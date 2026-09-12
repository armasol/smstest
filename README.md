# LAUNCH/SMS

A deployable SMS-first token launcher for **Pons v2 on Robinhood Chain**.

The user texts `LAUNCH`, answers 11 guided questions, reviews the token, and replies `CONFIRM`. The server then resolves the current Pons launch configuration and economics, simulates the exact transaction, signs with a dedicated backend launcher wallet, and returns the token/explorer link by SMS.

## What changed in v2 of this project

- Removed Twilio.
- Removed X API and X-profile scraping.
- Added HushSMS inbound webhook + outbound reply adapter.
- Uses Robinhood's public RPC directly: `https://rpc.mainnet.chain.robinhood.com`.
- Collects Pons metadata directly over SMS.
- Automatically resolves Pons technical fields at launch time.
- Added webhook deduplication.
- Added two-switch mainnet kill switch.
- Added `/test`, a browser SMS simulator that is permanently dry-run.
- Added `/api/status` for Pons/RPC/gate diagnostics.
- The public phone number is runtime-configured through environment variables.

## Deploy

1. Upload/import this repository to Vercel.
2. Add every required variable from `.env.example`.
3. Create an Upstash Redis database and add the REST URL/token.
4. Leave `EXECUTION_MODE=dry-run` and `ENABLE_ONCHAIN_LAUNCH=false`.
5. Open `/test` and complete the flow.
6. Buy a HushSMS mobile line with crypto.
7. Configure HushSMS inbound webhook to `https://YOUR-DOMAIN.com/api/sms`.
8. Add the HushSMS line ID, bearer token, webhook signing secret, and public number env values.
9. Text `LAUNCH` to the line and finish a real carrier dry-run.
10. Only after that, add a dedicated launcher wallet and turn on mainnet execution.

## Non-US phone testing

HushSMS advertises numbers in many European countries. For a Kosovo-based test, a nearby supported mobile line such as Serbia (+381) gives you a real international SMS path from a +383 phone without requiring a US SIM. The app does not assume a US phone number anywhere in the backend.

## Pons gate

Pons v2 currently documents public launches as closed and enforces the restriction inside the factory contract through `canLaunch(address)`. Removing a frontend/backend check cannot bypass the contract. Real mainnet execution therefore requires a launcher wallet that Pons currently allows. Dry-run SMS testing works without that access.

## Important

- Do not put `LAUNCHER_PRIVATE_KEY` in frontend code.
- Use a fresh, low-balance operational wallet.
- HushSMS request/response specifics should be verified against the line's current API panel/docs when the account is provisioned.
- Robinhood's public RPC is rate-limited; it is fine for early testing but a production service may eventually need a dedicated RPC provider.
- This project is independent and not affiliated with Robinhood Markets, Inc. or Pons.
