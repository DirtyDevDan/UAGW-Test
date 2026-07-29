# United Azeroth Supabase setup

## Connected project

This website is currently configured for the **United Azeroth IronForged**
Supabase project. The schemas in `supabase-schema.sql` and
`supabase-shared-migration.sql` were applied on July 29, 2026.
`supabase-config.js` contains the project URL and public publishable browser key.

## Reconnecting to another project

Create the replacement Supabase project and wait for its database to finish provisioning.

## 2. Create the guild tables

Open **SQL Editor**, paste the complete contents of `supabase-schema.sql`, and
run it once. Then run `supabase-shared-migration.sql`,
`supabase-officer-command-migration.sql`, and
`supabase-production-hardening.sql`, in that order.

The script creates:

- private member profiles;
- protected guild ranks and membership statuses;
- multiple characters per account;
- automatic profile creation after signup;
- row-level security policies;
- leadership access for Guild Master and Co-Guild Master.
- a shared event calendar with character-based RSVPs and role caps;
- a live approved-member directory;
- shared guild announcements;
- recruitment applications with an acceptance-to-membership workflow;
- protected event and announcement management for authorized officers.
- shared rules, raid rosters, attendance, website content, member administration,
  and officer audit history.

## 3. Connect the website

Open the Supabase project’s API settings and copy:

- the project URL;
- the public publishable key, or legacy public `anon` key.

Add those values to `supabase-config.js`:

```js
window.UNITED_AZEROTH_SUPABASE = {
  url: "https://YOUR_PROJECT_REF.supabase.co",
  publishableKey: "YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY"
};
```

Never place the Supabase `service_role` key in this website.

## 4. Configure authentication

In Supabase Authentication:

1. Keep the Email provider enabled.
2. Choose whether members must confirm their email before signing in.
3. Add the deployed `dashboard.html` URL to the allowed redirect URLs for password resets.

## 5. Create the first Guild Master

Register the first account through `dashboard.html`. Then run:

```sql
update public.guild_memberships
set guild_rank = 'Guild Master', status = 'active'
where user_id = (
  select id from auth.users where email = 'YOUR_EMAIL'
);
```

The first Guild Master can manage shared events, announcements, and
applications through `guild-admin.html`.

## Security model

- Passwords are handled by Supabase Auth and are never stored in the website.
- Profiles and characters are protected by row-level security.
- Members can only change their own profile and characters.
- Guild Master and Co-Guild Master can read member records.
- Guild Master, Co-Guild Master, Raid Officer, and Event Officer can access
  Shared Operations.
- Calendar changes, RSVP limits, membership activation, and officer checks are
  enforced by the database rather than by browser-only controls.
- Guild ranks are stored separately from editable profile data, preventing self-promotion.
- New accounts start as pending Recruits.

## Shared-system pages

- `schedule.html` — shared events and character-based RSVPs.
- `members.html` — live directory for active guild members.
- `index.html` — shared guild announcements.
- `recruitment.html` — public application submission.
- `guild-admin.html` — the secure officer command center.
