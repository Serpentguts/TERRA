"use strict";

// Journal/projects remain authoritative; only profile text and reward grants get new keys.
(() => {
  const $ = id => document.getElementById(id);
  const PROFILE_KEY = "terra.profile.v1";
  const avatars = ["🌿", "🍄", "🐦", "❧"];
  const defaults = { version: 1, name: "Local explorer", bio: "", credentials: "", avatar: "🌿" };
  function readProfile() {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw === null) return { ...defaults };
    const p = JSON.parse(raw);
    if (!p || p.version !== 1 || typeof p.name !== "string" || !p.name.trim() || p.name.length > 80 ||
        typeof p.bio !== "string" || p.bio.length > 500 || typeof p.credentials !== "string" || p.credentials.length > 300 || !avatars.includes(p.avatar)) throw Error("Unsupported profile data");
    return p;
  }
  let profileReadable = false;
  function loadProfile() {
    try {
      const p = readProfile();
      profileReadable = true;
      $("profile-name").textContent = p.name;
      $("profile-bio").textContent = p.bio;
      $("profile-credentials").textContent = `Credentials: ${p.credentials || "none"} · user-entered / unverified`;
      $("profile-avatar").textContent = p.avatar;
      $("profile-display-name").value = p.name;
      $("profile-description").value = p.bio;
      $("profile-credential-input").value = p.credentials;
      $("profile-avatar-input").value = p.avatar;
      $("profile-status").textContent = "Profile stays on this device only. Nothing published.";
    } catch {
      profileReadable = false;
      $("profile-status").textContent = "Profile storage blocked or damaged. Editing paused; existing data untouched. Do not clear site data.";
    }
    $("profile-form").querySelector("button").disabled = !profileReadable;
  }
  $("profile-form").addEventListener("submit", event => {
    event.preventDefault();
    if (!profileReadable || !$("profile-display-name").value.trim()) return;
    try {
      readProfile(); // Do not overwrite damaged data from another tab.
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ version: 1, name: $("profile-display-name").value.trim(),
        bio: $("profile-description").value, credentials: $("profile-credential-input").value, avatar: $("profile-avatar-input").value }));
      loadProfile();
    } catch { $("profile-status").textContent = "Profile could not be saved. Draft kept; existing data untouched. Check browser storage."; }
  });
  const tabs = [...$("profile-tabs").querySelectorAll('[role="tab"]')];
  function selectTab(tab, focus = false) {
    for (const item of tabs) {
      const active = item === tab;
      item.setAttribute("aria-selected", String(active));
      item.tabIndex = active ? 0 : -1;
      $(item.getAttribute("aria-controls")).hidden = !active;
    }
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", event => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); selectTab(tabs[next], true); }
    });
  });
  function item(list, text) {
    const li = document.createElement("li");
    li.textContent = text;
    list.append(li);
    return li;
  }
  function randomToken() {
    return [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function renderRewards(records, projects) {
    $("award-list").replaceChildren(); $("decor-list").replaceChildren(); $("rewards-terrarium").replaceChildren();
    try {
      const prior = TerraRewards.parse(localStorage.getItem(TerraRewards.KEY));
      const next = TerraRewards.award(prior, TerraRewards.eligible(records, projects, TerraData.observationDate, FieldSummary.matches), randomToken);
      if (JSON.stringify(prior) !== JSON.stringify(next)) localStorage.setItem(TerraRewards.KEY, JSON.stringify(next));
      for (const badge of Object.keys(TerraRewards.labels)) {
        item($("award-list"), `${TerraRewards.labels[badge]} · ${next.grants.some(g => g.badge === badge) ? "earned" : "not yet earned"}`);
      }
      for (const grant of next.grants) {
        const decor = TerraRewards.decoration(grant);
        if (grant.placed) {
          const object = document.createElement("span");
          object.textContent = decor.icon;
          object.title = `${TerraRewards.labels[grant.badge]} · local serial ${grant.token}`;
          object.style.cssText = `left:${decor.x}%;top:${decor.y}%;font-size:${decor.size}px;color:${decor.color};transform:rotate(${decor.rotation}deg)`;
          $("rewards-terrarium").append(object);
        }
        const li = item($("decor-list"), `${decor.icon} ${TerraRewards.labels[grant.badge]} decoration · local serial ${grant.token} `);
        const button = document.createElement("button");
        button.type = "button"; button.className = "secondary-button";
        button.dataset.badge = grant.badge;
        button.textContent = grant.placed ? "Remove from terrarium" : "Place in terrarium";
        button.setAttribute("aria-pressed", String(grant.placed));
        button.addEventListener("click", () => {
          try {
            const state = TerraRewards.parse(localStorage.getItem(TerraRewards.KEY));
            const current = state.grants.find(g => g.badge === grant.badge && g.token === grant.token);
            if (!current) throw Error("Reward changed in another tab");
            current.placed = !current.placed;
            localStorage.setItem(TerraRewards.KEY, JSON.stringify(state));
            refresh();
            $("decor-list").querySelector(`[data-badge="${grant.badge}"]`)?.focus();
          } catch { $("rewards-status").textContent = "Placement could not be saved. Existing rewards kept; reload/check storage."; }
        });
        li.append(button);
      }
      $("rewards-status").textContent = `${next.grants.length} / 3 badges unlocked · one persistent randomized decoration per badge. Local participation only, not verified quality.`;
      $("rewards-terrarium").setAttribute("aria-label", `Local decorative terrarium, ${next.grants.filter(g => g.placed).length} objects placed. Full descriptions and controls below.`);
    } catch {
      $("rewards-status").textContent = "Rewards unavailable: local storage blocked/damaged or unlock could not be saved. Existing rewards untouched. Journal is unaffected. Do not clear site data.";
    }
  }
  function refresh() {
    const posts = $("profile-observations"), collections = $("profile-project-list");
    posts.replaceChildren(); collections.replaceChildren();
    try {
      const records = readObservations();
      const projects = FieldSummary.parse(localStorage.getItem(FieldSummary.KEY));
      const active = TerraData.active(records);
      for (const record of [...active].sort((a, b) => b.date.localeCompare(a.date))) {
        const li = item(posts, `${categories[record.type]} · ${record.name} · ${record.date} · `);
        const link = document.createElement("a"); link.href = "#saved-title"; link.textContent = "View journal details / provenance"; li.append(link);
      }
      if (!active.length) item(posts, "No observations yet. Save in your journal to see them here.");
      for (const project of projects) item(collections, `${project.title} · ${project.complete ? "complete" : "open"} · ${active.filter(r => project.observationIds.includes(r.id) && FieldSummary.matches(project, r)).length} eligible observations`);
      if (!projects.length) item(collections, "No projects yet.");
      renderRewards(records, projects);
    } catch {
      item(posts, "Journal/projects unavailable; existing data untouched. Check storage before editing.");
      $("award-list").replaceChildren(); $("decor-list").replaceChildren(); $("rewards-terrarium").replaceChildren();
      $("rewards-status").textContent = "Awards paused: journal or project data cannot be validated. No evidence invented.";
    }
  }
  for (const event of ["terra:journal-rendered", "terra:projects-rendered"]) document.addEventListener(event, refresh);
  window.addEventListener("storage", event => {
    if (event.key === PROFILE_KEY || event.key === null) loadProfile();
    if ([STORAGE_KEY, FieldSummary.KEY, TerraRewards.KEY, null].includes(event.key)) refresh();
  });
  loadProfile(); refresh();
})();
