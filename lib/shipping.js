import crypto from 'node:crypto';
import { HttpError } from './http.js';
function secret(){const s=process.env.SESSION_SECRET;if(!s||s.length<32)throw new HttpError(503,'QUOTE_KEY_MISSING','Quote signing unavailable');return s;}
function hmac(payload){return crypto.createHmac('sha256',secret()).update(payload).digest('base64url');}
export function allowSimulation(){
  return process.env.ALLOW_PREVIEW_SIMULATION==='true' && (process.env.VERCEL_ENV==='preview' || (process.env.TRASTAR_ENV==='development' && process.env.VERCEL_ENV!=='production'));
}
export function signQuote(data) {
  const raw=Buffer.from(JSON.stringify({...data,expires:Date.now()+5*60*1000})).toString('base64url');
  return raw+'.'+hmac(raw);
}
export function readQuote(token) {
  const parts=String(token||'').split('.');
  if(parts.length!==2) throw new HttpError(422,'INVALID_QUOTE','Invalid shipping quote');
  const expected=Buffer.from(hmac(parts[0])),provided=Buffer.from(parts[1]);
  if(expected.length!==provided.length || !crypto.timingSafeEqual(expected,provided)) throw new HttpError(422,'INVALID_QUOTE','Invalid shipping quote');
  let d;try{d=JSON.parse(Buffer.from(parts[0],'base64url').toString());}catch{throw new HttpError(422,'INVALID_QUOTE','Malformed quote');}
  if(d.expires<Date.now()) throw new HttpError(409,'QUOTE_EXPIRED','Shipping quote expired');
  return d;
}
export function previewShipping({country,weightGrams}) {
  if(!allowSimulation()) throw new HttpError(503,'SHIPPING_PROVIDER_PENDING','Live shipping carrier integration is not configured');
  const grams=Number(weightGrams);
  if(!/^[A-Z]{2}$/.test(country)||!Number.isSafeInteger(grams)||grams<1)throw new HttpError(422,'INVALID_SHIPPING_ADDRESS','A supported country and positive package weight are required');
  const cost=country==='ID' ? 20000+Math.ceil(grams/1000)*5000 : 150000+Math.ceil(grams/1000)*60000;
  const data={provider:'SIMULATION_ONLY',service:country==='ID'?'DOMESTIC_TEST':'INTERNATIONAL_TEST',country,weightGrams:grams,costIdr:cost,isSimulation:true};
  return {...data,label:'SIMULASI ONGKIR - BUKAN TARIF KURIR',quoteToken:signQuote(data)};
}
