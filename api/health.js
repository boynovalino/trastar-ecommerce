import { pool, requireDatabase } from '../lib/db.js';
import { json, run, method } from '../lib/http.js';
export default run(async (req,res)=>{
  method(req,['GET']);
  requireDatabase();
  const result=await pool.query("SELECT to_regclass('public.orders') IS NOT NULL AS schema_ready");
  json(res,result.rows[0]?.schema_ready?200:503,{app:'trastar-ecommerce',status:result.rows[0]?.schema_ready?'ok':'schema_missing',database:'connected',payment:'not_configured',shipping:'preview_simulation_only'});
});
