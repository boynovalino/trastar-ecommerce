import {json,run,method,body,HttpError} from '../lib/http.js';
import {createPreviewOrder,findOrderForCustomer} from '../lib/checkout.js';
export default run(async(req,res)=>{
  if(req.method==='POST'){
    method(req,['POST']);
    const input=await body(req);
    const order=await createPreviewOrder(input);
    return json(res,201,order);
  }
  method(req,['GET']);
  const no=String(req.query?.orderNo||'');
  const access=String(req.headers['x-order-access-token']||'');
  if(access.length<16)throw new HttpError(401,'ORDER_ACCESS_REQUIRED','Order access token required');
  return json(res,200,{order:await findOrderForCustomer(no,access)});
});
