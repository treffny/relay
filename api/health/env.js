// api/health/env.js
export default async function handler(req, res) {
  const present = (name) => Boolean(process.env[name] && process.env[name].trim());
  res.json({
    CANVA_CLIENT_ID:     present('CANVA_CLIENT_ID'),
    CANVA_CLIENT_SECRET: present('CANVA_CLIENT_SECRET'),
    RELAY_BASE_URL:      present('RELAY_BASE_URL'),
    CANVA_SCOPES:        present('CANVA_SCOPES'),
    KV_REST_API_URL:     present('KV_REST_API_URL'),
    KV_REST_API_TOKEN:   present('KV_REST_API_TOKEN')
  });
}
