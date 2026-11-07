import {withTransaction,pool} from '../lib/db.js';
if(process.env.VERCEL_ENV==='production') throw new Error('Demo seed is forbidden in production');
if(process.env.ALLOW_PREVIEW_SIMULATION!=='true')throw new Error('Set ALLOW_PREVIEW_SIMULATION=true explicitly for demo data seeding');
const seed=[
{sku:'DEMO-BRAKE-01',slug:'demo-kampas-rem',name:'[DEMO] Kampas Rem Motor',weight:450,price:150000,stock:20,tiers:[[5,140000],[10,130000],[20,120000]]},
{sku:'DEMO-FILTER-01',slug:'demo-filter-udara',name:'[DEMO] Filter Udara Motor',weight:300,price:75000,stock:35,tiers:[[5,70000],[10,65000]]}
];
await withTransaction(async db=>{
 for(const s of seed){
  const p=await db.query("INSERT INTO products(sku,slug,name,description,is_active,export_allowed,weight_grams) VALUES($1,$2,$3,$4,true,true,$5) ON CONFLICT(sku) DO UPDATE SET name=EXCLUDED.name RETURNING id",[s.sku,s.slug,s.name,'Development fixture. Not a real TRASTAR item.',s.weight]);
  const v=await db.query("INSERT INTO variants(product_id,sku,unit_price_idr,stock_on_hand) VALUES($1,$2,$3,$4) ON CONFLICT(sku) DO UPDATE SET unit_price_idr=EXCLUDED.unit_price_idr RETURNING id",[p.rows[0].id,s.sku,s.price,s.stock]);
  for(const [min,price] of s.tiers)await db.query("INSERT INTO product_price_tiers(variant_id,min_qty,unit_price_idr) VALUES($1,$2,$3) ON CONFLICT(variant_id,min_qty) DO UPDATE SET unit_price_idr=EXCLUDED.unit_price_idr",[v.rows[0].id,min,price]);
 }
});
await pool.end();
console.log('Seeded TRASTAR development fixtures only');
