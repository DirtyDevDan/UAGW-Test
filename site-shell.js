(() => {
  const mount = document.querySelector("[data-site-shell]");
  if (!mount) return;

  const current = mount.dataset.current || "";
  const memberOnlyPages = new Set(["members", "availability", "keys"]);
  if (memberOnlyPages.has(current)) document.body.classList.add("ua-member-gated");
  const config = window.UNITED_AZEROTH_SUPABASE;
  const readCachedSession = () => {
    if (!config?.url) return false;
    try {
      const projectRef = new URL(config.url).hostname.split(".")[0];
      const stored = window.localStorage.getItem(`sb-${projectRef}-auth-token`);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      const session = parsed?.currentSession || parsed?.session || parsed;
      return session?.access_token && (!session.expires_at || session.expires_at * 1000 > Date.now()) ? session : null;
    } catch (_error) {
      return null;
    }
  };
  const cachedSession = readCachedSession();
  let activeUserId = cachedSession?.user?.id || null;
  const membershipKey = (userId) => `ua-membership-${userId}`;
  const readCachedMembership = (userId) => {
    if (!userId) return null;
    try {
      const cached = JSON.parse(window.localStorage.getItem(membershipKey(userId)) || "null");
      return cached?.user_id === userId ? cached : null;
    } catch (_error) {
      return null;
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
  nav.append(
    group("Explore", [
      ["index.html", "Home", "home"],
      ["schedule.html", "Events Calendar", "events"],
      ["roster.html", "Officers", "officers"],
      ["rules.html", "Guild Rules", "rules"]
    ])
  );

  const memberGroup = group("Guild member", [
    ["members.html", "Members", "members"],
    ["availability.html", "Availability", "availability"]
  ], "nav-member");
  memberGroup.hidden = true;
  nav.append(memberGroup);

  const officerGroup = group("Leadership", [
    ["guild-admin.html", "Officer Command", "command"]
  ], "nav-officer");
  officerGroup.hidden = true;
  nav.append(officerGroup);

  const accountCorner = document.createElement("div");
  accountCorner.className = "account-corner";
  accountCorner.hidden = true;
  const accountCornerCopy = document.createElement("span");
  accountCornerCopy.textContent = "Member account";
  const dashboardLink = link("dashboard.html", "My Dashboard", "dashboard");
  accountCorner.append(accountCornerCopy, dashboardLink);

  const loginLinks = document.createElement("div");
  loginLinks.className = "sidebar-login-links";
  const memberLogin = link("index.html?login=1", "Member login", "");
  const officerLogin = link("index.html?login=1&access=officer", "Officer login", "");
  loginLinks.append(memberLogin, officerLogin);

  const note = document.createElement("p");
  note.className = "sidebar-note";
  note.textContent = notes[current] || notes.home;
  if (current === "home") note.id = "home-sidebar-message";

  const storm = document.createElement("div");
  storm.className = "arcane-storm";
  storm.setAttribute("aria-hidden", "true");
  storm.append(...Array.from({ length: 3 }, () => document.createElement("span")));

  sidebar.append(brand, nav, note, loginLinks);
  mount.replaceWith(skip, storm, toggle, sidebar, accountCorner);

  const officerRanks = new Set(["Guild Master", "Co-Guild Master", "Raid Officer", "Event Officer"]);
  const applyAuthUI = (session, membership = null, verified = false) => {
    const signedIn = Boolean(session?.user);
    const approved = membership?.status === "active" && (!memberOnlyPages.has(current) || verified);
    activeUserId = session?.user?.id || null;
    accountCorner.hidden = !signedIn;
    loginLinks.hidden = signedIn;
    memberGroup.hidden = !signedIn || !approved;
    officerGroup.hidden = !signedIn || !approved || !officerRanks.has(membership.guild_rank);
    document.body.classList.toggle("ua-authenticated", signedIn);
    document.body.classList.toggle("ua-member-approved", approved);
    document.body.classList.toggle("ua-auth-resolved", true);
    if (signedIn) {
      accountCornerCopy.textContent = approved ? membership.guild_rank : "Application under review";
      dashboardLink.textContent = approved ? "My Dashboard" : "Application Status";
      accountCorner.title = session.user.email || "Signed-in member account";
    }
    window.dispatchEvent(new CustomEvent("ua-auth-ui", { detail: { signedIn, session, membership } }));
  };

  applyAuthUI(cachedSession, readCachedMembership(cachedSession?.user?.id));

  if (!config?.url || !config?.publishableKey || !window.supabase?.createClient) return;

  const db = window.uaSupabaseClient || window.supabase.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.uaSupabaseClient = db;
  const updateNavigation = async () => {
    const { data: { user } } = await db.auth.getUser();
    if (!user) {
      if (activeUserId) window.localStorage.removeItem(membershipKey(activeUserId));
      applyAuthUI(null, null);
      return;
    }

    const { data: membership, error: membershipError } = await db
      .from("guild_memberships")
      .select("guild_rank,status")
      .eq("user_id", user.id)
      .maybeSingle();
    const safeMembership = membershipError ? null : membership;
    if (safeMembership) window.localStorage.setItem(membershipKey(user.id), JSON.stringify({ ...safeMembership, user_id: user.id }));
    const { data: { session } } = await db.auth.getSession();
    if (memberOnlyPages.has(current) && safeMembership?.status !== "active") {
      window.location.replace(safeMembership ? "dashboard.html" : "index.html?login=1");
      return;
    }
    applyAuthUI(session, safeMembership, true);
  };

  window.uaAuthNavigation = { refresh: updateNavigation };
  updateNavigation().catch(() => {});
  db.auth.onAuthStateChange((_event, session) => {
    if (!session && activeUserId) window.localStorage.removeItem(membershipKey(activeUserId));
    applyAuthUI(session, readCachedMembership(session?.user?.id));
    window.setTimeout(() => updateNavigation().catch(() => {}), 0);
  });
})();
