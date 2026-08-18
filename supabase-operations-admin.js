(async function () {
  const config = window.UNITED_AZEROTH_SUPABASE || {};
  if (!config.url || !config.publishableKey || !window.supabase?.createClient) return;
  const db = window.uaSupabaseClient || window.supabase.createClient(config.url, config.publishableKey);
  window.uaSupabaseClient = db;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const loading = $("ops-loading"), denied = $("ops-denied"), dashboard = $("ops-dashboard");
  const { data: { user } } = await db.auth.getUser();
  if (!user) { loading.hidden = true; denied.hidden = false; return; }
  const { data: membership } = await db.from("guild_memberships").select("*").eq("user_id", user.id).single();
  const officerRanks = ["Guild Master", "Co-Guild Master", "Raid Officer", "Event Officer"];
  if (!membership || membership.status !== "active" || !officerRanks.includes(membership.guild_rank)) {
    loading.hidden = true; denied.hidden = false;
    $("ops-denied-message").textContent = "Your account is signed in but does not have active officer permissions.";
    return;
  }
  const leader = ["Guild Master", "Co-Guild Master"].includes(membership.guild_rank);
  loading.hidden = true; dashboard.hidden = false;
  $("ops-rank").textContent = membership.guild_rank; $("ops-email").textContent = user.email;
  $("ops-permission-summary").textContent = leader ? "Full guild leadership, membership, content, and event operations." : "Calendar, team rules, roster, and attendance operations.";
  document.querySelectorAll("[data-leader-only]").forEach((node) => { node.hidden = !leader; });
  $("ops-signout").addEventListener("click", async () => { await db.auth.signOut(); location.href = "index.html"; });

  let events = [], signups = [], announcements = [], applications = [], members = [], auditRows = [];
  async function audit(action, target, detail = "") {
    await db.from("officer_audit_log").insert({ officer_id: user.id, action, target, detail });
    if (leader && !$("audit-panel").hidden) loadAudit();
  }
  function showPanel(id) {
    const button = document.querySelector(`[data-panel="${id}"]`);
    if (!button || button.hidden) return;
    document.querySelectorAll(".command-panel").forEach((panel) => { panel.hidden = panel.id !== id; });
    document.querySelectorAll(".command-nav-item").forEach((item) => item.toggleAttribute("aria-current", item === button));
    if (id === "roster-panel") renderRoster();
    if (id === "attendance-panel") renderAttendance();
  }
  document.querySelectorAll("[data-panel]").forEach((button) => button.addEventListener("click", () => showPanel(button.dataset.panel)));
  document.querySelectorAll("[data-open-panel]").forEach((button) => button.addEventListener("click", () => showPanel(button.dataset.openPanel)));

  async function loadOverview() {
    const [eventResult, applicationResult, memberResult, rsvpResult] = await Promise.all([
      db.from("guild_events").select("id", { count: "exact", head: true }).eq("status", "published"),
      leader ? db.from("recruitment_applications").select("id", { count: "exact", head: true }).eq("status", "New") : Promise.resolve({ count: 0 }),
      db.from("guild_memberships").select("user_id", { count: "exact", head: true }).eq("status", "active"),
      db.from("event_rsvps").select("id", { count: "exact", head: true })
    ]);
    const stats = [
      ["Published events", eventResult.count ?? 0],
      ["Active members", memberResult.count ?? 0],
      ["Event sign-ups", rsvpResult.count ?? 0],
      [leader ? "New applications" : "Officer access", leader ? applicationResult.count ?? 0 : membership.guild_rank]
    ];
    $("command-stats").innerHTML = stats.map(([label, value]) => `<article class="command-stat panel"><strong>${esc(value)}</strong><span>${esc(label)}</span></article>`).join("");
  }

  async function loadEvents() {
    const { data, error } = await db.from("guild_events").select("*").order("starts_at");
    if (error) return;
    events = data || [];
    $("shared-event-list").innerHTML = `<div class="admin-list-heading"><strong>Scheduled events</strong><span>${events.length}</span></div>` + events.map((item) => `<button class="admin-event-row" type="button" data-shared-event="${item.id}"><span class="admin-date">${new Date(item.starts_at).getDate()}</span><span><strong>${esc(item.title)}</strong><small>${esc(item.category === "mythic" ? "Mythic+" : item.category)} · ${new Date(item.starts_at).toLocaleString()}</small></span><span aria-hidden="true">›</span></button>`).join("");
    document.querySelectorAll("[data-shared-event]").forEach((button) => button.addEventListener("click", () => openEvent(events.find((item) => item.id === button.dataset.sharedEvent))));
    const raidEvents = events.filter((item) => ["raid", "mythic"].includes(item.category));
    [$("shared-roster-event"), $("shared-attendance-event")].forEach((select) => {
      const selected = select.value;
      select.innerHTML = raidEvents.map((item) => `<option value="${item.id}">${esc(item.title)} · ${new Date(item.starts_at).toLocaleDateString()}</option>`).join("");
      if (raidEvents.some((item) => item.id === selected)) select.value = selected;
    });
  }
  function openEvent(item = null) {
    const form = $("shared-event-form"); form.hidden = false;
    $("shared-event-id").value = item?.id || ""; $("shared-event-title").textContent = item ? "Edit event" : "Add event"; $("delete-shared-event").hidden = !item;
    $("shared-title").value = item?.title || ""; $("shared-category").value = item?.category || "raid";
    $("shared-start").value = item ? new Date(new Date(item.starts_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
    $("shared-duration").value = item?.duration_minutes || 120; $("shared-recurrence").value = item?.recurrence || "none";
    $("shared-location").value = item?.location || ""; $("shared-organizer").value = item?.organizer || "";
    $("shared-description").value = item?.description || ""; $("shared-requirements").value = item?.requirements || "";
    $("shared-tanks").value = item?.tank_capacity ?? 2; $("shared-healers").value = item?.healer_capacity ?? 4; $("shared-dps").value = item?.dps_capacity ?? 14;
    $("shared-title").focus();
  }
  $("new-shared-event").addEventListener("click", () => openEvent());
  $("close-shared-event").addEventListener("click", () => { $("shared-event-form").hidden = true; });
  $("shared-event-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const id = $("shared-event-id").value;
    const record = { title: $("shared-title").value.trim(), category: $("shared-category").value, starts_at: new Date($("shared-start").value).toISOString(), duration_minutes: Number($("shared-duration").value), recurrence: $("shared-recurrence").value, location: $("shared-location").value.trim(), organizer: $("shared-organizer").value.trim(), description: $("shared-description").value.trim(), requirements: $("shared-requirements").value.trim(), tank_capacity: Number($("shared-tanks").value), healer_capacity: Number($("shared-healers").value), dps_capacity: Number($("shared-dps").value), status: "published", updated_at: new Date().toISOString() };
    if (!id) record.created_by = user.id;
    const { error } = id ? await db.from("guild_events").update(record).eq("id", id) : await db.from("guild_events").insert(record);
    $("shared-event-message").textContent = error ? error.message : "Event published.";
    if (!error) { await audit(id ? "Updated" : "Created", "Calendar event", record.title); event.target.hidden = true; await loadEvents(); loadOverview(); }
  });
  $("delete-shared-event").addEventListener("click", async () => {
    const id = $("shared-event-id").value, item = events.find((entry) => entry.id === id);
    if (!id || !window.confirm(`Delete ${item?.title || "this event"}? This also removes its RSVP and roster history and cannot be undone.`)) return;
    const { error } = await db.from("guild_events").delete().eq("id", id);
    if (!error) { await audit("Deleted", "Calendar event", item?.title); $("shared-event-form").hidden = true; await loadEvents(); loadOverview(); }
  });

  async function loadRules() {
    const { data } = await db.from("guild_settings").select("*").in("key", ["raid_rules", "mythic_rules"]);
    const settings = Object.fromEntries((data || []).map((item) => [item.key, item.value]));
    $("shared-raid-rules").value = (settings.raid_rules || []).join("\n");
    $("shared-mythic-rules").value = (settings.mythic_rules || []).join("\n");
  }
  $("shared-rules-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const lines = (id) => $(id).value.split("\n").map((line) => line.trim()).filter(Boolean);
    const records = [{ key: "raid_rules", value: lines("shared-raid-rules"), updated_by: user.id, updated_at: new Date().toISOString() }, { key: "mythic_rules", value: lines("shared-mythic-rules"), updated_by: user.id, updated_at: new Date().toISOString() }];
    const { error } = await db.from("guild_settings").upsert(records);
    $("shared-rules-message").textContent = error ? error.message : "Rules published to the guild rules page.";
    if (!error) audit("Published", "Raid & Mythic+ rules");
  });

  async function loadSignups() {
    const { data } = await db.from("event_rsvps").select("event_id,character_id,role,status,characters(name,primary_role)");
    signups = data || [];
  }
  async function renderRoster() {
    const eventId = $("shared-roster-event").value; if (!eventId) { $("shared-roster-builder").innerHTML = `<p class="empty-state">Create a raid or Mythic+ event first.</p>`; return; }
    const { data: decisions } = await db.from("roster_decisions").select("*").eq("event_id", eventId);
    const saved = Object.fromEntries((decisions || []).map((item) => [item.character_id, item.decision]));
    const entries = signups.filter((item) => item.event_id === eventId);
    const roles = ["Tank", "Healer", "DPS", "Bench", "Tentative"];
    $("shared-roster-builder").innerHTML = roles.map((role) => {
      const roleEntries = entries.filter((item) => item.role === role);
      return `<section class="roster-role panel"><div class="roster-role-heading"><h3>${role}</h3><span>${roleEntries.length}</span></div><div class="roster-entries">${roleEntries.map((item) => `<label class="roster-entry"><strong>${esc(item.characters?.name || "Character")}</strong><select data-roster-character="${item.character_id}"><option ${saved[item.character_id] === "Confirmed" ? "selected" : ""}>Confirmed</option><option ${saved[item.character_id] === "Bench" ? "selected" : ""}>Bench</option><option ${saved[item.character_id] === "Declined" ? "selected" : ""}>Declined</option></select></label>`).join("") || `<p>No ${role.toLowerCase()} sign-ups.</p>`}</div></section>`;
    }).join("");
  }
  $("shared-roster-event").addEventListener("change", renderRoster);
  $("save-shared-roster").addEventListener("click", async () => {
    const eventId = $("shared-roster-event").value;
    const records = [...document.querySelectorAll("[data-roster-character]")].map((select) => ({ event_id: eventId, character_id: select.dataset.rosterCharacter, decision: select.value, updated_by: user.id, updated_at: new Date().toISOString() }));
    const { error } = records.length ? await db.from("roster_decisions").upsert(records) : { error: null };
    $("shared-roster-message").textContent = error ? error.message : "Roster decisions saved.";
    if (!error) audit("Saved", "Raid roster", events.find((item) => item.id === eventId)?.title || "");
  });

  async function renderAttendance() {
    const eventId = $("shared-attendance-event").value; if (!eventId) { $("shared-attendance-rows").innerHTML = `<p class="empty-state">Create a raid or Mythic+ event first.</p>`; return; }
    const eventSignups = signups.filter((item) => item.event_id === eventId);
    const { data } = await db.from("event_attendance").select("*").eq("event_id", eventId);
    const saved = Object.fromEntries((data || []).map((item) => [item.character_id, item]));
    $("shared-attendance-rows").innerHTML = eventSignups.map((item) => { const record = saved[item.character_id] || {}; return `<div class="attendance-row"><strong>${esc(item.characters?.name || "Character")}</strong><span>${esc(item.role)}</span><label><span class="sr-only">Attendance status</span><select data-attendance-character="${item.character_id}"><option ${record.status === "Present" ? "selected" : ""}>Present</option><option ${record.status === "Late" ? "selected" : ""}>Late</option><option ${record.status === "Absent" ? "selected" : ""}>Absent</option><option ${record.status === "Excused" ? "selected" : ""}>Excused</option></select></label><label><span class="sr-only">Officer note</span><input data-attendance-note="${item.character_id}" value="${esc(record.officer_note || "")}" placeholder="Optional note"></label></div>`; }).join("") || `<p class="empty-state">No character sign-ups for this event.</p>`;
  }
  $("shared-attendance-event").addEventListener("change", renderAttendance);
  $("shared-attendance-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const eventId = $("shared-attendance-event").value;
    const records = [...document.querySelectorAll("[data-attendance-character]")].map((select) => ({ event_id: eventId, character_id: select.dataset.attendanceCharacter, status: select.value, officer_note: document.querySelector(`[data-attendance-note="${select.dataset.attendanceCharacter}"]`).value.trim(), updated_by: user.id, updated_at: new Date().toISOString() }));
    const { error } = records.length ? await db.from("event_attendance").upsert(records) : { error: null };
    $("shared-attendance-message").textContent = error ? error.message : "Attendance saved.";
    if (!error) audit("Updated", "Attendance", events.find((item) => item.id === eventId)?.title || "");
  });

  async function loadMembers() {
    if (!leader) return;
    const { data } = await db.from("guild_memberships").select("user_id,guild_rank,status,joined_at,profiles(display_name,discord_name)");
    members = data || []; $("shared-member-count").textContent = `${members.length} accounts`;
    const ranks = ["Guild Master", "Co-Guild Master", "Raid Officer", "Event Officer", "Veteran", "Member", "Recruit"];
    $("shared-member-list").innerHTML = members.map((item) => `<div class="member-admin-row"><div><strong>${esc(item.profiles?.display_name || "Member")}</strong><small>${esc(item.profiles?.discord_name || "No Discord listed")} · Joined ${new Date(item.joined_at).toLocaleDateString()}</small></div><label><span>Rank</span><select data-member-rank="${item.user_id}">${ranks.map((rank) => `<option ${rank === item.guild_rank ? "selected" : ""}>${rank}</option>`).join("")}</select></label><label><span>Status</span><select data-member-status="${item.user_id}"><option ${item.status === "pending" ? "selected" : ""}>pending</option><option ${item.status === "active" ? "selected" : ""}>active</option><option ${item.status === "suspended" ? "selected" : ""}>suspended</option></select></label><button class="button secondary compact-button" data-save-member="${item.user_id}" type="button">Save</button></div>`).join("") || `<p class="empty-state">No member accounts found.</p>`;
    document.querySelectorAll("[data-save-member]").forEach((button) => button.addEventListener("click", async () => {
      const memberId = button.dataset.saveMember, rank = document.querySelector(`[data-member-rank="${memberId}"]`).value, status = document.querySelector(`[data-member-status="${memberId}"]`).value;
      const member = members.find((item) => item.user_id === memberId);
      const memberName = member?.profiles?.display_name || "this member";
      if (status === "suspended" && !window.confirm(`Suspend ${memberName}? They will immediately lose access to member-only guild data.`)) return;
      button.disabled = true; const { error } = await db.rpc("manage_guild_member", { p_user_id: memberId, p_rank: rank, p_status: status }); button.disabled = false;
      button.textContent = error ? "Try again" : "Saved"; if (!error) { setTimeout(() => { button.textContent = "Save"; }, 1500); loadOverview(); }
    }));
  }

  async function loadApplications() {
    if (!leader) return;
    const { data } = await db.from("recruitment_applications").select("*").order("created_at", { ascending: false });
    applications = data || []; $("shared-application-count").textContent = `${applications.filter((item) => item.status === "New").length} new`;
    $("shared-application-list").innerHTML = applications.map((item) => `<article class="application-card panel"><div class="application-title"><div><span>${esc(item.status)}</span><h3>${esc(item.character_name)}</h3><p>${esc(item.class_name)} · ${esc(item.primary_role)} · ilvl ${item.item_level || "—"}</p></div><time>${new Date(item.created_at).toLocaleDateString()}</time></div><dl class="event-facts"><div><dt>Email</dt><dd>${esc(item.email)}</dd></div><div><dt>Discord</dt><dd>${esc(item.discord_name)}</dd></div><div><dt>Goals</dt><dd>${esc(item.goals)}</dd></div><div><dt>Experience</dt><dd>${esc(item.experience)}</dd></div></dl><label>Review status<select data-review-app="${item.id}"><option ${item.status === "New" ? "selected" : ""}>New</option><option ${item.status === "Reviewing" ? "selected" : ""}>Reviewing</option><option ${item.status === "Interview" ? "selected" : ""}>Interview</option><option ${item.status === "Accepted" ? "selected" : ""}>Accepted</option><option ${item.status === "Declined" ? "selected" : ""}>Declined</option></select></label></article>`).join("") || `<p class="empty-state">No applications yet.</p>`;
    document.querySelectorAll("[data-review-app]").forEach((select) => select.addEventListener("change", async () => {
      if (select.value === "New") return; const application = applications.find((item) => item.id === select.dataset.reviewApp);
      const { error } = await db.rpc("review_recruitment_application", { p_application_id: select.dataset.reviewApp, p_status: select.value });
      if (error) { alert(error.message); } else { await audit("Reviewed", "Application", `${application?.character_name}: ${select.value}`); loadApplications(); loadMembers(); loadOverview(); }
    }));
  }

  async function loadAnnouncements() {
    if (!leader) return;
    const { data } = await db.from("guild_announcements").select("*").order("published_at", { ascending: false });
    announcements = data || [];
    $("shared-announcement-list").innerHTML = announcements.map((item) => `<button class="announcement-admin-row announcement-edit-row" type="button" data-edit-announcement="${item.id}"><span><small>${esc(item.category)}${item.pinned ? " · Pinned" : ""}</small><strong>${esc(item.title)}</strong></span><span aria-hidden="true">›</span></button>`).join("") || `<p class="empty-state">No announcements yet.</p>`;
    document.querySelectorAll("[data-edit-announcement]").forEach((button) => button.addEventListener("click", () => {
      const item = announcements.find((entry) => entry.id === button.dataset.editAnnouncement);
      $("shared-announcement-id").value = item.id; $("shared-announcement-title").value = item.title; $("shared-announcement-category").value = item.category; $("shared-announcement-body").value = item.body; $("shared-announcement-pinned").checked = item.pinned; $("cancel-shared-announcement").hidden = false; $("delete-shared-announcement").hidden = false;
    }));
  }
  function resetAnnouncement() { $("shared-announcement-form").reset(); $("shared-announcement-id").value = ""; $("cancel-shared-announcement").hidden = true; $("delete-shared-announcement").hidden = true; }
  $("cancel-shared-announcement").addEventListener("click", resetAnnouncement);
  $("delete-shared-announcement").addEventListener("click", async () => {
    const id = $("shared-announcement-id").value;
    const item = announcements.find((entry) => entry.id === id);
    if (!id || !window.confirm(`Delete the announcement “${item?.title || "Untitled"}”? It will disappear from the homepage immediately and cannot be undone.`)) return;
    const { error } = await db.from("guild_announcements").delete().eq("id", id);
    if (error) { window.alert(error.message); return; }
    await audit("Deleted", "Announcement", item?.title || "");
    resetAnnouncement();
    loadAnnouncements();
  });
  $("shared-announcement-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const id = $("shared-announcement-id").value;
    const record = { title: $("shared-announcement-title").value.trim(), category: $("shared-announcement-category").value, body: $("shared-announcement-body").value.trim(), pinned: $("shared-announcement-pinned").checked, published: true, updated_at: new Date().toISOString() };
    if (!id) record.created_by = user.id;
    const { error } = id ? await db.from("guild_announcements").update(record).eq("id", id) : await db.from("guild_announcements").insert(record);
    if (!error) { await audit(id ? "Updated" : "Published", "Announcement", record.title); resetAnnouncement(); loadAnnouncements(); }
  });

  async function loadContent() {
    if (!leader) return;
    const { data } = await db.from("guild_settings").select("value").eq("key", "site_content").maybeSingle();
    const value = data?.value || {}; $("shared-home-headline").value = value.headline || ""; $("shared-home-lede").value = value.lede || ""; $("shared-sidebar-message").value = value.sidebar || "";
  }
  $("shared-content-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const value = { headline: $("shared-home-headline").value.trim(), lede: $("shared-home-lede").value.trim(), sidebar: $("shared-sidebar-message").value.trim() };
    const { error } = await db.from("guild_settings").upsert({ key: "site_content", value, updated_by: user.id, updated_at: new Date().toISOString() });
    $("shared-content-message").textContent = error ? error.message : "Homepage content published.";
    if (!error) audit("Published", "Website content", "Homepage messaging updated");
  });

  async function loadAudit() {
    if (!leader) return;
    const { data } = await db.from("officer_audit_log").select("*").order("created_at", { ascending: false }).limit(250);
    auditRows = data || []; $("shared-audit-list").innerHTML = auditRows.map((item) => `<div class="audit-row"><time>${new Date(item.created_at).toLocaleString()}</time><strong>${esc(item.action)}</strong><span>${esc(item.target)}</span><small>${esc(item.detail)}</small></div>`).join("") || `<p class="empty-state">Administrative actions will appear here.</p>`;
  }
  $("export-shared-audit").addEventListener("click", () => {
    const csv = ["Time,Action,Target,Detail", ...auditRows.map((item) => [item.created_at, item.action, item.target, item.detail].map((value) => `"${String(value || "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "united-azeroth-officer-audit.csv"; link.click(); URL.revokeObjectURL(link.href);
  });

  await Promise.all([loadOverview(), loadEvents(), loadRules(), loadSignups(), loadMembers(), loadApplications(), loadAnnouncements(), loadContent(), loadAudit()]);
})();
