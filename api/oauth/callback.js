// api/oauth/callback.js
export const config = { runtime: 'nodejs20.x' };

import { kv } from '@vercel/kv';
import { randomId } from '../../lib/pkce.js';

const CANVA_CLIENT_ID = process.env.CANVA_CLIENT_ID;
const CANVA_CLIENT_SECRET = process.env.CANVA_CLIENT_SECRET;
const RELAY_BASE_URL = process.env.RELAY_BASE_URL;

export default async function handler(req, res) {
  const log = [];
  const say = (msg, obj) => {
    const line = obj ? `${msg} ${JSON.stringify(obj)}` : msg;
    console.error('[callback]', line);
    log.push(line);
  };

  try {
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url, `https://${host}`);

    const code       = url.searchParams.get('code');
    const sessionId  = url.searchParams.get('state');
    const oerr       = url.searchParams.get('error');
    const oerrDesc   = url.searchParams.get('error_description') || '';

    say('incoming', { haveCode: !!code, haveState: !!sessionId, error: oerr });

    // Env sanity
    if (!CANVA_CLIENT_ID || !CANVA_CLIENT_SECRET || !RELAY_BASE_URL) {
      const msg = 'Server not configured: missing Canva env vars';
      say(msg, { hasId: !!CANVA_CLIENT_ID, hasSecret: !!CANVA_CLIENT_SECRET, hasRelay: !!RELAY_BASE_URL });
      return res.status(500).send(msg + '\n' + log.join('\n'));
    }
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      const msg = 'Server not configured: Vercel KV missing';
      say(msg);
      return res.status(500).send(msg + '\n' + log.join('\n'));
    }

    // If Canva sent an OAuth error (e.g., invalid_scope)
    if (oerr) {
      say('oauth error from Canva', { oerr, oerrDesc, sessionId });
      if (sessionId) {
        const raw = await kv.get(sessionId).catch(e => (say('kv.get error', {e: String(e)}), null));
        const session = raw ? JSON.parse(raw) : null;
        if (session?.chatgptRedirect) {
          const redirect = new URL(session.chatgptRedirect);
          redirect.searchParams.set('error', oerr);
          redirect.searchParams.set('error_description', oerrDesc);
          if (session.chatgptState) redirect.searchParams.set('state', session.chatgptState);
          res.writeHead(302, { Location: redirect.toString() });
          return res.end();
        }
      }
      return res.status(400).send(`Authorization failed: ${oerr} – ${oerrDesc}\n` + log.join('\n'));
    }

    if (!code || !sessionId) {
      const msg = 'Missing code or state';
      say(msg, { code, sessionId });
      return res.status(400).send(msg + '\n' + log.join('\n'));
    }

    // Load session (PKCE verifier etc.)
    const raw = await kv.get(sessionId).catch(e => (say('kv.get error', {e: String(e)}), null));
    if (!raw) {
      const msg = 'Session not found or expired';
      say(msg, { sessionId });
      return res.status(400).send(msg + '\n' + log.join('\n'));
    }
    const session = JSON.parse(raw);
    if (!session.codeVerifier) {
      const msg = 'PKCE verifier missing in session';
      say(msg);
      return res.status(400).send(msg + '\n' + log.join('\n'));
    }

    // Exchange code with Canva (be extra compatible: include client_id param AND Basic)
    const tokenURL = 'https://api.canva.com/rest/v1/oauth/token';
    const params = new URLSearchParams({
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
    const bodyText = await r.text();
    say('token response', { status: r.status, bodyPreview: bodyText.slice(0, 500) });

    if (!r.ok) {
      return res.status(502).send(`Token exchange failed (status ${r.status}). Body: ${bodyText}\n` + log.join('\n'));
    }

    let tokenJson;
    try {
      tokenJson = JSON.parse(bodyText);
    } catch (e) {
      say('json parse failed', { e: String(e) });
      return res.status(500).send('Token parse failed\n' + log.join('\n'));
    }

    // Issue one-time code for ChatGPT
    const chatgptCode = randomId('code_');
    await kv.set(chatgptCode, JSON.stringify({
      provider: 'canva',
      token: tokenJson,
      createdAt: Date.now()
    }), { ex: 300 }).catch(e => (say('kv.set error', {e: String(e)})));

    // Redirect back to ChatGPT with the one-time code
    const redirect = new URL(session.chatgptRedirect);
    redirect.searchParams.set('code', chatgptCode);
    if (session.chatgptState) redirect.searchParams.set('state', session.chatgptState);

    res.writeHead(302, { Location: redirect.toString() });
    res.end();
  } catch (e) {
    console.error('[callback] crashed', e);
    return res.status(500).send('Callback crashed:\n' + (e && e.stack ? e.stack : String(e)));
  }
}

