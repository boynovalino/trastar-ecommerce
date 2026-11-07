import {pool,requireDatabase} from '../lib/db.js';
import {releaseExpiredPreviewOrders} from '../lib/checkout.js';
import {json,run,method} from '../lib/http.js';
export default run(async(req,res)=>{
  method(req,['GET']);requireDatabase();
  await releaseExpiredPreviewOrders();
  const products=await pool.query("SELECT id,sku,slug,name,description,image_url,brand,category,weight_grams,export_allowed FROM products WHERE is_active=true ORDER BY created_at DESC LIMIT 100");
  const ids=products.rows.map(p=>p.id);
  const variants=ids.length?await pool.query("SELECT id,product_id,sku,options,unit_price_idr,stock_on_hand-stock_reserved AS available_stock FROM variants WHERE product_id=ANY($1::uuid[]) AND is_active=true ORDER BY sku",[ids]):{rows:[]};
  const variantIds=variants.rows.map(v=>v.id);
  const tiers=variantIds.length?await pool.query("SELECT variant_id,min_qty,unit_price_idr FROM product_price_tiers WHERE variant_id=ANY($1::uuid[]) ORDER BY min_qty",[variantIds]):{rows:[]};
  json(res,200,{products:products.rows.map(p=>({...p,variants:variants.rows.filter(v=>v.product_id===p.id).map(v=>({id:v.id,sku:v.sku,options:v.options,unitPriceIdr:Number(v.unit_price_idr),availableStock:Number(v.available_stock),tiers:tiers.rows.filter(t=>t.variant_id===v.id).map(t=>({minQty:t.min_qty,unitPriceIdr:Number(t.unit_price_idr)}))}))}))});
});
