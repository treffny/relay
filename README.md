# Canva OAuth Relay v2 for ChatGPT Actions

A minimal relay that satisfies Canva PKCE and server-side token exchange, then returns Canva tokens to ChatGPT Actions.

## Routes
- `GET /api/oauth/authorize` – Builds the Canva authorisation URL with PKCE (S256) and redirects the user to Canva.
- `GET /api/oauth/callback` – Receives the Canva `code`, exchanges it for tokens at Canva, then redirects back to ChatGPT with a one-time `code`.
- `POST /api/oauth/token` – ChatGPT exchanges the one-time `code` for tokens here. Also supports `grant_type=refresh_token`.

## Environment variables
Set these in Vercel Project Settings:
- `CANVA_CLIENT_ID`
- `CANVA_CLIENT_SECRET`
- `CANVA_SCOPES` (default provided):  
  `design:content:read design:content:write folder:read autofill:write autofill:read`
- `RELAY_BASE_URL` e.g. `https://your-relay.vercel.app`

> Add the **Vercel KV** integration to this project.

## Deploy on Vercel
1. Push this repo to GitHub and import into Vercel.
2. Add the env vars listed above.
3. Add the Vercel KV integration.
4. Deploy. Note the public domain and set `RELAY_BASE_URL` accordingly.

## Canva Developer Portal
1. Open your Canva app.
2. Add this exact redirect URI: `https://YOUR-RELAY-DOMAIN/api/oauth/callback`
3. Tick only the scopes you request.
4. Copy Client ID and Client Secret into Vercel env vars.

## ChatGPT Action OpenAPI
Point OAuth to the **relay**. Keep API server as Canva REST.

```yaml
components:
  securitySchemes:
    oAuth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://YOUR-RELAY-DOMAIN/api/oauth/authorize
          tokenUrl: https://YOUR-RELAY-DOMAIN/api/oauth/token
          scopes:
            design:content:write: Create designs
            design:content:read: Read designs and export
            folder:read: Read folders and items
            autofill:write: Create autofill jobs
            autofill:read: Read autofill job status

servers:
  - url: https://api.canva.com/rest/v1
    description: Canva REST base
```

## Troubleshooting
- **LHR incident code on Canva**: check `CANVA_CLIENT_ID`, scopes, and that the relay callback is whitelisted.
- **Action cannot get token**: open Vercel logs for `/api/oauth/callback` and `/api/oauth/token`.
- **Vercel legacy runtime error**: ensure there is **no `vercel.json`** in the repo and the Project uses Node.js 20 with auto-detected functions.
