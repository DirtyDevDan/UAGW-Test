# United Azeroth Guild Website

An Alliance-focused guild website connected to Supabase for member accounts,
multiple characters, shared events, RSVPs, announcements, member listings, and
leader-approved membership applications.

## Start locally

Serve this folder with any static web server, then open `index.html`. The site
has no build step and no installed runtime dependencies.

## Main areas

- `dashboard.html` — private member account and character management.
- `schedule.html` — interactive shared calendar and character RSVPs.
- `members.html` — approved-member directory.
- `index.html?login=1&signup=1` — account creation and required guild application.
- `guild-admin.html` — a unified officer command center for calendar, rules,
  rosters, attendance, member access, recruitment, announcements, website
  content, and audit history.

The connected database has already been migrated. See `SUPABASE_SETUP.md` when
moving the site to another Supabase project.
