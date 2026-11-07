import {pool,requireDatabase} from '../lib/db.js';
import {json,run,method,body,HttpError} from '../lib/http.js';
import {normalizeItems} from '../lib/pricing.js';
import {previewShipping} from '../lib/shipping.js';
import {releaseExpiredPreviewOrders} from '../lib/checkout.js';
export default run(async(req,res)=>{
  method(req,['POST']);requireDatabase();
  await releaseExpiredPreviewOrders();
  const input=await body(req);const lines=normalizeItems(input.items);const ids=lines.map(l=>l.variantId);
  const db=await pool.query('SELECT v.id,v.stock_on_hand,v.stock_reserved,v.is_active,p.is_active AS product_active,p.weight_grams,p.export_allowed FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=ANY($1::uuid[])',[ids]);
  if(db.rowCount!==ids.length)throw new HttpError(422,'PRODUCT_UNAVAILABLE','Product not found');
  const country=String(input.country||'').trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(country))throw new HttpError(422,'INVALID_COUNTRY','ISO 3166-1 alpha-2 country code required');
  let weight=0;
  for(const line of lines){const v=db.rows.find(v=>v.id===line.variantId);if(!v||!v.is_active||!v.product_active||v.stock_on_hand-v.stock_reserved<line.quantity)throw new HttpError(409,'PRODUCT_UNAVAILABLE','Item unavailable or out of stock');if(country!=='ID'&&!v.export_allowed)throw new HttpError(422,'EXPORT_RESTRICTED','Some items cannot be exported');weight+=v.weight_grams*line.quantity;}
  if(weight<=0||weight>30000)throw new HttpError(422,'MISSING_WEIGHT','Weight is missing or exceeds preview limit');
  json(res,200,{quote:previewShipping({country,weightGrams:weight})});
});
