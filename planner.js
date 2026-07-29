const PLAN_KEYS = { availability: "uaAvailability", keys: "uaMythicKeys", member: "uaCurrentMember", signups: "uaEventSignups", attendance: "uaAttendance", announcements: "uaAnnouncements" };
const planRead = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
const planEscape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const defaultDispatch = [{ title: "Heroic progression continues", body: "Confirm your role in the calendar and arrive repaired with consumables.", level: "Raid" }, { title: "Guild meeting this month", body: "Bring feedback and event ideas to our Discord town hall.", level: "Community" }];

const dashboardMember = document.getElementById("dashboard-member");
if (dashboardMember) {
  const savedMember = localStorage.getItem(PLAN_KEYS.member) || "Aeloria"; dashboardMember.value = savedMember;
  const renderDashboard = () => {
    const name = dashboardMember.value; localStorage.setItem(PLAN_KEYS.member, name); document.getElementById("dashboard-name").textContent = name;
    const signups = planRead(PLAN_KEYS.signups, {}); const myRsvps = Object.entries(signups).flatMap(([event,entries]) => entries.filter((x)=>x.name.toLowerCase()===name.toLowerCase()).map((x)=>({event,...x})));
    const attendance = planRead(PLAN_KEYS.attendance, {}); const myAttendance = Object.entries(attendance).flatMap(([event,records])=>records[name]?[{event,...records[name]}]:[]);
    const availability = planRead(PLAN_KEYS.availability, {})[name]; const keys = planRead(PLAN_KEYS.keys, []).filter((x)=>x.owner.toLowerCase()===name.toLowerCase());
    const present = myAttendance.filter((x)=>x.status==="Present").length;
    document.getElementById("dashboard-stats").innerHTML = `<article class="stat-card panel"><strong>${myRsvps.length}</strong><span>Upcoming RSVPs</span></article><article class="stat-card panel"><strong>${present}</strong><span>Events attended</span></article><article class="stat-card panel"><strong>${keys.length}</strong><span>Open keys</span></article><article class="stat-card panel"><strong>${availability?.windows?.length||0}</strong><span>Available windows</span></article>`;
    document.getElementById("dashboard-rsvps").innerHTML = myRsvps.length ? myRsvps.map((x)=>`<div class="dashboard-row"><span>${planEscape(x.role)}</span><strong>${planEscape(x.event)}</strong></div>`).join("") : `<p class="empty-copy">No event RSVPs yet.</p>`;
    const announcements = planRead(PLAN_KEYS.announcements, defaultDispatch); document.getElementById("dashboard-announcements").innerHTML = announcements.slice(0,3).map((x)=>`<div class="dashboard-row"><span>${planEscape(x.level)}</span><strong>${planEscape(x.title)}</strong><small>${planEscape(x.body)}</small></div>`).join("");
    document.getElementById("dashboard-availability").innerHTML = availability ? `<p><strong>${availability.role} · ${availability.timezone}</strong></p><div class="mini-tags">${availability.windows.map((x)=>`<span>${planEscape(x)}</span>`).join("")}</div><small>${planEscape(availability.notes||"No scheduling notes.")}</small>` : `<p class="empty-copy">Availability has not been shared.</p>`;
    document.getElementById("dashboard-keys").innerHTML = keys.length ? keys.map((x)=>`<div class="dashboard-row"><span>+${x.level}</span><strong>${planEscape(x.dungeon)}</strong><small>${planEscape(x.time)}</small></div>`).join("") : `<p class="empty-copy">No keys posted.</p>`;
  };
  dashboardMember.addEventListener("change", renderDashboard); renderDashboard();
}

const availabilityForm = document.getElementById("availability-form");
if (availabilityForm) {
  const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]; const windows = ["Afternoon","Evening","Late night"]; const week = document.getElementById("availability-week");
  days.forEach((day) => { const group=document.createElement("div"); group.className="availability-day"; group.innerHTML=`<strong>${day}</strong>${windows.map((window)=>`<label><input type="checkbox" value="${day} · ${window}"> ${window}</label>`).join("")}`; week.append(group); });
  availabilityForm.addEventListener("submit",(event)=>{event.preventDefault();const name=document.getElementById("availability-name").value.trim();const all=planRead(PLAN_KEYS.availability,{});all[name]={role:document.getElementById("availability-role").value,timezone:document.getElementById("availability-timezone").value,windows:[...week.querySelectorAll("input:checked")].map((x)=>x.value),notes:document.getElementById("availability-notes").value.trim()};localStorage.setItem(PLAN_KEYS.availability,JSON.stringify(all));localStorage.setItem(PLAN_KEYS.member,name);document.getElementById("availability-message").textContent="Availability saved to your dashboard.";});
}

