import {json,run,method} from '../lib/http.js';
// The merchant has not selected/activated a gateway. Do not fake capture, VA or QRIS.
export default run(async(req,res)=>{
  method(req,['POST']);
  return json(res,503,{error:'GATEWAY_NOT_CONFIGURED',message:'Payment gateway is pending merchant activation. No real payment can be processed.'});
});
