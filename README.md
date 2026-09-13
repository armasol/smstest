# imessage.fun

A deployable SMS-first token launcher for **Pons v2 on Robinhood Chain**.

The user texts `LAUNCH`, answers guided questions, reviews the token, and replies `CONFIRM`. This is a **fully non-custodial** flow: the server never holds a launcher private key and never signs anything on the customer's behalf. Instead, after `CONFIRM` we text a one-time link — *"Your token is ready. Tap to launch."* — that opens the customer's own wallet with the exact Pons `launchToken` transaction pre-filled. They approve it themselves, we watch the chain, and we text back the result.

This is more trust-minimized than a custodial launcher wallet, but it means every launch ends in a wallet transaction — the SMS thread prepares and confirms the launch, but the customer's wallet is the one signing it. Pons' own interface works the same way.

## What changed in v3 of this project

- **Removed the custodial launcher wallet.** There is no backend signing step anymore. `LAUNCHER_PRIVATE_KEY` is no longer used to sign transactions (it may still be set for read-only `canLaunch` diagnostics on `/api/status`).
- Added `/claim/:token` — a wallet-connect page. The SMS `CONFIRM` reply now returns a secure link instead of a final result.
- Added `api/claim/[token].js` — builds the unsigned transaction for the claim, accepts the submitted `txHash`, polls the chain, and sends the final SMS once the transaction is confirmed or reverted.
- Replaced Upstash Redis with **Supabase Postgres** for session state, webhook dedup, and launch claims (`sms_sessions`, `webhook_dedup`, `launch_claims` tables).
- Removed Twilio.
- Removed X API and X-profile scraping.
- Added HushSMS inbound webhook + outbound reply adapter.
- Uses Robinhood's public RPC directly: `https://rpc.mainnet.chain.robinhood.com`.
- Collects Pons metadata directly over SMS.
- Automatically resolves Pons technical fields at launch time.
- Added webhook deduplication.
- Added `/test`, a browser SMS simulator that is permanently dry-run.
- Added `/api/status` for Pons/RPC/gate diagnostics.
- The public phone number is runtime-configured through environment variables.

## Non-custodial launch flow

1. Customer texts `LAUNCH`, answers the prompts, reviews, replies `CONFIRM`.
2. Server creates a `launch_claims` row (draft, a fresh launch salt, 30-minute expiry) and texts back `https://YOUR-DOMAIN.com/claim/<token>`.
3. Customer opens the link on their phone. `claim/app.js` connects to `window.ethereum` (MetaMask, Rabby, Coinbase Wallet, etc.), switches/adds Robinhood Chain, and asks the wallet to send the exact `launchToken` transaction returned by `GET /api/claim/:token`.
4. The wallet shows the customer the real transaction (contract, calldata, value) — the same approval step Pons' own site would show.
5. Once submitted, the page polls `POST /api/claim/:token` with the `txHash`. The server checks the receipt, and on success/revert sends the final SMS and marks the claim `confirmed`/`failed`.
6. If the customer never opens the link, or the transaction never confirms, no funds move and no token is created — the claim just expires.

## Deploy

1. Upload/import this repository to Vercel.
2. Add every required variable from `.env.example`.
3. Connect the Supabase integration (or your own Supabase project) and set `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
4. Leave `EXECUTION_MODE=dry-run`. Dry-run mode never creates a claim link or touches your wallet.
5. Open `/test` and complete the flow.
6. Buy a HushSMS mobile line with crypto.
7. Configure HushSMS inbound webhook to `https://YOUR-DOMAIN.com/api/sms`.
8. Add the HushSMS line ID, bearer token, webhook signing secret, and public number env values.
9. Set `PUBLIC_SITE_URL` to your deployed domain so claim links resolve correctly.
10. Text `LAUNCH` to the line and finish a real carrier dry-run.
11. Only after that, switch `EXECUTION_MODE=mainnet`. There is no separate onchain kill switch anymore — every mainnet `CONFIRM` produces a claim link, and the customer's own wallet is what actually broadcasts the transaction.

## Non-US phone testing

HushSMS advertises numbers in many European countries. For a Kosovo-based test, a nearby supported mobile line such as Serbia (+381) gives you a real international SMS path from a +383 phone without requiring a US SIM. The app does not assume a US phone number anywhere in the backend.

## Pons gate

Pons v2 currently documents public launches as closed and enforces the restriction inside the factory contract through `canLaunch(address)`. Removing a frontend/backend check cannot bypass the contract. Real mainnet execution therefore requires a launcher wallet that Pons currently allows. Dry-run SMS testing works without that access.

## Important

- The backend never holds a signing key for customer launches. `LAUNCHER_PRIVATE_KEY`/`LAUNCHER_ADDRESS` are optional and only used for the read-only `canLaunch` diagnostic on `/api/status`.
- Claim links (`/claim/:token`) are single-use-in-spirit: the token is a random 24-byte value, only its SHA-256 hash is stored, and it expires 30 minutes after issue.
- `launch_claims`, `sms_sessions`, and `webhook_dedup` live in Supabase Postgres with RLS enabled and no anon/authenticated policies — only the service-role key (server-side only) can read or write them.
- HushSMS request/response specifics should be verified against the line's current API panel/docs when the account is provisioned.
- Robinhood's public RPC is rate-limited; it is fine for early testing but a production service may eventually need a dedicated RPC provider.
- Pons v2 currently documents public launches as closed and enforces the restriction inside the factory contract through `canLaunch(address)`. Since the customer's own wallet is the one calling `launchToken`, that wallet — not a backend wallet — needs to pass Pons' gate.
- This project is independent and not affiliated with Robinhood Markets, Inc. or Pons.
