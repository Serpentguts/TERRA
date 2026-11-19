"use strict";

// Validate tab: your review tier, vote weight and the practice queue. Rendered by profile.js
// with the participation summary; answering a practice card asks profile.js to refresh.
const TerraValidateUI = (() => {
  const $ = id => document.getElementById(id);
  const V = TerraValidators;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  let feedback = null; // { id, choice } for the card just answered, until "Next".
  // Shuffle each card's options the same way every time, so the answer isn't always in one spot.
  const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const order = item => item.options.map((_, i) => i).sort((a, b) => hash(`${item.id}:${a}`) - hash(`${item.id}:${b}`));
  const pct = n => `${Math.round(n * 100)}%`;

  function render(p) {
    const { standing, review, xp, validator } = p;
    // Standing.
    const box = $("validate-standing");
    box.replaceChildren();
    const head = el("div", "standing-head");
    head.append(el("strong", "", standing.tier.name), el("span", `standing-weight${standing.weight ? "" : " none"}`, standing.weight ? `Vote weight ${standing.weight}×` : "Votes don't count yet"));
    box.append(head, el("p", "", standing.tier.perk));
    const stats = el("dl", "standing-stats");
    for (const [k, v] of [["Level", `${xp.level} · ${xp.name}`], ["Reviews", String(review.reviews)], ["Right", review.reviews ? `${review.correct} (${pct(review.accuracy)})` : "–"], ["Reliability", review.reviews ? pct(review.reliability) : "–"]]) stats.append(el("dt", "", k), el("dd", "", v));
    box.append(stats);
    if (standing.next) box.append(el("p", "standing-next", `Next: ${standing.next.name}. Needs ${standing.needs.join(", ")}.`));
    // Tier ladder.
    const ladder = $("validate-tiers");
    ladder.replaceChildren(...V.TIERS.map(t => {
      const reached = V.TIERS.indexOf(t) <= V.TIERS.indexOf(standing.tier);
      const li = el("li", `tier${reached ? " reached" : ""}${t === standing.tier ? " current" : ""}`);
      const req = [`Level ${t.minLevel}`, ...(t.minReviews ? [`${t.minReviews} reviews`] : []), ...(t.minReliability ? [`${pct(t.minReliability)} reliability`] : [])].join(" · ");
      li.append(el("span", "tier-mark", reached ? "✓" : "🔒"), el("strong", "", t.name), el("small", "", req));
      if (t === standing.tier) li.setAttribute("aria-current", "step");
      return li;
    }));
    // Practice queue.
    const card = $("practice-card"), progress = $("practice-progress");
    card.replaceChildren();
    progress.textContent = `${review.reviews} of ${V.PRACTICE.length} practice cards reviewed.`;
    if (xp.level < 2) {
      card.append(el("p", "practice-locked", `🔒 Practice reviews unlock at level 2 (Sprout, 100 XP). You have ${xp.xp} XP: record a few observations to get there.`));
      return;
    }
    const item = feedback ? V.PRACTICE.find(x => x.id === feedback.id) : V.PRACTICE.find(x => !Object.hasOwn(validator.answers, x.id));
    if (!item) { card.append(el("p", "practice-done", "You've reviewed every practice card. Your track record is set until community reviews open.")); return; }
    card.append(el("span", "practice-group", item.group === "other" ? "amphibian" : item.group), el("p", "practice-clue", item.clue));
    const choices = el("div", "practice-options");
    choices.setAttribute("role", "group"); choices.setAttribute("aria-label", "Your identification");
    for (const i of order(item)) {
      const b = el("button", "practice-option", item.options[i]);
      b.type = "button"; b.dataset.option = String(i);
      if (feedback) {
        b.disabled = true;
        if (i === item.answer) b.classList.add("correct");
        else if (i === feedback.choice) b.classList.add("wrong");
      } else b.addEventListener("click", () => choose(item, i));
      choices.append(b);
    }
    card.append(choices);
    if (feedback) {
      const right = feedback.choice === item.answer;
      card.append(el("p", `practice-result ${right ? "right" : "wrong"}`, `${right ? "✓ Right." : `✗ Not quite: it's ${item.options[item.answer]}.`} ${item.why}`));
      const next = el("button", "primary-button practice-next", "Next card");
      next.type = "button";
      next.addEventListener("click", () => { feedback = null; document.dispatchEvent(new CustomEvent("terra:participation-changed")); requestAnimationFrame(() => $("practice-card").querySelector(".practice-option")?.focus()); });
      card.append(next);
    }
  }

  function choose(item, choice) {
    try {
      const state = V.parse(localStorage.getItem(V.KEY));
      const next = V.answer(state, item.id, choice);
      if (next !== state) localStorage.setItem(V.KEY, JSON.stringify(next));
      feedback = { id: item.id, choice: next.answers[item.id] ?? choice };
    } catch {
      $("practice-progress").textContent = "Your review couldn't be saved (browser storage blocked or damaged). Nothing was changed.";
      return;
    }
    document.dispatchEvent(new CustomEvent("terra:participation-changed"));
    requestAnimationFrame(() => $("practice-card").querySelector(".practice-next")?.focus());
  }
  return Object.freeze({ render });
})();
