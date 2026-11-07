import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

for (const file of ['index.html','admin.html']) {
  test(file+' inline scripts compile and demo notice is visible',()=>{
    const html=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
    assert.match(html,/role="status"[^>]*>TRASTAR (?:PROTOTYPE|ADMIN DEMO)/);
    const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(Boolean);
    assert.ok(scripts.length>=1);
    for (const source of scripts) new vm.Script(source,{filename:file});
  });
}
test('buyer payment cannot create a fake PAID order in the prototype',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/Disabled legacy payment and localStorage order pages/);
 assert.match(html,/startTrastarStorefront/);
 assert.match(html,/storefront-connected\.js/);
 assert.match(html,/const PRODUCTS = \[\];/);
 assert.doesNotMatch(html,/paymentStatus:'PAID', orderStatus:'PROCESSING'/);
});

test('qa.html uses only development fixtures and inline script compiles',()=>{
 const html=fs.readFileSync(new URL('../qa.html',import.meta.url),'utf8');
 assert.match(html,/KHUSUS DEVELOPMENT/);
 assert.match(html,/qa-fixture@example\.invalid/);
 assert.match(html,/\/api\/products/);
 assert.match(html,/\/api\/quote/);
 assert.match(html,/\/api\/orders/);
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(Boolean);
 assert.ok(scripts.length);
 for(const source of scripts)new vm.Script(source,{filename:'qa.html'});
});

test('admin-live.html uses auth session and server-backed product/order APIs',()=>{
 const html=fs.readFileSync(new URL('../admin-live.html',import.meta.url),'utf8');
 assert.match(html,/DEV ONLY/);
 for(const path of ['/api/session','/api/admin-products','/api/admin-price-tiers','/api/admin-orders','/api/admin-inventory','/api/admin-product-update'])assert.ok(html.includes(path));
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(Boolean);
 assert.ok(scripts.length);for(const source of scripts)new vm.Script(source,{filename:'admin-live.html'});
});

test('connected storefront uses database-backed catalog and unpaid orders',()=>{
 const js=fs.readFileSync(new URL('../storefront-connected.js',import.meta.url),'utf8');
 new vm.Script(js,{filename:'storefront-connected.js'});
 assert.match(js,/api\('\/api\/products'\)/);
 assert.match(js,/api\('\/api\/quote'/);
 assert.match(js,/api\('\/api\/orders'/);
 assert.match(js,/data\.paymentStatus!=='PENDING'/);
 assert.match(js,/sessionStorage\.setItem\('trastar_preview_order'/);
 assert.match(js,/trastar_preview_order/);
 assert.match(js,/ConnectedCheckoutPage/);
 assert.match(js,/ConnectedOrderPage/);
 assert.doesNotMatch(js,/localStorage\./);
 assert.doesNotMatch(js,/paymentStatus\s*:\s*['"]PAID['"]/);
});

test('admin main route serves database UI with audited actions',()=>{
 const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 for(const route of ['/admin','/admin/:path*']){
  assert.equal(config.rewrites.find(x=>x.source===route)?.destination,'/admin-live.html');
 }
 const admin=fs.readFileSync(new URL('../admin-live.html',import.meta.url),'utf8');
 for(const id of ['editProduct','editName','stockEdit','priceEdit','saveInventory','saveProduct','orderDetail','cancelReason']){
  assert.match(admin,new RegExp('id="'+id+'"'));
 }
 assert.match(admin,/cancel_simulation/);
 assert.match(admin,/reason:\$\('stockReason'\)/);
 assert.match(admin,/reason:\$\('productReason'\)/);
});
