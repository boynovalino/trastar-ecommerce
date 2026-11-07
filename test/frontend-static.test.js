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
 assert.match(html,/PAYMENT DISABLED \(DEMO\)/);
 assert.match(html,/disabled:true, onClick:handlePayNow/);
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
 for(const path of ['/api/session','/api/admin-products','/api/admin-price-tiers','/api/admin-orders'])assert.ok(html.includes(path));
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(Boolean);
 assert.ok(scripts.length);for(const source of scripts)new vm.Script(source,{filename:'admin-live.html'});
});
