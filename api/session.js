import crypto from 'node:crypto';
import {pool,requireDatabase} from '../lib/db.js';
import {createSession,secureCookie,verifyPassword,requireAdmin} from '../lib/auth.js';
import {json,run,method,body,HttpError} from '../lib/http.js';
export default run(async(req,res)=>{
  if(req.method==='GET') {
    const user=await requireAdmin(req);
    return json(res,200,{user:{email:user.email,role:user.role}});
  }
  if(req.method==='DELETE') {
    method(req,['DELETE']);
    res.setHeader('Set-Cookie',secureCookie(req,''));
    return json(res,200,{ok:true});
  }
  method(req,['POST']);requireDatabase();
  const input=await body(req),email=String(input.email||'').trim().toLowerCase(), password=String(input.password||'');
  if(email.length>254||password.length>1024||!email)throw new HttpError(422,'INVALID_CREDENTIALS','Invalid credentials');
  const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim().slice(0,100);
  const ipHash=crypto.createHash('sha256').update(ip).digest('hex');
  // Database-backed login throttling also works across serverless instances.
  const attempts=await pool.query("SELECT count(*)::int AS n FROM admin_login_attempts WHERE attempted_at > now() - interval '15 minutes' AND (email=$1 OR ip_hash=$2)",[email,ipHash]);
  if(attempts.rows[0].n>=5)throw new HttpError(429,'LOGIN_RATE_LIMIT','Too many login attempts. Try later.');
  await pool.query('INSERT INTO admin_login_attempts(email,ip_hash) VALUES($1,$2)',[email,ipHash]);
  const result=await pool.query('SELECT id,email,role,password_scrypt,enabled FROM admin_users WHERE email=$1',[email]);
  const user=result.rows[0];
  // Timing parity for unknown users.
  const dummy='00000000000000000000000000000000:'+ '00'.repeat(64);
  const valid=verifyPassword(password,user?.password_scrypt||dummy);
  if(!user||!user.enabled||!valid)throw new HttpError(401,'INVALID_CREDENTIALS','Invalid credentials');
  res.setHeader('Set-Cookie',secureCookie(req,createSession(user)));
  json(res,200,{user:{email:user.email,role:user.role}});
});
