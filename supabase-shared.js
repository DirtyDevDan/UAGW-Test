(function () {
  const config = window.UNITED_AZEROTH_SUPABASE || {};
  if (!config.url || !config.publishableKey || !window.supabase?.createClient) return;
  const db = window.uaSupabaseClient || window.supabase.createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  window.uaSupabaseClient = db;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const categoryColors = { raid:"#f3d384",mythic:"#67c9ff",pvp:"#ff7b7b",transmog:"#c39bff",meeting:"#72db9b",social:"#ff9dd1" };
  const showError = (container, message, retry) => {
    container.innerHTML = `<div class="empty-state"><strong>Something went wrong</strong><p>${escapeHtml(message)}</p><div class="state-actions"><button class="retry-button" type="button">Try again</button></div></div>`;
    container.querySelector(".retry-button").addEventListener("click", retry);
  };

  const renderOfflineAnnouncements = (container) => {
    container.innerHTML = `<article class="announcement-card panel"><span>Service notice</span><h3>Guild services are temporarily offline</h3><p>The public website is still available. Live announcements, accounts, event sign-ups, and officer tools will return when the guild database is back online.</p></article>`;
  };

  const renderOfflineHomepageEvents = (container) => {
    const fallbackEvents = [
      { category: "mythic", title: "Mythic+ Vault Night", schedule: "Weekly guild event", location: "Check Discord for current details" },
      { category: "raid", title: "Progression Raid", schedule: "Scheduled raid night", location: "Check Discord for current details" },
      { category: "social", title: "Guild Community Night", schedule: "Community event", location: "Check Discord for current details" }
    ];
    container.innerHTML = fallbackEvents.map((event) => `<article class="home-event-card panel" style="--event-color:${categoryColors[event.category]}"><time>${escapeHtml(event.schedule)}</time><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.location)}</span></article>`).join("");
  };

  async function loadAnnouncements() {
    const container = document.getElementById("public-announcements");
    if (!container) return;
    const { data, error } = await db.from("guild_announcements").select("*").eq("published", true).order("pinned", { ascending: false }).order("published_at", { ascending: false }).limit(3);
    if (error) { renderOfflineAnnouncements(container); return; }
    container.innerHTML = data.length ? data.map((item) => `<article class="announcement-card panel"><span>${escapeHtml(item.category)}${item.pinned ? " · Pinned" : ""}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></article>`).join("") : `<p class="empty-state">No announcements have been published yet.</p>`;
  }

  async function loadHomepageEvents() {
    const container = document.getElementById("home-upcoming-events");
    if (!container) return;
    const { data, error } = await db.from("guild_events").select("*").eq("status", "published").order("starts_at");
    if (error) { renderOfflineHomepageEvents(container); return; }
    const now = new Date();
    const nextDate = (event) => {
      const date = new Date(event.starts_at);
      const until = event.recurrence_until ? new Date(`${event.recurrence_until}T23:59:59`) : new Date(now.getFullYear() + 2, 11, 31);
      while (date < now && date <= until && event.recurrence !== "none") {
        if (event.recurrence === "weekly") date.setDate(date.getDate() + 7);
        else date.setMonth(date.getMonth() + 1);
      }
      return date >= now && date <= until ? date : null;
    };
    const upcoming = (data || []).map((event) => ({ ...event, next: nextDate(event) })).filter((event) => event.next).sort((a, b) => a.next - b.next).slice(0, 3);
    container.innerHTML = upcoming.length ? upcoming.map((event) => `<article class="home-event-card panel" style="--event-color:${categoryColors[event.category] || "#d8b35d"}"><time datetime="${event.next.toISOString()}">${event.next.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})} \u00b7 ${event.next.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}</time><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.location || "Location to be announced")}</span></article>`).join("") : `<p class="empty-state">No upcoming events are scheduled yet. Check back soon.</p>`;
  }

  async function loadSharedSettings() {
    if (!document.getElementById("home-headline") && !document.getElementById("raid-rules")) return;
    const { data } = await db.from("guild_settings").select("key,value").in("key", ["raid_rules", "mythic_rules", "site_content"]);
    if (!data) return;
    const settings = Object.fromEntries(data.map((item) => [item.key, item.value]));
    if (settings.site_content) {
      if (document.getElementById("home-headline")) document.getElementById("home-headline").textContent = settings.site_content.headline || "";
      if (document.getElementById("home-lede")) document.getElementById("home-lede").textContent = settings.site_content.lede || "";
      if (settings.site_content.sidebar) document.querySelectorAll(".sidebar-note").forEach((note) => { note.textContent = settings.site_content.sidebar; });
    }
    [["raid-rules", settings.raid_rules], ["mythic-rules", settings.mythic_rules]].forEach(([id, rules]) => {
      const list = document.getElementById(id);
      if (list && Array.isArray(rules)) list.innerHTML = rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("");
    });
  }

  async function loadDirectory() {
    const directory = document.getElementById("member-directory");
    if (!directory) return;
    const { data: { user } } = await db.auth.getUser();
    if (!user) { directory.innerHTML = `<div class="empty-state"><strong>Guild members only</strong><p>Sign in to view approved member profiles and characters.</p><a class="button" href="index.html?login=1">Sign in</a></div>`; return; }
    const [{ data: profiles, error: profileError }, { data: memberships }, { data: characters }] = await Promise.all([
      db.from("profiles").select("user_id,display_name,discord_name,bio,visibility").eq("visibility", "guild"),
      db.from("guild_memberships").select("user_id,guild_rank,status").eq("status", "active"),
      db.from("characters").select("*").order("is_main", { ascending: false }).order("name")
    ]);
    if (profileError) { showError(directory, "The directory is unavailable, or your account is still awaiting approval.", loadDirectory); return; }
    const ranks = new Map((memberships || []).map((item) => [item.user_id, item.guild_rank]));
    const roster = (profiles || []).filter((item) => ranks.has(item.user_id)).map((item) => ({ ...item, rank: ranks.get(item.user_id), characters: (characters || []).filter((character) => character.user_id === item.user_id) }));
    window.uaLiveMembers = roster;
    const search = document.getElementById("member-search"); let role = "all";
    const render = () => {
      const query = search.value.trim().toLowerCase();
      const visible = roster.filter((member) => {
        const main = member.characters.find((item) => item.is_main) || member.characters[0];
        const text = [member.display_name, member.rank, ...member.characters.flatMap((item) => [item.name, item.class_name, item.primary_role, ...(item.professions || [])])].join(" ").toLowerCase();
        return (!query || text.includes(query)) && (role === "all" || member.characters.some((item) => item.primary_role === role));
      });
      directory.innerHTML = visible.map((member, index) => {
        const main = member.characters.find((item) => item.is_main) || member.characters[0];
        return `<button class="member-card panel" type="button" data-live-member="${index}"><span class="member-avatar">${escapeHtml(member.display_name.slice(0,2).toUpperCase())}</span><span class="member-rank">${escapeHtml(member.rank)}</span><strong>${escapeHtml(member.display_name)}</strong><span>${main ? `${escapeHtml(main.specialization)} ${escapeHtml(main.class_name)}` : "No characters listed"}</span><span class="member-role">${main ? escapeHtml(main.primary_role) : "Member"}</span><small>${member.characters.length} character${member.characters.length === 1 ? "" : "s"}</small></button>`;
      }).join("") || `<p class="empty-state">No approved members match this search.</p>`;
      directory.querySelectorAll("[data-live-member]").forEach((button) => button.addEventListener("click", () => {
        const member = visible[Number(button.dataset.liveMember)]; const main = member.characters.find((item) => item.is_main) || member.characters[0];
        document.getElementById("member-dialog-content").innerHTML = `<p class="eyebrow">${escapeHtml(member.rank)}</p><h2 id="member-dialog-name">${escapeHtml(member.display_name)}</h2><p class="profile-subtitle">${main ? `${escapeHtml(main.name)} \u00b7 ${escapeHtml(main.specialization)} ${escapeHtml(main.class_name)} \u00b7 ${escapeHtml(main.realm)}` : "No main character selected"}</p><p>${escapeHtml(member.bio || "No member biography yet.")}</p><dl class="event-facts"><div><dt>Discord</dt><dd>${escapeHtml(member.discord_name || "Not shared")}</dd></div><div><dt>Characters</dt><dd>${member.characters.map((item) => `${escapeHtml(item.name)} \u00b7 ${escapeHtml(item.primary_role)}${item.is_main ? " \u00b7 Main" : ""}`).join("<br>") || "None"}</dd></div></dl>`;
        document.getElementById("member-dialog").showModal();
      }));
    };
    search.addEventListener("input", render);
    document.querySelectorAll("#member-filter button").forEach((button) => button.addEventListener("click", () => { role = button.dataset.role; document.querySelectorAll("#member-filter button").forEach((item) => item.classList.toggle("active", item === button)); render(); }));
    render();
  }

  async function loadCalendar() {
    const grid = document.getElementById("calendar-grid"); if (!grid) return;
    const categories = { raid:["Raid","#f3d384"],mythic:["Mythic+","#67c9ff"],pvp:["PvP","#ff7b7b"],transmog:["Transmog","#c39bff"],meeting:["Meeting","#72db9b"],social:["Social","#ff9dd1"] };
    const state = { month:new Date().getMonth(),year:new Date().getFullYear(),active:new Set(Object.keys(categories)),events:[],current:null,characters:[] };
    const { data: events, error } = await db.from("guild_events").select("*").eq("status","published").order("starts_at");
    if (error) {
      window.uaRenderStaticCalendar?.();
      const signupMessage = document.getElementById("signup-message");
      if (signupMessage) signupMessage.textContent = "RSVP is unavailable while guild services are offline. Please use Discord to reserve a spot.";
      const signupButton = document.querySelector("#event-signup-form button[type='submit']");
      if (signupButton) signupButton.disabled = true;
      return;
    }
    state.events = events || [];
    const { data:{ user } } = await db.auth.getUser();
    if (user) { const { data } = await db.from("characters").select("*").eq("user_id",user.id).order("is_main",{ascending:false}); state.characters=data||[]; }
    const charSelect=document.getElementById("signup-character"); charSelect.innerHTML=user ? `<option value="">Choose a character</option>${state.characters.map((item)=>`<option value="${item.id}" data-role="${item.primary_role}">${escapeHtml(item.name)} \u00b7 ${escapeHtml(item.primary_role)}</option>`).join("")}` : `<option value="">Sign in to choose a character</option>`;
    charSelect.addEventListener("change",()=>{const option=charSelect.options[charSelect.selectedIndex];if(option?.dataset.role && option.dataset.role!=="Flexible")document.getElementById("signup-role").value=option.dataset.role;});
    const filter=document.getElementById("filter-list");filter.innerHTML=Object.entries(categories).map(([key,[label,color]])=>`<label class="filter-chip" style="--event-color:${color}"><input type="checkbox" value="${key}" checked><span class="filter-dot"></span>${label}</label>`).join("");
    filter.querySelectorAll("input").forEach((input)=>input.addEventListener("change",()=>{input.checked?state.active.add(input.value):state.active.delete(input.value);render();}));
    const monthInstances=()=>{
      const start=new Date(state.year,state.month,1),end=new Date(state.year,state.month+1,0,23,59,59);
      return state.events.flatMap((event)=>{const base=new Date(event.starts_at),until=event.recurrence_until?new Date(`${event.recurrence_until}T23:59:59`):new Date(state.year+2,11,31);const instances=[];if(event.recurrence==="none"){if(base>=start&&base<=end)instances.push({...event,date:base});return instances;}let cursor=new Date(base);while(cursor<start){if(event.recurrence==="weekly")cursor.setDate(cursor.getDate()+7);else cursor.setMonth(cursor.getMonth()+1);}while(cursor<=end&&cursor<=until){instances.push({...event,date:new Date(cursor)});if(event.recurrence==="weekly")cursor.setDate(cursor.getDate()+7);else cursor.setMonth(cursor.getMonth()+1);}return instances;}).filter((item)=>state.active.has(item.category));
    };
    async function openEvent(item){
      state.current=item;const [label,color]=categories[item.category];document.getElementById("event-dialog-category").textContent=label;document.getElementById("event-dialog-category").style.setProperty("--event-color",color);document.getElementById("event-dialog-title").textContent=item.title;document.getElementById("event-dialog-time").textContent=`${item.date.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})} \u00b7 ${item.date.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})} \u00b7 ${Math.round(item.duration_minutes/60*10)/10} hours`;document.getElementById("event-dialog-description").textContent=item.description;document.getElementById("event-dialog-location").textContent=item.location;document.getElementById("event-dialog-lead").textContent=item.organizer;document.getElementById("event-dialog-requirements").textContent=item.requirements;document.getElementById("event-dialog").showModal();
      const {data:counts}=await db.rpc("event_rsvp_counts",{p_event_id:item.id});const caps={Tank:item.tank_capacity,Healer:item.healer_capacity,DPS:item.dps_capacity,Bench:null,Tentative:null};document.getElementById("signup-counts").innerHTML=Object.keys(caps).map((role)=>`<span><strong>${counts?.[role]||0}</strong> ${role}${caps[role]!==null?` / ${caps[role]}`:""}</span>`).join("");document.getElementById("signup-message").textContent=user?(state.characters.length?"":"Add a character to your private dashboard before signing up."):"Sign in to your private dashboard to RSVP.";
    }
    function render(){const name=new Date(state.year,state.month).toLocaleDateString("en-US",{month:"long",year:"numeric"});document.getElementById("calendar-heading").textContent=name;const items=monthInstances();document.getElementById("calendar-summary").textContent=`${items.length} ${items.length===1?"event":"events"} shown`;grid.replaceChildren();const first=new Date(state.year,state.month,1).getDay(),days=new Date(state.year,state.month+1,0).getDate(),prev=new Date(state.year,state.month,0).getDate();for(let i=0;i<42;i++){const offset=i-first+1,inMonth=offset>=1&&offset<=days,day=offset<1?prev+offset:offset>days?offset-days:offset;const cell=document.createElement("div");cell.className=`calendar-day${inMonth?"":" outside-month"}`;cell.setAttribute("role","gridcell");cell.innerHTML=`<span class="day-number">${day}</span><span class="agenda-date">${new Date(state.year,state.month,day).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</span>`;if(inMonth)items.filter((item)=>item.date.getDate()===day).forEach((item)=>{const button=document.createElement("button");button.type="button";button.className="calendar-event";button.style.setProperty("--event-color",categories[item.category][1]);button.setAttribute("aria-label",`${item.title}, ${item.date.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}`);button.innerHTML=`<span class="event-dot"></span><span class="event-button-copy"><span>${escapeHtml(item.title)}</span><small>${item.date.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}</small></span>`;button.addEventListener("click",()=>openEvent(item));cell.append(button);});grid.append(cell);}document.getElementById("upcoming-list").innerHTML=items.slice(0,3).map((item)=>`<button class="upcoming-card" type="button" data-event-id="${item.id}" style="--event-color:${categories[item.category][1]}"><span class="upcoming-date"><strong>${item.date.getDate()}</strong><span>${item.date.toLocaleDateString("en-US",{month:"short"})}</span></span><span class="upcoming-copy"><span class="event-type">${categories[item.category][0]}</span><strong>${escapeHtml(item.title)}</strong><span>${item.date.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})} \u00b7 ${escapeHtml(item.location)}</span></span></button>`).join("") || `<p class="empty-state">No events match the selected filters this month.</p>`;document.querySelectorAll("#upcoming-list [data-event-id]").forEach((button)=>button.addEventListener("click",()=>openEvent(items.find((item)=>item.id===button.dataset.eventId))));}
    document.getElementById("previous-month").addEventListener("click",()=>{state.month--;if(state.month<0){state.month=11;state.year--;}render();});document.getElementById("next-month").addEventListener("click",()=>{state.month++;if(state.month>11){state.month=0;state.year++;}render();});document.getElementById("today-button").addEventListener("click",()=>{state.month=new Date().getMonth();state.year=new Date().getFullYear();render();});
    document.getElementById("event-signup-form").addEventListener("submit",async(event)=>{event.preventDefault();const message=document.getElementById("signup-message");if(!user){message.textContent="Sign in before RSVPing.";return;}const character=charSelect.value;if(!character){message.textContent="Choose one of your characters.";return;}message.textContent="Saving RSVP...";const {error}=await db.rpc("rsvp_for_event",{p_event_id:state.current.id,p_character_id:character,p_role:document.getElementById("signup-role").value});message.textContent=error?error.message:"Your character is signed up.";if(!error)openEvent(state.current);});
    render();
  }

  loadAnnouncements(); loadHomepageEvents(); loadSharedSettings(); loadDirectory(); loadCalendar();
})();
