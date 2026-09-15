# SKYLAR X ULTRA — Pairing Portal

Static portal + serverless API for pairing WhatsApp numbers with the **Skylar** bot
running on Pterodactyl. Live at <https://skylar-pairing.vercel.app>

## How it fits together

```
browser                    POST /api/request   -> row inserted into skylar_pairing_requests (Neon)
Skylar bot (Pterodactyl)   polls every 3s      -> claims the row, asks WhatsApp for a code,
                                                  writes pairing_code back
browser                    GET /api/status?id= -> status / pairing_code / error / expires_at
```

The bot itself lives in `blacklorddev15/Back` (`d_Skylar-X-ULTRA-panel.zip`) and polls
**`skylar_pairing_requests`** and nothing else.

## The one thing that breaks this site

The API's table prefix must stay **`skylar_`** — see `const PREFIX = 'skylar_'` in `api/_db.js`.

Skylar shares a Neon database with other bots but uses its own tables. If the prefix is
changed to another bot's, the site **still generates pairing codes** — but from the *other*
bot, while the Skylar bot never sees the request. It looks like it works. It isn't yours.

## Environment variables (set on the Vercel project, never in this repo)

| Key | Purpose |
|---|---|
| `DATABASE_URL` | Neon connection string (control database) |
| `ADMIN_PASSWORD` | gate for `/api/admin` |

There is deliberately no `.env` file here.

## Endpoints

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/request` | none | create a pairing request `{ phone }` |
| `GET /api/status?id=` | none | poll status + `pairing_code` — returns no phone number, on purpose |
| `GET /api/stats` | none | dashboard counters |
| `POST /api/heartbeat` | none | bot-host liveness ping |
| `/api/admin` | `x-admin-password` header | admin actions |

## Deploy

Linked to the Vercel project `skylar-pairing`. Pushing to `main` deploys to production.

## Files served as-is

`countries.json` (dial-code list), `background.jpg` (page artwork),
`skylar-x-ultra-1.2.apk` (Android wrapper — its source project is separate and not committed here).

## Android app

`skylar-x-ultra.apk` is the app — a WebView wrapper for this portal
(`com.aether.pairportal`, minSdk 24). The site's download button points at that
**stable filename**, so publishing a new build never requires editing `index.html`.

| Path | What it is |
|---|---|
| `skylar-x-ultra.apk` | the build the site serves — stable name |
| `apk/` | every version, kept for pinning and rollback |
| `android/` | the Gradle project, so the app can be rebuilt |
| `apk/README.md` | the release steps |

The Android source is committed so a change (icon, name, target URL) is a normal commit
rather than a hunt for a zip. `android/debug.keystore` is deliberately **not** committed,
and `build/`, `.gradle/` and `dist/` are gitignored.

Builds here are debug-signed: Android warns about an unknown developer and the app is
debuggable. Build a release-signed APK before promoting the download widely.
