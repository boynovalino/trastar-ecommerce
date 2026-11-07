import {pool,requireDatabase} from '../lib/db.js';
import {requireAdmin} from '../lib/auth.js';
import {json,run,method} from '../lib/http.js';
export default run(async(req,res)=>{
  method(req,['GET']);requireDatabase();
  await requireAdmin(req,['OWNER','ADMIN','STAFF']);
  const result=await pool.query("SELECT order_no,recipient_name,shipping_country,subtotal_idr,shipping_cost_idr,total_idr,payment_status,fulfillment_status,is_simulation,created_at FROM orders ORDER BY created_at DESC LIMIT 100");
  json(res,200,{orders:result.rows.map(o=>({...o,subtotal_idr:Number(o.subtotal_idr),shipping_cost_idr:Number(o.shipping_cost_idr),total_idr:Number(o.total_idr)}))});
});
