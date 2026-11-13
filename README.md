# TapSA site: deploy guide

Static site + two Cloudflare Pages Functions (`functions/api/checkout.js`, `webhook.js`). Orders are confirmed by Yoco webhook, then emailed to you.

## 1. Put it online (free)
Cloudflare drag-and-drop does NOT build the `functions` folder. Use one of:
- **GitHub (no terminal):** create a GitHub repo, upload all files here, then Cloudflare > Workers & Pages > Create > Pages > Connect to Git. Build command: none. Output directory: `/`.
- **Wrangler:** `npx wrangler pages deploy .` from this folder.

## 2. Create the order store
Cloudflare > Storage > KV > create a namespace (e.g. `tapsa-orders`). In your Pages project > Settings > Bindings (Functions), add a KV binding named exactly `ORDERS`.

## 3. Variables (Pages project > Settings > Variables and secrets, add as secrets)
- `YOCO_SECRET_KEY` : start with your TEST secret key from the Yoco app (Checkout API integration)
- `ORDER_EMAIL_TO` : your email. `RESEND_API_KEY` : free key from resend.com
- optional `ORDER_EMAIL_FROM` (needs a domain verified in Resend), `SHEET_WEBHOOK_URL` (see below)

## 4. Register the Yoco webhook
After the site is live (use your real domain), run once, with your secret key:
```
curl -X POST https://payments.yoco.com/api/webhooks -H "Authorization: Bearer YOUR_SECRET_KEY" -H "Content-Type: application/json" -d '{"name":"tapsa","url":"https://YOURDOMAIN.co.za/api/webhook"}'
```
The reply contains a `secret` starting `whsec_`. Save it as `YOCO_WEBHOOK_SECRET`, then redeploy (variable changes apply to new deployments). Yoco allows 5 webhooks per account.

## 5. Test, then go live
Make a test order with the test key; check the email arrives. Then swap in the LIVE secret key, register the webhook again with it, update `YOCO_WEBHOOK_SECRET`, redeploy.

## 6. Domain
Pages project > Custom domains. Buy a .co.za domain from any registrar.

## 7. Ads
Put your Meta Pixel ID in `config.js`. It fires PageView, ViewContent, InitiateCheckout and Purchase (on /thanks).

## Google Sheet (optional)
Google Sheet > Extensions > Apps Script, paste, Deploy as Web app (anyone), copy URL into `SHEET_WEBHOOK_URL`:
```
function doPost(e){var o=JSON.parse(e.postData.contents);SpreadsheetApp.getActiveSheet().appendRow([o.created,o.orderId,o.product,o.qty,o.total,o.customer.name,o.customer.email,o.customer.phone,o.customer.address,o.links.join(' | ')]);return ContentService.createTextOutput('ok')}
```

## Edit before launch
- Prices: in BOTH `app.js` (PR list) and `functions/api/checkout.js` (CATALOG). The server price is the one charged.
- Footer in `index.html`: email, WhatsApp, company reg and VAT numbers. Check FAQ answers match how you really work.
