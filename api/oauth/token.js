export const config = { runtime: 'nodejs20.x' };
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
  try { return JSON.parse(raw); } catch { return {}; }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).send('Method Not Allowed');
    }

    const body = await parseBody(req);
    const grantType = body.grant_type;

    if (grantType === 'authorization_code') {
      const code = body.code;
      if (!code) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing code' });
      }
      const raw = await kv.get(code);
      if (!raw) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'Unknown or expired code' });
      }
      await kv.del(code); // one-time use
      const saved = JSON.parse(raw);
      return res.json({
        access_token: saved.token.access_token,
        token_type: saved.token.token_type || 'Bearer',
        expires_in: saved.token.expires_in,
        refresh_token: saved.token.refresh_token,
        scope: saved.token.scope
      });
    }

    if (grantType === 'refresh_token') {
      const refresh = body.refresh_token;
      if (!refresh) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing refresh_token' });
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

      const text = await tokenResp.text();
      if (!tokenResp.ok) {
        console.error('Refresh failed', tokenResp.status, text);
        return res.status(400).json({ error: 'invalid_grant', error_description: 'Refresh failed' });
      }
      let tokenJson;
      try { tokenJson = JSON.parse(text); }
      catch {
        console.error('Invalid refresh JSON', text);
        return res.status(500).json({ error: 'server_error' });
      }

      return res.json({
        access_token: tokenJson.access_token,
        token_type: tokenJson.token_type || 'Bearer',
        expires_in: tokenJson.expires_in,
        refresh_token: tokenJson.refresh_token || refresh,
        scope: tokenJson.scope
      });
    }

    return res.status(400).json({ error: 'unsupported_grant_type', error_description: 'Use authorization_code or refresh_token' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
}
