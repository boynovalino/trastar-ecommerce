import {withTransaction} from '../lib/db.js';
import {requireAdmin} from '../lib/auth.js';
import {json,run,method,body,HttpError} from '../lib/http.js';
export default run(async(req,res)=>{
  method(req,['POST']);await requireAdmin(req,['OWNER','ADMIN']);
  const input=await body(req);
  const id=String(input.variantId||'');
  if(!/^[0-9a-f-]{36}$/i.test(id) || !Array.isArray(input.tiers)||input.tiers.length>20)throw new HttpError(422,'INVALID_TIERS','Invalid tier configuration');
  let previous=1;
  for(const t of input.tiers) {
    if(!Number.isSafeInteger(t.minQty)||t.minQty<=previous||!Number.isSafeInteger(t.unitPriceIdr)||t.unitPriceIdr<0)throw new HttpError(422,'INVALID_TIERS','Tier quantities must increase and prices must be nonnegative');
    previous=t.minQty;
  }
  const out=await withTransaction(async db=>{
    const vr=await db.query('SELECT id,unit_price_idr FROM variants WHERE id=$1 FOR UPDATE',[id]);
    if(!vr.rowCount)throw new HttpError(404,'VARIANT_NOT_FOUND','Variant not found');
    let ceiling=Number(vr.rows[0].unit_price_idr);
    for(const t of input.tiers){if(t.unitPriceIdr>ceiling)throw new HttpError(422,'TIER_PRICE_INCREASE','Volume tiers may not increase the unit price');ceiling=t.unitPriceIdr;}
    await db.query('DELETE FROM product_price_tiers WHERE variant_id=$1',[id]);
    for(const t of input.tiers)await db.query('INSERT INTO product_price_tiers(variant_id,min_qty,unit_price_idr) VALUES($1,$2,$3)',[id,t.minQty,t.unitPriceIdr]);
    return input.tiers;
  });
  json(res,200,{variantId:id,tiers:out});
});
