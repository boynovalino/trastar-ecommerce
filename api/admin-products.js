import {pool,requireDatabase,withTransaction} from '../lib/db.js';
import {requireAdmin} from '../lib/auth.js';
import {json,run,method,body,HttpError} from '../lib/http.js';
function name(x,max=180){if(typeof x!=='string'||x.trim().length<1||x.trim().length>max)throw new HttpError(422,'INVALID_TEXT','Missing or invalid text field');return x.trim();}
function money(x){if(!Number.isSafeInteger(x)||x<0)throw new HttpError(422,'INVALID_PRICE','Price must be a nonnegative whole IDR amount');return x;}
export default run(async(req,res)=>{
  requireDatabase();
  const user=await requireAdmin(req,['OWNER','ADMIN']);
  if(req.method==='GET') {
    const p=await pool.query('SELECT * FROM products ORDER BY created_at DESC LIMIT 150');
    const v=await pool.query('SELECT * FROM variants ORDER BY created_at DESC LIMIT 500');
    return json(res,200,{products:p.rows,variants:v.rows.map(x=>({...x,unit_price_idr:Number(x.unit_price_idr)}))});
  }
  method(req,['POST']);
  const input=await body(req);
  const sku=name(input.sku,80).toUpperCase(),slug=name(input.slug,120).toLowerCase(),label=name(input.name);
  if(!/^[A-Z0-9_-]+$/.test(sku)|| !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new HttpError(422,'INVALID_SKU_SLUG','Invalid SKU or slug');
  const variants=input.variants;
  if(!Array.isArray(variants)||variants.length<1||variants.length>30)throw new HttpError(422,'INVALID_VARIANTS','At least one variant required');
  for(const v of variants) {
    if(!v||!/^[A-Z0-9_-]+$/.test(String(v.sku||''))||!Number.isSafeInteger(v.stock)||v.stock<0||v.stock>1000000)throw new HttpError(422,'INVALID_VARIANT','Invalid variant');
    money(v.unitPriceIdr);
  }
  if(!Number.isSafeInteger(input.weightGrams)||input.weightGrams<1)throw new HttpError(422,'INVALID_WEIGHT','Product weight required');
  const p=await withTransaction(async db=>{
    const r=await db.query('INSERT INTO products(sku,slug,name,description,image_url,brand,category,is_active,export_allowed,weight_grams) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,sku,name',[sku,slug,label,String(input.description||'').slice(0,10000),input.imageUrl||null,String(input.brand||'').slice(0,100),String(input.category||'').slice(0,100),Boolean(input.active),Boolean(input.exportAllowed),input.weightGrams]);
    for(const v of variants) await db.query('INSERT INTO variants(product_id,sku,options,unit_price_idr,stock_on_hand) VALUES($1,$2,$3,$4,$5)',[r.rows[0].id,v.sku,JSON.stringify(v.options||{}),v.unitPriceIdr,v.stock]);
    await db.query('INSERT INTO admin_audit_events(actor_user_id,action,target_id,before_data,after_data,reason) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)',
      [user.id,'PRODUCT_CREATED',r.rows[0].id,JSON.stringify({}),JSON.stringify({product:r.rows[0],variants:variants.map(v=>({sku:v.sku,unitPriceIdr:v.unitPriceIdr,stock:v.stock}))}),'Development product created']);
    return r.rows[0];
  });
  json(res,201,{product:p});
});
