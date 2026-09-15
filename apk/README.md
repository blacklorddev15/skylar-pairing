# APK releases

Every build, kept so a version can be pinned or rolled back.

| File | Version |
|---|---|
| `skylar-x-ultra-1.0.apk` | 1.0 |
| `skylar-x-ultra-1.1.apk` | 1.1 |
| `skylar-x-ultra-1.2.apk` | 1.2 (current) |

## Publishing a new build

The site links to **`/skylar-x-ultra.apk`** — a stable filename, so the download button
never has to change.

1. Build: `./android/build.sh` (needs Android SDK; output lands in `android/dist/`).
2. Bump `versionCode` / `versionName` in `android/app/build.gradle`
   **and** `android:versionCode` / `android:versionName` in `AndroidManifest.xml` — they must match.
3. Copy the build over the stable name and archive it under its version:
   ```bash
   cp android/dist/pairportal-<VER>-debug.apk skylar-x-ultra.apk
   cp android/dist/pairportal-<VER>-debug.apk apk/skylar-x-ultra-<VER>.apk
   ```
4. Commit and push. Vercel deploys automatically.

Nothing in `index.html` needs editing — that is the point of the stable filename.

## Note

These are **debug-signed** builds (`android/debug.keystore`, deliberately not committed).
Android shows an "unknown developer" warning and the app is debuggable. Before promoting
a download widely, build a release-signed APK.
