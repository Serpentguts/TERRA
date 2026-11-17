// Run with Flask on :8080. XP level card, week strip, rest leaves, level-up toast and the
// Validate tab (locked under level 2, practice answers final, tier progress). Fixed clock.
require('./test-screens.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch();
  try {
    const origin = 'http://127.0.0.1:8080', errors = [], outbound = [];
    const context = await browser.newContext({ viewport: { width: 900, height: 1100 } });
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : (outbound.push(route.request().url()), route.abort()));
    await context.addInitScript(() => { for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) window[api] = () => { throw Error('No network'); }; });
    const page = await context.newPage();
    await page.clock.install({ time: new Date(2024, 2, 13, 12, 0, 0) }); // Wednesday 13 March 2024
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const rec = (id, date, name, extra = {}) => ({ id, type: 'plant', name, notes: '', date, privacy: 'hidden', ...extra });
    const set = (key, value) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [key, value]);
    const get = key => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);

    // One find: level 1, Validate locked.
    await page.goto(origin + '/#home');
    await set('terra.observations.v1', [rec('a', '2024-03-13', 'Sword fern')]);
    await page.reload();
    assert.match(await page.locator('#home-level').textContent(), /Level 1 · Seedling.*55 XP · 45 XP to Sprout/);
    assert.equal(await page.locator('.streak-day.done').count(), 1);
    assert.equal(await page.locator('.streak-day.today.done').count(), 1);
    assert.equal(await page.locator('.streak-day.future').count(), 4, 'Thursday to Sunday still ahead');
    assert.match(await page.locator('#home-streak').textContent(), /Finish a weekly quest to earn a rest leaf/);
    await page.goto(origin + '/#profile');
    await page.click('#validate-tab');
    assert.match(await page.locator('#practice-card').textContent(), /unlock at level 2 \(Sprout, 100 XP\)/);
    assert.match(await page.locator('#validate-standing').textContent(), /Observer.*Votes don't count yet/);

    // A week of varied finds ending Monday, plus one finished weekly quest = one rest leaf.
    const week = ['2024-03-05', '2024-03-06', '2024-03-07', '2024-03-08', '2024-03-09', '2024-03-10', '2024-03-11'].map((d, i) => rec(`w${i}`, d, ['Oak', 'Fern', 'Moss', 'Lupine', 'Poppy', 'Clover', 'Dandelion'][i]));
    await set('terra.observations.v1', week);
    await set('terra.quests.v1', { version: 1, claimed: { '2024-03-04/weekly/finds5': { type: 'decor', id: 'lantern', token: 'a'.repeat(32) } }, spots: {} });
    await set('terra.streak.v1', { version: 1, used: [], level: 1 });
    await page.goto(origin + '/#home');
    // Tuesday the 12th was missed: the leaf covers it, so the 7-day streak is still alive today.
    assert.match(await page.locator('#toast').textContent(), /A rest leaf covered yesterday/);
    assert.deepEqual((await get('terra.streak.v1')).used, ['2024-03-12']);
    assert.match(await page.locator('#home-streak').textContent(), /7-day streak.*Record a find today/);
    assert.equal(await page.locator('.streak-day.leaf[data-date="2024-03-12"]').count(), 1);
    assert.match(await page.locator('#home-level').textContent(), /Level 3 · Sapling/);
    assert.equal((await get('terra.streak.v1')).level, 3, 'level remembered for level-up toasts');
    await page.reload();
    assert.deepEqual((await get('terra.streak.v1')).used, ['2024-03-12'], 'a leaf is spent once, not on every visit');

    // Validate: practice unlocked, answers final, progress tracked.
    await page.goto(origin + '/#profile');
    await page.click('#validate-tab');
    assert.match(await page.locator('#validate-standing').textContent(), /Apprentice reviewer/);
    assert.match(await page.locator('#practice-progress').textContent(), /0 of 22/);
    const answer = async correct => {
      const clue = await page.locator('.practice-clue').textContent();
      const right = await page.evaluate(c => { const p = TerraValidators.PRACTICE.find(x => x.clue === c); return p.options[p.answer]; }, clue);
      const options = await page.locator('.practice-option').allTextContents();
      await page.locator('.practice-option', { hasText: correct ? right : options.find(o => o !== right) }).first().click();
      return right;
    };
    const right = await answer(false);
    assert.match(await page.locator('.practice-result').textContent(), new RegExp(`Not quite: it's ${right}`));
    assert.equal(await page.locator('.practice-option.correct').textContent(), right);
    assert.equal(await page.locator('.practice-option:not([disabled])').count(), 0, 'no changing your answer');
    await page.reload();
    await page.click('#validate-tab');
    assert.match(await page.locator('#practice-progress').textContent(), /1 of 22/);
    assert.notEqual(await page.locator('.practice-clue').textContent(), null);
    for (let i = 0; i < 12; i++) { await answer(true); await page.click('.practice-next'); }
    const v = await get('terra.validator.v1');
    assert.equal(Object.keys(v.answers).length, 13);
    // 12 of 13 right: reliability ~0.67, level 3 → Validator with weight.
    assert.match(await page.locator('#validate-standing').textContent(), /Validator.*Vote weight 1\.1\d×/);
    assert.equal(await page.locator('.tier.current strong').textContent(), 'Validator');
    assert.match(await page.locator('#validate-standing').textContent(), /Next: Senior validator\. Needs reach level 5, 7 more reviews/);
    // Practice reviews earn XP: 13 × 2 + 12 × 3 = 62 more.
    await page.goto(origin + '/#home');
    const xp = Number((await page.locator('#home-level').textContent()).match(/(\d+) XP ·/)[1]);
    assert.ok(xp >= 62 + 300, `${xp} XP`);

    // Phone width.
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(origin + '/#profile');
    await page.click('#validate-tab');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, [], errors.join(' | '));
    await context.close();
    console.log('PASS: XP level card and week strip, rest leaf covers a missed day once, level remembered, Validate tab locked below level 2, practice answers final with feedback, tier and weight from accuracy, review XP, phone width, no network.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
