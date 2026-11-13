// Creates a Yoco checkout. Prices live here (server side) so customers cannot change them.
const CATALOG = {
 "google-white": {
  "name": "Google Review Card (White)",
  "price": 129,
  "links": [
   "Your Google review link"
  ]
 },
 "google-black": {
  "name": "Google Review Card (Black)",
  "price": 129,
  "links": [
   "Your Google review link"
  ]
 },
 "facebook": {
  "name": "Facebook Follow Card",
  "price": 129,
  "links": [
   "Your Facebook page link"
  ]
 },
 "instagram": {
  "name": "Instagram Follow Card",
  "price": 129,
  "links": [
   "Your Instagram profile link"
  ]
 },
 "menu": {"name": "Menu Card (NFC)", "price": 129, "links": ["Your online menu link"]},
 "google-duo": {
  "name": "Google Review Duo (Black + White)",
  "price": 229,
  "links": [
   "Your Google review link"
  ]
 },
 "social-duo": {
  "name": "Instagram + Facebook Duo",
  "price": 229,
  "links": [
   "Your Instagram profile link",
   "Your Facebook page link"
  ]
 }
};
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
export async function onRequestPost({ request, env }) {
  if (!env.YOCO_SECRET_KEY || !env.ORDERS) return json({ error: 'Store is not configured yet.' }, 500);
  let b; try { b = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const it = CATALOG[b.slug]; if (!it) return json({ error: 'Unknown product' }, 400);
  const qty = Math.floor(Number(b.qty)); if (!(qty >= 1 && qty <= 99)) return json({ error: 'Bad quantity' }, 400);
  const clean = v => String(v || '').trim().slice(0, 300), c = b.customer || {};
  const cust = { name: clean(c.name), email: clean(c.email), phone: clean(c.phone), address: clean(c.address) };
  if (!cust.name || !/^\S+@\S+\.\S+$/.test(cust.email) || !cust.phone || !cust.address) return json({ error: 'Please fill in all your details.' }, 400);
  const links = (Array.isArray(b.links) ? b.links : []).map(clean);
  if (links.length !== it.links.length || links.some(l => !/^https?:\/\//i.test(l))) return json({ error: 'Please enter your full link, starting with https://' }, 400);
  const total = it.price * qty;
  const orderId = 'T' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
  const order = { orderId, product: it.name, qty, total, customer: cust, links: it.links.map((l, i) => l + ': ' + links[i]), created: new Date().toISOString() };
  await env.ORDERS.put(orderId, JSON.stringify(order), { expirationTtl: 60 * 60 * 24 * 90 });
  const origin = new URL(request.url).origin;
  const r = await fetch('https://payments.yoco.com/api/checkouts', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.YOCO_SECRET_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ amount: total * 100, currency: 'ZAR', successUrl: `${origin}/thanks?o=${orderId}&v=${total}`, cancelUrl: `${origin}/p/${b.slug}?cancelled=1`, failureUrl: `${origin}/p/${b.slug}?failed=1`, metadata: { orderId } })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.redirectUrl) { console.log('Yoco error', r.status, JSON.stringify(d)); return json({ error: 'Could not start payment. Please try again.' }, 502); }
  return json({ url: d.redirectUrl });
}
