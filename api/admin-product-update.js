import {withTransaction} from '../lib/db.js';
import {requireAdmin} from '../lib/auth.js';
import {json,run,method,body,HttpError} from '../lib/http.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default run(async(req,res)=>{
  method(req,['POST']);
  const user=await requireAdmin(req,['OWNER','ADMIN']);
  const input=await body(req);
  if(!uuid.test(String(input.productId||'')))throw new HttpError(422,'INVALID_PRODUCT','Invalid product ID');
  const reason=typeof input.reason==='string'?input.reason.trim():'';
  if(reason.length<8||reason.length>200)throw new HttpError(422,'REASON_REQUIRED','Reason must contain 8-200 characters');
  const allowed=['name','description','brand','category','weightGrams','active','exportAllowed'];
  const changes={};
  for(const field of allowed){
    if(!(field in input))continue;
    const v=input[field];
    if(field==='active'||field==='exportAllowed') {
      if(typeof v!=='boolean')throw new HttpError(422,'INVALID_BOOLEAN','Active and export fields must be booleans');
    } else if(field==='weightGrams') {
      if(!Number.isSafeInteger(v)||v<1||v>500000)throw new HttpError(422,'INVALID_WEIGHT','Weight must be 1-500000 grams');
    } else {
      if(typeof v!=='string'||v.trim().length>(field==='description'?10000:180)||(field==='name'&&!v.trim()))throw new HttpError(422,'INVALID_TEXT','Invalid product text field');
    }
    const key=({weightGrams:'weight_grams',active:'is_active',exportAllowed:'export_allowed'})[field]||field;
    changes[key]=typeof v==='string'?v.trim():v;
  }
  if(!Object.keys(changes).length)throw new HttpError(422,'NO_CHANGES','No editable fields supplied');
  const updated=await withTransaction(async db=>{
    const row=await db.query('SELECT id,sku,name,description,brand,category,weight_grams,is_active,export_allowed FROM products WHERE id=$1 FOR UPDATE',[input.productId]);
    if(!row.rowCount)throw new HttpError(404,'PRODUCT_NOT_FOUND','Product not found');
    const before=row.rows[0];
    const after={...before,...changes};
    const changed=await db.query(
      'UPDATE products SET name=$2,description=$3,brand=$4,category=$5,weight_grams=$6,is_active=$7,export_allowed=$8,updated_at=now() WHERE id=$1 RETURNING id,sku,name,description,brand,category,weight_grams,is_active,export_allowed',
      [input.productId,after.name,after.description,after.brand,after.category,after.weight_grams,after.is_active,after.export_allowed]
    );
    await db.query('INSERT INTO admin_audit_events(actor_user_id,action,target_id,before_data,after_data,reason) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)',
      [user.id,'PRODUCT_UPDATED',input.productId,JSON.stringify(before),JSON.stringify(changed.rows[0]),reason]);
    return changed.rows[0];
  });
  json(res,200,{product:updated});
});
