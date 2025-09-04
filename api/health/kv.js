// api/health/kv.js
import { kv } from '@vercel/kv';
export default async function handler(req, res) {
  try {
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      return res.status(500).json({ ok: false, reason: 'KV env vars missing' });
    }
    const key = 'kv_selftest_' + Math.random().toString(36).slice(2);
    const val = { t: Date.now() };
    await kv.set(key, val, { ex: 30 });
    const readBack = await kv.get(key);
    await kv.del(key);
    return res.json({ ok: true, wrote: val, readBack });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
