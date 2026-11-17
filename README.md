# Helshoogte Premier League

Free hobby league website: **GitHub Pages + Supabase**. No build step or npm packages are required to publish it. The design, team logos, points system, and cricket calculations come from the original HTML MVP.

## Everyday use

Visitors open the website and view teams, fixtures, standings, and player statistics without an account. Refresh the page to see newly saved records.

Admins click **Admin Mode**, sign in, and use the existing forms. Wait for the database save confirmation before leaving. Results update standings and player totals automatically. Download a JSON backup after match days, and keep it outside this public repository.

## Deployment

1. Keep this repository public to use GitHub Pages on GitHub Free.
2. In repository **Settings → Pages**, choose **GitHub Actions** as the source.
3. Push to `main` or run **Actions → Publish league website → Run workflow**.
4. The workflow publishes only `site/`. SQL scripts and project documentation are not part of the website.

Expected URL: https://maharajjevad1-commits.github.io/Helshoogte-Premier-League/

`site/config.js` contains only the Supabase project URL and a browser-safe publishable key. Never add database passwords, secret/service-role keys, private exports, or access tokens to this repository.

## Database

This app uses the existing `teams`, `players`, `seasons`, `matches`, `performances`, `news`, `awards`, `site_settings`, and `admin_users` tables. It keeps the original team UUIDs and active season. It does not create a competing database structure.

`supabase/migrations/001_connect_existing_schema.sql` adds a few compatibility fields and the `get_league`/`save_league` functions. It was applied through Supabase SQL Editor; GitHub Pages does not automatically apply database migrations. Future schema changes must be applied to Supabase before publishing code that needs them. Keep each new change as a separate migration file.

The existing confirmed league admin account is registered in `admin_users`. Passwords stay in Supabase Auth. To change admins, ask for a controlled database change using the confirmed user's UUID. Visitors and ordinary signed-in users cannot grant themselves admin rights.

Public read access follows the existing RLS policies, including published-match/news visibility. Browser roles have no direct table mutation or truncate permissions. The save function checks admin membership and commits all related records together. A revision check rejects stale tabs. Refresh after any unconfirmed save; the server may have committed even if the response was lost.

The basic admin forms publish records when saved. Draft publication workflows, live ball-by-ball scoring, and paid services are outside this MVP. The UI supports scheduled/completed matches; use these forms for league maintenance rather than editing database status values manually.

Player photos and new logos are compressed to JPEG and uploaded to the existing public `hpl-media` bucket. Only approved admins can upload through its existing RLS policies. Original team logos are served as static website assets.

## Backups and recovery

- **Code:** Git history stores website versions. Reverting a code commit does not undo database changes.
- **Records:** Admin → Settings & Backup → Export JSON backup. Restore replaces the shared records; first export the current records. Use backups from this online app (old offline snapshots use incompatible record IDs).
- **Images:** JSON exports contain image links. Separately download uploaded files from Supabase Storage for a complete independent archive. Old replaced uploads are not automatically deleted; remove unused files deliberately when storage needs tidying.
- **Free plan:** Supabase may pause after low activity. Resume the project from its dashboard and refresh the website. The app displays an unavailable message instead of pretending records were saved.
- **Password setup/recovery:** Use the link below the admin login, or open `reset.html`. Request a fresh email, open only its newest link, and choose a password privately. Supabase Auth Site URL must be the live website root, with its exact `reset.html` URL in the redirect allowlist. The root forwards recovery callbacks to that page. Supabase's default email service has recipient and sending limits; use the project-owner admin address for this initial setup. Configure an appropriate sender if other admins need recovery emails later.

## Maintaining with Codex

Ask for changes in plain language, for example: “Add a venue filter” or “Add another administrator.” Codex can update the code, prepare migrations, check changes, and publish through the repository when account access is available. Account ownership, passwords, and billing remain with the league.

Local preview on Windows: run `scripts/preview.ps1` in PowerShell. It serves the site on localhost only. The script also exposes the prepared migration at `/__setup.sql` for local setup; this route is not deployed.

Optional maintainer checks: `node scripts/check.mjs` on Node 18+. These use only Node's built-in libraries; installing Node is not necessary for visitors, admins, or publishing the site.

Verified during setup: cricket totals, overs and NRR, corrected scores, visitor-save blocking, stale-save protection, failed-save recovery, and database scorecard round trips in rolled-back test transactions.
