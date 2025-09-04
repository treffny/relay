// api/canva/[...path].js
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    const incoming = new URL(req.url, `https://${req.headers.host}`);
    const pathAfterPrefix = incoming.pathname.replace(/^\/api\/canva\/?/, '');
    const target = new URL(`https://api.canva.com/rest/v1/${pathAfterPrefix}${incoming.search}`);

    // read body
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;

    // forward headers
    const headers = new Headers();
    const copyHeader = (name) => {
      const val = req.headers[name.toLowerCase()];
      if (val) headers.set(name, val);
    };
    copyHeader('Authorization');
    copyHeader('Content-Type');
    headers.set('Accept', 'application/json');

    const resp = await fetch(target, {
      method: req.method,
      headers,
      body: (req.method === 'GET' || req.method === 'HEAD') ? undefined : body,
    });

    res.statusCode = resp.status;
    resp.headers.forEach((v, k) => {
      if (!['transfer-encoding', 'content-encoding'].includes(k)) {
        res.setHeader(k, v);
      }
    });
    const buf = Buffer.from(await resp.arrayBuffer());
    res.end(buf);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(502).json({ error: 'bad_gateway', message: 'Failed to reach Canva API' });
  }
}
