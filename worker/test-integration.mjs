import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = process.env.UA_API_URL || "http://127.0.0.1:8787";
const origin = "http://127.0.0.1:4173";
const workerSource = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
assert.match(workerSource, /const PASSWORD_ITERATIONS = 100000;/, "PBKDF2 must stay within Cloudflare's 100,000-iteration limit");

async function call(path, { token, body, method = body ? "POST" : "GET" } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json();
  return { status: response.status, payload, cors: response.headers.get("access-control-allow-origin") };
}

async function query(token, table, action = "select", options = {}) {
  return call("/api/query", { token, body: { table, action, filters: [], orders: [], ...options } });
}

const health = await call("/api/health");
assert.equal(health.status, 200); assert.equal(health.payload.ok, true); assert.equal(health.cors, origin);

const adminCredentials = { email: "admin.integration@example.com", password: "IntegrationPass!2026" };
let admin = await call("/api/auth/bootstrap", { body: { setupKey: "local-development-setup-key", displayName: "Integration Admin", discordName: "Admin#0001", ...adminCredentials } });
if (admin.status === 409) admin = await call("/api/auth/login", { body: adminCredentials });
  assert.ok([200, 201].includes(admin.status), JSON.stringify(admin.payload));
const adminToken = admin.payload.session.access_token;

const eventId = crypto.randomUUID();
const event = await query(adminToken, "guild_events", "insert", { data: { id: eventId, title: "Integration Raid", category: "raid", starts_at: "2026-09-12T18:30:00.000Z", duration_minutes: 180, location: "Raid entrance", organizer: "Integration Admin", description: "Integration test event", requirements: "Ready check", status: "published", created_by: admin.payload.user.id } });
assert.equal(event.status, 200);

const publicEvents = await query(null, "guild_events", "select", { filters: [{ column: "status", operator: "eq", value: "published" }] });
assert.equal(publicEvents.status, 200); assert.ok(publicEvents.payload.data.some((item) => item.id === eventId));

const memberEmail = `member-${Date.now()}@example.com`;
const signup = await call("/api/auth/signup", { body: { email: memberEmail, password: "MemberPass!2026", metadata: { display_name: "Integration Member", character_name: "Testadin", discord_name: "Member#0001", class_name: "Paladin", primary_role: "Healer", item_level: 600, goals: "Test the guild system", experience: "Integration tests", rules_agreed: true } } });
assert.equal(signup.status, 201); const memberToken = signup.payload.session.access_token; const memberId = signup.payload.user.id;

const pendingDirectory = await query(memberToken, "profiles");
assert.equal(pendingDirectory.status, 403);

const activate = await call("/api/rpc/manage_guild_member", { token: adminToken, body: { p_user_id: memberId, p_rank: "Member", p_status: "active" } });
assert.equal(activate.status, 200);

const characterId = crypto.randomUUID();
const character = await query(memberToken, "characters", "insert", { data: { id: characterId, user_id: memberId, name: "Testadin", realm: "Proudmoore", class_name: "Paladin", specialization: "Holy", primary_role: "Healer", item_level: 600, professions: ["Alchemy", "Herbalism"], is_main: true } });
assert.equal(character.status, 200);

const forbiddenEvent = await query(memberToken, "guild_events", "insert", { data: { title: "Not allowed", category: "raid", starts_at: "2026-09-20T18:00:00Z" } });
assert.equal(forbiddenEvent.status, 403);

const rsvp = await call("/api/rpc/rsvp_for_event", { token: memberToken, body: { p_event_id: eventId, p_character_id: characterId, p_role: "Healer" } });
assert.equal(rsvp.status, 200);
const counts = await call("/api/rpc/event_rsvp_counts", { body: { p_event_id: eventId } });
assert.equal(counts.status, 200); assert.equal(counts.payload.data.Healer, 1);

const announcement = await query(adminToken, "guild_announcements", "insert", { data: { title: "Integration announcement", category: "Guild News", body: "The Worker API is operating.", pinned: true, published: true, created_by: admin.payload.user.id } });
assert.equal(announcement.status, 200);

const members = await query(adminToken, "guild_memberships", "select");
assert.equal(members.status, 200); assert.ok(members.payload.data.some((item) => item.user_id === memberId && item.profiles?.display_name === "Integration Member"));

console.log("Cloudflare Worker integration checks passed.");
