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
    if (badge.startsWith("d:")) {
      try { localStorage.setItem(TerraDex.KEY, JSON.stringify(TerraDex.move(TerraDex.parse(localStorage.getItem(TerraDex.KEY)), badge.slice(2), x, y))); }
      catch { $("rewards-status").textContent = "That spot couldn't be saved. The decoration will return to its last saved place after reloading."; }
      return;
    }
    if (badge.startsWith("q:")) {
      try { localStorage.setItem(TerraQuests.KEY, JSON.stringify(TerraQuests.move(TerraQuests.parse(localStorage.getItem(TerraQuests.KEY)), badge.slice(2), x, y))); }
      catch { $("rewards-status").textContent = "That spot couldn't be saved. The decoration will return to its last saved place after reloading."; }
      return;
    }
    try { localStorage.setItem(TerraRewards.KEY, JSON.stringify(TerraRewards.move(TerraRewards.parse(localStorage.getItem(TerraRewards.KEY)), badge, x, y))); }
    catch { $("rewards-status").textContent = "That spot couldn't be saved. The item will return to its last saved place after reloading."; }
  });
  $("terrarium-sandbox").addEventListener("click", event => {
    sandbox = !sandbox;
    event.currentTarget.setAttribute("aria-pressed", String(sandbox));
    event.currentTarget.textContent = sandbox ? "Back to my collection" : "Try every item";
    $("terrarium-sandbox-note").hidden = !sandbox;
    $("terrarium-preview").hidden = !sandbox;
    if (!sandbox) { $("terrarium-season").value = ""; $("terrarium-time").value = ""; TerraTerrarium.setEnvironment({}); }
    refresh();
  });
  for (const button of document.querySelectorAll(".terrarium-speed button")) {
    button.addEventListener("click", () => {
      TerraTerrarium.setSpeed(Number(button.dataset.speed));
      for (const other of document.querySelectorAll(".terrarium-speed button")) other.setAttribute("aria-pressed", String(other === button));
    });
  }
  for (const button of document.querySelectorAll("[data-care]")) button.addEventListener("click", () => {
    TerraTerrarium.care(button.dataset.care);
    $("terrarium-live").textContent = $("terrarium-caption").textContent;
  });
  const PREVIEW_WEATHER = { clear: { kind: "clear", temperature: 18 }, rain: { kind: "rain", temperature: 12, precipitation: 1 }, snow: { kind: "snow", temperature: -1 }, fog: { kind: "fog", temperature: 9 }, storm: { kind: "storm", temperature: 16, precipitation: 4 }, heat: { kind: "clear", temperature: 36 }, frost: { kind: "clear", temperature: -4 } };
  const previewEnv = () => TerraTerrarium.setEnvironment({ season: $("terrarium-season").value || null, phase: $("terrarium-time").value || null, weather: PREVIEW_WEATHER[$("terrarium-weather").value] ?? null });
  $("terrarium-weather").addEventListener("change", previewEnv);
  // ---- Habitat jars ----
  const JAR_KEY = "terra.jar.v1";
  const readJar = () => { try { const j = JSON.parse(localStorage.getItem(JAR_KEY))?.habitat; return TerraLife.HABITATS[j] ? j : "forest"; } catch { return "forest"; } };
  const HABITAT_HINTS = { desert: "Log a desert species (cactus, lizard, snake, scorpion) to unlock.", tidepool: "Log a tide-pool species (crab, sea star, anemone, octopus, shrimp) to unlock.", rainforest: "Log a rainforest species (parrot, monkey, sloth, orchid) to unlock." };
  function renderJars(unlocked, current) {
    const box = $("jar-switcher"); box.replaceChildren();
    for (const [id, h] of Object.entries(TerraLife.HABITATS)) {
      const b = document.createElement("button"); b.type = "button"; b.dataset.jar = id;
      const open = unlocked.has(id);
      b.textContent = `${open ? h.icon : "🔒"} ${h.name}`;
      b.setAttribute("aria-pressed", String(id === current));
      if (!open) { b.classList.add("locked"); b.title = HABITAT_HINTS[id]; b.setAttribute("aria-label", `${h.name}, locked. ${HABITAT_HINTS[id]}`); }
      b.addEventListener("click", () => {
        if (!open) { $("jar-hint").textContent = `🔒 ${h.name}: ${HABITAT_HINTS[id]}`; return; }
        try { localStorage.setItem(JAR_KEY, JSON.stringify({ version: 1, habitat: id })); } catch { /* Preference only. */ }
        $("jar-hint").textContent = "";
        refresh();
      });
      box.append(b);
    }
    const hint = document.createElement("p"); hint.id = "jar-hint"; hint.className = "jar-hint"; hint.setAttribute("role", "status");
    box.append(hint);
  }
  // ---- Real local weather (opt-in) ----
  let weatherState = null;
  try { weatherState = TerraWeather.parse(localStorage.getItem(TerraWeather.KEY)); } catch { weatherState = null; }
  const saveWeather = next => { weatherState = next; try { localStorage.setItem(TerraWeather.KEY, JSON.stringify(next)); } catch { /* Kept for this visit. */ } };
  $("weather-enabled").checked = Boolean(weatherState?.enabled);
  function latestMappedSpot() {
    try {
      const lat = l => l?.space === TerraData.GEO ? (Number.isFinite(l.y) ? [l.y, l.x] : Number.isFinite(l.y1) ? [(l.y1 + l.y2) / 2, (l.x1 + l.x2) / 2] : null) : null;
      const r = TerraData.active(readObservations()).filter(r => lat(r.location)).sort((a, b) => b.date.localeCompare(a.date))[0];
      return r ? lat(r.location) : null;
    } catch { return null; }
  }
  function describeWeather(w, cached) {
    return `${typeof w.temperature === "number" ? `${Math.round(w.temperature)}°C, ` : ""}${w.kind} near you${weatherState?.source === "observation" ? " (from your latest mapped find)" : ""}${cached ? "" : ""}. Location rounded to about 11 km.`;
  }
  async function refreshWeather(force = false) {
    if (!weatherState?.enabled || weatherState.lat === null) { TerraTerrarium.setWeather(null); $("weather-status").textContent = ""; return; }
    if (!force && !TerraWeather.stale(weatherState)) { TerraTerrarium.setWeather(weatherState.data); $("weather-status").textContent = describeWeather(weatherState.data, true); return; }
    $("weather-status").textContent = "Checking the weather…";
    try {
      const data = await TerraWeather.fetchWeather(weatherState.lat, weatherState.lon);
      saveWeather({ ...weatherState, fetched: Date.now(), data });
      TerraTerrarium.setWeather(data);
      $("weather-status").textContent = describeWeather(data);
    } catch (error) {
      if (weatherState.data) TerraTerrarium.setWeather(weatherState.data);
      $("weather-status").textContent = `${error.message.includes("fetch") || error instanceof TypeError ? "Local weather needs the TERRA server and an internet connection." : error.message} The jar is using ${weatherState.data ? "the last weather it saw" : "the calendar"}.`;
    }
  }
  $("weather-enabled").addEventListener("change", () => {
    const base = weatherState ?? TerraWeather.parse(null);
    if (!$("weather-enabled").checked) { saveWeather({ ...base, enabled: false }); refreshWeather(); return; }
    const useSpot = (lat, lon, source) => { saveWeather({ ...base, enabled: true, source, lat: TerraWeather.round1(lat), lon: TerraWeather.round1(lon), fetched: null, data: null }); refreshWeather(true); };
    const fallback = () => {
      const spot = latestMappedSpot();
      if (spot) useSpot(spot[0], spot[1], "observation");
      else { $("weather-enabled").checked = false; $("weather-status").textContent = "To use local weather, allow location access or record an observation with a map location."; }
    };
    $("weather-status").textContent = "Finding your approximate location…";
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(p => useSpot(p.coords.latitude, p.coords.longitude, "device"), fallback, { maximumAge: 3600000, timeout: 8000, enableHighAccuracy: false });
    else fallback();
  });
  refreshWeather();
  setInterval(() => { if (weatherState?.enabled && !document.hidden) refreshWeather(); }, 10 * 60 * 1000);
  $("terrarium-season").addEventListener("change", previewEnv);
  $("terrarium-time").addEventListener("change", previewEnv);
  // Rare sightings: a "???" card for each one you haven't spotted yet.
  // Field guide: species cards, sets with ??? slots, evolution and set-complete celebrations.
  function renderDex(species) {
    const g = TerraDex.guide(species, TerraLife.KINDS);
    let state = null;
    try { state = TerraDex.parse(localStorage.getItem(TerraDex.KEY)); } catch { /* Damaged: show the guide, celebrate nothing, overwrite nothing. */ }
    if (state) {
      const firstRun = !localStorage.getItem(TerraDex.KEY);
      const u = TerraDex.update(state, species, g, localToday());
      if (JSON.stringify(u.state) !== JSON.stringify(state)) { try { localStorage.setItem(TerraDex.KEY, JSON.stringify(u.state)); } catch { /* Celebrated again next time. */ } }
      state = u.state;
      const news = [
        ...u.evolved.map(sp => `✨ Your ${sp.name} evolved into ${/^[aeiou]/i.test(sp.form) ? "an" : "a"} ${sp.form}!`),
        ...u.completed.map(set => `📖 Set complete: ${set.name}! ${set.reward.icon} ${set.reward.item} added to your jar.`),
        ...(firstRun ? [] : u.added.slice(0, 1).map(sp => `📖 New field-guide card: ${sp.name}.`))
      ];
      if (news.length) TerraScreens.toast(news.join(" "), { href: "#terrarium", label: "See jar" });
    }
    $("dex-summary").textContent = `${g.cards.length} species · ${g.completeSets} of ${g.sets.length} sets complete. Log a species again to evolve it (stages at ${TerraLife.STAGE_AT.join(", ")} sightings).`;
    const sets = $("dex-sets"); sets.replaceChildren();
    for (const set of g.sets) {
      const box = document.createElement("section");
      box.className = `dex-set${set.complete ? " complete" : ""}`; box.dataset.set = set.id;
      const head = document.createElement("header");
      head.append(textNode("strong", "", set.name), textNode("span", "dex-set-count", `${set.found}/${set.slots.length}`), textNode("span", "dex-set-reward", `${set.reward.icon} ${set.complete ? set.reward.item : "Reward"}`));
      const slots = document.createElement("ul"); slots.className = "dex-slots";
      for (const slot of set.slots) {
        const li = document.createElement("li");
        li.className = `dex-slot${slot.found ? " found" : ""}`;
        const icon = textNode("span", "dex-slot-icon", TerraLife.iconFor(slot.kind, 2)); icon.setAttribute("aria-hidden", "true");
        li.append(icon, textNode("span", "", slot.found ? slot.found.name : "???"));
        li.title = slot.found ? `${slot.name}: ${slot.found.name}` : `${slot.hint} (${slot.name.toLowerCase()})`;
        li.setAttribute("aria-label", slot.found ? `${slot.name}: found, ${slot.found.name}` : `Not found yet. Hint: ${slot.hint}.`);
        slots.append(li);
      }
      box.append(head, slots);
      sets.append(box);
    }
    const cards = $("dex-cards"); cards.replaceChildren();
    if (!g.cards.length) { const li = textNode("li", "dex-empty", "No cards yet. Every species you log gets a card here."); cards.append(li); }
    g.cards.forEach((sp, i) => {
      const f = TerraLife.form(sp.kind, sp.stage);
      const li = document.createElement("li");
      const b = document.createElement("button"); b.type = "button"; b.className = `dex-card stage-${sp.stage}`; b.dataset.species = sp.id;
      const icon = textNode("span", "dex-card-icon", TerraLife.iconFor(sp.kind, sp.stage)); icon.setAttribute("aria-hidden", "true");
      const meter = document.createElement("span"); meter.className = "dex-stage";
      for (let st = 0; st < 3; st++) meter.append(textNode("span", st <= sp.stage ? "on" : "", ""));
      b.append(textNode("span", "dex-no", `#${String(i + 1).padStart(3, "0")}`), icon, textNode("strong", "", sp.name));
      if (sp.scientific) b.append(textNode("em", "", sp.scientific));
      b.append(meter, textNode("small", "", `${f.name} · seen ${sp.count}× · ${sp.next ? `${sp.next - sp.count} to evolve` : "fully evolved ★"}`));
      b.setAttribute("aria-label", `${sp.name}${sp.scientific ? `, ${sp.scientific}` : ""}. Stage ${sp.stage + 1} of 3, ${f.name}. Seen ${sp.count} times, first on ${sp.first}. ${sp.next ? `${sp.next - sp.count} more sightings to evolve.` : "Fully evolved."} Show in the jar.`);
      b.addEventListener("click", () => { TerraTerrarium.select(sp.id); $("rewards-terrarium").scrollIntoView({ block: "center", behavior: "smooth" }); });
      li.append(b); cards.append(li);
    });
    return state ? TerraDex.rewards(state).map(r => ({ ...r, uid: `d:${r.id}` })) : [];
  }
  // ---- Visiting friends and seed gifts (links, no accounts) ----
  let visiting = null, shareData = null;
  const readGifts = () => { try { return TerraVisits.parse(localStorage.getItem(TerraVisits.KEY)); } catch { return null; } };
  const giftGarden = () => { const g = readGifts(); return g ? TerraVisits.garden(g, TerraQuests.SEEDS) : []; };
  function myGifts() {
    const g = readGifts();
    if (!g) throw Error("Your gift data couldn't be read, so nothing was changed.");
    if (g.jarId) return g;
    const withId = TerraVisits.withJarId(g);
    localStorage.setItem(TerraVisits.KEY, JSON.stringify(withId));
    return withId;
  }
  const lib = () => ({ catalog: TerraRewards.CATALOG, kinds: TerraLife.KINDS, seeds: TerraQuests.SEEDS, decor: TerraQuests.DECOR, sets: TerraDex.SETS });
  const linkFor = (kind, code) => `${location.origin}${location.pathname}?${kind}=${code}#terrarium`;
  function renderVisit(s) {
    const avatar = $("visit-avatar"); avatar.replaceChildren();
    try { TerraAvatars.render(avatar, TerraAvatars.iconId(s.avatar) ?? "leaf"); } catch { /* No picture. */ }
    $("visit-title").textContent = `Visiting ${s.name}'s jar`;
    $("visit-meta").textContent = `Level ${s.level} · ${s.levelName} · ${s.species.length} species · ${s.items.length} item${s.items.length === 1 ? "" : "s"} · shared ${s.made}`;
    $("rewards-status").textContent = "You're looking at a snapshot of a friend's jar. Nothing here changes your own jar.";
    const entries = s.items.map(i => ({ achievement: TerraRewards.CATALOG.find(a => a.id === i.b), grant: { badge: i.b, token: "0".repeat(32), placed: true, ...(i.x === undefined ? {} : { x: i.x, y: i.y }) } }));
    const finds = s.species.map((x, n) => ({ id: `s:visit-${n}`, key: `visit-${n}`, kind: x.k, habitat: "forest", name: x.n, scientific: "", count: TerraLife.STAGE_AT[x.s], stage: x.s, next: TerraLife.nextAt(x.s), first: "", last: "", unknown: false }));
    const garden = s.garden.map((id, n) => ({ ...TerraQuests.SEEDS.find(x => x.id === id), token: `visit${String(n).padStart(28, "0")}`, planted: "2000-01-01" }));
    const decor = [...s.decor.map((d, n) => ({ ...TerraQuests.DECOR.find(x => x.id === d.d), uid: `q:visit${n}`, ...(d.x === undefined ? {} : { x: d.x, y: d.y }) })),
      ...TerraDex.SETS.filter(set => s.sets.includes(set.id)).map((set, n) => ({ id: set.id, item: set.reward.item, icon: set.reward.icon, note: `${s.name} completed “${set.name}”.`, uid: `d:visit-${set.id}`, x: [0.82, 0.12, 0.44, 0.68][n % 4], y: 0.6 }))];
    TerraTerrarium.show(entries, { growth: entries.length, label: `${s.name}'s jar (a shared snapshot).`, finds, garden, questDecor: decor, sandbox: true, south: false, date: localToday(), jar: "forest" });
  }
  function openLinkDialog({ title, text, value = "", mode }) {
    $("link-title").textContent = title; $("link-text").textContent = text;
    $("link-input").value = value; $("link-input").readOnly = mode !== "open";
    $("link-label").textContent = mode === "open" ? "Paste a jar or gift link" : "Link";
    $("link-open").hidden = mode !== "open"; $("link-copy").hidden = mode === "open"; $("link-share").hidden = mode === "open" || typeof navigator.share !== "function";
    $("link-status").textContent = "";
    if (!$("link-dialog").open) $("link-dialog").showModal();
    if (mode === "open") $("link-input").focus(); else $("link-input").select();
  }
  $("link-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("link-input").value); $("link-status").textContent = "Link copied. Send it to a friend."; }
    catch { $("link-input").select(); $("link-status").textContent = "Copying isn't allowed here: the link is selected, so copy it yourself."; }
  });
  $("link-share").addEventListener("click", () => { navigator.share?.({ title: $("link-title").textContent, url: $("link-input").value }).catch(() => {}); });
  $("link-open").addEventListener("click", () => {
    const parsed = TerraVisits.parseLink($("link-input").value);
    if (!parsed) { $("link-status").textContent = "That doesn't look like a TERRA jar or gift link."; return; }
    $("link-dialog").close();
    handleCode(parsed.kind, parsed.code);
  });
  $("open-link").addEventListener("click", () => openLinkDialog({ title: "Open a friend's link", text: "Paste a jar link to visit it, or a gift link to plant the seed.", mode: "open" }));
  $("share-jar").addEventListener("click", async () => {
    if (!shareData || !lastParticipation) { $("rewards-status").textContent = "Your jar isn't ready to share yet."; return; }
    try {
      const gifts = myGifts();
      let profile = { ...defaults }; try { profile = readProfile(); } catch { /* Default name. */ }
      let dexState = { sets: {} }; try { dexState = TerraDex.parse(localStorage.getItem(TerraDex.KEY)); } catch { /* No sets. */ }
      const snap = TerraVisits.snapshot({ jarId: gifts.jarId, name: profile.name, avatar: profile.avatar === "photo" ? "leaf" : profile.avatar, xp: lastParticipation.xp,
        grants: shareData.grants, species: shareData.species, garden: shareData.inventory.seeds, decor: shareData.inventory.decor, sets: Object.keys(dexState.sets), today: localToday() });
      const code = await TerraVisits.encode(snap);
      openLinkDialog({ title: "Share your jar", text: `Anyone with this link can visit a snapshot of your jar and leave you a seed gift. It shows your name (${snap.name}), level, items, species and garden. It never includes locations, notes, dates or photos.`, value: linkFor("visit", code), mode: "share" });
    } catch (error) { $("rewards-status").textContent = error.message || "Your jar couldn't be shared right now."; }
  });
  $("visit-leave").addEventListener("click", () => {
    visiting = null;
    history.replaceState(null, "", `${location.pathname}#terrarium`);
    refresh();
  });
  // Gift dialog (while visiting).
  const seedsBox = $("gift-seeds");
  TerraQuests.SEEDS.forEach((seed, i) => {
    const label = document.createElement("label");
    const input = document.createElement("input"); input.type = "radio"; input.name = "gift-seed"; input.value = seed.id; input.checked = i === 0;
    label.append(input, textNode("span", "", seed.icon), textNode("small", "", seed.item));
    label.querySelector("span").setAttribute("aria-hidden", "true");
    seedsBox.append(label);
  });
  $("visit-gift").addEventListener("click", () => {
    if (!visiting) return;
    let profile = { ...defaults }; try { profile = readProfile(); } catch { /* Default. */ }
    $("gift-for").textContent = `For ${visiting.name}'s garden. They'll get a link to plant it.`;
    $("gift-from").value = profile.name; $("gift-status").textContent = "";
    $("gift-dialog").showModal();
  });
  $("gift-create").addEventListener("click", async () => {
    try {
      const gifts = myGifts(), today = localToday();
      if (visiting.id === gifts.jarId) { $("gift-status").textContent = "That's your own jar. Gifts are for friends!"; return; }
      if (!TerraVisits.canGift(gifts, visiting.id, today)) { $("gift-status").textContent = `You've already left ${visiting.name} a gift today. Come back tomorrow!`; return; }
      const g = TerraVisits.gift({ to: visiting.id, seed: $("gift-dialog").querySelector('input[name="gift-seed"]:checked').value, from: $("gift-from").value, note: $("gift-note").value, today });
      const code = await TerraVisits.encode(g);
      localStorage.setItem(TerraVisits.KEY, JSON.stringify(TerraVisits.markSent(gifts, visiting.id, today)));
      $("gift-dialog").close();
      const seed = TerraQuests.SEEDS.find(s => s.id === g.seed);
      openLinkDialog({ title: `${seed.icon} Gift ready`, text: `Send this link to ${visiting.name}. When they open it, a ${seed.item.toLowerCase()} is planted in their garden with your note.`, value: linkFor("gift", code), mode: "share" });
    } catch (error) { $("gift-status").textContent = error.message || "The gift couldn't be created."; }
  });
  let pendingGift = null;
  $("received-plant").addEventListener("click", () => {
    if (!pendingGift) return;
    try {
      const { state, result } = TerraVisits.redeem(myGifts(), pendingGift, localToday());
      if (result === "planted") localStorage.setItem(TerraVisits.KEY, JSON.stringify(state));
      $("received-status").textContent = result === "planted" ? "Planted! Look for it in your jar's garden." : result === "already" ? "You've already planted this gift." : "This gift was made for someone else's jar, so it can't be planted here.";
      $("received-plant").disabled = true;
      pendingGift = null;
      history.replaceState(null, "", `${location.pathname}#terrarium`);
      refresh();
    } catch (error) { $("received-status").textContent = error.message; }
  });
  async function handleCode(kind, code) {
    let data;
    try { data = await TerraVisits.decode(code); }
    catch { TerraScreens.toast("That link couldn't be opened. It may be incomplete; ask your friend to send it again."); return; }
    try {
      if ((kind ?? data?.t) === "visit" || data?.t === "jar") {
        visiting = TerraVisits.validJar(data, lib());
        location.hash = "#terrarium";
        if (sandbox) $("terrarium-sandbox").click(); else refresh();
        return;
      }
      const g = TerraVisits.validGift(data, lib());
      const seed = TerraQuests.SEEDS.find(s => s.id === g.seed);
      const mine = readGifts();
      pendingGift = g;
      $("received-icon").textContent = seed.icon;
      $("received-title").textContent = `${g.from} sent you a ${seed.item.toLowerCase()} seed!`;
      $("received-note").textContent = g.note ? `“${g.note}”` : "";
      $("received-note").hidden = !g.note;
      const already = mine?.received[g.id], wrong = mine?.jarId && g.to !== mine.jarId;
      $("received-plant").disabled = Boolean(already || wrong);
      $("received-status").textContent = already ? "You've already planted this gift." : wrong ? "This gift was made for someone else's jar, so it can't be planted here." : "";
      location.hash = "#terrarium";
      $("gift-received").showModal();
    } catch { TerraScreens.toast("That link isn't a valid TERRA jar or gift."); }
  }
  {
    const params = new URLSearchParams(location.search);
    for (const kind of ["visit", "gift"]) if (params.get(kind)) { handleCode(kind, params.get(kind)); break; }
  }
  function renderRares() {
    const list = $("rare-list"); list.replaceChildren();
    for (const rare of TerraTerrarium.rares()) {
      const li = document.createElement("li");
      li.className = `rare-card ${rare.seen ? "seen" : "unseen"} ${rare.tier.toLowerCase()}`;
      const icon = textNode("span", "rare-icon", rare.seen ? rare.icon : "?"); icon.setAttribute("aria-hidden", "true");
      li.append(textNode("span", "rare-tier", rare.tier), icon, textNode("strong", "", rare.seen ? rare.name : "???"),
        textNode("small", "", rare.seen ? `First seen ${rare.seen}` : "Not spotted yet"));
      if (rare.seen) li.title = rare.fact;
      list.append(li);
    }
  }
  TerraTerrarium.onRare(() => renderRares());
  // Sample finds for the sandbox, so you can see how journal entries come to life.
  const SAMPLE_FINDS = ["frog", "fern", "bee", "fish", "spider", "worm", "shelf", "flower", "moss", "lichen", "rabbit", "beetle", "butterfly", "sapling", "sparrow",
    "cactus", "lizard", "snake", "scorpion", "crab", "seastar", "anemone", "octopus", "shrimp", "parrot", "monkey", "sloth", "orchid"]
    .map((kind, i) => { const stage = i % 3, count = TerraLife.STAGE_AT[stage]; return { id: `s:sample-${kind}`, key: `sample-${kind}`, kind, habitat: TerraLife.habitatOf(kind), name: TerraLife.KINDS[kind].name, scientific: "", count, stage, next: TerraLife.nextAt(stage), first: "Sample", last: "Sample", unknown: false }; });
  document.addEventListener("terra:participation-changed", () => refresh());
  document.addEventListener("terra:workspace-changed", () => refresh());
  // Dashboard and résumé, from the same participation summary as Home.
  let resumeData = null;
  function renderWorkspace(records, projects) {
    const p = lastParticipation;
    if (!p) return;
    TerraDashboard.render(TerraData.active(records), projects, p, { matches: FieldSummary.matches, photoCounts, today: localToday() });
    let profile = { ...defaults };
    try { profile = readProfile(); } catch { /* Default name; profile errors are shown in the profile card. */ }
    let achievements = [];
    try { achievements = TerraRewards.parse(localStorage.getItem(TerraRewards.KEY)).grants.map(g => TerraRewards.labels[g.badge]); } catch { /* None shown. */ }
    resumeData = TerraResume.build({ profile, records: TerraData.active(records), projects, p, achievements, rares: TerraTerrarium.rares(), matches: FieldSummary.matches, today: localToday() });
    const face = document.createElement("span"); face.className = "resume-avatar"; face.setAttribute("aria-hidden", "true");
    try { TerraAvatars.render(face, profile.avatar === "photo" ? "photo" : TerraAvatars.iconId(profile.avatar) ?? "leaf", profile.photo); } catch { /* No picture. */ }
    TerraResume.render($("resume-sheet"), resumeData, face);
  }
  if (typeof TerraPhotos !== "undefined") TerraPhotos.counts().then(map => { photoCounts = map; refresh(); }).catch(() => {});
  $("resume-print").addEventListener("click", () => {
    document.body.classList.add("print-resume");
    window.addEventListener("afterprint", () => document.body.classList.remove("print-resume"), { once: true });
    try { window.print(); } catch { $("resume-status").textContent = "Printing isn't available here. Use Copy as text or Download .txt instead."; }
    setTimeout(() => document.body.classList.remove("print-resume"), 1000);
  });
  $("resume-copy").addEventListener("click", async () => {
    if (!resumeData) return;
    try { await navigator.clipboard.writeText(TerraResume.text(resumeData)); $("resume-status").textContent = "Résumé copied as text."; }
    catch { $("resume-status").textContent = "Copying isn't allowed here. Use Download .txt instead."; }
  });
  $("resume-download").addEventListener("click", () => {
    if (!resumeData) return;
    const url = URL.createObjectURL(new Blob([TerraResume.text(resumeData)], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = `terra-resume-${localToday()}.txt`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("resume-status").textContent = "Résumé downloaded as text.";
  });
  if (TerraTerrarium.paused) {
    for (const other of document.querySelectorAll(".terrarium-speed button")) other.setAttribute("aria-pressed", String(other.dataset.speed === "0"));
    $("terrarium-caption").textContent = "Paused because your device prefers reduced motion. Choose a speed to play.";
  }
  const localToday = () => new Date().toLocaleDateString("en-CA");
  // Award finished field quests, then report the board. Never throws away earned rewards.
  let questCache = { state: null, board: null };
  function updateQuests(records) {
    const active = TerraData.active(records).filter(r => TerraData.observationDate(r.date));
    const board = TerraQuests.board(active, localToday());
    const prior = TerraQuests.parse(localStorage.getItem(TerraQuests.KEY));
    const { state, earned } = TerraQuests.claim(prior, board, randomToken);
    if (earned.length) {
      localStorage.setItem(TerraQuests.KEY, JSON.stringify(state));
      const names = earned.map(e => `${e.reward.icon} ${e.reward.item}${e.reward.type === "seed" ? " seeds" : ""}`).join(", ");
      TerraScreens.toast(`Quest complete! ${names} for your jar.`, { href: "#terrarium", label: "See it" });
    }
    questCache = { state, board };
    return questCache;
  }
  // Southern hemisphere if your latest find with a map location is south of the equator.
  function southern(records) {
    const lat = l => l?.space === TerraData.GEO ? (Number.isFinite(l.y) ? l.y : Number.isFinite(l.y1) ? (l.y1 + l.y2) / 2 : null) : null;
    const located = TerraData.active(records).filter(r => lat(r.location) !== null).sort((a, b) => b.date.localeCompare(a.date))[0];
    return Boolean(located && lat(located.location) < 0);
  }
  function renderRewards(records, projects) {
    clearRewards();
    try {
      const prior = TerraRewards.parse(localStorage.getItem(TerraRewards.KEY));
      const next = TerraRewards.award(prior, TerraRewards.eligible(records, projects, TerraData.observationDate, FieldSummary.matches), randomToken);
      if (JSON.stringify(prior) !== JSON.stringify(next)) localStorage.setItem(TerraRewards.KEY, JSON.stringify(next));
      const fresh = new Set(next.grants.filter(g => !prior.grants.some(p => p.badge === g.badge)).map(g => g.badge));
      $("profile-awards").classList.toggle("visiting", Boolean(visiting));
      $("visit-banner").hidden = !visiting;
      if (visiting) { renderVisit(visiting); return; }
      const counts = TerraRewards.progress(records, projects, TerraData.observationDate, FieldSummary.matches);
      const placed = next.grants.filter(g => g.placed);
      const label = `Your terrarium, ${placed.length} item${placed.length === 1 ? "" : "s"} on display${placed.length ? `: ${placed.map(g => achievementFor(g).item).join(", ")}` : ""}.`;
      // Sandbox shows every item without earning or saving anything.
      const entries = sandbox
        ? TerraRewards.CATALOG.map(a => ({ achievement: a, grant: { badge: a.id, token: "0".repeat(32), placed: true, ...(sandboxSpots[a.id] ?? {}) } }))
        : placed.map(g => ({ achievement: achievementFor(g), grant: g }));
      const active = TerraData.active(records).filter(r => TerraData.observationDate(r.date));
      let inventory = { seeds: [], decor: [] };
      try { if (questCache.state) inventory = TerraQuests.inventory(questCache.state); } catch { /* Quest rewards unavailable; the jar still shows. */ }
      const sampleToken = i => i.toString(16).padStart(32, "0");
      const speciesNow = TerraLife.species(active);
      const dexRewards = renderDex(speciesNow);
      // Which habitat jars are open, and which one is showing.
      const openJars = new Set(["forest", ...(sandbox ? Object.keys(TerraLife.HABITATS) : speciesNow.map(sp => sp.habitat))]);
      let jar = readJar(); if (!openJars.has(jar)) jar = "forest";
      renderJars(openJars, jar);
      const inJar = list => list.filter(sp => sp.habitat === jar);
      const setRewardsHere = dexRewards.filter(r => (["desert", "tidepool", "rainforest"].includes(r.id) ? r.id : "forest") === jar);
      const living = jar !== "forest"
        ? { finds: inJar(sandbox ? SAMPLE_FINDS : speciesNow), garden: [], questDecor: sandbox ? [] : setRewardsHere, ...(sandbox ? {} : { journalCount: active.length }) }
        : sandbox
        ? { finds: inJar(SAMPLE_FINDS),
            garden: TerraQuests.SEEDS.map((seed, i) => ({ ...seed, token: sampleToken(i + 1), planted: "2000-01-01" })),
            questDecor: TerraQuests.DECOR.map((d, i) => ({ ...d, token: sampleToken(i + 20), ...(sandboxSpots[`q:${sampleToken(i + 20)}`] ?? {}) })) }
        : { finds: inJar(speciesNow), garden: [...inventory.seeds, ...giftGarden()], questDecor: [...inventory.decor, ...setRewardsHere], journalCount: active.length };
      if (!sandbox) shareData = { grants: next.grants, species: speciesNow, inventory };
      TerraTerrarium.show(jar === "forest" ? entries : [], { growth: jar !== "forest" ? 0 : sandbox ? TerraRewards.CATALOG.length : next.grants.length, fresh: sandbox || jar !== "forest" ? [] : [...fresh],
        label: `${TerraLife.HABITATS[jar].name}. ${sandbox ? "Sandbox terrarium with every item." : label}`,
        ...living, south: southern(records), sandbox, date: localToday(), jar });
      renderRares();
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
  // XP, level, streak with rest leaves, and review record: everything participation-related, computed once.
  function participation(records) {
    const today = localToday(), dateOK = TerraData.observationDate;
    const active = TerraData.active(records).filter(r => dateOK(r.date));
    const quests = questCache.state ? TerraQuests.stats(questCache.state) : { quests: 0, decor: 0 };
    const rares = TerraTerrarium.rares().filter(r => r.seen).length;
    let validator;
    try { validator = TerraValidators.parse(localStorage.getItem(TerraValidators.KEY)); } catch { validator = { version: 1, answers: {} }; }
    const review = TerraValidators.record(validator);
    const real = TerraRewards.streak(records, dateOK, today);
    const xp = TerraXP.compute(active, { quests: quests.quests, rares, reviews: review.reviews, correct: review.correct, longestStreak: real.longest });
    let saved = null, leaves = { available: Math.max(0, quests.decor), spent: [] }, bridge = new Set();
    try { saved = TerraRewards.parseStreak(localStorage.getItem(TerraRewards.STREAK_KEY)); } catch { /* Damaged: no rest leaves applied, nothing overwritten. */ }
    if (saved) {
      const p = TerraRewards.protect(records, dateOK, today, saved, quests.decor);
      let next = p.state;
      if (xp.level > next.level) {
        if (next.level > 0) TerraScreens.toast(`Level up! ${xp.icon} You're now a ${xp.name} (level ${xp.level}).`, { href: "#profile", label: "See profile" });
        next = { ...next, level: xp.level };
      }
      if (p.spent.length) TerraScreens.toast(`🍃 A rest leaf covered ${p.spent.length === 1 ? "yesterday" : `${p.spent.length} missed days`}, so your streak is safe. Record today to keep it going.`);
      if (next !== saved) { try { localStorage.setItem(TerraRewards.STREAK_KEY, JSON.stringify(next)); } catch { /* Shown again next time. */ } }
      leaves = { available: p.available, spent: p.spent };
      bridge = new Set(next.used);
    }
    const streak = TerraRewards.streak(records, dateOK, today, bridge);
    return { today, active, xp, streak, leaves, bridge, review, validator, standing: TerraValidators.standing(xp.level, review) };
  }
  let lastParticipation = null, photoCounts = new Map();
  // Professional workspace: a data-quality line on Home instead of quests.
  function renderQuality(records, projects) {
    const card = $("home-quality");
    const s = TerraDashboard.summary(TerraData.active(records), projects, { matches: FieldSummary.matches, photoCounts, today: localToday() });
    if (!s.n) { card.hidden = true; return; }
    const done = s.checks.filter(c => c.ok).length, q = s.quality;
    card.replaceChildren(textNode("strong", "", "Data quality"), textNode("span", "", `${Math.round(q.identified / q.total * 100)}% scientific names · ${Math.round(q.located / q.total * 100)}% located · ${done}/${s.checks.length} readiness checks`));
    card.hidden = false;
  }
  function renderLevel(p) {
    const card = $("home-level");
    if (!p.active.length) { card.hidden = true; return; }
    const { xp } = p;
    const icon = textNode("span", "level-icon", xp.icon); icon.setAttribute("aria-hidden", "true");
    const text = document.createElement("span"); text.className = "level-text";
    text.append(textNode("strong", "", `Level ${xp.level} · ${xp.name}`), textNode("small", "", xp.next ? `${xp.xp} XP · ${xp.toNext} XP to ${xp.next.name}` : `${xp.xp} XP · top level reached`));
    const bar = document.createElement("progress"); bar.max = 1; bar.value = xp.progress; bar.className = "level-bar"; bar.setAttribute("aria-hidden", "true");
    text.append(bar);
    card.replaceChildren(icon, text);
    card.setAttribute("aria-label", `Level ${xp.level}, ${xp.name}. ${xp.xp} XP.${xp.next ? ` ${xp.toNext} XP to ${xp.next.name}.` : ""} Open your dashboard.`);
    card.hidden = false;
  }
  function renderStreak(p) {
    const card = $("home-streak");
    const s = p.streak;
    if (!s.longest) { card.hidden = true; return; }
    const flame = textNode("span", `streak-flame${s.recordedToday ? " lit" : ""}`, s.current ? "🔥" : "🌱"); flame.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    let title, line;
    if (s.current && s.recordedToday) { title = `${s.current}-day streak`; line = "You recorded today. See you tomorrow!"; }
    else if (s.current) { title = `${s.current}-day streak`; line = "Record a find today to keep it going."; }
    else { title = "Start a new streak today"; line = `Your best streak: ${s.longest} day${s.longest === 1 ? "" : "s"}. Every day is a fresh start.`; }
    text.append(textNode("strong", "", title), textNode("small", "", line));
    if (s.next) text.append(textNode("small", "streak-next", `Next: ${s.next.icon} ${s.next.item} at ${s.next.target} days in a row`));
    // This week, Monday to Sunday: recorded days, rest-leaf days, today.
    const week = document.createElement("span"); week.className = "streak-week"; week.setAttribute("aria-hidden", "true");
    const days = new Set(p.active.map(r => r.date)), monday = TerraQuests.weekStart(p.today);
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.parse(`${monday}T12:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
      const dot = textNode("span", `streak-day${days.has(d) ? " done" : p.bridge.has(d) ? " leaf" : ""}${d === p.today ? " today" : ""}${d > p.today ? " future" : ""}`, days.has(d) ? "✓" : p.bridge.has(d) ? "🍃" : "");
      dot.dataset.day = "MTWTFSS"[i]; dot.dataset.date = d;
      week.append(dot);
    }
    text.append(week);
    text.append(textNode("small", "streak-leaves", p.leaves.available ? `🍃 ${p.leaves.available} rest lea${p.leaves.available === 1 ? "f" : "ves"}: cover${p.leaves.available === 1 ? "s" : ""} a missed day automatically` : "Finish a weekly quest to earn a rest leaf that covers a missed day"));
    card.replaceChildren(flame, text);
    card.classList.toggle("at-risk", s.atRisk);
    card.setAttribute("aria-label", `${title}. ${line}${s.next ? ` Next reward: ${s.next.item} at ${s.next.target} days.` : ""}`);
    card.hidden = false;
  }
  function renderQuests() {
    const box = $("home-quests");
    const { state, board } = questCache;
    if (!board) { box.hidden = true; return; }
    const rewardFor = q => {
      const claimed = state?.claimed[q.key];
      if (claimed) return [...TerraQuests.SEEDS, ...TerraQuests.DECOR].find(x => x.id === claimed.id);
      return q.scope === "daily" ? { icon: "🌱", item: "Seed packet" } : { icon: "🎁", item: "Decoration" };
    };
    const fill = (list, quests) => {
      list.replaceChildren();
      for (const q of quests) {
        const li = document.createElement("li"); li.className = `quest${q.done ? " done" : ""}`; li.dataset.quest = q.id;
        const check = textNode("span", "quest-check", q.done ? "✓" : ""); check.setAttribute("aria-hidden", "true");
        const body = document.createElement("span"); body.className = "quest-body";
        body.append(textNode("span", "quest-text", q.text));
        if (q.target > 1) { const meter = document.createElement("progress"); meter.max = q.target; meter.value = q.count; meter.setAttribute("aria-hidden", "true"); body.append(meter); }
        const reward = rewardFor(q);
        const prize = textNode("span", "quest-reward", reward.icon); prize.title = reward.item;
        li.append(check, body, prize);
        li.setAttribute("aria-label", `${q.text}. ${q.done ? "Done" : `${q.count} of ${q.target}`}. Reward: ${reward.item}.`);
        list.append(li);
      }
    };
    fill($("quest-daily"), board.daily);
    fill($("quest-weekly"), board.weekly);
    const stats = state ? TerraQuests.stats(state) : { questDays: 0 };
    $("quest-days").textContent = stats.questDays ? `${stats.questDays} quest day${stats.questDays === 1 ? "" : "s"}` : "";
    box.hidden = false;
  }
  const groupIcons = { plant: "🌿", fungus: "🍄", insect: "🐞", mammal: "🐁", bird: "🐦", fish: "🐟", reptile: "🦎", microorganism: "🦠", other: "❧" };
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
    const p = participation(records);
    lastParticipation = p;
    renderStreak(p);
    renderLevel(p);
    renderQuality(records, projects);
    if (typeof TerraValidateUI !== "undefined") TerraValidateUI.render(p);
    renderQuests();
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
      try { updateQuests(records); } catch { questCache = { state: null, board: null }; }
      renderRewards(records, projects);
      renderHome(records, projects);
      renderWorkspace(records, projects);
    } catch {
      item(posts, "Journal/projects unavailable; existing data untouched. Check storage before editing.");
      clearRewards();
      $("rewards-status").textContent = "Awards paused: journal or project data cannot be validated. No evidence invented.";
    }
  }
  for (const event of ["terra:journal-rendered", "terra:projects-rendered"]) document.addEventListener(event, refresh);
  window.addEventListener("storage", event => {
    if (event.key === PROFILE_KEY || event.key === null) loadProfile();
    if ([STORAGE_KEY, FieldSummary.KEY, TerraRewards.KEY, TerraQuests.KEY, TerraValidators.KEY, TerraRewards.STREAK_KEY, null].includes(event.key)) refresh();
  });
  // The terrarium lays itself out to the jar's width, which is 0 while Profile is hidden.
  document.addEventListener("terra:screen-shown", event => { if (event.detail.screen === "profile" || event.detail.screen === "home") refresh(); });
  loadProfile(); refresh();
  // A #terrarium link opened before this script loaded still lands on the Terrarium tab.
  if (location.hash === "#terrarium") selectTab($("awards-tab"));
})();
