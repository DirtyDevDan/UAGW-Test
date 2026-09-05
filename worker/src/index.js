const OFFICER_RANKS = new Set(["Guild Master", "Co-Guild Master", "Raid Officer", "Event Officer"]);
const LEADER_RANKS = new Set(["Guild Master", "Co-Guild Master"]);
const SESSION_DAYS = 30;
// Cloudflare Workers Web Crypto currently caps PBKDF2 at 100,000 iterations.
const PASSWORD_ITERATIONS = 100000;

const TABLES = {
  profiles: ["user_id", "display_name", "discord_name", "bio", "visibility", "created_at", "updated_at"],
  guild_memberships: ["user_id", "guild_rank", "status", "joined_at", "updated_at"],
  characters: ["id", "user_id", "name", "realm", "class_name", "specialization", "primary_role", "item_level", "professions", "is_main", "profile_note", "created_at", "updated_at"],
  recruitment_applications: ["id", "account_user_id", "email", "character_name", "discord_name", "class_name", "primary_role", "item_level", "goals", "experience", "rules_agreed", "status", "created_at", "updated_at", "reviewed_at", "reviewed_by"],
  guild_events: ["id", "title", "category", "starts_at", "duration_minutes", "recurrence", "recurrence_until", "location", "organizer", "description", "requirements", "tank_capacity", "healer_capacity", "dps_capacity", "status", "created_by", "created_at", "updated_at"],
  event_rsvps: ["id", "event_id", "character_id", "user_id", "role", "status", "created_at", "updated_at"],
  guild_announcements: ["id", "title", "category", "body", "pinned", "published", "published_at", "expires_at", "created_by", "created_at", "updated_at"],
  guild_settings: ["key", "value", "updated_by", "updated_at"],
  roster_decisions: ["event_id", "character_id", "decision", "updated_by", "updated_at"],
  event_attendance: ["event_id", "character_id", "status", "officer_note", "updated_by", "updated_at"],
  officer_audit_log: ["id", "officer_id", "action", "target", "detail", "created_at"]
};

const PRIMARY_KEYS = {
  profiles: ["user_id"], guild_memberships: ["user_id"], characters: ["id"], recruitment_applications: ["id"],
  guild_events: ["id"], event_rsvps: ["id"], guild_announcements: ["id"], guild_settings: ["key"],
  roster_decisions: ["event_id", "character_id"], event_attendance: ["event_id", "character_id"], officer_audit_log: ["id"]
};

const textEncoder = new TextEncoder();

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function sha256(value) {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", textEncoder.encode(value))));
}

async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: base64UrlToBytes(salt), iterations: PASSWORD_ITERATIONS }, key, 256);
  return bytesToBase64Url(new Uint8Array(bits));
}

function safeEqual(left, right) {
  const a = textEncoder.encode(String(left));
  const b = textEncoder.encode(String(right));
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a.length ? a[index % a.length] : 0) ^ (b.length ? b[index % b.length] : 0);
  return difference === 0;
}

function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
function now() { return new Date().toISOString(); }
function newId() { return crypto.randomUUID(); }
function jsonValue(value) { return typeof value === "string" ? value : JSON.stringify(value); }

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : allowed[0] || "https://dirtydevdan.github.io";
}

