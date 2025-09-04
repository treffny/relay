// api/canva/[...path].js
export default async function handler(req, res) {
  try {
    // Build the target Canva URL
    const incoming = new URL(req.url, `https://${req.headers.host}`);
    const pathAfterPrefix = incoming.pathname.replace(/^\/api\/canva\/?/, ''); // strip /api/canva/
    const target = new URL(`https://api.canva.com/rest/v1/${pathAfterPrefix}${incoming.search}`);

    // Read body (if any)
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;

    // Forward headers (keep auth & content-type; drop hop-by-hop)
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

    // Pipe back status, headers, body
    res.statusCode = resp.status;
    // pass through JSON-ish headers; avoid hop-by-hop
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
