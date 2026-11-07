import {pool} from '../lib/db.js';
import {hashPassword} from '../lib/auth.js';
if(process.env.VERCEL_ENV==='production')throw new Error('Use an approved production provisioning procedure, not this development script');
const email=String(process.env.TRASTAR_INITIAL_ADMIN_EMAIL||'').toLowerCase();
const password=process.env.TRASTAR_INITIAL_ADMIN_PASSWORD;
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!password)throw new Error('Temporary admin email/password required via environment');
await pool.query("INSERT INTO admin_users(email,password_scrypt,role) VALUES($1,$2,'OWNER') ON CONFLICT(email) DO NOTHING",[email,hashPassword(password)]);
await pool.end();
console.log('Development admin provisioned; credentials not printed');
