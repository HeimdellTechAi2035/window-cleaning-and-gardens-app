# Greenfix signup deployment

The website sends POST requests to `/api/greenfix/subscribe` on Roundflow.
Plans are Lawn £39, Silver £59 and Gold £79 per month. Both uppercase and
lowercase plan keys are accepted. GoCardless returns customers to
`/api/greenfix/mandate-complete`, which requests phone verification and
redirects to the customer's portal.

Deploy the Roundflow change before the Greenfix website change. The VPS-only
`/api/public/signup` route described in the previous troubleshooting session
is absent from GitHub main; preserve a backup of any uncommitted server changes
before updating the checkout.

Check the VPS environment:

- `NEXT_PUBLIC_APP_URL=https://roundflow.uk`
- `GREENFIX_ORG_ID` identifies the actual Greenfix organization.
- That organization's GoCardless access token and environment are configured.
- `TPV_API_URL` points to the verification service and `TPV_API_KEY` is set.

Deploy the existing garden subscription migration using the normal release
procedure. The repository's `npm run build` also runs `prisma migrate deploy`,
so it requires the correct production database environment. Restart the
Roundflow process after building. Deploy the website change afterward.

Check OPTIONS responses from both website origins. Each should return 204
and `Access-Control-Allow-Origin` matching the requested origin:

```bash
curl --max-time 20 -i -X OPTIONS https://roundflow.uk/api/greenfix/subscribe \
  -H 'Origin: https://greenfixexterior-care.co.uk' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: Content-Type'
```

Repeat with `https://www.greenfixexterior-care.co.uk`. Test actual signup and
mandate completion using a GoCardless sandbox organization before any live
payment setup. Check that the saved subscription and phone verification use
the selected plan's price, and that the portal opens without an admin login.

Local tests mock GoCardless, the database and verification service; they do
not prove that VPS environment values, DNS or provider credentials work.
