import crypto from 'node:crypto';
import { HttpError } from './http.js';
import { requireDatabase, pool } from './db.js';
function key() { const s=process.env.SESSION_SECRET; if(!s || s.length<32) throw new HttpError(503,'AUTH_NOT_CONFIGURED','Admin authentication is not configured'); return s; }
function mac(x) { return crypto.createHmac('sha256',key()).update(x).digest('base64url'); }
export function createSession(user) {
  const payload = Buffer.from(JSON.stringify({id:user.id,role:user.role,exp:Math.floor(Date.now()/1000)+8*3600})).toString('base64url');
  return payload+'.'+mac(payload);
}
export function secureCookie(req,token) {
  const secure=(req.headers['x-forwarded-proto']==='https' || req.headers['x-forwarded-proto']?.startsWith('https'));
  return 'trastar_admin_session='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+ (token?'28800':'0') + (secure?'; Secure':'');
}
export function verifyPassword(pass, encoded) {
  if(typeof encoded !== 'string'|| !/^[0-9a-f]{32}:[0-9a-f]{128}$/i.test(encoded)) return false;
  const [salt,expected] = encoded.split(':');
  const actual=crypto.scryptSync(String(pass), Buffer.from(salt,'hex'),64);
  return crypto.timingSafeEqual(actual,Buffer.from(expected,'hex'));
}
export function hashPassword(pass) {
  if(typeof pass!=='string'||pass.length<12) throw new Error('Admin password must have at least 12 characters');
  const salt=crypto.randomBytes(16);
  return salt.toString('hex')+':'+crypto.scryptSync(pass,salt,64).toString('hex');
}
export async function requireAdmin(req,allowed=['OWNER','ADMIN','STAFF']) {
  requireDatabase();
  const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('trastar_admin_session='));
  if(!cookie) throw new HttpError(401,'UNAUTHORIZED','Login required');
  const token=cookie.slice('trastar_admin_session='.length), parts=token.split('.');
  if(parts.length!==2) throw new HttpError(401,'UNAUTHORIZED','Invalid session');
  const actual=Buffer.from(mac(parts[0])), given=Buffer.from(parts[1]);
  if(actual.length!==given.length||!crypto.timingSafeEqual(actual,given)) throw new HttpError(401,'UNAUTHORIZED','Invalid session');
  let data;
  try { data=JSON.parse(Buffer.from(parts[0],'base64url').toString()); } catch { throw new HttpError(401,'UNAUTHORIZED','Invalid session'); }
  if(!data.exp||data.exp < Date.now()/1000 || !allowed.includes(data.role)) throw new HttpError(403,'FORBIDDEN','Session expired or insufficient privileges');
  const result=await pool.query('SELECT id,email,role,enabled FROM admin_users WHERE id=$1',[data.id]);
  const user=result.rows[0];
  if(!user||!user.enabled||!allowed.includes(user.role)||user.role!==data.role) throw new HttpError(403,'FORBIDDEN','Account disabled or changed');
  return user;
}
