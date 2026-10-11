# Greenfix signup deployment

The website sends POST requests to `/api/greenfix/subscribe` on Roundflow.
Plans are Lawn £39, Silver £59 and Gold £79 per month. Both uppercase and
lowercase plan keys are accepted. GoCardless returns customers to
`/api/greenfix/mandate-complete`, which requests phone verification and
redirects to the customer's portal. The signup handler creates only the Roundflow
customer before checkout. It prefills the hosted GoCardless page, which creates
the GoCardless customer during mandate setup. The completion callback stores the
customer and mandate IDs returned by that flow.

Direct GoCardless customer creation can require approval for custom payment
pages, even with a valid Read-write token. It is unnecessary for this hosted flow
and was removed after the live account returned 403 at that step.

Deploy the Roundflow change before the Greenfix website change. The compatibility
endpoint `/api/public/signup` accepts both the earlier `package`/`address` fields
and the website's `plan`/`addressLine1` fields, and returns both `ok` and `success`.
Preserve a backup of any uncommitted server changes before updating the checkout.

The October 11 VPS had a customized GoCardless webhook and `/signup/success`
page that were absent from GitHub main. The release preserves those files.
`deployments/greenfix-legacy-webhook.patch` records the guard applied to that
custom webhook so the new garden subscription callback and legacy hook cannot
both request verification. This patch targets the VPS's customized webhook,
not the unmodified GitHub webhook. The original server source and process
configuration are backed up in `/var/backups/roundflow/pre-codex-20261011.tar.gz`.

Check the VPS environment:

- `NEXT_PUBLIC_APP_URL=https://roundflow.greenfixexterior-care.co.uk`
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
curl --max-time 20 -i -X OPTIONS https://roundflow.greenfixexterior-care.co.uk/api/greenfix/subscribe \
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
