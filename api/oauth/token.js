// api/oauth/token.js
export const config = { runtime: 'nodejs' };

import { kv } from '@vercel/kv';

const CANVA_CLIENT_ID     = process.env.CANVA_CLIENT_ID;
const CANVA_CLIENT_SECRET = process.env.CANVA_CLIENT_SECRET;

function ensureObject(maybe) {
  if (maybe && typeof maybe === 'object') return maybe;
  if (typeof maybe === 'string') {
    try { return JSON.parse(maybe); } catch { return null; }
  }
  return null;
}

async function parseBody(req) {
  const ct = req.headers['content-type'] || '';
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (ct.includes('application/json')) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (ct.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(raw);
    return Object.fromEntries(params.entries());
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
      if (!code) return res.status(400).json({ error: 'invalid_request', error_description: 'Missing code' });

      const raw = await kv.get(code);
      if (!raw) return res.status(400).json({ error: 'invalid_grant', error_description: 'Unknown or expired code' });

      await kv.del(code);
      const saved = ensureObject(raw);
      if (!saved?.token?.access_token) {
        return res.status(500).json({ error: 'server_error', error_description: 'Token missing in KV' });
      }

      return res.json({
        access_token:  saved.token.access_token,
        token_type:    saved.token.token_type || 'Bearer',
        expires_in:    saved.token.expires_in,
        refresh_token: saved.token.refresh_token,
        scope:         saved.token.scope
      });
    }

    if (grantType === 'refresh_token') {
      const refresh = body.refresh_token;
      if (!refresh) return res.status(400).json({ error: 'invalid_request', error_description: 'Missing refresh_token' });

      const tokenResp = await fetch('https://api.canva.com/rest/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`).toString('base64')
        },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh })
      });

      const ct = (tokenResp.headers.get('content-type') || '').toLowerCase();
      let tokenJson, text;
      if (ct.includes('application/json')) {
        try { tokenJson = await tokenResp.json(); }
        catch { text = await tokenResp.text(); }
      } else {
        text = await tokenResp.text();
        try { tokenJson = JSON.parse(text); } catch {}
      }
      if (!tokenResp.ok) {
        return res.status(400).json({ error: 'invalid_grant', error_description: `Refresh failed (${tokenResp.status}) ${text || ''}` });
      }
      if (!tokenJson?.access_token) {
        return res.status(500).json({ error: 'server_error', error_description: `Bad refresh payload ${text || ''}` });
      }

      return res.json({
        access_token:  tokenJson.access_token,
        token_type:    tokenJson.token_type || 'Bearer',
        expires_in:    tokenJson.expires_in,
        refresh_token: tokenJson.refresh_token || refresh,
        scope:         tokenJson.scope
      });
    }

    return res.status(400).json({ error: 'unsupported_grant_type', error_description: 'Use authorization_code or refresh_token' });
  } catch (err) {
    console.error('[token] error', err);
    res.status(500).json({ error: 'server_error', error_description: String(err) });
  }
}
