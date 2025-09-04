import { kv } from '@vercel/kv';

const CANVA_CLIENT_ID = process.env.CANVA_CLIENT_ID;
const CANVA_CLIENT_SECRET = process.env.CANVA_CLIENT_SECRET;

async function parseBody(req) {
  const contentType = req.headers['content-type'] || '';
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');

  if (contentType.includes('application/json')) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(raw);
    const obj = {};
    for (const [k, v] of params.entries()) obj[k] = v;
    return obj;
  }
  // default
  try { return JSON.parse(raw); } catch { return {}; }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).send('Method Not Allowed');
      return;
    }

    const body = await parseBody(req);
    const grantType = body.grant_type;

    if (grantType === 'authorization_code') {
      const code = body.code;
      if (!code) {
        res.status(400).json({ error: 'invalid_request', error_description: 'Missing code' });
        return;
      }
      const raw = await kv.get(code);
      if (!raw) {
        res.status(400).json({ error: 'invalid_grant', error_description: 'Unknown or expired code' });
        return;
      }
      // one time use
      await kv.del(code);
      const saved = JSON.parse(raw);
      // Return tokens to ChatGPT
      res.json({
        access_token: saved.token.access_token,
        token_type: saved.token.token_type || 'Bearer',
        expires_in: saved.token.expires_in,
        refresh_token: saved.token.refresh_token,
        scope: saved.token.scope
      });
      return;
    }

    if (grantType === 'refresh_token') {
      const refresh = body.refresh_token;
      if (!refresh) {
        res.status(400).json({ error: 'invalid_request', error_description: 'Missing refresh_token' });
        return;
      }

      const tokenResp = await fetch('https://api.canva.com/rest/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`).toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refresh
        })
      });

      if (!tokenResp.ok) {
        const text = await tokenResp.text();
        console.error('Refresh failed', tokenResp.status, text);
        res.status(400).json({ error: 'invalid_grant', error_description: 'Refresh failed' });
        return;
      }
      const tokenJson = await tokenResp.json();
      res.json({
        access_token: tokenJson.access_token,
        token_type: tokenJson.token_type || 'Bearer',
        expires_in: tokenJson.expires_in,
        refresh_token: tokenJson.refresh_token || refresh,
        scope: tokenJson.scope
      });
      return;
    }

    res.status(400).json({ error: 'unsupported_grant_type', error_description: 'Use authorization_code or refresh_token' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
}
