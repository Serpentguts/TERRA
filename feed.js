"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const node = (tag, text, className = "") => element(tag, className, text);
  const read = () => TerraFeed.parse(localStorage.getItem(TerraFeed.KEY));
  const activeRecords = () => TerraData.active(readObservations());
  let readable = false;
  function error(message = "") { showError($("feed-form-error"), message); }
  function write(change) {
    try {
      const next = change(read()); // Re-read so sequential edits in other tabs are retained.
      localStorage.setItem(TerraFeed.KEY, JSON.stringify(TerraFeed.parse(JSON.stringify(next))));
      return true;
    } catch {
      error("Local feed change could not be saved. Draft and existing data kept. Storage may be blocked, full or damaged; do not clear site data.");
      return false;
    }
  }
  function sourceSummary(record) {
    return `Observation: ${categories[record.type]} · ${record.date}. Discovery / finding: ${record.name} · unverified, no identification history yet. Where: ${privacyLabels[record.privacy]}; location values withheld from this demo. Notes and photos not copied.`;
  }
  function syncComposer() {
    const observation = $("feed-type").value === "observation";
    $("feed-source-field").hidden = !observation;
    $("feed-source").disabled = !observation;
    $("feed-source").required = observation;
    $("feed-to-inat").disabled = !observation;
    if (!observation) $("feed-to-inat").checked = false;
    try {
      const record = activeRecords().find(r => r.id === $("feed-source").value);
      $("feed-source-preview").textContent = record ? sourceSummary(record) : "Choose an active saved observation. No record has been selected automatically.";
    } catch { $("feed-source-preview").textContent = "Journal unavailable. Observation sharing is paused; journal data unchanged."; }
  }
  function refreshSources() {
    const selected = $("feed-source").value;
    $("feed-source").replaceChildren(new Option("Choose a saved observation…", ""));
    try {
      for (const record of activeRecords()) $("feed-source").add(new Option(`${record.name} · ${record.date}`, record.id));
      $("feed-source").value = selected;
    } catch { /* Fail closed; other post types and mock profiles can still work. */ }
    syncComposer();
  }
  function link(href, text) { const a = node("a", text); a.href = href; return a; }
  function sampleCard(sample) {
    const card = node("li", undefined, "observation-card");
    const author = TerraFeed.profiles.find(p => p.id === sample.author);
    card.append(node("p", `FICTIONAL DEMO · ${TerraFeed.types[sample.type]} · Not published`, "demo-purpose"),
      link(`#demo-profile-${author.id}`, `${author.icon} ${author.name}`), node("h4", sample.title), node("p", sample.body));
    return card;
  }
  // Fixed samples and profiles have no storage side effects on startup.
  for (const sample of TerraFeed.samples) $("feed-samples").append(sampleCard(sample));
  for (const profile of TerraFeed.profiles) {
    const card = node("section", undefined, "mock-profile observation-card");
    card.id = `demo-profile-${profile.id}`; card.tabIndex = -1;
    const heading = node("h4", `${profile.icon} ${profile.name}`);
    heading.id = `${card.id}-title`; card.setAttribute("aria-labelledby", heading.id);
    const follow = node("button", "Follow locally", "secondary-button");
    follow.type = "button"; follow.dataset.follow = profile.id;
    follow.addEventListener("click", () => {
      error();
      if (!write(state => ({ ...state, following: state.following.includes(profile.id) ? state.following.filter(id => id !== profile.id) : [...state.following, profile.id] }))) return;
      render();
      $("feed-status").textContent = `${profile.name}: local follow preference saved. No real account followed or notified.`;
    });
    const posts = node("ul", undefined, "feed-cards");
    for (const sample of TerraFeed.samples.filter(p => p.author === profile.id)) posts.append(sampleCard(sample));
    card.append(heading, node("p", profile.bio), follow, node("h5", "Fictional posts from this mock profile"), posts, link("#feed-title", "Back to demo feed"));
    $("feed-profiles").append(card);
  }
  function localCard(post, records, preparation) {
    const card = node("li", undefined, "observation-card");
    card.dataset.postId = post.id;
    card.append(node("p", preparation ? "LOCAL PREPARATION · iNaturalist NOT SUBMITTED" : "LOCAL TERRA DEMO · NOT PUBLISHED", "demo-purpose"),
      link("#profile", "Your local profile · not a public account"), node("h4", post.title), node("p", `${TerraFeed.types[post.type]} · Saved locally ${new Date(post.createdAt).toLocaleString()}`), node("p", post.body));
    if (post.observationId) {
      const record = records?.find(r => r.id === post.observationId);
      card.append(node("p", record ? sourceSummary(record) : "Source observation unavailable (in Trash, removed, or journal unreadable). No saved snapshot or identification is shown."));
      if (record) card.append(link("#saved-title", "Review original journal record / provenance"));
    }
    if (post.type === "offering") card.append(node("p", "Demo offering only · not available to buy · no transaction."));
    if (preparation) card.append(node("p", "Review checklist: confirm organism/finding and date, review privacy, choose an appropriate real location and photos separately. No external request or submission was made. This is not an export or an upload-ready payload."));
    const remove = node("button", "Remove local post / preparation", "text-button"); remove.type = "button";
    remove.setAttribute("aria-label", `Remove local post / preparation: ${post.title}`);
    remove.addEventListener("click", () => {
      error();
      if (!write(state => ({ ...state, posts: state.posts.filter(p => p.id !== post.id) }))) return;
      render(); $("feed-status").textContent = "Local post and its preparation removed. Original journal record unchanged.";
      $("feed-save").focus();
    });
    card.append(remove);
    return card;
  }
  function render() {
    let state;
    try { state = read(); readable = true; showError($("feed-storage-error"), ""); }
    catch {
      readable = false;
      showError($("feed-storage-error"), "Local feed storage is blocked or damaged. Feed editing paused; existing data untouched. Journal and fictional samples are independent. Do not clear site data.");
    }
    $("feed-save").disabled = !readable;
    for (const button of document.querySelectorAll("[data-follow]")) {
      const followed = state?.following.includes(button.dataset.follow) || false;
      button.disabled = !readable;
      button.textContent = followed ? "Unfollow locally" : "Follow locally";
      button.setAttribute("aria-pressed", String(followed));
      button.setAttribute("aria-label", `${button.textContent}: ${TerraFeed.profiles.find(p => p.id === button.dataset.follow).name}`);
    }
    $("feed-follow-summary").textContent = state ? `${state.following.length} mock profiles followed locally · not a real following count. All fictional samples stay visible.` : "Local follow preferences unavailable.";
    $("feed-local-posts").replaceChildren(); $("feed-preparations").replaceChildren();
    let records;
    try { records = activeRecords(); } catch { /* Never use stale journal details. */ }
    if (state) for (const post of [...state.posts].reverse()) {
      if (post.terra) $("feed-local-posts").append(localCard(post, records, false));
      if (post.inaturalist) $("feed-preparations").append(localCard(post, records, true));
    }
    for (const id of ["feed-local-posts", "feed-preparations"]) if (!$(id).children.length) $(id).append(node("li", readable ? "None saved locally yet." : "Local items unavailable; existing data kept."));
    refreshSources();
  }
  function reset() { $("feed-form").reset(); error(); syncComposer(); }
  $("feed-type").addEventListener("change", () => { error(); syncComposer(); });
  $("feed-source").addEventListener("change", syncComposer);
  $("feed-reset").addEventListener("click", () => { reset(); $("feed-type").focus(); });
  $("feed-form").addEventListener("submit", event => {
    event.preventDefault(); error();
    const post = { id: crypto.randomUUID(), type: $("feed-type").value, title: $("feed-post-title").value.trim(), body: $("feed-body").value.trim(),
      observationId: $("feed-type").value === "observation" ? $("feed-source").value : null,
      terra: $("feed-to-terra").checked, inaturalist: $("feed-to-inat").checked, createdAt: new Date().toISOString() };
    if (!TerraFeed.validPost(post)) { error("Add a title, choose a saved observation when needed, and select at least one local destination."); return; }
    if (post.observationId) {
      try {
        const record = activeRecords().find(r => r.id === post.observationId);
        if (!record || !TerraData.observationDate(record.date)) throw Error("Unavailable source");
      } catch { error("The source observation is unavailable or has a future date. Nothing saved; review the journal and choose an active record."); refreshSources(); return; }
    }
    if (!write(state => ({ ...state, posts: [...state.posts, post] }))) return;
    reset(); render();
    $("feed-status").textContent = `Saved locally: ${post.terra ? "TERRA demo post · NOT PUBLISHED" : "no TERRA post"}${post.inaturalist ? "; iNaturalist preparation · NOT SUBMITTED" : ""}. Journal unchanged; nothing sent externally.`;
    $("feed-post-title").focus();
  });
  document.addEventListener("click", event => {
    const share = event.target.closest("[data-share-observation]");
    if (!share || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    // Reuse the composer without replacing a caption draft or chosen destinations.
    $("feed-type").value = "observation"; refreshSources();
    $("feed-source").value = share.dataset.shareObservation; syncComposer();
    $("feed-post-title").focus();
    $("feed-status").textContent = "Saved observation selected for review. Add a caption and choose destinations; nothing shared until you save this local demo.";
  });
  document.addEventListener("terra:journal-rendered", render);
  window.addEventListener("storage", event => { if ([TerraFeed.KEY, STORAGE_KEY, null].includes(event.key)) render(); });
  render();
})();
