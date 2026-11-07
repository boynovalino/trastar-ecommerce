import test from 'node:test';
import assert from 'node:assert/strict';
import {unitPriceForQty,normalizeItems} from '../lib/pricing.js';
import {previewShipping,readQuote,allowSimulation} from '../lib/shipping.js';
import {hashPassword,verifyPassword} from '../lib/auth.js';
import {method,HttpError} from '../lib/http.js';
test('tier pricing respects quantity thresholds',()=>{
 const tiers=[{min_qty:5,unit_price_idr:'140000'},{min_qty:10,unit_price_idr:'130000'},{min_qty:20,unit_price_idr:'120000'}];
 assert.equal(unitPriceForQty(150000,tiers,1),150000);
 assert.equal(unitPriceForQty(150000,tiers,5),140000);
 assert.equal(unitPriceForQty(150000,tiers,9),140000);
 assert.equal(unitPriceForQty(150000,tiers,10),130000);
 assert.equal(unitPriceForQty(150000,tiers,20),120000);
});
test('normalize cart merges same SKU and rejects invalid quantity',()=>{
 const id='42c00000-0000-4000-8000-000000000001';
 assert.deepEqual(normalizeItems([{variantId:id,quantity:2},{variantId:id,quantity:3}]),[{variantId:id,quantity:5}]);
 assert.throws(()=>normalizeItems([{variantId:id,quantity:0}]),/Quantity/);
 assert.throws(()=>normalizeItems([{variantId:id,quantity:1000}]),/Quantity/);
});
test('preview shipping is signed and never accidentally enabled in production',()=>{
 const oldSim=process.env.ALLOW_PREVIEW_SIMULATION,oldEnv=process.env.VERCEL_ENV,oldSecret=process.env.SESSION_SECRET;
 try {
 process.env.ALLOW_PREVIEW_SIMULATION='true'; process.env.VERCEL_ENV='preview'; process.env.SESSION_SECRET='12345678901234567890123456789012';
 const quote=previewShipping({country:'SG',weightGrams:1000});
 assert.equal(quote.isSimulation,true);
 assert.equal(quote.provider,'SIMULATION_ONLY');
 assert.equal(readQuote(quote.quoteToken).costIdr,210000);
 assert.throws(()=>readQuote(quote.quoteToken+'x'),/Invalid shipping quote/);
 process.env.VERCEL_ENV='production';
 assert.equal(allowSimulation(),false);
 delete process.env.VERCEL_ENV;
 assert.equal(allowSimulation(),false);
 assert.throws(()=>previewShipping({country:'SG',weightGrams:1000}),/not configured/);
 }finally{ if(oldSim===undefined)delete process.env.ALLOW_PREVIEW_SIMULATION;else process.env.ALLOW_PREVIEW_SIMULATION=oldSim;if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv;if(oldSecret===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=oldSecret;}
});
test('passwords are salted hashes and incorrect passwords fail',()=>{
 const h=hashPassword('SufficientPassword_345!');
 assert.equal(verifyPassword('SufficientPassword_345!',h),true);
 assert.equal(verifyPassword('wrong-value',h),false);
 assert.equal(h.includes('SufficientPassword'),false);
});
test('cross-origin POST blocked',()=>{
 assert.throws(()=>method({method:'POST',headers:{origin:'https://evil.example',host:'trastar.example'}},['POST']),e=>e.status===403);
 assert.doesNotThrow(()=>method({method:'POST',headers:{origin:'https://trastar.example',host:'trastar.example'}},['POST']));
});
