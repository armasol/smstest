# LAUNCH/SMS

A production-oriented SMS launch surface for Robinhood Chain. The site is static and deploys on Vercel; the `/api/sms` serverless function handles Twilio inbound SMS, X metadata lookup, short-lived confirmation state, and Pons v2 contract deployment.

## What is included

- Premium responsive landing page, inspired by the cinematic structure of the supplied reference but implemented from scratch.
- All CTAs open the device SMS composer with a prefilled launch command.
- Twilio-compatible inbound SMS webhook with optional signature verification.
- X API v2 profile lookup and metadata generation.
- 15-minute pending launch state using Upstash Redis REST, with an in-memory fallback for local testing.
- Explicit `YES` confirmation before onchain execution.
- Pons v2 / Robinhood Chain execution using `viem`.
- Sender allowlist and public-launch kill switch.
- Docs, privacy and terms routes.

## Important before public deployment

The displayed `+1 (555) 013-7117` is a fictional US placeholder. Buy a real SMS-capable number from Twilio, update `assets/app.js` + visible copy, and point its incoming-message webhook to `https://YOUR-DOMAIN/api/sms` using POST.

Pons v2 currently documents that public launches are closed and launchers must pass `canLaunch(address)`. The code checks this on every deployment and fails safely if the configured hot wallet is not approved.

## Deploy to Vercel

1. Push this folder to GitHub.
2. Import the repo in Vercel.
3. Add all required values from `.env.example`.
4. Deploy.
5. In Twilio, set the SMS webhook on your purchased phone number to `POST https://YOUR-DOMAIN/api/sms`.
6. Fund the dedicated launcher wallet with enough ETH to pay launch fees and gas.
7. Keep `ALLOW_PUBLIC_LAUNCHES=false` during testing and add your own E.164 phone number to `ALLOWED_PHONE_NUMBERS`.

No build command is required for the static pages. Vercel will install the `viem` dependency for the serverless function.

## SMS command

```text
LAUNCH @orbitlabs $ORBIT
```

Then:

```text
YES
```

To stop:

```text
CANCEL
```

## Production hardening

Before making the number public, add per-phone/IP rate limiting, billing or deposits for sponsored launch fees, abuse review, alerting, wallet balance monitoring, and counsel-reviewed legal policies. Use a dedicated launcher key with the minimum practical balance; never use a treasury key.
