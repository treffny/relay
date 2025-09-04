# Canva OAuth Relay for ChatGPT Actions

This repo gives you a tiny OAuth relay that satisfies Canva PKCE and returns Canva tokens to ChatGPT Actions. Deploy on Vercel. Point your Action OAuth to the relay. Your Action can then call Canva REST with the returned Bearer token.

## Repository layout
1. `api/oauth/authorize.js` starts the flow. It creates a PKCE pair and redirects to Canva.
2. `api/oauth/callback.js` handles Canva redirect, exchanges the code for Canva tokens, then issues a one time code back to ChatGPT.
3. `api/oauth/token.js` is the token endpoint for ChatGPT. It returns Canva tokens for `authorization_code` and refreshes on `refresh_token`.
4. `openapi.yaml` is a starter spec for your Action. Replace RELAY_BASE_URL with your deployed relay domain.
5. `lib/pkce.js` contains PKCE helpers.
6. `vercel.json` configures Node runtime. Vercel KV is used for short lived storage.

## Prerequisites
1. Canva Developer account and an app created in the Canva Developer Portal.
2. Vercel account with the Vercel KV integration enabled for this project.
3. ChatGPT Plus account to create an Action.

## Environment variables
Set these in Vercel Project Settings
- `CANVA_CLIENT_ID` your Canva app client id
- `CANVA_CLIENT_SECRET` your Canva app client secret
- `CANVA_SCOPES` scopes separated by spaces. Suggested minimal set
  `design:content:read design:content:write folder:read autofill:write autofill:read`
- `RELAY_BASE_URL` your deployed Vercel domain for example `https://your-relay.vercel.app`
Vercel KV variables are created by the integration automatically.

## Step by step: Canva setup
1. Open Canva Developer Portal
2. Create an app or open your existing app
3. Copy the Client ID and Client Secret
4. Add this exact redirect to Authorized redirect URIs
   `https://YOUR-RELAY-DOMAIN/api/oauth/callback`
5. Tick the scopes you intend to request. Keep to the minimal set at first

## Step by step: Vercel deploy
1. Create a new Vercel project from this repository
2. Add the environment variables listed above
3. Add the Vercel KV integration to the project
4. Deploy. After deploy, note the public domain. Use it for RELAY_BASE_URL

## Step by step: ChatGPT Action
1. Create a new Action
2. Paste `openapi.yaml` and replace RELAY_BASE_URL with your relay domain
3. In the OAuth section set
   Authorization URL to `https://YOUR-RELAY-DOMAIN/api/oauth/authorize`
   Token URL to `https://YOUR-RELAY-DOMAIN/api/oauth/token`
   Client ID leave blank or any placeholder. The relay handles Canva Client authentication
   Client Secret leave blank
4. Save the Action. ChatGPT will generate a Callback URL but you can ignore it since the relay handles OAuth. The relay callback is what Canva uses
5. Start auth. The browser will go to your relay then to Canva. Approve access. The relay returns a one time code to ChatGPT which it swaps for tokens at the relay token endpoint
6. Call Canva endpoints from your Action paths for example POST `/designs` then POST `/exports`

## Notes
- Tokens are stored in Vercel KV only for the few seconds needed to hand them to ChatGPT or to process a refresh.
- You can expand the relay to proxy the Canva REST calls if you prefer, but it is not required.

## Troubleshooting
1. If you see an LHR incident code during authorize, check that CANVA_CLIENT_ID is set and your Canva redirect matches `https://YOUR-RELAY-DOMAIN/api/oauth/callback`
2. If ChatGPT says it cannot get a token, check the Vercel logs for `authorization_code` flow errors in `api/oauth/token.js`
3. If refresh fails, confirm the client secret and that your Canva app permits refresh tokens

