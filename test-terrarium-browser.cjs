// Run with Flask on :8080. Living terrarium: sandbox, speed, highlighting, moving decorations,
// mushroom and bird life cycles, reduced motion. No network APIs; map tiles are not involved.
require('./test-screens.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch();
  try {
    const origin = 'http://127.0.0.1:8080', errors = [], outbound = [];
    const context = await browser.newContext({ viewport: { width: 900, height: 1000 } });
    await context.route('**/*', route => {
      if (route.request().url().startsWith(origin)) return route.continue();
      outbound.push(route.request().url()); return route.abort();
    });
    await context.addInitScript(() => {
      for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) window[api] = () => { throw Error('No network'); };
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const R = 'terra.rewards.v1';
    const debug = () => page.evaluate(() => TerraTerrarium.debug());
    const rewards = async () => JSON.parse(await page.evaluate(R => localStorage.getItem(R), R));

    // An empty journal shows an empty jar; the sandbox fills it without earning or saving anything.
    await page.goto(origin + '/#terrarium');
    assert.equal(await page.locator('#awards-tab').getAttribute('aria-selected'), 'true');
    assert.deepEqual((await debug()).items, []);
    await page.click('#terrarium-sandbox');
    assert.equal(await page.locator('#terrarium-sandbox').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#terrarium-sandbox-note').isVisible(), true);
    assert.equal((await debug()).items.length, 14);
    assert.equal(await page.evaluate(R => localStorage.getItem(R), R), null, 'Sandbox earns nothing');
    assert.equal(await page.locator('#decor-list .collection-find').count(), 14);

    // Speed controls; pausing stops the clock.
    await page.click('.terrarium-speed [data-speed="0"]');
    assert.equal((await debug()).paused, true);
    await page.click('.terrarium-speed [data-speed="16"]');
    assert.deepEqual([(await debug()).paused, (await debug()).speed], [false, 16]);
    assert.equal(await page.locator('.terrarium-speed [aria-pressed="true"]').getAttribute('data-speed'), '16');
    await page.click('.terrarium-speed [data-speed="0"]');

    // Life cycles: mushrooms pin, fruit and decay along a growing mycelium; the bird can be poisoned and hatches again.
    const seen = new Set(), phases = new Set();
    const states = ['perch', 'fly', 'ground', 'peck', 'sick', 'dead', 'egg', 'chick'], stages = ['pin', 'growing', 'mature', 'decaying'];
    for (let i = 0; i < 1500 && !(states.every(s => seen.has(s)) && stages.every(p => phases.has(p))); i++) {
      await page.evaluate(() => TerraTerrarium.step(2));
      const d = await debug();
      seen.add(d.bird.state); for (const f of d.fruits) phases.add(f.phase);
    }
    for (const state of states) assert.ok(seen.has(state), `bird reached ${state}`);
    for (const phase of stages) assert.ok(phases.has(phase), `mushroom reached ${phase}`);
    assert.ok((await debug()).mycelium > 40, 'Mycelium network grows');

    // "Show in terrarium" highlights an item and describes what it's doing.
    await page.locator('#decor-list [data-achievement="obs5"] .collection-find').click();
    assert.equal((await debug()).selected, 'obs5');
    assert.match(await page.locator('#terrarium-caption').textContent(), /^Toadstool: (\d mushrooms? fruiting|resting as mycelium underground)/);
    assert.equal(await page.locator('#terrarium-live').textContent(), await page.locator('#terrarium-caption').textContent());
    await page.locator('#decor-list [data-achievement="first"] .collection-find').click();
    assert.match(await page.locator('#terrarium-caption').textContent(), /Sprout: growth stage 6 of 6/);
    await page.locator('#decor-list [data-achievement="followers10"] .collection-find').click();
    assert.match(await page.locator('#terrarium-caption').textContent(), /^Songbird: /);

    // Sandbox moves stay in the sandbox.
    await page.locator('#decor-list [data-achievement="projects3"] .collection-find').click();
    const before = (await debug()).decor.projects3;
    await page.locator('#terrarium-canvas').focus(); await page.keyboard.press('ArrowRight');
    assert.ok((await debug()).decor.projects3.x > before.x);
    assert.equal(await page.evaluate(R => localStorage.getItem(R), R), null);
    await page.click('#terrarium-sandbox');
    assert.deepEqual((await debug()).items, []);

    // An earned decoration remembers where you drag or arrow it.
    await page.evaluate(R => localStorage.setItem(R, JSON.stringify({ version: 1, grants: [{ badge: 'project', token: 'ab'.repeat(16), placed: true }] })), R);
    await page.reload();
    assert.deepEqual((await debug()).items, ['project']);
    await page.locator('#decor-list [data-achievement="project"] .collection-find').click();
    await page.locator('#terrarium-canvas').focus();
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    let saved = (await rewards()).grants[0];
    assert.equal(saved.x, Math.round(((await debug()).decor.project.x) * 1000) / 1000);
    const box = await page.locator('#terrarium-canvas').boundingBox();
    const start = await page.evaluate(() => { const d = TerraTerrarium.debug().decor.project; return d; });
    const ground = box.height * 0.68;
    const sx = box.x + start.x * box.width, sy = box.y + ground + 4 + start.y * (box.height - ground) * 0.45 - 11;
    await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.8, sy, { steps: 5 }); await page.mouse.up();
    saved = (await rewards()).grants[0];
    assert.ok(Math.abs(saved.x - 0.8) < 0.03, `dragged to ${saved.x}`);
    await page.reload();
    assert.ok(Math.abs((await debug()).decor.project.x - saved.x) < 0.001, 'Position survives a reload');
    assert.match(await page.locator('#terrarium-canvas').getAttribute('aria-label'), /Your terrarium, 1 item on display: Spiral shell\./);
    await page.keyboard.press('Escape');

    // Reduced motion starts paused and says so.
    const calm = await browser.newContext({ reducedMotion: 'reduce' });
    const still = await calm.newPage();
    await still.goto(origin + '/#terrarium');
    assert.equal(await still.evaluate(() => TerraTerrarium.debug().paused), true);
    assert.match(await still.locator('#terrarium-caption').textContent(), /Paused because your device prefers reduced motion/);
    assert.equal(await still.locator('.terrarium-speed [aria-pressed="true"]').getAttribute('data-speed'), '0');
    await calm.close();

    assert.deepEqual(errors, [], errors.join(' | '));
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS: living terrarium sandbox (all items, nothing saved), speed/pause, mushroom pin→fruit→decay with growing mycelium, bird peck/poison/egg/chick, highlight + descriptions, keyboard and drag moves saved and restored, reduced-motion pause, no network.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
