import crypto from 'node:crypto';
import { withTransaction, pool, requireDatabase } from './db.js';
import { HttpError } from './http.js';
import { normalizeItems, unitPriceForQty } from './pricing.js';
import { readQuote, allowSimulation } from './shipping.js';
function safeText(x,max=200) {return typeof x==='string' ? x.trim().slice(0,max) : '';}
function sha(x){return crypto.createHash('sha256').update(x).digest('hex');}
async function loadLines(db, cart) {
  const ids=cart.map(x=>x.variantId);
  const rows=await db.query(
    'SELECT v.id,v.sku,v.unit_price_idr,v.stock_on_hand,v.stock_reserved,v.is_active,p.name,p.is_active AS product_active,p.export_allowed,p.weight_grams FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=ANY($1::uuid[]) ORDER BY v.id FOR UPDATE OF v',[ids]);
  if(rows.rowCount!==ids.length)throw new HttpError(422,'UNKNOWN_PRODUCT','Product not found');
  const tierRows=await db.query('SELECT variant_id,min_qty,unit_price_idr FROM product_price_tiers WHERE variant_id=ANY($1::uuid[]) ORDER BY min_qty',[ids]);
  const tiers=new Map();for(const row of tierRows.rows){const k=String(row.variant_id);if(!tiers.has(k))tiers.set(k,[]);tiers.get(k).push(row);}
  return cart.map(line=>{
    const v=rows.rows.find(v=>v.id===line.variantId);
    if(!v.is_active||!v.product_active)throw new HttpError(422,'PRODUCT_UNAVAILABLE','Item unavailable');
    if(v.stock_on_hand-v.stock_reserved<line.quantity)throw new HttpError(409,'INSUFFICIENT_STOCK','Not enough stock for SKU '+v.sku);
    const unit=unitPriceForQty(v.unit_price_idr,tiers.get(v.id)||[],line.quantity);
    return {id:v.id,sku:v.sku,name:v.name,qty:line.quantity,unit,lineTotal:unit*line.quantity,weightGrams:v.weight_grams*line.quantity,exportAllowed:v.export_allowed};
  });
}
async function expireOldSimulations(db) {
  const expired=await db.query("SELECT id FROM orders WHERE payment_status='PENDING' AND is_simulation=true AND expires_at<now() ORDER BY id LIMIT 100 FOR UPDATE");
  for(const row of expired.rows) {
    const items=await db.query('SELECT variant_id,quantity FROM order_items WHERE order_id=$1',[row.id]);
    for(const item of items.rows) {
      await db.query('UPDATE variants SET stock_reserved=stock_reserved-$1 WHERE id=$2 AND stock_reserved >= $1',[item.quantity,item.variant_id]);
      await db.query('INSERT INTO inventory_events(variant_id,order_id,delta_reserved,reason) VALUES($1,$2,$3,$4)',[item.variant_id,row.id,-item.quantity,'PREVIEW_ORDER_EXPIRED']);
    }
    await db.query("UPDATE orders SET payment_status='EXPIRED' WHERE id=$1",[row.id]);
  }
}
export async function createPreviewOrder({items,quoteToken,address,email,recipientName}) {
  if(!allowSimulation())throw new HttpError(503,'PAYMENT_NOT_CONFIGURED','Payment integration awaiting approved provider');
  const cart=normalizeItems(items);
  const quote=readQuote(quoteToken);
  if(!quote.isSimulation||quote.provider!=='SIMULATION_ONLY')throw new HttpError(422,'INVALID_QUOTE','Quote not valid for preview');
  const mail=safeText(email,254),recipient=safeText(recipientName,150);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)||!recipient)throw new HttpError(422,'INVALID_CUSTOMER','Recipient name and email are required');
  if(!address||typeof address!=='object'||safeText(address.country,2).toUpperCase()!==quote.country||safeText(address.line1,200).length<5||!safeText(address.city,100))throw new HttpError(422,'INVALID_ADDRESS','Valid recipient address is required');
  return await withTransaction(async db=>{
    await expireOldSimulations(db);
    const lines=await loadLines(db,cart);
    const weight=lines.reduce((s,i)=>s+i.weightGrams,0);
    if(weight!==quote.weightGrams)throw new HttpError(409,'QUOTE_CHANGED','Product weight or quantity changed; recalculate shipping');
    if(quote.country!=='ID'&&lines.some(x=>!x.exportAllowed))throw new HttpError(422,'EXPORT_RESTRICTED','Item cannot be shipped internationally');
    const subtotal=lines.reduce((s,i)=>s+i.lineTotal,0);
    const total=subtotal+Number(quote.costIdr);
    if(!Number.isSafeInteger(total))throw new HttpError(422,'INVALID_TOTAL','Order total exceeds supported limit');
    const orderNo='TRS'+new Date().toISOString().slice(0,10).replace(/-/g,'')+crypto.randomBytes(5).toString('hex').toUpperCase();
    const token=crypto.randomBytes(24).toString('base64url');
    const result=await db.query(
      'INSERT INTO orders(order_no,email,recipient_name,shipping_address,shipping_country,shipping_provider,shipping_service,shipping_cost_idr,subtotal_idr,total_idr,is_simulation,access_token_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11) RETURNING id,order_no,payment_status,expires_at',
      [orderNo,mail,recipient,JSON.stringify(address),quote.country,quote.provider,quote.service,quote.costIdr,subtotal,total,sha(token)]);
    const id=result.rows[0].id;
    for(const line of lines){
      await db.query('INSERT INTO order_items(order_id,variant_id,sku_snapshot,name_snapshot,quantity,unit_price_idr,line_total_idr) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,line.id,line.sku,line.name,line.qty,line.unit,line.lineTotal]);
      await db.query('UPDATE variants SET stock_reserved=stock_reserved+$1 WHERE id=$2',[line.qty,line.id]);
      await db.query('INSERT INTO inventory_events(variant_id,order_id,delta_reserved,reason) VALUES($1,$2,$3,$4)',[line.id,id,line.qty,'PREVIEW_ORDER_CREATED']);
    }
    return {orderNo,paymentStatus:'PENDING',isSimulation:true,paymentAvailable:false,accessToken:token,totalIdr:total,expiresAt:result.rows[0].expires_at,notice:'Simulation only. No money is collected, and this order is not paid.'};
  });
}
export async function findOrderForCustomer(orderNo,accessToken) {
  requireDatabase();
  if(typeof orderNo!=='string'||!/^TRS\d{8}[A-F0-9]{10}$/.test(orderNo)||!accessToken)throw new HttpError(400,'INVALID_ORDER_LOOKUP','Invalid order credentials');
  const result=await pool.query('SELECT id,order_no,payment_status,fulfillment_status,subtotal_idr,shipping_cost_idr,total_idr,expires_at,is_simulation FROM orders WHERE order_no=$1 AND access_token_hash=$2',[orderNo,sha(accessToken)]);
  if(result.rowCount!==1)throw new HttpError(404,'ORDER_NOT_FOUND','Order not found');
  const order=result.rows[0];
  const items=await pool.query('SELECT sku_snapshot,name_snapshot,quantity,unit_price_idr,line_total_idr FROM order_items WHERE order_id=$1',[order.id]);
  return {orderNo:order.order_no,paymentStatus:order.payment_status,fulfillmentStatus:order.fulfillment_status,isSimulation:order.is_simulation,subtotalIdr:Number(order.subtotal_idr),shippingCostIdr:Number(order.shipping_cost_idr),totalIdr:Number(order.total_idr),expiresAt:order.expires_at,items:items.rows};
}
