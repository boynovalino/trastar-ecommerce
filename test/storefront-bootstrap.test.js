import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script=fs.readFileSync(new URL('../storefront-connected.js',import.meta.url),'utf8');
function sandboxFor(getProducts) {
  const products=[{id:'fake-old-product'}];
  const reviews=[{name:'fake-testimonial'}];
  const routes=['/cart','/checkout','/orders/:orderId','/payment','/thank-you'].map(pattern=>({pattern,component:null}));
  const root={textContent:'',children:[],append(el){this.children.push(el)}};
  let started=0;
  const context={
    PRODUCTS:products,DUMMY_REVIEWS:reviews,ROUTES:routes,CATEGORIES:[{name:'Accessories',icon:'package'}],
    window:{startTrastarStorefront:()=>{started++}},
    document:{getElementById:()=>root,createElement:()=>({style:'',textContent:''})},
    fetch:async()=>getProducts(),console:{error(){}},sessionStorage:{setItem(){},getItem(){return null}},
    Error,Date,Number,Math,JSON,Intl,Array,String,Object,Set,Map,encodeURIComponent
  };
  return {context,products,reviews,routes,root,get started(){return started}};
}

test('startup replaces old catalog with actual Neon response and installs checkout routes',async()=>{
 const p=sandboxFor(()=>({
   ok:true,status:200,
   json:async()=>({products:[{
     slug:'demo-catalog',name:'[DEMO] Katalog',brand:'TRASTAR',category:'Accessories',
     weight_grams:350,description:'fixture',export_allowed:true,
     variants:[
       {id:'00000000-0000-4000-8000-000000000001',sku:'DEMO-001',unitPriceIdr:150000,availableStock:18,tiers:[{minQty:5,unitPriceIdr:140000}]},
       {id:'00000000-0000-4000-8000-000000000002',sku:'DEMO-002',unitPriceIdr:90000,availableStock:9,tiers:[]}
     ]
   }]})
 }));
 vm.runInNewContext(script,p.context);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(p.started,1);
 assert.equal(p.products.length,2);
 assert.equal(p.products[0].id,'00000000-0000-4000-8000-000000000001');
 assert.equal(p.products[0].stock,18);
 assert.equal(p.products[0].priceTiers[0].unitPriceIdr,140000);
 assert.equal(p.reviews.length,0);
 assert.equal(p.routes.every(r=>typeof r.component==='function'),true);
 assert.equal(p.context.window.__trastarStorefrontAdapter.priceForQuantity(p.products[0],5),140000);
 assert.equal(p.context.window.__trastarStorefrontAdapter.priceForQuantity(p.products[0],1),150000);
});

test('API catalog failure never falls back to seeded mock products',async()=>{
 const p=sandboxFor(()=>{throw new Error('Neon offline')});
 vm.runInNewContext(script,p.context);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(p.started,0);
 assert.equal(p.root.children.length,1);
 assert.match(p.root.children[0].textContent,/tidak dapat dimuat/i);
});
