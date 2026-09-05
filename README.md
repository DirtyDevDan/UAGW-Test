# United Azeroth Guild Website

An Alliance-focused guild website backed by a Cloudflare Worker and D1 for member accounts,
multiple characters, shared events, RSVPs, announcements, member listings, and
leader-approved membership applications.

## Start locally

Install the Worker tooling with `npm install`, run the D1 migrations with
`npm run db:local`, then run `npm run dev`. Serve this folder on port 4173 with
any static web server and open `index.html`.

## Main areas

- `dashboard.html` — private member account and character management.
- `schedule.html` — interactive shared calendar and character RSVPs.
- `members.html` — approved-member directory.
- `index.html?login=1&signup=1` — account creation and required guild application.
- `guild-admin.html` — a unified officer command center for calendar, rules,
  rosters, attendance, member access, recruitment, announcements, website
  content, and audit history.

The production D1 database has already been migrated. See `CLOUDFLARE_SETUP.md`
for deployment, migration, and first-administrator instructions. The old
`SUPABASE_SETUP.md` remains only as migration history.
