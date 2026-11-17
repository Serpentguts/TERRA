"use strict";

// Journal/projects remain authoritative; only profile text and reward grants get new keys.
(() => {
  const $ = id => document.getElementById(id);
  const PROFILE_KEY = "terra.profile.v1";
  const defaults = { version: 1, name: "Local explorer", bio: "", credentials: "", avatar: "leaf" };
  function readProfile() {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw === null) return { ...defaults };
    const p = JSON.parse(raw);
    if (!p || p.version !== 1 || typeof p.name !== "string" || !p.name.trim() || p.name.length > 80 ||
        typeof p.bio !== "string" || p.bio.length > 500 || typeof p.credentials !== "string" || p.credentials.length > 300 || !TerraAvatars.isValid(p.avatar, p.photo)) throw Error("Unsupported profile data");
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
      renderAvatar(p);
      $("profile-display-name").value = p.name;
      $("profile-description").value = p.bio;
      $("profile-credential-input").value = p.credentials;
      $("profile-status").textContent = "Profile stays on this device only. Nothing published.";
    } catch {
      profileReadable = false;
      $("profile-status").textContent = "Profile storage blocked or damaged. Editing paused; existing data untouched. Do not clear site data.";
    }
    $("profile-form").querySelector("button").disabled = !profileReadable;
    for (const control of $("avatar-picker").querySelectorAll("input, button")) control.disabled = !profileReadable;
  }
  // Profile picture: one of the drawn icons, or the person's own photo.
  const avatarGrid = $("avatar-grid");
  function choiceFor(value, label) {
    const option = document.createElement("label");
    option.className = "avatar-option";
    option.title = label;
    const input = document.createElement("input");
    input.type = "radio"; input.name = "avatar-choice"; input.value = value;
    input.className = "visually-hidden";
    const face = document.createElement("span");
    face.className = "avatar-face";
    const name = document.createElement("span");
    name.className = "avatar-name"; name.textContent = label;
    option.append(input, face, name);
    input.addEventListener("change", () => saveAvatar({ avatar: value }));
    return { option, face, input };
  }
  for (const icon of TerraAvatars.ICONS) {
    const { option, face } = choiceFor(icon.id, icon.label);
    TerraAvatars.render(face, icon.id);
    avatarGrid.append(option);
  }
  const photoChoice = choiceFor("photo", "Your photo");
  photoChoice.option.hidden = true;
  avatarGrid.prepend(photoChoice.option);
  function renderAvatar(p) {
    const avatar = p.avatar === "photo" ? "photo" : TerraAvatars.iconId(p.avatar);
    TerraAvatars.render($("profile-avatar"), avatar, p.photo);
    $("profile-avatar").setAttribute("aria-label", `Profile picture: ${TerraAvatars.labelFor(avatar, p.photo)}`);
    photoChoice.option.hidden = !p.photo;
    if (p.photo) TerraAvatars.render(photoChoice.face, "photo", p.photo);
    $("avatar-remove-photo").hidden = !p.photo;
    for (const input of avatarGrid.querySelectorAll("input")) input.checked = input.value === avatar;
  }
  // Writes only the picture fields, keeping whatever name and bio are already saved.
  function saveAvatar(change, message) {
    try {
      const current = readProfile();
      const next = { ...current, avatar: TerraAvatars.iconId(current.avatar) ?? current.avatar, ...change };
      if (next.photo === undefined) delete next.photo;
      if (!TerraAvatars.isValid(next.avatar, next.photo)) throw Error("invalid");
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      loadProfile();
      $("avatar-status").textContent = message ?? `Picture changed to ${TerraAvatars.labelFor(next.avatar, next.photo)}.`;
    } catch {
      loadProfile();
      $("avatar-status").textContent = "The picture couldn't be saved. Your previous picture is unchanged; check that this browser allows site storage.";
    }
  }
  $("avatar-photo-input").addEventListener("change", async event => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    $("avatar-status").textContent = "Preparing your photo…";
    try {
      const photo = await TerraAvatars.photoFromFile(file);
      saveAvatar({ avatar: "photo", photo }, "Photo set as your profile picture.");
    } catch (error) {
      $("avatar-status").textContent = error.message.startsWith("Choose") || error.message.startsWith("That") ? error.message : "That image couldn't be used. Try a different file.";
    }
  });
  $("avatar-remove-photo").addEventListener("click", () => {
    const current = (() => { try { return readProfile(); } catch { return null; } })();
    const fallback = current && current.avatar !== "photo" ? TerraAvatars.iconId(current.avatar) : "leaf";
    saveAvatar({ avatar: fallback, photo: undefined }, "Photo removed from this browser.");
    $("avatar-photo-input").focus();
  });
  $("profile-form").addEventListener("submit", event => {
    event.preventDefault();
    if (!profileReadable || !$("profile-display-name").value.trim()) return;
    try {
      const current = readProfile(); // Do not overwrite damaged data from another tab.
      const next = { version: 1, name: $("profile-display-name").value.trim(), bio: $("profile-description").value,
        credentials: $("profile-credential-input").value, avatar: TerraAvatars.iconId(current.avatar) ?? current.avatar };
      if (current.photo) next.photo = current.photo;
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
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
    if (tab.id === "awards-tab") refresh(); // Lay out the jar now that it has a width.
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
  function clearRewards() {
    $("decor-list").replaceChildren();
  }
  function togglePlacement(grant) {
    try {
      const state = TerraRewards.parse(localStorage.getItem(TerraRewards.KEY));
      const current = state.grants.find(g => g.badge === grant.badge && g.token === grant.token);
      if (!current) throw Error("Reward changed in another tab");
      current.placed = !current.placed;
      localStorage.setItem(TerraRewards.KEY, JSON.stringify(state));
      refresh();
      $("decor-list").querySelector(`button[data-badge="${grant.badge}"]`)?.focus();
    } catch { $("rewards-status").textContent = "Placement could not be saved. Existing rewards kept; reload/check storage."; }
  }
  const achievementFor = grant => TerraRewards.CATALOG.find(a => a.id === grant.badge);
  const textNode = (tag, className, text) => { const el = document.createElement(tag); el.className = className; el.textContent = text; return el; };
  function collectionCard(achievement, grant, count, fresh) {
    const li = document.createElement("li");
    li.className = `collection-card ${grant ? "earned" : "locked"}${fresh ? " fresh" : ""}`;
    li.dataset.achievement = achievement.id;
    const icon = textNode("span", "collection-icon", achievement.icon);
    icon.setAttribute("aria-hidden", "true");
    li.append(textNode("span", "collection-group", achievement.group), icon, textNode("strong", "collection-name", achievement.item),
      textNode("small", "collection-goal", achievement.goal));
    li.title = achievement.label;
    if (grant) {
      const serial = textNode("small", "collection-serial", fresh ? "New!" : `Serial ${grant.token.slice(0, 8)}`);
      serial.title = `Local serial ${grant.token}`;
      const button = textNode("button", "secondary-button", grant.placed ? "Remove from terrarium" : "Place in terrarium");
      button.type = "button";
      button.dataset.badge = grant.badge;
      button.setAttribute("aria-pressed", String(grant.placed));
      button.setAttribute("aria-label", `${grant.placed ? "Remove" : "Place"} ${achievement.item} ${grant.placed ? "from" : "in"} terrarium`);
      button.addEventListener("click", () => togglePlacement(grant));
      li.append(serial, button);
    } else if (achievement.source === "unavailable") {
      li.append(textNode("small", "collection-status", `Locked · ${achievement.lockedReason}`));
    } else {
      const shown = Math.min(count, achievement.target);
      const meter = document.createElement("progress");
      meter.max = achievement.target; meter.value = shown;
      meter.setAttribute("aria-label", `${achievement.item} progress, ${shown} of ${achievement.target}`);
      li.append(meter, textNode("small", "collection-status", `Locked · ${shown} / ${achievement.target}`));
    }
    return li;
  }
  // Terrarium controls: sandbox, speed, "Show in terrarium" and saving moved decorations.
  let sandbox = false;
  const sandboxSpots = {};
  function findButton(achievement) {
    const button = textNode("button", "text-button collection-find", "Show in terrarium");
    button.type = "button";
    button.setAttribute("aria-label", `Show ${achievement.item} in the terrarium`);
    button.addEventListener("click", () => {
      TerraTerrarium.select(achievement.id);
      $("terrarium-live").textContent = $("terrarium-caption").textContent;
      $("rewards-terrarium").scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
    return button;
  }
  TerraTerrarium.onMove((badge, x, y) => {
    if (sandbox) { sandboxSpots[badge] = { x, y }; return; }
    try { localStorage.setItem(TerraRewards.KEY, JSON.stringify(TerraRewards.move(TerraRewards.parse(localStorage.getItem(TerraRewards.KEY)), badge, x, y))); }
    catch { $("rewards-status").textContent = "That spot couldn't be saved. The item will return to its last saved place after reloading."; }
  });
  $("terrarium-sandbox").addEventListener("click", event => {
    sandbox = !sandbox;
    event.currentTarget.setAttribute("aria-pressed", String(sandbox));
    event.currentTarget.textContent = sandbox ? "Back to my collection" : "Try every item";
    $("terrarium-sandbox-note").hidden = !sandbox;
    refresh();
  });
  for (const button of document.querySelectorAll(".terrarium-speed button")) {
    button.addEventListener("click", () => {
      TerraTerrarium.setSpeed(Number(button.dataset.speed));
      for (const other of document.querySelectorAll(".terrarium-speed button")) other.setAttribute("aria-pressed", String(other === button));
    });
  }
  if (TerraTerrarium.paused) {
    for (const other of document.querySelectorAll(".terrarium-speed button")) other.setAttribute("aria-pressed", String(other.dataset.speed === "0"));
    $("terrarium-caption").textContent = "Paused because your device prefers reduced motion. Choose a speed to play.";
  }
  function renderRewards(records, projects) {
    clearRewards();
    try {
      const prior = TerraRewards.parse(localStorage.getItem(TerraRewards.KEY));
      const next = TerraRewards.award(prior, TerraRewards.eligible(records, projects, TerraData.observationDate, FieldSummary.matches), randomToken);
      if (JSON.stringify(prior) !== JSON.stringify(next)) localStorage.setItem(TerraRewards.KEY, JSON.stringify(next));
      const fresh = new Set(next.grants.filter(g => !prior.grants.some(p => p.badge === g.badge)).map(g => g.badge));
      const counts = TerraRewards.progress(records, projects, TerraData.observationDate, FieldSummary.matches);
      const placed = next.grants.filter(g => g.placed);
      const label = `Your terrarium, ${placed.length} item${placed.length === 1 ? "" : "s"} on display${placed.length ? `: ${placed.map(g => achievementFor(g).item).join(", ")}` : ""}.`;
      // Sandbox shows every item without earning or saving anything.
      const entries = sandbox
        ? TerraRewards.CATALOG.map(a => ({ achievement: a, grant: { badge: a.id, token: "0".repeat(32), placed: true, ...(sandboxSpots[a.id] ?? {}) } }))
        : placed.map(g => ({ achievement: achievementFor(g), grant: g }));
      TerraTerrarium.show(entries, { growth: sandbox ? TerraRewards.CATALOG.length : next.grants.length, fresh: sandbox ? [] : [...fresh], label: sandbox ? "Sandbox terrarium with every item." : label });
      for (const achievement of TerraRewards.CATALOG) {
        const grant = next.grants.find(g => g.badge === achievement.id);
        const card = collectionCard(achievement, grant, counts[achievement.metric] ?? 0, fresh.has(achievement.id));
        if (sandbox || grant?.placed) card.append(findButton(achievement));
        $("decor-list").append(card);
      }
      const unlocked = next.grants.filter(g => fresh.has(g.badge)).map(g => achievementFor(g).item);
      $("rewards-status").textContent = (unlocked.length ? `New for your terrarium: ${unlocked.join(", ")}! ` : "") +
        `${next.grants.length} of ${TerraRewards.CATALOG.length} items collected · ${placed.length} on display. Local participation only, not verified quality.`;
    } catch {
      $("rewards-status").textContent = "Rewards unavailable or could not be saved: local storage blocked/damaged or unlock could not be saved. Existing rewards untouched. Journal is unaffected. Do not clear site data.";
    }
  }
  const groupIcons = { plant: "🌿", fungus: "🍄", insect: "🐞", mammal: "🐁", bird: "🐦", fish: "🐟", reptile: "🦎", other: "❧" };
  function renderHome(records, projects) {
    const active = TerraData.active(records).filter(r => TerraData.observationDate(r.date));
    $("home-count").textContent = active.length;
    $("home-days").textContent = new Set(active.map(r => r.date)).size;
    const recent = $("home-recent"); recent.replaceChildren();
    for (const record of [...active].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)) {
      const li = document.createElement("li");
      const icon = textNode("span", "home-recent-icon", groupIcons[record.type] ?? "❧"); icon.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.append(textNode("strong", "", record.name), textNode("small", "", `${categories[record.type] ?? "Other"} · ${record.date}`));
      li.append(icon, text); recent.append(li);
    }
    $("home-empty").hidden = active.length > 0;
    const next = $("home-next");
    next.hidden = true;
    try {
      const state = TerraRewards.parse(localStorage.getItem(TerraRewards.KEY));
      $("home-items").textContent = `${state.grants.length} / ${TerraRewards.CATALOG.length}`;
      const counts = TerraRewards.progress(records, projects, TerraData.observationDate, FieldSummary.matches);
      // The locked item you're closest to, so there's always something to work toward.
      const goal = TerraRewards.CATALOG
        .filter(a => a.source !== "unavailable" && !state.grants.some(g => g.badge === a.id))
        .map(a => ({ a, done: Math.min(counts[a.metric] ?? 0, a.target) }))
        .sort((x, y) => y.done / y.a.target - x.done / x.a.target)[0];
      if (goal) {
        const icon = textNode("span", "home-next-icon", goal.a.icon); icon.setAttribute("aria-hidden", "true");
        const meter = document.createElement("progress"); meter.max = goal.a.target; meter.value = goal.done;
        meter.setAttribute("aria-hidden", "true");
        const text = document.createElement("span");
        text.append(textNode("small", "", "Next for your terrarium"), textNode("strong", "", goal.a.item), textNode("small", "", `${goal.a.goal} · ${goal.done} / ${goal.a.target}`), meter);
        next.replaceChildren(icon, text);
        next.setAttribute("aria-label", `Next for your terrarium: ${goal.a.item}. ${goal.a.goal}. ${goal.done} of ${goal.a.target}.`);
        next.hidden = false;
      }
    } catch { $("home-items").textContent = "–"; }
  }
  // Posts: a 3-column grid of your observations, with photos where you saved them.
  let postUrls = [];
  const revokePosts = () => { postUrls.forEach(url => URL.revokeObjectURL(url)); postUrls = []; };
  function renderPosts(list, records) {
    revokePosts();
    list.className = "post-grid";
    if (!records.length) { item(list, "No observations yet. Save in your journal to see them here.").className = "post-empty"; return; }
    for (const record of records) {
      const li = document.createElement("li");
      const tile = document.createElement("button");
      tile.type = "button"; tile.className = "post-tile"; tile.dataset.observation = record.id;
      tile.setAttribute("aria-label", `${record.name}, ${categories[record.type]}, ${record.date}`);
      const face = textNode("span", "post-face", groupIcons[record.type] ?? "❧"); face.setAttribute("aria-hidden", "true");
      tile.append(face, textNode("span", "post-label", `${categories[record.type]} · ${record.name} · ${record.date}`));
      tile.addEventListener("click", () => openPost(record));
      li.append(tile); list.append(li);
    }
    if (typeof TerraPhotos === "undefined") return;
    TerraPhotos.covers(records.map(r => r.id)).then(covers => {
      for (const tile of list.querySelectorAll(".post-tile")) {
        const blob = covers.get(tile.dataset.observation);
        if (!blob || !tile.isConnected) continue;
        const url = URL.createObjectURL(blob); postUrls.push(url);
        const img = document.createElement("img"); img.src = url; img.alt = "";
        tile.classList.add("has-photo"); tile.prepend(img);
      }
    }).catch(() => { /* Photos unavailable: tiles keep their icons. */ });
  }
  let viewerUrls = [];
  async function openPost(record) {
    const dialog = $("post-viewer"), box = $("post-viewer-photos");
    viewerUrls.forEach(url => URL.revokeObjectURL(url)); viewerUrls = [];
    box.replaceChildren();
    $("post-viewer-title").textContent = record.name;
    $("post-viewer-meta").textContent = `${categories[record.type]} · ${record.date}`;
    $("post-viewer-journal").href = "#journal";
    if (!dialog.open) dialog.showModal(); // Open right away; the photo fills in when read.
    try {
      const photos = typeof TerraPhotos === "undefined" ? [] : await TerraPhotos.forObservation(record.id);
      for (const photo of photos) {
        const url = URL.createObjectURL(photo.full); viewerUrls.push(url);
        const img = document.createElement("img"); img.src = url; img.alt = `Photo of ${record.name}`;
        box.append(img);
      }
      if (!photos.length) box.append(textNode("p", "post-viewer-none", "No photo saved for this observation."));
    } catch { box.append(textNode("p", "post-viewer-none", "Photos can't be read in this browser right now.")); }
  }
  $("post-viewer").addEventListener("close", () => { viewerUrls.forEach(url => URL.revokeObjectURL(url)); viewerUrls = []; });
  $("post-viewer").addEventListener("click", event => { if (event.target === $("post-viewer")) $("post-viewer").close(); });
  $("post-viewer-journal").addEventListener("click", () => $("post-viewer").close());
  document.addEventListener("terra:photos-changed", () => refresh());
  // Release thumbnail and viewer images when leaving the page.
  window.addEventListener("pagehide", () => { revokePosts(); viewerUrls.forEach(url => URL.revokeObjectURL(url)); viewerUrls = []; });
  function refresh() {
    const posts = $("profile-observations"), collections = $("profile-project-list");
    posts.replaceChildren(); collections.replaceChildren();
    try {
      const records = readObservations();
      const projects = FieldSummary.parse(localStorage.getItem(FieldSummary.KEY));
      const active = TerraData.active(records);
      renderPosts(posts, [...active].sort((a, b) => b.date.localeCompare(a.date)));
      for (const project of projects) item(collections, `${project.title} · ${project.complete ? "complete" : "open"} · ${active.filter(r => project.observationIds.includes(r.id) && FieldSummary.matches(project, r)).length} eligible observations`);
      if (!projects.length) item(collections, "No projects yet.");
      renderRewards(records, projects);
      renderHome(records, projects);
    } catch {
      item(posts, "Journal/projects unavailable; existing data untouched. Check storage before editing.");
      clearRewards();
      $("rewards-status").textContent = "Awards paused: journal or project data cannot be validated. No evidence invented.";
    }
  }
  for (const event of ["terra:journal-rendered", "terra:projects-rendered"]) document.addEventListener(event, refresh);
  window.addEventListener("storage", event => {
    if (event.key === PROFILE_KEY || event.key === null) loadProfile();
    if ([STORAGE_KEY, FieldSummary.KEY, TerraRewards.KEY, null].includes(event.key)) refresh();
  });
  // The terrarium lays itself out to the jar's width, which is 0 while Profile is hidden.
  document.addEventListener("terra:screen-shown", event => { if (event.detail.screen === "profile" || event.detail.screen === "home") refresh(); });
  loadProfile(); refresh();
  // A #terrarium link opened before this script loaded still lands on the Terrarium tab.
  if (location.hash === "#terrarium") selectTab($("awards-tab"));
})();
