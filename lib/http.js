export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
export function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.end(JSON.stringify(data));
}
export function method(req, allowed) {
  resHeaderGuard(req);
  if(!allowed.includes(req.method)) throw new HttpError(405,'METHOD_NOT_ALLOWED','Method not supported');
}
export function resHeaderGuard(req) {
  // Deny cross-origin state-changing requests without requiring permissive CORS.
  if(['POST','PUT','PATCH','DELETE'].includes(req.method) && req.headers.origin) {
    const origin = new URL(req.headers.origin);
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (origin.host !== host) throw new HttpError(403,'ORIGIN_MISMATCH','Invalid request origin');
  }
}
export async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString();
    if(raw.length > 65536) throw new HttpError(413,'BODY_TOO_LARGE','Request too large');
  }
  try { return JSON.parse(raw || '{}'); }
  catch { throw new HttpError(400,'INVALID_JSON','Invalid JSON payload'); }
}
export function run(handler) {
  return async(req,res) => {
    try { await handler(req,res); }
    catch(e) {
      const status = Number(e.status) || 500;
      if(status >= 500) console.error('API failure:',e.code || e.name, e.message);
      json(res,status,{error:e.code || 'INTERNAL_ERROR',message:status >=500 ? 'Request could not be completed' : e.message});
    }
  };
}