function cors(request, env) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(request, env),
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function response(request, env, body, status = 200) {
  return Response.json(body, { status, headers: { ...cors(request, env), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }

async function readJson(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 100000) fail("Request is too large.", 413);
  try { return await request.json(); } catch { fail("Invalid JSON body."); }
}

async function getActor(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  const tokenHash = await sha256(token);
  const actor = await env.DB.prepare(`
    SELECT u.id, u.email, p.display_name, m.guild_rank, m.status
    FROM sessions s JOIN users u ON u.id = s.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN guild_memberships m ON m.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(tokenHash, now()).first();
  return actor || null;
}

function requireActor(actor) { if (!actor) fail("Sign in required.", 401); return actor; }
function requireActive(actor) { requireActor(actor); if (actor.status !== "active") fail("Active guild membership required.", 403); return actor; }
function requireOfficer(actor) { requireActive(actor); if (!OFFICER_RANKS.has(actor.guild_rank)) fail("Officer permission required.", 403); return actor; }
function requireLeader(actor) { requireActive(actor); if (!LEADER_RANKS.has(actor.guild_rank)) fail("Guild leadership permission required.", 403); return actor; }

async function createSession(env, userId) {
  const raw = new Uint8Array(32); crypto.getRandomValues(raw);
  const token = bytesToBase64Url(raw);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").bind(await sha256(token), userId, expiresAt).run();
  return { access_token: token, expires_at: Math.floor(new Date(expiresAt).getTime() / 1000) };
}

async function authPayload(env, userId, session = null) {
  const user = await env.DB.prepare("SELECT id,email,created_at FROM users WHERE id = ?").bind(userId).first();
  return { user, session: session ? { ...session, user } : null };
}

function validateCredentials(email, password) {
  if (!/^\S+@\S+\.\S+$/.test(email)) fail("Enter a valid email address.");
  if (String(password || "").length < 10) fail("Password must be at least 10 characters.");
}

async function bootstrap(request, env) {
  const body = await readJson(request);
  if (!env.ADMIN_SETUP_KEY) fail("Admin setup is not configured.", 503);
  if (!safeEqual(body.setupKey || "", env.ADMIN_SETUP_KEY)) fail("Invalid admin setup key.", 403);
  const existing = await env.DB.prepare("SELECT COUNT(*) AS count FROM guild_memberships WHERE guild_rank IN ('Guild Master','Co-Guild Master')").first();
  if (Number(existing.count) > 0) fail("The first administrator has already been created.", 409);
  const email = normalizeEmail(body.email); validateCredentials(email, body.password);
  const userId = newId(); const saltBytes = new Uint8Array(16); crypto.getRandomValues(saltBytes); const salt = bytesToBase64Url(saltBytes);
  const created = now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id,email,password_hash,password_salt,created_at) VALUES (?,?,?,?,?)").bind(userId, email, await passwordHash(body.password, salt), salt, created),
    env.DB.prepare("INSERT INTO profiles (user_id,display_name,discord_name,bio,visibility,updated_at) VALUES (?,?,?,?,?,?)").bind(userId, String(body.displayName || "Guild Administrator").trim().slice(0, 80), String(body.discordName || "").trim().slice(0, 80), "", "guild", created),
    env.DB.prepare("INSERT INTO guild_memberships (user_id,guild_rank,status,joined_at) VALUES (?,?,?,?)").bind(userId, "Guild Master", "active", created)
  ]);
  const session = await createSession(env, userId);
  return authPayload(env, userId, session);
}

async function signup(request, env) {
  const body = await readJson(request); const email = normalizeEmail(body.email); validateCredentials(email, body.password);
  const metadata = body.metadata || {}; const userId = newId(); const created = now();
  const saltBytes = new Uint8Array(16); crypto.getRandomValues(saltBytes); const salt = bytesToBase64Url(saltBytes);
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id,email,password_hash,password_salt,created_at) VALUES (?,?,?,?,?)").bind(userId, email, await passwordHash(body.password, salt), salt, created),
      env.DB.prepare("INSERT INTO profiles (user_id,display_name,discord_name,bio,visibility,updated_at) VALUES (?,?,?,?,?,?)").bind(userId, String(metadata.display_name || metadata.character_name || "Applicant").trim().slice(0, 80), String(metadata.discord_name || "").trim().slice(0, 80), "", "guild", created),
      env.DB.prepare("INSERT INTO guild_memberships (user_id,guild_rank,status,joined_at) VALUES (?,?,?,?)").bind(userId, "Recruit", "pending", created),
      env.DB.prepare(`INSERT INTO recruitment_applications (id,account_user_id,email,character_name,discord_name,class_name,primary_role,item_level,goals,experience,rules_agreed,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(newId(), userId, email, String(metadata.character_name || "").trim().slice(0, 80), String(metadata.discord_name || "").trim().slice(0, 80), String(metadata.class_name || "").slice(0, 40), String(metadata.primary_role || "DPS").slice(0, 20), Number(metadata.item_level) || null, String(metadata.goals || "").slice(0, 2000), String(metadata.experience || "").slice(0, 2000), metadata.rules_agreed ? 1 : 0, "New", created)
    ]);
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) fail("An account with that email already exists.", 409);
    throw error;
  }
  const session = await createSession(env, userId);
  return authPayload(env, userId, session);
}

