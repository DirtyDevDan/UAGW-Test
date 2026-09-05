# Cloudflare backend

The website uses the Worker in `worker/src/index.js` and the D1 migrations in
`worker/migrations`. The browser compatibility layer is `api-client.js`.

## Local development

1. Run `npm install`.
2. Put `ADMIN_SETUP_KEY=your-private-test-key` in `.dev.vars`.
3. Run `npm run db:local`.
4. Run `npm run dev`.
5. Serve the static files at `http://127.0.0.1:4173`.

The production URL is configured in `supabase-config.js`; change it to
`http://127.0.0.1:8787` only while testing locally.

## Production

- Worker: `united-azeroth-guild-api`
- D1 database: `united-azeroth-guild`
- D1 binding: `DB`
- Secret binding: `ADMIN_SETUP_KEY`

After changing the Worker, run `npm run check` and `npm run test:integration`,
then deploy with `npm run deploy`. Apply future migrations with
`npm run db:remote` before deploying code that depends on them.

## First administrator

Open `admin-setup.html` on the published site and enter the private deployment
setup key. The endpoint permanently refuses another bootstrap after the first
Guild Master exists. Afterward, manage member activation and guild ranks from
`guild-admin.html`.

Never commit `.dev.vars`, the production setup key, passwords, or session
tokens. Rotate the `ADMIN_SETUP_KEY` secret after first setup if desired.
