// api/ping.js
export default async function handler(req, res) {
  res.json({ ok: true, route: '/api/ping', time: Date.now() });
}
