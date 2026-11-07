import assert from 'node:assert/strict';
import {pool} from '../lib/db.js';
import quoteHandler from '../api/quote.js';
import ordersHandler from '../api/orders.js';
import adminOrdersHandler from '../api/admin-orders.js';
import sessionHandler from '../api/session.js';

if(process.env.TRASTAR_ENV!=='development'||!process.env.DATABASE_URL?.includes('/trastar_dev')||process.env.VERCEL_ENV==='production')throw new Error('Refusing integration outside TRASTAR development database');
if(!process.env.TRASTAR_INITIAL_ADMIN_PASSWORD)throw new Error('QA admin credential missing');

async function invoke(handler,method,body,query={},headers={}) {
 const req={method,body,query,headers:{host:'trastar.example.invalid','x-forwarded-proto':'https','x-forwarded-for':'127.0.0.1',...headers},socket:{remoteAddress:'127.0.0.1'}};
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(output){this.output=output}};
 await handler(req,res);
 return {status:res.statusCode,data:JSON.parse(res.output),cookie:res.headers['set-cookie']};
}
try {
 const r=await pool.query("SELECT current_database() AS db");
 assert.equal(r.rows[0].db,'trastar_dev');
 const variants=await pool.query("SELECT id,stock_on_hand-stock_reserved AS available FROM variants WHERE sku='DEMO-FILTER-01'");
 assert.equal(variants.rowCount,1);
 assert.ok(variants.rows[0].available>=2);
 const items=[{variantId:variants.rows[0].id,quantity:2}];
 const quote=await invoke(quoteHandler,'POST',{country:'SG',items});
 assert.equal(quote.status,200);
 assert.equal(quote.data.quote.isSimulation,true);
 const malformed=quote.data.quote.quoteToken+'a';
 const invalid=await invoke(ordersHandler,'POST',{
  items,quoteToken:malformed,
  recipientName:'TRASTAR QA FIXTURE',email:'qa-fixture@example.invalid',
  address:{country:'SG',city:'QA City',line1:'TEST ONLY 123 Road',postalCode:'000000'}
 });
 assert.equal(invalid.status,422);
 const buyerOrder=await invoke(ordersHandler,'POST',{
  items,quoteToken:quote.data.quote.quoteToken,
  recipientName:'TRASTAR QA FIXTURE',email:'qa-fixture@example.invalid',
  address:{country:'SG',city:'QA City',line1:'TEST ONLY 123 Road',postalCode:'000000'}
 });
 assert.equal(buyerOrder.status,201);
 assert.equal(buyerOrder.data.paymentStatus,'PENDING');
 assert.equal(buyerOrder.data.paymentAvailable,false);
 assert.equal(buyerOrder.data.totalIdr,75000*2+quote.data.quote.costIdr);
 const orderNo=buyerOrder.data.orderNo;
 const read=await invoke(ordersHandler,'GET',undefined,{orderNo},{'x-order-access-token':buyerOrder.data.accessToken});
 assert.equal(read.status,200);
 assert.equal(read.data.order.orderNo,orderNo);
 assert.equal(read.data.order.paymentStatus,'PENDING');
 assert.equal(read.data.order.items.length,1);
 const login=await invoke(sessionHandler,'POST',{email:'qa-admin@trastar.invalid',password:process.env.TRASTAR_INITIAL_ADMIN_PASSWORD});
 assert.equal(login.status,200);
 const admin=await invoke(adminOrdersHandler,'GET',undefined,{}, {cookie:login.cookie.split(';')[0]});
 assert.equal(admin.status,200);
 const row=admin.data.orders.find(x=>x.order_no===orderNo);
 assert.ok(row,'Buyer order must be visible to server-authenticated admin');
 assert.equal(row.payment_status,'PENDING');
 assert.equal(row.is_simulation,true);
 console.log('STOREFRONT->API->NEON->ADMIN PASS, international QA order PENDING, no capture, tampered quote blocked');
 console.log('QA order '+orderNo);
} finally {await pool.end();}
