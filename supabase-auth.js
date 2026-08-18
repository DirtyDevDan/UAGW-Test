(function () {
  const loading = document.getElementById("account-loading");
  const setup = document.getElementById("account-setup");
  const dashboard = document.getElementById("private-dashboard");
  const config = window.UNITED_AZEROTH_SUPABASE || {};
  let client = null;
  let currentUser = null;
  let profile = null;
  let membership = null;
  let characters = [];

  const show = (element) => {
    [loading, setup, dashboard].forEach((view) => { view.hidden = view !== element; });
  };
  const setMessage = (id, message, error = false) => {
    const element = document.getElementById(id); element.textContent = message; element.classList.toggle("error", error);
  };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

  if (!config.url || !config.publishableKey) {
    show(setup);
    return;
  }
  if (!window.supabase?.createClient) {
    show(setup);
    document.getElementById("setup-error").textContent = "The Supabase client could not load. Check your internet connection and try again.";
    return;
  }

  client = window.uaSupabaseClient || window.supabase.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.uaSupabaseClient = client;

  async function loadAccount() {
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) {
      window.location.replace("index.html?login=1");
      return;
    }
    currentUser = userData.user;
    const [{ data: profileData, error: profileError }, { data: membershipData, error: membershipError }, { data: characterData, error: characterError }] = await Promise.all([
      client.from("profiles").select("*").eq("user_id", currentUser.id).single(),
      client.from("guild_memberships").select("*").eq("user_id", currentUser.id).single(),
      client.from("characters").select("*").eq("user_id", currentUser.id).order("is_main", { ascending: false }).order("name")
    ]);
    if (profileError || membershipError || characterError) {
      show(setup);
      document.getElementById("setup-error").textContent = "Connected to Supabase, but the guild tables are unavailable. Run supabase-schema.sql in the SQL Editor.";
      return;
    }
    profile = profileData; membership = membershipData; characters = characterData || [];
    renderPrivateDashboard(); show(dashboard);
  }

  function switchPanel(panelId) {
    document.querySelectorAll(".account-tabs [role='tab']").forEach((tab) => tab.setAttribute("aria-selected", String(tab.getAttribute("aria-controls") === panelId)));
    document.querySelectorAll(".account-panel").forEach((panel) => { panel.hidden = panel.id !== panelId; });
  }

  function renderPrivateDashboard() {
    const name = profile.display_name || currentUser.email.split("@")[0];
    document.getElementById("private-name").textContent = name;
    document.getElementById("private-rank").textContent = membership.guild_rank;
    document.getElementById("private-email").textContent = currentUser.email;
    document.getElementById("profile-display-name").value = profile.display_name || "";
    document.getElementById("profile-discord").value = profile.discord_name || "";
    document.getElementById("profile-bio").value = profile.bio || "";
    document.getElementById("profile-visibility").value = profile.visibility || "guild";
    document.getElementById("private-stats").innerHTML = `<article class="stat-card panel"><strong>${characters.length}</strong><span>Characters</span></article><article class="stat-card panel"><strong>${characters.filter((item) => item.is_main).length}</strong><span>Main character</span></article><article class="stat-card panel"><strong>${new Set(characters.map((item) => item.primary_role)).size}</strong><span>Playable roles</span></article><article class="stat-card panel"><strong>${membership.guild_rank}</strong><span>Guild rank</span></article>`;
    renderCharacters();
    const overview = document.getElementById("overview-characters");
    overview.innerHTML = characters.length ? characters.slice(0, 4).map((item) => `<div class="dashboard-row"><span>${item.is_main ? "Main" : "Alt"}</span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.specialization)} ${escapeHtml(item.class_name)} · ${escapeHtml(item.primary_role)}</small></div>`).join("") : `<p class="empty-copy">Add your main character and alts to begin.</p>`;
    document.getElementById("private-announcements").innerHTML = `<div class="dashboard-row"><span>Account</span><strong>Your dashboard is private</strong><small>Only you and authorized guild leadership can access these account records.</small></div><div class="dashboard-row"><span>Characters</span><strong>Add every main and alt</strong><small>Set one character as your main and keep roles, item levels, and professions current.</small></div>`;
  }

  function renderCharacters() {
    const list = document.getElementById("private-character-list"); list.replaceChildren();
    characters.forEach((character) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "private-character-card panel";
      button.innerHTML = `<span class="character-initial">${escapeHtml(character.name.slice(0, 2).toUpperCase())}</span><span class="member-rank">${character.is_main ? "Main character" : "Alt character"}</span><strong>${escapeHtml(character.name)}</strong><span>${escapeHtml(character.specialization)} ${escapeHtml(character.class_name)}</span><small>${escapeHtml(character.realm)} · ${escapeHtml(character.primary_role)}${character.item_level ? ` · ilvl ${character.item_level}` : ""}</small>`;
      button.addEventListener("click", () => openCharacterEditor(character)); list.append(button);
    });
    if (!characters.length) list.innerHTML = `<p class="empty-state">No characters yet. Add your main character to get started.</p>`;
  }

  function openCharacterEditor(character = null) {
    document.getElementById("character-form").hidden = false;
    document.getElementById("character-form-title").textContent = character ? "Edit character" : "Add character";
    document.getElementById("character-id").value = character?.id || "";
    document.getElementById("character-name").value = character?.name || "";
    document.getElementById("character-realm").value = character?.realm || "";
    document.getElementById("character-class").value = character?.class_name || "";
    document.getElementById("character-spec").value = character?.specialization || "";
    document.getElementById("character-role").value = character?.primary_role || "DPS";
    document.getElementById("character-ilvl").value = character?.item_level || "";
    document.getElementById("character-professions").value = (character?.professions || []).join(", ");
    document.getElementById("character-main").checked = Boolean(character?.is_main);
    document.getElementById("character-note").value = character?.profile_note || "";
    document.getElementById("delete-character").hidden = !character;
    document.getElementById("character-name").focus();
  }

  document.querySelectorAll(".account-tabs [role='tab']").forEach((tab) => tab.addEventListener("click", () => switchPanel(tab.getAttribute("aria-controls"))));
  document.querySelectorAll("[data-open-panel]").forEach((button) => button.addEventListener("click", () => switchPanel(button.dataset.openPanel)));
  document.getElementById("account-signout").addEventListener("click", async () => {
    await client.auth.signOut();
    currentUser = null;
    window.location.replace("index.html");
  });

  document.getElementById("profile-form").addEventListener("submit", async (event) => {
    event.preventDefault(); setMessage("profile-message", "Saving…");
    const updates = { display_name: document.getElementById("profile-display-name").value.trim(), discord_name: document.getElementById("profile-discord").value.trim(), bio: document.getElementById("profile-bio").value.trim(), visibility: document.getElementById("profile-visibility").value, updated_at: new Date().toISOString() };
    const { data, error } = await client.from("profiles").update(updates).eq("user_id", currentUser.id).select().single();
    if (error) { setMessage("profile-message", error.message, true); return; }
    profile = data; renderPrivateDashboard(); setMessage("profile-message", "Profile saved.");
  });
  document.getElementById("add-character").addEventListener("click", () => openCharacterEditor());
  document.getElementById("close-character-form").addEventListener("click", () => { document.getElementById("character-form").hidden = true; });
  document.getElementById("character-form").addEventListener("submit", async (event) => {
    event.preventDefault(); setMessage("character-message", "Saving…");
    const id = document.getElementById("character-id").value;
    const record = { user_id: currentUser.id, name: document.getElementById("character-name").value.trim(), realm: document.getElementById("character-realm").value.trim(), class_name: document.getElementById("character-class").value.trim(), specialization: document.getElementById("character-spec").value.trim(), primary_role: document.getElementById("character-role").value, item_level: Number(document.getElementById("character-ilvl").value) || null, professions: document.getElementById("character-professions").value.split(",").map((item) => item.trim()).filter(Boolean), is_main: document.getElementById("character-main").checked, profile_note: document.getElementById("character-note").value.trim(), updated_at: new Date().toISOString() };
    if (record.is_main) await client.from("characters").update({ is_main: false }).eq("user_id", currentUser.id);
    const query = id ? client.from("characters").update(record).eq("id", id) : client.from("characters").insert(record);
    const { error } = await query;
    if (error) { setMessage("character-message", error.message, true); return; }
    document.getElementById("character-form").hidden = true; await loadAccount(); switchPanel("account-characters");
  });
  document.getElementById("delete-character").addEventListener("click", async () => {
    const id = document.getElementById("character-id").value;
    if (!id) return;
    const name = document.getElementById("character-name").value.trim() || "this character";
    if (!window.confirm(`Delete ${name}? This permanently removes the character from your account and cannot be undone.`)) return;
    setMessage("character-message", `Deleting ${name}…`);
    const { error } = await client.from("characters").delete().eq("id", id);
    if (error) { setMessage("character-message", error.message, true); return; }
    document.getElementById("character-form").hidden = true; await loadAccount(); switchPanel("account-characters");
  });

  client.auth.onAuthStateChange((_event, session) => {
    if (!session && currentUser) {
      currentUser = null;
      window.location.replace("index.html");
    }
  });
  loadAccount();
})();
