const toggle = document.querySelector(".menu-toggle");
const sidebar = document.querySelector(".sidebar");

if (toggle && sidebar) {
  toggle.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    toggle.textContent = open ? "×" : "☰";
  });

  document.addEventListener("click", (event) => {
    if (sidebar.classList.contains("open") && !sidebar.contains(event.target) && !toggle.contains(event.target)) {
      sidebar.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open navigation");
      toggle.textContent = "☰";
    }
  });
}

document.querySelectorAll("[data-dialog]").forEach((trigger) => {
  trigger.addEventListener("click", () => {
    const dialog = document.getElementById(trigger.dataset.dialog);
    if (dialog) dialog.showModal();
  });
});

document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

const calendarGrid = document.getElementById("calendar-grid");

if (calendarGrid && !document.documentElement.hasAttribute("data-shared-calendar")) {
  const categories = {
    raid: { label: "Raid", color: "#f3d384" },
    mythic: { label: "Mythic+", color: "#67c9ff" },
    pvp: { label: "PvP", color: "#ff7b7b" },
    transmog: { label: "Transmog", color: "#c39bff" },
    meeting: { label: "Meeting", color: "#72db9b" },
    social: { label: "Social", color: "#ff9dd1" }
  };

  const defaultEventTemplates = [
    { day: 2, recurrence: "weekly", category: "mythic", title: "Mythic+ Vault Night", time: "7:00 PM", duration: "2 hours", location: "Dornogal fountain", lead: "Thornwall", requirements: "Any key, a positive attitude, and consumables for higher keys.", description: "Build groups for weekly vault slots, crest farming, and steady key progression. New key runners are welcome." },
    { day: 5, category: "raid", title: "Progression Raid", time: "6:30 PM", duration: "3 hours", location: "Raid entrance", lead: "Aeloria", requirements: "Confirmed sign-up, repaired gear, flasks, food, and current enchants.", description: "Our focused progression night. Please arrive 15 minutes early for invites and role assignments." },
    { day: 8, category: "pvp", title: "Alliance Battleground Blitz", time: "7:30 PM", duration: "2 hours", location: "Stormwind war room", lead: "Lightforge", requirements: "Honor gear recommended; voice chat is encouraged but not required.", description: "Queue together for battlegrounds, earn honor, and enjoy some friendly Alliance coordination." },
    { day: 11, category: "transmog", title: "Legacy Transmog Run", time: "6:00 PM", duration: "90 minutes", location: "Stormwind portal room", lead: "Silkweaver", requirements: "Bag space and any characters that need appearances or achievements.", description: "A relaxed run through older raids for armor sets, mounts, pets, and achievements." },
    { day: 14, category: "meeting", title: "Monthly Guild Meeting", time: "7:00 PM", duration: "45 minutes", location: "Discord town hall", lead: "Officer team", requirements: "Bring questions, suggestions, and upcoming event ideas.", description: "Guild updates, raid news, community shout-outs, and an open floor for members." },
    { day: 17, category: "mythic", title: "Keys & Coaching", time: "6:30 PM", duration: "2 hours", location: "Dornogal inn", lead: "Stoneward", requirements: "A key of any level; learners are especially welcome.", description: "Learning-friendly dungeon groups with route tips, mechanic explanations, and patient coaching." },
    { day: 20, category: "raid", title: "Heroic Farm Night", time: "6:30 PM", duration: "2.5 hours", location: "Raid entrance", lead: "Aeloria", requirements: "Appropriate item level and basic encounter familiarity.", description: "A brisk heroic clear for gear, crests, alts, and guildmates preparing for progression." },
    { day: 23, category: "social", title: "Azeroth Scavenger Hunt", time: "5:00 PM", duration: "90 minutes", location: "Stormwind gates", lead: "Maplewing", requirements: "A flying mount and room for screenshots.", description: "Solve clues across Alliance lands, race other teams, and meet back in Stormwind for prizes." },
    { day: 26, category: "pvp", title: "Rated PvP Night", time: "7:30 PM", duration: "2 hours", location: "Discord PvP lounge", lead: "Lightforge", requirements: "Current PvP gear and willingness to swap teams between rounds.", description: "Organized rated battleground and arena groups with a focus on communication and improvement." },
    { day: 28, category: "social", title: "Tavern & Trivia", time: "7:00 PM", duration: "1 hour", location: "The Blue Recluse, Stormwind", lead: "Maplewing", requirements: "No gear required—just bring your best Warcraft lore knowledge.", description: "A casual guild social with lore trivia, screenshots, and prizes from the guild bank." }
  ];
  window.uaDefaultEvents = defaultEventTemplates;
  let eventTemplates = defaultEventTemplates;
  try {
    eventTemplates = JSON.parse(localStorage.getItem("uaGuildEvents")) || defaultEventTemplates;
  } catch {
    eventTemplates = defaultEventTemplates;
  }

  const state = {
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    activeCategories: new Set(Object.keys(categories))
  };

  const heading = document.getElementById("calendar-heading");
  const summary = document.getElementById("calendar-summary");
  const filterList = document.getElementById("filter-list");
  const upcomingList = document.getElementById("upcoming-list");
  const dialog = document.getElementById("event-dialog");
  const today = new Date();

  const monthEvents = () => eventTemplates.flatMap((event) => {
    const lastDay = new Date(state.year, state.month + 1, 0).getDate();
    const startDay = Math.min(Number(event.day), lastDay);
    const days = event.recurrence === "weekly"
      ? Array.from({ length: Math.ceil((lastDay - startDay + 1) / 7) }, (_, index) => startDay + (index * 7)).filter((day) => day <= lastDay)
      : [startDay];
    return days.map((day) => ({ ...event, day, date: new Date(state.year, state.month, day) }));
  });

  const formatDate = (date) => new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  }).format(date);

  const openEvent = (event) => {
    const category = categories[event.category];
    document.getElementById("event-dialog-category").textContent = category.label;
    document.getElementById("event-dialog-category").style.setProperty("--event-color", category.color);
    document.getElementById("event-dialog-title").textContent = event.title;
    document.getElementById("event-dialog-time").textContent = `${formatDate(event.date)} · ${event.time} · ${event.duration}`;
    document.getElementById("event-dialog-description").textContent = event.description;
    document.getElementById("event-dialog-location").textContent = event.location;
    document.getElementById("event-dialog-lead").textContent = event.lead;
    document.getElementById("event-dialog-requirements").textContent = event.requirements;
    dialog.showModal();
  };

  const createEventButton = (event, compact = false) => {
    const category = categories[event.category];
    const button = document.createElement("button");
    button.type = "button";
    button.className = compact ? "upcoming-card" : "calendar-event";
    button.style.setProperty("--event-color", category.color);
    button.setAttribute("aria-label", `${event.title}, ${formatDate(event.date)} at ${event.time}`);
    if (compact) {
      button.innerHTML = `<span class="upcoming-date"><strong>${event.date.getDate()}</strong><span>${event.date.toLocaleDateString("en-US", { month: "short" })}</span></span><span class="upcoming-copy"><span class="event-type">${category.label}</span><strong>${event.title}</strong><span>${event.time} · ${event.location}</span></span><span class="event-arrow" aria-hidden="true">›</span>`;
    } else {
      button.innerHTML = `<span class="event-dot" aria-hidden="true"></span><span class="event-button-copy"><span>${event.title}</span><small>${event.time}</small></span>`;
    }
    button.addEventListener("click", () => openEvent(event));
    return button;
  };

  const renderFilters = () => {
    filterList.replaceChildren();
    Object.entries(categories).forEach(([key, category]) => {
      const label = document.createElement("label");
      label.className = "filter-chip";
      label.style.setProperty("--event-color", category.color);
      label.innerHTML = `<input type="checkbox" value="${key}" checked><span class="filter-dot" aria-hidden="true"></span>${category.label}`;
      label.querySelector("input").addEventListener("change", (event) => {
        event.target.checked ? state.activeCategories.add(key) : state.activeCategories.delete(key);
        renderCalendar();
      });
      filterList.append(label);
    });
  };

  const renderCalendar = () => {
    const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(state.year, state.month));
    heading.textContent = monthName;
    calendarGrid.replaceChildren();

    const firstDay = new Date(state.year, state.month, 1).getDay();
    const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
    const previousMonthDays = new Date(state.year, state.month, 0).getDate();
    const events = monthEvents().filter((event) => state.activeCategories.has(event.category));
    summary.textContent = `${events.length} ${events.length === 1 ? "event" : "events"} shown`;

    for (let cellIndex = 0; cellIndex < 42; cellIndex += 1) {
      const dayOffset = cellIndex - firstDay + 1;
      const inMonth = dayOffset >= 1 && dayOffset <= daysInMonth;
      const displayDay = dayOffset < 1 ? previousMonthDays + dayOffset : dayOffset > daysInMonth ? dayOffset - daysInMonth : dayOffset;
      const cell = document.createElement("div");
      cell.className = `calendar-day${inMonth ? "" : " outside-month"}`;
      cell.setAttribute("role", "gridcell");

      const dateNumber = document.createElement("span");
      dateNumber.className = "day-number";
      dateNumber.textContent = displayDay;
      if (inMonth && displayDay === today.getDate() && state.month === today.getMonth() && state.year === today.getFullYear()) {
        cell.classList.add("is-today");
        dateNumber.setAttribute("aria-label", `${displayDay}, today`);
      }
      cell.append(dateNumber);

      if (inMonth) {
        events.filter((event) => event.day === displayDay).forEach((event) => cell.append(createEventButton(event)));
      }
      calendarGrid.append(cell);
    }

    upcomingList.replaceChildren();
    events.slice(0, 3).forEach((event) => upcomingList.append(createEventButton(event, true)));
    if (!events.length) {
      upcomingList.innerHTML = `<p class="empty-state">No events match these filters. Choose another category to bring adventures back into view.</p>`;
    }
  };

  const changeMonth = (amount) => {
    state.month += amount;
    if (state.month > 11) { state.month = 0; state.year += 1; }
    if (state.month < 0) { state.month = 11; state.year -= 1; }
    renderCalendar();
  };

  document.getElementById("previous-month").addEventListener("click", () => changeMonth(-1));
  document.getElementById("next-month").addEventListener("click", () => changeMonth(1));
  document.getElementById("today-button").addEventListener("click", () => {
    state.month = today.getMonth();
    state.year = today.getFullYear();
    renderCalendar();
  });

  renderFilters();
  renderCalendar();
}

try {
  const savedRules = JSON.parse(localStorage.getItem("uaGuildRules"));
  if (savedRules) {
    [["raid-rules", savedRules.raid], ["mythic-rules", savedRules.mythic]].forEach(([id, rules]) => {
      const list = document.getElementById(id);
      if (list && Array.isArray(rules)) {
        list.replaceChildren(...rules.map((text) => {
          const item = document.createElement("li");
          item.textContent = text;
          return item;
        }));
      }
    });
  }
} catch {
  // Keep the built-in rules if local browser data is invalid.
}

try {
  const site = JSON.parse(localStorage.getItem("uaSiteContent"));
  if (site) {
    if (document.getElementById("home-headline")) document.getElementById("home-headline").textContent = site.headline;
    if (document.getElementById("home-lede")) document.getElementById("home-lede").textContent = site.lede;
    if (document.getElementById("home-sidebar-message")) document.getElementById("home-sidebar-message").textContent = site.sidebar;
  }
} catch {
  // Keep the built-in homepage content if local browser data is invalid.
}
