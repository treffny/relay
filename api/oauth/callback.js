import { kv } from '@vercel/kv';
import { randomId } from '../../lib/pkce.js';

const CANVA_CLIENT_ID = process.env.CANVA_CLIENT_ID;
const CANVA_CLIENT_SECRET = process.env.CANVA_CLIENT_SECRET;
const RELAY_BASE_URL = process.env.RELAY_BASE_URL;

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const code = url.searchParams.get('code');
    const sessionId = url.searchParams.get('state');

    if (!code || !sessionId) {
      return res.status(400).send('Missing code or state');
    }

    const raw = await kv.get(sessionId);
    if (!raw) {
      return res.status(400).send('Session not found or expired');
    }
    const session = JSON.parse(raw);

    // Exchange code with Canva
    const tokenResp = await fetch('https://api.canva.com/rest/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${RELAY_BASE_URL}/api/oauth/callback`,
        code_verifier: session.codeVerifier
      })
    });

    const text = await tokenResp.text();
    if (!tokenResp.ok) {
      console.error('Token exchange failed', tokenResp.status, text);
      return res.status(500).send('Token exchange failed');
    }

    let tokenJson;
    try { tokenJson = JSON.parse(text); }
    catch {
      console.error('Invalid token JSON', text);
      return res.status(500).send('Token parse failed');
    }

    // Issue a one-time code for ChatGPT to fetch tokens here
    const chatgptCode = randomId('code_');
    await kv.set(chatgptCode, JSON.stringify({
      provider: 'canva',
      token: tokenJson,
      createdAt: Date.now()
    }), { ex: 300 });

    const redirect = new URL(session.chatgptRedirect);
    redirect.searchParams.set('code', chatgptCode);
    if (session.chatgptState) redirect.searchParams.set('state', session.chatgptState);

    res.writeHead(302, { Location: redirect.toString() });
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal error in callback');
  }
}
