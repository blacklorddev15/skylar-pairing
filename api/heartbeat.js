// GET or POST /api/heartbeat   { server?: 1|2|3, name?: 'Server 1' }
//
// A bot host pings this to mark itself ONLINE. If nothing arrives within
// HEARTBEAT_FRESH_MS the dashboard shows that server OFFLINE (see api/stats.js).
//
// A bare GET counts as server 1. The Skylar bot's existing self-ping loop only issues
// plain GETs, so pointing its WEBSITE_URL at this endpoint is a one-line change in
// settings.js instead of an edit to the bot's code.
const { query } = require('./_db');

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

/**
 * Vercel hands a plain Node function the raw request body, which is a Buffer (or a
 * string) - NOT a parsed object. `JSON.parse(req.body)` therefore throws every time,
 * body ended up as {} and every real heartbeat was answered with
 * "server must be 1, 2 or 3". Handle every shape, like api/admin.js does.
 */
function readBody(req) {
  const b = req.body;
  if (!b) return {};
  if (Buffer.isBuffer(b)) {
    try { return JSON.parse(b.toString('utf8') || '{}'); } catch (_) { return {}; }
  }
  if (typeof b === 'string') {
    try { return JSON.parse(b || '{}'); } catch (_) { return {}; }
  }
  if (typeof b === 'object') return b;
  return {};
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.end();

  // Accept the values from the JSON body or from the query string.
  const body = Object.assign({}, readBody(req), req.query || {});

  // A plain GET with no parameters is the bot's keep-alive ping: treat it as server 1.
  const bareGet = req.method === 'GET' && body.server == null;
  if (req.method !== 'POST' && !bareGet) {
    return json(res, 405, { error: 'Method not allowed. Use POST, or GET with no parameters.' });
  }

  const server = bareGet ? 1 : Number(body.server);
  if (!Number.isInteger(server) || server < 1 || server > 3) {
    return json(res, 400, { error: 'server must be 1, 2 or 3' });
  }
  const name = String(body.name || '').trim() || 'Server ' + server;

  try {
    await query(
      `INSERT INTO skylar_server_heartbeats (server_id, name, last_seen)
       VALUES ($1, $2, now())
       ON CONFLICT (server_id) DO UPDATE SET last_seen = now(), name = EXCLUDED.name`,
      [server, name]
    );
    return json(res, 200, { ok: true, server, at: new Date().toISOString() });
  } catch (e) {
    console.error('[heartbeat]', e.message);
    return json(res, 500, { error: e.message });
  }
};
