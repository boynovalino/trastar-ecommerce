import {pool,requireDatabase,withTransaction} from '../lib/db.js';
import {requireAdmin} from '../lib/auth.js';
import {json,run,method,body,HttpError} from '../lib/http.js';
import {releaseExpiredPreviewOrders} from '../lib/checkout.js';

const orderRegex=/^TRS\d{8}[A-F0-9]{10}$/;
export default run(async(req,res)=>{
  requireDatabase();
  if(req.method==='GET'){
    method(req,['GET']);
    await requireAdmin(req,['OWNER','ADMIN','STAFF']);
    await releaseExpiredPreviewOrders();
    const orderNo=String(req.query?.orderNo||'');
    if(orderNo){
      if(!orderRegex.test(orderNo))throw new HttpError(422,'INVALID_ORDER_NUMBER','Invalid order number');
      const single=await pool.query("SELECT order_no,recipient_name,shipping_country,shipping_provider,shipping_service,shipping_address,subtotal_idr,shipping_cost_idr,total_idr,payment_status,fulfillment_status,is_simulation,expires_at,created_at FROM orders WHERE order_no=$1",[orderNo]);
      if(!single.rowCount)throw new HttpError(404,'ORDER_NOT_FOUND','Order not found');
      const itemRows=await pool.query('SELECT sku_snapshot,name_snapshot,quantity,unit_price_idr,line_total_idr FROM order_items WHERE order_id=(SELECT id FROM orders WHERE order_no=$1) ORDER BY id',[orderNo]);
      const o=single.rows[0];
      return json(res,200,{order:{...o,subtotal_idr:Number(o.subtotal_idr),shipping_cost_idr:Number(o.shipping_cost_idr),total_idr:Number(o.total_idr),items:itemRows.rows.map(i=>({...i,unit_price_idr:Number(i.unit_price_idr),line_total_idr:Number(i.line_total_idr)}))}});
    }
    const result=await pool.query("SELECT order_no,recipient_name,shipping_country,subtotal_idr,shipping_cost_idr,total_idr,payment_status,fulfillment_status,is_simulation,created_at,expires_at FROM orders ORDER BY created_at DESC LIMIT 100");
    return json(res,200,{orders:result.rows.map(o=>({...o,subtotal_idr:Number(o.subtotal_idr),shipping_cost_idr:Number(o.shipping_cost_idr),total_idr:Number(o.total_idr)}))});
  }
  method(req,['POST']);
  const user=await requireAdmin(req,['OWNER','ADMIN']);
  const input=await body(req),orderNo=String(input.orderNo||'');
  if(input.action!=='cancel_simulation'||!orderRegex.test(orderNo))throw new HttpError(422,'INVALID_ACTION','Only cancellation of a preview order is allowed');
  const reason=typeof input.reason==='string'?input.reason.trim():'';
  if(reason.length<8||reason.length>200)throw new HttpError(422,'REASON_REQUIRED','A reason of 8-200 characters is required');
  const result=await withTransaction(async db=>{
    const orderResult=await db.query('SELECT id,order_no,is_simulation,payment_status,fulfillment_status FROM orders WHERE order_no=$1 FOR UPDATE',[orderNo]);
    if(!orderResult.rowCount)throw new HttpError(404,'ORDER_NOT_FOUND','Order not found');
    const o=orderResult.rows[0];
    if(!o.is_simulation)throw new HttpError(403,'REAL_ORDER_PROTECTED','Only preview orders can be cancelled from this development interface');
    if(o.payment_status==='EXPIRED' || o.fulfillment_status==='CANCELLED')return {orderNo,cancelled:false,alreadyClosed:true};
    if(o.payment_status!=='PENDING')throw new HttpError(409,'ORDER_NOT_CANCELLABLE','Preview order is no longer pending');
    const lines=await db.query('SELECT variant_id,quantity FROM order_items WHERE order_id=$1 ORDER BY variant_id',[o.id]);
    for(const line of lines.rows) {
      const released=await db.query('UPDATE variants SET stock_reserved=stock_reserved-$1 WHERE id=$2 AND stock_reserved >= $1',[line.quantity,line.variant_id]);
      if(released.rowCount!==1)throw new Error('Reservation consistency error');
      await db.query('INSERT INTO inventory_events(variant_id,order_id,delta_reserved,reason) VALUES($1,$2,$3,$4)',[line.variant_id,o.id,-line.quantity,'PREVIEW_ADMIN_CANCEL']);
    }
    await db.query("UPDATE orders SET payment_status='EXPIRED',fulfillment_status='CANCELLED' WHERE id=$1",[o.id]);
    await db.query('INSERT INTO admin_audit_events(actor_user_id,action,target_id,before_data,after_data,reason) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)',
      [user.id,'PREVIEW_ORDER_CANCELLED',o.id,JSON.stringify({payment_status:o.payment_status,fulfillment_status:o.fulfillment_status}),JSON.stringify({payment_status:'EXPIRED',fulfillment_status:'CANCELLED'}),reason]);
    return {orderNo,cancelled:true,paymentStatus:'EXPIRED',fulfillmentStatus:'CANCELLED'};
  });
  json(res,200,result);
});
