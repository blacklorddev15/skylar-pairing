// GET /api/stats  – status dashboard numbers (same shape the old site used).
//
// "Online" has three independent sources, and the dashboard needs any one of them:
//   1. skylar_server_heartbeats – a bot host pings /api/heartbeat. A ping inside
//      HEARTBEAT_FRESH_MS means that server tile is online.
//   2. skylar_sessions – status='connected' AND refreshed within 15 minutes. Nothing
//      refreshes updated_at while a session is live (the bot only writes it on connect
//      and disconnect), so in practice this rarely fires. Kept for correctness.
//   3. Recent bot activity – the bot claiming a request or writing a session proves it
//      is running even when it has never pinged /api/heartbeat. Without this the
//      dashboard reads "offline" while the bot is visibly issuing pairing codes.
const { query, getSetting, ensureActiveSchema } = require('./_db');

// The bot's self-ping loop runs every 4 minutes, so a 2-minute window would report a
// healthy bot as offline three quarters of the time.
const HEARTBEAT_FRESH_MS = 10 * 60 * 1000;
const BOT_ACTIVITY_FRESH_MS = 10 * 60 * 1000;
const SESSION_FRESH_MS = 15 * 60 * 1000;

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.end();

  try {
    // Self-heal the schema on whichever database is active, so a database that
    // never went through the admin "switch database" flow still has every table.
    await ensureActiveSchema();

    const [sess, keys, today] = await Promise.all([
      query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE status = 'connected'
                                   AND updated_at > now() - interval '15 minutes')::int AS online,
                count(*) FILTER (WHERE status = 'connected')::int AS connected,
                max(updated_at) AS last_session
           FROM skylar_sessions`
      ),
      query(`SELECT count(*)::int AS n FROM skylar_premium_keys WHERE status = 'unused'`),
      query(
        `SELECT count(*)::int AS n FROM skylar_pairing_requests WHERE created_at::date = current_date`
      ),
    ]);

    const onlineNow = sess.rows[0].online;
    const connectedTotal = sess.rows[0].connected;

    // Server 1..3 heartbeat status (offline when last ping > 2 minutes ago).
    let servers = [];
    let lastHeartbeatAt = null;
    try {
      const hb = await query(
        'SELECT server_id, name, last_seen FROM skylar_server_heartbeats ORDER BY server_id'
      );
      const now = Date.now();
      const seen = new Map(hb.rows.map((r) => [Number(r.server_id), r]));
      servers = [1, 2, 3].map((i) => {
        const r = seen.get(i);
        const last = r && r.last_seen ? new Date(r.last_seen).getTime() : 0;
        const online = now - last < HEARTBEAT_FRESH_MS && last > 0;
        if (online && (!lastHeartbeatAt || last > lastHeartbeatAt)) lastHeartbeatAt = last;
        return { id: i, name: (r && r.name) || 'Server ' + i, online, lastSeen: last || null };
      });
    } catch (e) {
      console.error('[stats] heartbeat query:', e && e.message);
    }

    const anyServerOnline = servers.some((s) => s.online);

    // Third signal: proof of work. The bot claiming a request or writing a session shows
    // it is running even if it has never pinged. Wrapped so a problem here cannot take
    // the whole dashboard down.
    let lastBotActivityAt = null;
    let activityFresh = false;
    try {
      const act = await query(
        `SELECT GREATEST(
                  COALESCE((SELECT max(updated_at) FROM skylar_sessions), 'epoch'::timestamptz),
                  COALESCE((SELECT max(updated_at) FROM skylar_pairing_requests
                             WHERE status IN ('processing','code_generated','connected')),
                           'epoch'::timestamptz)
                ) AS last`
      );
      const t = act.rows[0] && act.rows[0].last ? new Date(act.rows[0].last).getTime() : 0;
      if (t > 0) {
        lastBotActivityAt = t;
        activityFresh = Date.now() - t < BOT_ACTIVITY_FRESH_MS;
      }
    } catch (e) {
      console.error('[stats] activity query:', e && e.message);
    }

    return json(res, 200, {
      totalPairs: sess.rows[0].total,
      onlineNow,
      today: today.rows[0].n,
      // Any one of: a live heartbeat, a fresh session, or recent proof of work.
      botOnline: anyServerOnline || onlineNow > 0 || activityFresh,
      // Which signal decided it, so a wrong answer is diagnosable rather than mysterious.
      botOnlineSource: anyServerOnline ? 'heartbeat'
        : (onlineNow > 0 ? 'session' : (activityFresh ? 'activity' : 'none')),
      servers,
      lastHeartbeatAt,
      lastBotActivityAt,
      lastSessionAt: sess.rows[0].last_session || null,
      connectedTotal,
      premiumMode: (await getSetting('premiumMode')) === 'true',
      keysLeft: keys.rows[0].n,
      notice: (await getSetting('notice')) || '',
    });
  } catch (e) {
    console.error('[stats]', e.message);
    return json(res, 500, { error: e.message });
  }
};