async function login(request, env) {
  const body = await readJson(request); const email = normalizeEmail(body.email);
  const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
  const attemptKey = await sha256(`${email}|${clientIp}`);
  const attempt = await env.DB.prepare("SELECT failures,window_started_at,blocked_until FROM login_attempts WHERE attempt_key=?").bind(attemptKey).first();
  const currentTime = now();
  if (attempt?.blocked_until && attempt.blocked_until > currentTime) fail("Too many sign-in attempts. Try again in 15 minutes.", 429);
  const user = await env.DB.prepare("SELECT id,email,password_hash,password_salt FROM users WHERE email = ?").bind(email).first();
  const candidate = user ? await passwordHash(String(body.password || ""), user.password_salt) : await passwordHash(String(body.password || ""), bytesToBase64Url(new Uint8Array(16)));
  if (!user || !safeEqual(candidate, user.password_hash)) {
    const windowExpired = !attempt || Date.now() - new Date(attempt.window_started_at).getTime() > 15 * 60 * 1000;
    const failures = windowExpired ? 1 : Number(attempt.failures) + 1;
    const blockedUntil = failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    await env.DB.prepare(`INSERT INTO login_attempts (attempt_key,failures,window_started_at,blocked_until) VALUES (?,?,?,?)
      ON CONFLICT (attempt_key) DO UPDATE SET failures=excluded.failures,window_started_at=excluded.window_started_at,blocked_until=excluded.blocked_until`)
      .bind(attemptKey, failures, windowExpired ? currentTime : attempt.window_started_at, blockedUntil).run();
    fail(blockedUntil ? "Too many sign-in attempts. Try again in 15 minutes." : "Invalid email or password.", blockedUntil ? 429 : 401);
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE attempt_key=?").bind(attemptKey).run();
  const session = await createSession(env, user.id);
  return authPayload(env, user.id, session);
}

async function logout(request, env, actor) {
  requireActor(actor);
  const token = (request.headers.get("Authorization") || "").slice(7);
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return { ok: true };
}

function normalizeRow(table, row) {
  const output = { ...row };
  if (table === "guild_settings" && typeof output.value === "string") { try { output.value = JSON.parse(output.value); } catch {} }
  if (table === "characters" && typeof output.professions === "string") { try { output.professions = JSON.parse(output.professions); } catch { output.professions = []; } }
  for (const key of ["pinned", "published", "is_main", "rules_agreed"]) if (key in output) output[key] = Boolean(output[key]);
  return output;
}

function cleanRecord(table, input, actor, insert = false) {
  const allowed = TABLES[table]; if (!allowed) fail("Unknown data resource.", 404);
  const output = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!allowed.includes(key)) continue;
    if (key === "value" && table === "guild_settings") output[key] = jsonValue(value);
    else if (key === "professions") output[key] = jsonValue(value || []);
    else if (["pinned", "published", "is_main", "rules_agreed"].includes(key)) output[key] = value ? 1 : 0;
    else if (typeof value === "string") output[key] = value.slice(0, key === "body" || key === "description" || key === "goals" || key === "experience" ? 10000 : 500);
    else output[key] = value;
  }
  if (insert && allowed.includes("id") && !output.id) output.id = newId();
  if (allowed.includes("updated_at")) output.updated_at = now();
  if (insert && allowed.includes("created_at") && !output.created_at) output.created_at = now();
  if (table === "guild_events") output.created_by = actor.id;
  if (table === "guild_announcements") output.created_by = actor.id;
  if (table === "guild_settings") output.updated_by = actor.id;
  if (table === "roster_decisions" || table === "event_attendance") output.updated_by = actor.id;
  if (table === "officer_audit_log") { output.officer_id = actor.id; output.id ||= newId(); }
  return output;
}

