// api/oauth/callback.js
export const config = { runtime: 'nodejs' };

import { kv } from '@vercel/kv';
import { randomId } from '../../lib/pkce.js';

const CANVA_CLIENT_ID     = process.env.CANVA_CLIENT_ID;
const CANVA_CLIENT_SECRET = process.env.CANVA_CLIENT_SECRET;
const RELAY_BASE_URL      = process.env.RELAY_BASE_URL;

function ensureObject(maybe) {
  // Accept object directly; parse string JSON; otherwise null.
  if (maybe && typeof maybe === 'object') return maybe;
  if (typeof maybe === 'string') {
    try { return JSON.parse(maybe); } catch { return null; }
  }
  return null;
}

export default async function handler(req, res) {
  const say = (...a) => console.error('[callback]', ...a);
  try {
    const host = req.headers.host || 'localhost';
    const url  = new URL(req.url, `https://${host}`);

    const code      = url.searchParams.get('code');
    const sessionId = url.searchParams.get('state');
    const oerr      = url.searchParams.get('error');
    const oerrDesc  = url.searchParams.get('error_description') || '';

    // Env checks
    if (!CANVA_CLIENT_ID || !CANVA_CLIENT_SECRET || !RELAY_BASE_URL) {
      say('Missing Canva env vars', { hasId: !!CANVA_CLIENT_ID, hasSecret: !!CANVA_CLIENT_SECRET, hasRelay: !!RELAY_BASE_URL });
      return res.status(500).send('Server not configured: missing Canva env vars');
    }
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      say('Missing KV env vars');
      return res.status(500).send('Server not configured: Vercel KV missing');
    }

    // Canva sent an OAuth error (e.g., invalid_scope)
    if (oerr) {
      say('OAuth error from Canva', { oerr, oerrDesc, sessionId });
      if (sessionId) {
        const raw = await kv.get(sessionId).catch(e => (say('kv.get error', e), null));
        const session = ensureObject(raw);
        if (session?.chatgptRedirect) {
          const redirect = new URL(session.chatgptRedirect);
          redirect.searchParams.set('error', oerr);
          redirect.searchParams.set('error_description', oerrDesc);
          if (session.chatgptState) redirect.searchParams.set('state', session.chatgptState);
          res.writeHead(302, { Location: redirect.toString() });
          return res.end();
        }
      }
      return res.status(400).send(`Authorization failed: ${oerr} – ${oerrDesc}`);
    }

    if (!code || !sessionId) {
      say('Missing code or state', { code: !!code, sessionId });
      return res.status(400).send('Missing code or state');
    }

    // Load session
    const raw = await kv.get(sessionId).catch(e => (say('kv.get error', e), null));
    const session = ensureObject(raw);
    if (!session) {
      say('Session not found/expired', { sessionId, rawType: typeof raw });
      return res.status(400).send('Session not found or expired');
    }
    if (!session.codeVerifier) {
      say('PKCE verifier missing in session', session);
      return res.status(400).send('PKCE verifier missing');
    }

    // Token exchange
    const tokenURL  = 'https://api.canva.com/rest/v1/oauth/token';
    const params    = new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  `${RELAY_BASE_URL}/api/oauth/callback`,
      code_verifier: session.codeVerifier,
      client_id:     CANVA_CLIENT_ID
    });
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept':       'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`).toString('base64')
    };

    say('token request', { url: tokenURL, body: Object.fromEntries(params) });
    const r = await fetch(tokenURL, { method: 'POST', headers, body: params });

    const ct = (r.headers.get('content-type') || '').toLowerCase();
    let bodyText = '', tokenJson = null;

    if (ct.includes('application/json')) {
      try {
        tokenJson = await r.json();
        bodyText  = JSON.stringify(tokenJson);
      } catch (e) {
        bodyText = await r.text(); // fallback to raw
      }
    } else {
      bodyText = await r.text();
      try { tokenJson = JSON.parse(bodyText); } catch { /* leave null */ }
    }

    say('token response', { status: r.status, preview: bodyText.slice(0, 600) });

    if (!r.ok) {
      return res.status(502).send(`Token exchange failed (status ${r.status}). Body: ${bodyText}`);
    }
    if (!tokenJson || !tokenJson.access_token) {
      return res.status(500).send(`Token parse failed. Body: ${bodyText}`);
    }

    // One-time code for ChatGPT
    const chatgptCode = randomId('code_');
    await kv.set(chatgptCode, {
      provider: 'canva',
      token: tokenJson,
      createdAt: Date.now()
    }, { ex: 300 });

    const redirect = new URL(session.chatgptRedirect);
    redirect.searchParams.set('code', chatgptCode);
    if (session.chatgptState) redirect.searchParams.set('state', session.chatgptState);

    res.writeHead(302, { Location: redirect.toString() });
    res.end();
  } catch (e) {
    console.error('[callback] crashed', e);
    res.status(500).send('Callback crashed:\n' + (e?.stack || String(e)));
  }
}
