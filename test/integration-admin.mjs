import assert from 'node:assert/strict';
import {pool} from '../lib/db.js';
import session from '../api/session.js';
import adminProducts from '../api/admin-products.js';
import adminTiers from '../api/admin-price-tiers.js';
import adminOrders from '../api/admin-orders.js';
import payments from '../api/payments.js';
if(process.env.TRASTAR_ENV!=='development'||!process.env.DATABASE_URL?.includes('/trastar_dev')||process.env.VERCEL_ENV==='production')throw new Error('Wrong database target');
if(!process.env.TRASTAR_INITIAL_ADMIN_PASSWORD)throw new Error('QA credential missing');

async function invoke(handler,method,body,cookie){
 const req={method,body,query:{},socket:{remoteAddress:'127.0.0.1'},headers:{host:'trastar.test','x-forwarded-proto':'https','x-forwarded-for':'127.0.0.1',...(cookie?{cookie}:{})}};
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(v){this.output=v}};
 await handler(req,res);
 return {status:res.statusCode,data:JSON.parse(res.output),cookie:res.headers['set-cookie']};
}
try {
 const db=await pool.query("SELECT current_database() AS db");
 assert.equal(db.rows[0].db,'trastar_dev');
 const failuresBefore=await pool.query("SELECT count(*)::int AS n FROM admin_login_attempts WHERE email='qa-admin@trastar.invalid' AND attempted_at > now()-interval '15 minutes'");
 let r=await invoke(adminOrders,'GET',null,null);
 assert.equal(r.status,401,'Admin data should not be accessible anonymously');
 r=await invoke(session,'POST',{email:'qa-admin@trastar.invalid',password:process.env.TRASTAR_INITIAL_ADMIN_PASSWORD},null);
 assert.equal(r.status,200,'QA login should succeed');
 const failuresAfter=await pool.query("SELECT count(*)::int AS n FROM admin_login_attempts WHERE email='qa-admin@trastar.invalid' AND attempted_at > now()-interval '15 minutes'");
 assert.equal(failuresAfter.rows[0].n,failuresBefore.rows[0].n,'Successful login must not consume failure budget');
 assert.match(r.cookie,/HttpOnly/);
 assert.match(r.cookie,/Secure/);
 const cookie=r.cookie.split(';')[0];
 r=await invoke(adminProducts,'GET',null,cookie);
 assert.equal(r.status,200,'Authenticated catalog access');
 const now=Date.now(),sku='QA-API-'+now;
 r=await invoke(adminProducts,'POST',{
  sku,slug:'qa-api-'+now,name:'[DEMO] QA API Product',
  weightGrams:400,active:true,exportAllowed:false,
  variants:[{sku:sku+'-A',unitPriceIdr:90000,stock:20,options:{type:'QA'}}]
 },cookie);
 assert.equal(r.status,201,'Admin creates development product');
 r=await invoke(adminProducts,'GET',null,cookie);
 assert.equal(r.status,200);
 const v=r.data.variants.find(v=>v.sku===sku+'-A');
 assert.ok(v,'Variant persisted');
 r=await invoke(adminTiers,'POST',{variantId:v.id,tiers:[{minQty:5,unitPriceIdr:85000},{minQty:10,unitPriceIdr:80000}]},cookie);
 assert.equal(r.status,200,'Admin saves quantity pricing');
 const tier=await pool.query('SELECT min_qty,unit_price_idr FROM product_price_tiers WHERE variant_id=$1 ORDER BY min_qty',[v.id]);
 assert.deepEqual(tier.rows.map(x=>[x.min_qty,Number(x.unit_price_idr)]),[[5,85000],[10,80000]]);
 const audit=await pool.query('SELECT action FROM admin_audit_events WHERE target_id IN($1,$2)',[v.id,r.data?.product?.id||'00000000-0000-0000-0000-000000000000']);
 assert.ok(audit.rows.some(x=>x.action==='PRICE_TIERS_UPDATED'),'Wholesale price changes must be audited');
 r=await invoke(adminOrders,'GET',null,cookie);
 assert.equal(r.status,200,'Admin order list responds');
 assert.ok(r.data.orders.length>0,'Synthetic admin order history should exist');
 assert.ok(r.data.orders.every(o=>o.is_simulation&&['PENDING','EXPIRED','FAILED'].includes(o.payment_status)),'Preview history may contain expired orders after stock cleanup');
 r=await invoke(payments,'POST',{},null);
 assert.equal(r.status,503,'Live payment cannot be faked');
 r=await invoke(session,'DELETE',null,cookie);
 assert.equal(r.status,200);
 assert.match(r.cookie,/Max-Age=0/);
 console.log('ADMIN INTEGRATION PASS: auth 401 without session; login 200; HttpOnly/Secure; product create; tier write; order list; live payments blocked; logout');
 console.log('QA fixture SKU '+sku+' (no real customer or payment)');
} finally { await pool.end(); }