function compileFilters(table, filters = []) {
  const allowed = TABLES[table]; const clauses = []; const bindings = [];
  for (const filter of filters) {
    if (!allowed.includes(filter.column)) fail("Unsupported filter column.");
    if (filter.operator === "eq") { clauses.push(`${filter.column} = ?`); bindings.push(filter.value); }
    else if (filter.operator === "in" && Array.isArray(filter.value) && filter.value.length) { clauses.push(`${filter.column} IN (${filter.value.map(() => "?").join(",")})`); bindings.push(...filter.value); }
    else fail("Unsupported query filter.");
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", bindings };
}

function accessForSelect(table, actor, filters) {
  if (["guild_events", "guild_announcements", "guild_settings"].includes(table)) return;
  if (table === "guild_memberships" && actor && filters.some((item) => item.column === "user_id" && item.operator === "eq" && item.value === actor.id)) return;
  if (table === "profiles" && actor && filters.some((item) => item.column === "user_id" && item.operator === "eq" && item.value === actor.id)) return;
  if (table === "profiles" || table === "characters" || table === "guild_memberships" || table === "event_rsvps") { requireActive(actor); return; }
  if (table === "recruitment_applications" && actor && filters.some((item) => item.column === "account_user_id" && item.value === actor.id)) return;
  if (["roster_decisions", "event_attendance"].includes(table)) { requireOfficer(actor); return; }
  requireLeader(actor);
}

async function selectRows(env, table, query, actor) {
  const filters = [...(query.filters || [])]; accessForSelect(table, actor, filters);
  if (!actor && table === "guild_events" && !filters.some((item) => item.column === "status")) filters.push({ column: "status", operator: "eq", value: "published" });
  if (!actor && table === "guild_announcements" && !filters.some((item) => item.column === "published")) filters.push({ column: "published", operator: "eq", value: 1 });
  const compiled = compileFilters(table, filters); let sql = `SELECT * FROM ${table}${compiled.sql}`;
  const orders = (query.orders || []).filter((item) => TABLES[table].includes(item.column));
  if (orders.length) sql += ` ORDER BY ${orders.map((item) => `${item.column} ${item.ascending === false ? "DESC" : "ASC"}`).join(",")}`;
  if (query.limit) sql += ` LIMIT ${Math.min(Math.max(Number(query.limit), 1), 500)}`;
  const result = await env.DB.prepare(sql).bind(...compiled.bindings).all(); let rows = (result.results || []).map((row) => normalizeRow(table, row));
  if (table === "guild_memberships" && rows.length) {
    const profiles = await env.DB.prepare(`SELECT user_id,display_name,discord_name FROM profiles WHERE user_id IN (${rows.map(() => "?").join(",")})`).bind(...rows.map((row) => row.user_id)).all();
    const profileMap = new Map(profiles.results.map((row) => [row.user_id, row])); rows = rows.map((row) => ({ ...row, profiles: profileMap.get(row.user_id) || null }));
  }
  if (table === "event_rsvps" && rows.length) {
    const characters = await env.DB.prepare(`SELECT id,name,primary_role FROM characters WHERE id IN (${rows.map(() => "?").join(",")})`).bind(...rows.map((row) => row.character_id)).all();
    const characterMap = new Map(characters.results.map((row) => [row.id, row])); rows = rows.map((row) => ({ ...row, characters: characterMap.get(row.character_id) || null }));
  }
  return { rows, count: rows.length };
}

async function mutationAccess(env, table, actor, action, records, filters) {
  if (table === "profiles" || table === "characters") {
    requireActor(actor); let ownUserId = records[0]?.user_id || filters.find((item) => item.column === "user_id")?.value;
    if (!ownUserId && table === "characters") {
      const id = filters.find((item) => item.column === "id" && item.operator === "eq")?.value;
      if (id) ownUserId = (await env.DB.prepare("SELECT user_id FROM characters WHERE id = ?").bind(id).first())?.user_id;
    }
    if (ownUserId !== actor.id && !LEADER_RANKS.has(actor.guild_rank)) fail("You can only change your own profile and characters.", 403);
    return;
  }
  if (["guild_events", "guild_settings", "roster_decisions", "event_attendance", "officer_audit_log"].includes(table)) { requireOfficer(actor); return; }
  if (table === "guild_announcements") { requireLeader(actor); return; }
  fail(`Direct ${action} is not allowed for this resource.`, 403);
}

async function mutate(env, table, query, actor) {
  const records = Array.isArray(query.data) ? query.data : [query.data || {}]; const filters = query.filters || [];
  await mutationAccess(env, table, actor, query.action, records, filters);
  if (query.action === "delete") {
    if (!filters.length) fail("A delete filter is required.");
    const compiled = compileFilters(table, filters); await env.DB.prepare(`DELETE FROM ${table}${compiled.sql}`).bind(...compiled.bindings).run(); return { rows: [] };
  }
  if (query.action === "update") {
    if (!filters.length || records.length !== 1) fail("An update filter is required.");
    const record = cleanRecord(table, records[0], actor, false); const columns = Object.keys(record); if (!columns.length) fail("Nothing to update.");
    const compiled = compileFilters(table, filters); await env.DB.prepare(`UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(",")}${compiled.sql}`).bind(...columns.map((column) => record[column]), ...compiled.bindings).run();
  } else {
    for (const raw of records) {
      const record = cleanRecord(table, raw, actor, true);
      if ((table === "profiles" || table === "characters") && !record.user_id) record.user_id = actor.id;
      const columns = Object.keys(record); const keys = PRIMARY_KEYS[table];
      let sql = `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`;
      if (query.action === "upsert") {
        const updates = columns.filter((column) => !keys.includes(column));
        sql += ` ON CONFLICT (${keys.join(",")}) DO UPDATE SET ${updates.map((column) => `${column}=excluded.${column}`).join(",")}`;
      }
      await env.DB.prepare(sql).bind(...columns.map((column) => record[column])).run();
    }
  }
  return query.returning ? selectRows(env, table, query, actor) : { rows: [] };
}

async function queryData(request, env, actor) {
  const query = await readJson(request); const table = String(query.table || "");
  if (!TABLES[table]) fail("Unknown data resource.", 404);
  const result = query.action === "select" ? await selectRows(env, table, query, actor) : await mutate(env, table, query, actor);
  let data = result.rows;
  if (query.single || query.maybeSingle) data = result.rows[0] || null;
  return { data: query.head ? null : data, count: result.count ?? null };
}

async function rpc(request, env, actor, name) {
  const body = await readJson(request);
  if (name === "event_rsvp_counts") {
    const rows = await env.DB.prepare("SELECT role,COUNT(*) AS count FROM event_rsvps WHERE event_id = ? GROUP BY role").bind(body.p_event_id).all();
    return Object.fromEntries(rows.results.map((row) => [row.role, row.count]));
  }
  if (name === "rsvp_for_event") {
    requireActive(actor); const character = await env.DB.prepare("SELECT id,user_id FROM characters WHERE id = ?").bind(body.p_character_id).first();
    if (!character || character.user_id !== actor.id) fail("Choose one of your own characters.", 403);
    const existing = await env.DB.prepare("SELECT id FROM event_rsvps WHERE event_id=? AND character_id=?").bind(body.p_event_id, body.p_character_id).first();
    if (existing) await env.DB.prepare("UPDATE event_rsvps SET role=?,status='Going',updated_at=? WHERE id=?").bind(body.p_role, now(), existing.id).run();
    else await env.DB.prepare("INSERT INTO event_rsvps (id,event_id,character_id,user_id,role,status,created_at,updated_at) VALUES (?,?,?,?,?,'Going',?,?)").bind(newId(), body.p_event_id, body.p_character_id, actor.id, body.p_role, now(), now()).run();
    return { ok: true };
  }
  if (name === "manage_guild_member") {
    requireLeader(actor); const validRanks = ["Guild Master","Co-Guild Master","Raid Officer","Event Officer","Veteran","Member","Recruit"];
    if (!validRanks.includes(body.p_rank) || !["pending","active","suspended"].includes(body.p_status)) fail("Invalid member permission selection.");
    const target = await env.DB.prepare("SELECT guild_rank,status FROM guild_memberships WHERE user_id=?").bind(body.p_user_id).first();
    if (!target) fail("Guild member not found.", 404);
    const removesLeader = LEADER_RANKS.has(target.guild_rank) && target.status === "active" && (!LEADER_RANKS.has(body.p_rank) || body.p_status !== "active");
    if (removesLeader) {
      const leaders = await env.DB.prepare("SELECT COUNT(*) AS count FROM guild_memberships WHERE status='active' AND guild_rank IN ('Guild Master','Co-Guild Master')").first();
      if (Number(leaders.count) <= 1) fail("Add another active Guild Master or Co-Guild Master before removing the final administrator.", 409);
    }
    await env.DB.prepare("UPDATE guild_memberships SET guild_rank=?,status=?,updated_at=? WHERE user_id=?").bind(body.p_rank, body.p_status, now(), body.p_user_id).run(); return { ok: true };
  }
  if (name === "review_recruitment_application") {
    requireLeader(actor); const valid = ["Reviewing","Interview","Accepted","Declined"]; if (!valid.includes(body.p_status)) fail("Invalid application status.");
    const application = await env.DB.prepare("SELECT account_user_id FROM recruitment_applications WHERE id=?").bind(body.p_application_id).first(); if (!application) fail("Application not found.", 404);
    await env.DB.prepare("UPDATE recruitment_applications SET status=?,reviewed_at=?,reviewed_by=? WHERE id=?").bind(body.p_status, now(), actor.id, body.p_application_id).run();
    if (body.p_status === "Accepted") await env.DB.prepare("UPDATE guild_memberships SET status='active',guild_rank=CASE WHEN guild_rank='Recruit' THEN 'Member' ELSE guild_rank END WHERE user_id=?").bind(application.account_user_id).run();
    if (body.p_status === "Declined") await env.DB.prepare("UPDATE guild_memberships SET status='pending' WHERE user_id=?").bind(application.account_user_id).run();
    return { ok: true };
  }
  fail("Unknown operation.", 404);
}

async function handle(request, env) {
  const url = new URL(request.url); const path = url.pathname.replace(/\/+$/, "") || "/";
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request, env) });
  if (request.method === "GET" && path === "/api/health") return response(request, env, { ok: true, service: "United Azeroth Guild API" });
  const actor = await getActor(request, env);
  if (request.method === "POST" && path === "/api/auth/bootstrap") return response(request, env, await bootstrap(request, env), 201);
  if (request.method === "POST" && path === "/api/auth/signup") return response(request, env, await signup(request, env), 201);
  if (request.method === "POST" && path === "/api/auth/login") return response(request, env, await login(request, env));
  if (request.method === "POST" && path === "/api/auth/logout") return response(request, env, await logout(request, env, actor));
  if (request.method === "GET" && path === "/api/auth/me") return response(request, env, actor ? await authPayload(env, actor.id) : { user: null, session: null });
  if (request.method === "POST" && path === "/api/query") return response(request, env, await queryData(request, env, actor));
  if (request.method === "POST" && path.startsWith("/api/rpc/")) return response(request, env, { data: await rpc(request, env, actor, path.slice(9)) });
  return response(request, env, { error: "Not found." }, 404);
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handle(request, env);
    } catch (error) {
      console.error(JSON.stringify({ event: "request_error", message: error?.message || "Unknown error", path: new URL(request.url).pathname }));
      return response(request, env, { error: error?.status ? error.message : "The guild service encountered an unexpected error." }, error?.status || 500);
    }
  }
};
