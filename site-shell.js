(() => {
  const mount = document.querySelector("[data-site-shell]");
  if (!mount) return;

  const current = mount.dataset.current || "";
  const config = window.UNITED_AZEROTH_SUPABASE;
  const hasCachedSession = () => {
    if (!config?.url) return false;
    try {
      const projectRef = new URL(config.url).hostname.split(".")[0];
      const stored = window.localStorage.getItem(`sb-${projectRef}-auth-token`);
      if (!stored) return false;
      const session = JSON.parse(stored);
      return Boolean(session?.access_token && (!session.expires_at || session.expires_at * 1000 > Date.now()));
    } catch (_error) {
      return false;
    }
  };
  const notes = {
    home: "Experienced players. Shared adventures. One united community.",
    dashboard: "Your private guild account and characters.",
    members: "Many characters. One guild community.",
    events: "Times shown in realm time. Confirm attendance and role in Discord.",
    availability: "Help officers schedule when the team can play.",
    keys: "Find a group, fill a role, and time the next key together.",
    rules: "Clear expectations help every guildmate succeed.",
    recruitment: "Build friendships, defeat bosses, and find your next guild home.",
    officers: "Leadership is here to guide events, support members, and protect the community.",
    command: "One secure place for leadership and event operations."
  };

  const link = (href, label, key) => {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.textContent = label;
    if (current === key) anchor.setAttribute("aria-current", "page");
    return anchor;
  };

  const group = (label, links, className = "") => {
    const section = document.createElement("div");
    section.className = `nav-group ${className}`.trim();
    const heading = document.createElement("span");
    heading.className = "nav-group-label";
    heading.textContent = label;
    section.append(heading, ...links.map(([href, text, key]) => link(href, text, key)));
    return section;
  };

  const skip = document.createElement("a");
  skip.className = "skip-link";
  skip.href = "#main";
  skip.textContent = "Skip to content";

  const toggle = document.createElement("button");
  toggle.className = "menu-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Open navigation");
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = "☰";

  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";

  const brand = document.createElement("a");
  brand.className = "brand";
  brand.href = "index.html";
  const mark = document.createElement("span");
  mark.className = "brand-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "UA";
  const brandText = document.createElement("span");
  brandText.className = "brand-text";
  const brandName = document.createElement("strong");
  brandName.textContent = "United Azeroth";
  const brandTagline = document.createElement("span");
  brandTagline.textContent = "Guild Community";
  brandText.append(brandName, brandTagline);
  brand.append(mark, brandText);

  const nav = document.createElement("nav");
  nav.className = "nav";
  nav.setAttribute("aria-label", "Primary");
  const accountGroup = group("Account", [
    ["dashboard.html", hasCachedSession() ? "My Dashboard" : "Member sign in", "dashboard"]
  ], "nav-account");
  const accountLink = accountGroup.querySelector("a");

  nav.append(
    group("Explore", [
      ["index.html", "Home", "home"],
      ["schedule.html", "Events Calendar", "events"],
      ["roster.html", "Officers", "officers"],
      ["rules.html", "Guild Rules", "rules"],
      ["recruitment.html", "Recruitment", "recruitment"]
    ]),
    accountGroup
  );

  const memberGroup = group("Guild member", [
    ["members.html", "Members", "members"],
    ["availability.html", "Availability", "availability"],
    ["keys.html", "Mythic+ Keys", "keys"]
  ], "nav-member");
  memberGroup.hidden = true;
  nav.append(memberGroup);

  const officerGroup = group("Leadership", [
    ["guild-admin.html", "Officer Command", "command"]
  ], "nav-officer");
  officerGroup.hidden = true;
  nav.append(officerGroup);

  const note = document.createElement("p");
  note.className = "sidebar-note";
  note.textContent = notes[current] || notes.home;
  if (current === "home") note.id = "home-sidebar-message";

  const storm = document.createElement("div");
  storm.className = "arcane-storm";
  storm.setAttribute("aria-hidden", "true");
  storm.append(...Array.from({ length: 3 }, () => document.createElement("span")));

  sidebar.append(brand, nav, note);
  mount.replaceWith(skip, storm, toggle, sidebar);

  if (!config?.url || !config?.publishableKey || !window.supabase?.createClient) return;

  const db = window.uaSupabaseClient || window.supabase.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.uaSupabaseClient = db;
  const officerRanks = new Set(["Guild Master", "Co-Guild Master", "Raid Officer", "Event Officer"]);

  const updateNavigation = async () => {
    const { data: { user } } = await db.auth.getUser();
    memberGroup.hidden = true;
    officerGroup.hidden = true;
    if (!user) {
      accountLink.textContent = "Member sign in";
      return;
    }
    accountLink.textContent = "My Dashboard";

    const { data: membership } = await db
      .from("guild_memberships")
      .select("guild_rank,status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (membership?.status !== "active") return;
    memberGroup.hidden = false;
    officerGroup.hidden = !officerRanks.has(membership.guild_rank);
  };

  updateNavigation().catch(() => {});
  db.auth.onAuthStateChange(() => {
    window.setTimeout(() => updateNavigation().catch(() => {}), 0);
  });
})();