const keyForm = document.getElementById("key-form");
if (keyForm) {
  const list=document.getElementById("key-list"); const filter=document.getElementById("key-filter");
  const defaults=[{id:1,owner:"Thornwall",dungeon:"The Stonevault",level:10,roles:["Healer","DPS"],time:"Thursday at 7 PM Pacific",notes:"Timed push; route linked in Discord."},{id:2,owner:"Luminae",dungeon:"Priory of the Sacred Flame",level:6,roles:["Tank","DPS"],time:"Saturday afternoon",notes:"Learning-friendly vault run."}];
  const renderKeys=()=>{const all=planRead(PLAN_KEYS.keys,defaults);const shown=all.filter((x)=>filter.value==="all"||(filter.value==="2-6"&&x.level<=6)||(filter.value==="7-10"&&x.level>=7&&x.level<=10)||(filter.value==="11"&&x.level>=11));list.innerHTML=shown.length?shown.map((x)=>`<article class="key-card panel"><span class="key-level">+${x.level}</span><div><span>${planEscape(x.owner)}</span><h3>${planEscape(x.dungeon)}</h3><p>${planEscape(x.time)}</p><div class="mini-tags">${x.roles.map((r)=>`<span>Needs ${planEscape(r)}</span>`).join("")}</div><small>${planEscape(x.notes||"No additional notes.")}</small></div></article>`).join(""):`<p class="empty-state">No open keys match this level.</p>`;};
  filter.addEventListener("change",renderKeys);keyForm.addEventListener("submit",(event)=>{event.preventDefault();const all=planRead(PLAN_KEYS.keys,defaults);const roles=[...keyForm.querySelectorAll(".role-checks input:checked")].map((x)=>x.value);all.unshift({id:Date.now(),owner:document.getElementById("key-owner").value.trim(),dungeon:document.getElementById("key-dungeon").value.trim(),level:Number(document.getElementById("key-level").value),roles,time:document.getElementById("key-time").value.trim(),notes:document.getElementById("key-notes").value.trim()});localStorage.setItem(PLAN_KEYS.keys,JSON.stringify(all));localStorage.setItem(PLAN_KEYS.member,document.getElementById("key-owner").value.trim());event.target.reset();document.getElementById("key-message").textContent="Key posted to the guild board.";renderKeys();});renderKeys();
}

function downloadCalendarEvent(title, dateText, timeText, description, location) {
  const parsed = new Date(`${dateText} ${timeText}`); const end = new Date(parsed.getTime()+2*60*60*1000);
  const stamp=(date)=>date.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
  const clean=(value)=>String(value).replace(/([,;])/g,"\\$1").replace(/\n/g,"\\n");
  const ics=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//United Azeroth//Guild Events//EN\r\nBEGIN:VEVENT\r\nUID:${Date.now()}@united-azeroth\r\nDTSTAMP:${stamp(new Date())}\r\nDTSTART:${stamp(parsed)}\r\nDTEND:${stamp(end)}\r\nSUMMARY:${clean(title)}\r\nDESCRIPTION:${clean(description)}\r\nLOCATION:${clean(location)}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([ics],{type:"text/calendar"}));link.download=`${title.toLowerCase().replace(/[^a-z0-9]+/g,"-")}.ics`;link.click();URL.revokeObjectURL(link.href);
}
const calendarExport=document.getElementById("download-event");
if(calendarExport) calendarExport.addEventListener("click",()=>{const time=document.getElementById("event-dialog-time").textContent.split(" · ");downloadCalendarEvent(document.getElementById("event-dialog-title").textContent,time[0],time[1],document.getElementById("event-dialog-description").textContent,document.getElementById("event-dialog-location").textContent);});
