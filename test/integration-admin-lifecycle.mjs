import assert from 'node:assert/strict';
import {pool} from '../lib/db.js';
import adminProduct from '../api/admin-products.js';
import adminProductUpdate from '../api/admin-product-update.js';
import adminInventory from '../api/admin-inventory.js';
import adminOrders from '../api/admin-orders.js';
import customerOrders from '../api/orders.js';
import products from '../api/products.js';
import quote from '../api/quote.js';
import session from '../api/session.js';
const identity=process.env.DATABASE_URL||'';
if(process.env.TRASTAR_ENV!=='development'||!identity.includes('/trastar_dev')||process.env.VERCEL_ENV==='production')throw Error('Unsafe test target');
if(!process.env.TRASTAR_INITIAL_ADMIN_PASSWORD)throw Error('Missing QA account');

async function call(handler,method,data,query={},headers={}){
 const req={method,body:data,query,headers:{host:'trastar.qa.invalid','x-forwarded-proto':'https','x-forwarded-for':'127.0.0.1',...headers},socket:{remoteAddress:'127.0.0.1'}};
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(text){this.text=text}};
 await handler(req,res);
 return {status:res.statusCode,data:JSON.parse(res.text),cookie:res.headers['set-cookie']};
}
function fixtureInput(variantId,quantity,quoteToken){
 return {items:[{variantId,quantity}],quoteToken,email:'qa-fixture@example.invalid',recipientName:'TRASTAR QA FIXTURE',address:{country:'ID',city:'QA City',line1:'TEST ONLY 123 Road',postalCode:'000000'}};
}
async function createQuote(variantId,quantity){
 const r=await call(quote,'POST',{items:[{variantId,quantity}],country:'ID'});
 assert.equal(r.status,200,JSON.stringify(r.data));
 return r.data.quote.quoteToken;
}
async function adminCancel(cookie,orderNo){
 return await call(adminOrders,'POST',{orderNo,action:'cancel_simulation',reason:'QA lifecycle cancellation test'}, {},{cookie});
}
try{
 const who=await pool.query('SELECT current_database() AS db');
 assert.equal(who.rows[0].db,'trastar_dev');
 const login=await call(session,'POST',{email:'qa-admin@trastar.invalid',password:process.env.TRASTAR_INITIAL_ADMIN_PASSWORD});
 assert.equal(login.status,200);
 const cookie=login.cookie.split(';')[0];
 assert.equal((await call(adminInventory,'POST',{variantId:'00000000-0000-4000-8000-000000000001',stockOnHand:1,reason:'QA change test'})).status,401);
 assert.equal((await call(adminOrders,'POST',{orderNo:'TRS202611070000000000',action:'cancel_simulation',reason:'QA change test'})).status,401);
 const stamp=Date.now().toString();
 const sku='QA-LIFE-'+stamp;
 const create=await call(adminProduct,'POST',{
  sku,slug:'qa-life-'+stamp,name:'[DEMO] Inventory Lifecycle QA',weightGrams:300,active:true,exportAllowed:true,
  variants:[{sku:sku+'-A',stock:6,unitPriceIdr:90000,options:{batch:'QA'}}]
 },{}, {cookie});
 assert.equal(create.status,201,JSON.stringify(create.data));
 const productId=create.data.product.id;
 const listed=await call(adminProduct,'GET',undefined,{}, {cookie});
 const variant=listed.data.variants.find(v=>v.sku===sku+'-A');
 assert.ok(variant);
 const badBuyer=await call(customerOrders,'POST',{items:[{variantId:variant.id,quantity:1}],quoteToken:'xx',recipientName:'Real Person',email:'real@example.com',address:{country:'ID',city:'Yogyakarta',line1:'Real address 123'}});
 assert.equal(badBuyer.status,422);
 const tierId=variant.id;
 const pending=await call(customerOrders,'POST',fixtureInput(tierId,3,await createQuote(tierId,3)));
 assert.equal(pending.status,201,JSON.stringify(pending.data));
 const orderNo=pending.data.orderNo;
 let state=await pool.query('SELECT stock_on_hand,stock_reserved FROM variants WHERE id=$1',[tierId]);
 assert.equal(state.rows[0].stock_reserved,3);
 const blocked=await call(adminInventory,'POST',{variantId:tierId,stockOnHand:2,reason:'QA invalid reserved reduction'}, {},{cookie});
 assert.equal(blocked.status,409);
 assert.equal(blocked.data.error,'STOCK_RESERVED');
 const changed=await call(adminInventory,'POST',{variantId:tierId,stockOnHand:5,unitPriceIdr:90000,active:true,reason:'QA inventory correction'}, {},{cookie});
 assert.equal(changed.status,200,JSON.stringify(changed.data));
 let p=await call(adminProductUpdate,'POST',{productId,name:'[DEMO] Updated Inventory QA',weightGrams:350,active:false,exportAllowed:true,reason:'QA unpublished variant test'}, {},{cookie});
 assert.equal(p.status,200);
 let catalog=await call(products,'GET');
 assert.equal(catalog.status,200);
 assert.equal(catalog.data.products.some(v=>v.id===productId),false,'Inactive product cannot appear in customer catalog');
 p=await call(adminProductUpdate,'POST',{productId,active:true,reason:'QA republish fixture test'}, {},{cookie});
 assert.equal(p.status,200);
 const details=await call(adminOrders,'GET',undefined,{orderNo},{cookie});
 assert.equal(details.status,200);
 assert.equal(details.data.order.items[0].quantity,3);
 const canceled=await adminCancel(cookie,orderNo);
 assert.equal(canceled.status,200,JSON.stringify(canceled.data));
 assert.equal(canceled.data.cancelled,true);
 const canceledAgain=await adminCancel(cookie,orderNo);
 assert.equal(canceledAgain.status,200);
 assert.equal(canceledAgain.data.alreadyClosed,true);
 state=await pool.query('SELECT stock_reserved FROM variants WHERE id=$1',[tierId]);
 assert.equal(state.rows[0].stock_reserved,0);
 const status=await call(customerOrders,'GET',undefined,{orderNo},{'x-order-access-token':pending.data.accessToken});
 assert.equal(status.status,200);
 assert.equal(status.data.order.paymentStatus,'EXPIRED');
 const oneRelease=await pool.query("SELECT COUNT(*)::int AS n FROM inventory_events WHERE variant_id=$1 AND reason='PREVIEW_ADMIN_CANCEL'",[tierId]);
 assert.equal(oneRelease.rows[0].n,1);
 const audit=await pool.query("SELECT action FROM admin_audit_events WHERE target_id IN ($1,$2,(SELECT id FROM orders WHERE order_no=$3))",[tierId,productId,orderNo]);
 assert.deepEqual([...new Set(audit.rows.map(x=>x.action))].sort(),['PREVIEW_ORDER_CANCELLED','PRODUCT_UPDATED','VARIANT_UPDATED'].sort());
 const exp=await call(customerOrders,'POST',fixtureInput(tierId,1,await createQuote(tierId,1)));
 assert.equal(exp.status,201,JSON.stringify(exp.data));
 const syntheticExpire=await pool.query("UPDATE orders SET expires_at=now()-interval '1 minute' WHERE order_no=$1 AND is_simulation=true AND payment_status='PENDING' RETURNING id",[exp.data.orderNo]);
 assert.equal(syntheticExpire.rowCount,1);
 catalog=await call(products,'GET');
 assert.equal(catalog.status,200);
 state=await pool.query('SELECT stock_reserved FROM variants WHERE id=$1',[tierId]);
 assert.equal(state.rows[0].stock_reserved,0);
 const expired=await pool.query('SELECT payment_status,fulfillment_status FROM orders WHERE order_no=$1',[exp.data.orderNo]);
 assert.equal(expired.rows[0].payment_status,'EXPIRED');
 assert.equal(expired.rows[0].fulfillment_status,'CANCELLED');
 const available=await pool.query('SELECT stock_on_hand-stock_reserved AS available FROM variants WHERE id=$1',[tierId]);
 assert.equal(available.rows[0].available,5);
 const firstQuote=await createQuote(tierId,4);
 const secondQuote=await createQuote(tierId,4);
 const both=await Promise.all([
   call(customerOrders,'POST',fixtureInput(tierId,4,firstQuote)),
   call(customerOrders,'POST',fixtureInput(tierId,4,secondQuote))
 ]);
 const successes=both.filter(x=>x.status===201),conflicts=both.filter(x=>x.status===409);
 assert.equal(successes.length,1,JSON.stringify(both.map(x=>x.status)));
 assert.equal(conflicts.length,1);
 await adminCancel(cookie,successes[0].data.orderNo);
 state=await pool.query('SELECT stock_reserved FROM variants WHERE id=$1',[tierId]);
 assert.equal(state.rows[0].stock_reserved,0);
 console.log('LIFECYCLE INTEGRATION PASS: auth required, unpublished filtered, reserved-stock lower bound, stock audit, idempotent cancellation, expiry release on catalog, concurrency oversell prevented, payment remains PENDING');
 console.log('QA SKU '+sku+' | no client data touched');
} finally {await pool.end();}
