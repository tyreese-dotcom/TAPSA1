// Receives Yoco's payment.succeeded webhook, verifies it, then emails you the order (and optionally adds it to a Google Sheet).
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function verify(req, raw, secret) {
  const id = req.headers.get('webhook-id'), ts = req.headers.get('webhook-timestamp'), sig = req.headers.get('webhook-signature');
  if (!id || !ts || !sig || !secret || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', b64(secret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${raw}`)));
  const exp = btoa(String.fromCharCode(...mac));
  return sig.split(' ').some(p => p.split(',')[1] === exp);
}
export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  if (!(await verify(request, raw, env.YOCO_WEBHOOK_SECRET))) return new Response('bad signature', { status: 401 });
  const ev = JSON.parse(raw);
  if (ev.type !== 'payment.succeeded') return new Response('ok');
  const id = ev.payload && ev.payload.metadata && ev.payload.metadata.orderId;
  if (!id || await env.ORDERS.get('paid:' + id)) return new Response('ok');
  const o = JSON.parse((await env.ORDERS.get(id)) || 'null');
  if (!o) return new Response('ok');
  const text = `PAID ORDER ${o.orderId}\n${o.product} x ${o.qty} = R${o.total}\n\nProgram the card(s) with:\n${o.links.join('\n')}\n\nCustomer: ${o.customer.name}\n${o.customer.email}\n${o.customer.phone}\nDeliver to: ${o.customer.address}`;
  const jobs = [];
  if (env.RESEND_API_KEY && env.ORDER_EMAIL_TO) jobs.push(fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env.ORDER_EMAIL_FROM || 'TapSA <onboarding@resend.dev>', to: [env.ORDER_EMAIL_TO], reply_to: o.customer.email, subject: 'TapSA order ' + o.orderId, text }) }));
  if (env.SHEET_WEBHOOK_URL) jobs.push(fetch(env.SHEET_WEBHOOK_URL, { method: 'POST', body: JSON.stringify(o) }));
  const res = await Promise.allSettled(jobs);
  if (res.some(r => r.status === 'rejected' || (r.value && !r.value.ok && r.value.status < 300 === false && r.value.status >= 400))) return new Response('retry', { status: 500 });
  await env.ORDERS.put('paid:' + id, '1', { expirationTtl: 60 * 60 * 24 * 90 });
  return new Response('ok');
}
