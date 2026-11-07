import assert from 'node:assert/strict';
import { pool } from '../lib/db.js';
import { createPreviewOrder, findOrderForCustomer } from '../lib/checkout.js';
import { previewShipping, readQuote } from '../lib/shipping.js';

if(process.env.TRASTAR_ENV!=='development' || !process.env.DATABASE_URL?.includes('/trastar_dev') || process.env.VERCEL_ENV==='production') {
 throw new Error('Refusing to run integration test outside the TRASTAR development database');
}
try {
 const identity=await pool.query("SELECT current_database() AS db, current_schema() AS schema, to_regclass('public.orders') AS orders_table");
 assert.equal(identity.rows[0].db,'trastar_dev');
 assert.equal(identity.rows[0].schema,'public');
 assert.equal(identity.rows[0].orders_table,'orders');
 const r=await pool.query("SELECT v.id, v.stock_on_hand-v.stock_reserved AS available, p.weight_grams FROM variants v JOIN products p ON p.id=v.product_id WHERE v.sku='DEMO-BRAKE-01'");
 assert.equal(r.rowCount,1);
 assert.ok(r.rows[0].available >= 5,'Not enough fixture stock to run checkout integration');
 const items=[{variantId:r.rows[0].id,quantity:5}];
 const quote=previewShipping({country:'SG',weightGrams:5*r.rows[0].weight_grams});
 assert.equal(quote.provider,'SIMULATION_ONLY');
 assert.equal(readQuote(quote.quoteToken).country,'SG');
 const order=await createPreviewOrder({
   items,quoteToken:quote.quoteToken,address:{country:'SG',city:'Singapore',line1:'TEST ONLY 123 Example Road',postalCode:'000000'},
   email:'qa-fixture@example.invalid',recipientName:'TRASTAR QA FIXTURE'
 });
 assert.equal(order.paymentStatus,'PENDING');
 assert.equal(order.isSimulation,true);
 assert.equal(order.paymentAvailable,false);
 assert.equal(order.totalIdr,5*140000+quote.costIdr);
 const stored=await findOrderForCustomer(order.orderNo,order.accessToken);
 assert.equal(stored.paymentStatus,'PENDING');
 assert.equal(stored.items.length,1);
 assert.equal(stored.items[0].quantity,5);
 assert.equal(Number(stored.items[0].unit_price_idr),140000);
 const v=await pool.query("SELECT o.is_simulation,o.payment_status,p.provider, p.status FROM orders o LEFT JOIN payments p ON p.order_id=o.id WHERE o.order_no=$1",[order.orderNo]);
 assert.equal(v.rows[0].payment_status,'PENDING');
 assert.equal(v.rows[0].is_simulation,true);
 assert.equal(v.rows[0].provider,null);
 console.log('INTEGRATION PASS: Neon identity, SQL schema, 5-unit gross tier, international preview quote, pending order, no payment captured');
 console.log('ORDER '+order.orderNo+' (synthetic fixture only, access token withheld)');
} finally { await pool.end(); }
