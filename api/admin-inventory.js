import {withTransaction} from '../lib/db.js';
import {requireAdmin} from '../lib/auth.js';
import {json,run,method,body,HttpError} from '../lib/http.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default run(async(req,res)=>{
  method(req,['POST']);
  const user=await requireAdmin(req,['OWNER','ADMIN']);
  const input=await body(req);
  if(!uuid.test(String(input.variantId||'')))throw new HttpError(422,'INVALID_VARIANT','Variant ID must be UUID');
  const reason=typeof input.reason==='string'?input.reason.trim():'';
  if(reason.length<8||reason.length>200)throw new HttpError(422,'REASON_REQUIRED','Reason of 8-200 characters is required');
  const changes={};
  if('stockOnHand' in input) {
    if(!Number.isSafeInteger(input.stockOnHand)||input.stockOnHand<0||input.stockOnHand>1000000)throw new HttpError(422,'INVALID_STOCK','Stock must be an integer 0-1000000');
    changes.stock_on_hand=input.stockOnHand;
  }
  if('unitPriceIdr' in input) {
    if(!Number.isSafeInteger(input.unitPriceIdr)||input.unitPriceIdr<0||input.unitPriceIdr>1000000000000)throw new HttpError(422,'INVALID_PRICE','Price must be a safe whole IDR amount');
    changes.unit_price_idr=input.unitPriceIdr;
  }
  if('active' in input) {
    if(typeof input.active!=='boolean')throw new HttpError(422,'INVALID_ACTIVE','Active must be a boolean');
    changes.is_active=input.active;
  }
  if(!Object.keys(changes).length)throw new HttpError(422,'NO_CHANGES','Provide stock, unit price, or active status');
  const result=await withTransaction(async db=>{
    const locked=await db.query('SELECT id,sku,stock_on_hand,stock_reserved,unit_price_idr,is_active FROM variants WHERE id=$1 FOR UPDATE',[input.variantId]);
    if(!locked.rowCount)throw new HttpError(404,'VARIANT_NOT_FOUND','SKU variant not found');
    const before=locked.rows[0];
    if('stock_on_hand' in changes && changes.stock_on_hand<before.stock_reserved)throw new HttpError(409,'STOCK_RESERVED','Target stock is below reserved units');
    if('unit_price_idr' in changes){
      const tiers=await db.query('SELECT max(unit_price_idr)::bigint AS max_price FROM product_price_tiers WHERE variant_id=$1',[input.variantId]);
      if(tiers.rows[0].max_price!==null&&changes.unit_price_idr<Number(tiers.rows[0].max_price))throw new HttpError(409,'TIER_PRICE_CONFLICT','Update quantity tiers before setting base price below tier prices');
    }
    const after=await db.query(
      'UPDATE variants SET stock_on_hand=$2,unit_price_idr=$3,is_active=$4 WHERE id=$1 RETURNING id,sku,stock_on_hand,stock_reserved,unit_price_idr,is_active',
      [input.variantId,changes.stock_on_hand??before.stock_on_hand,changes.unit_price_idr??before.unit_price_idr,changes.is_active??before.is_active]);
    const current=after.rows[0];
    await db.query('INSERT INTO admin_audit_events(actor_user_id,action,target_id,before_data,after_data,reason) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)',
      [user.id,'VARIANT_UPDATED',input.variantId,JSON.stringify(before),JSON.stringify(current),reason]);
    return current;
  });
  json(res,200,{variant:{...result,unit_price_idr:Number(result.unit_price_idr)}});
});
