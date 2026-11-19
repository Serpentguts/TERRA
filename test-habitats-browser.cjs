// Run with Flask on :8080. Habitat jars (locked until a matching find, remembered choice,
// residents and set rewards in their own jar) and real local weather (opt-in, rounded device
// location or latest mapped find, events banner, refresh cache). /api/weather is mocked.
require('./test-screens.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch();
  try {
    const origin = 'http://127.0.0.1:8080', errors = [], outbound = [], weatherCalls = [];
    let weather = { lat: 37.8, lon: -122.4, time: '2024-10-15T12:00', temperature: 11.2, precipitation: 0.6, snowfall: 0, cloud: 90, wind: 8, code: 61, kind: 'rain', isDay: true, source: 'Open-Meteo' };
    const context = await browser.newContext({ viewport: { width: 900, height: 1100 }, geolocation: { latitude: 37.774912, longitude: -122.419416 }, permissions: ['geolocation'] });
    await context.route('**/*', route => {
      const url = route.request().url();
      if (!url.startsWith(origin)) { outbound.push(url); return route.abort(); }
      if (new URL(url).pathname === '/api/weather') { weatherCalls.push(url); return route.fulfill({ json: weather }); }
      return route.continue();
    });
    const page = await context.newPage();
    await page.clock.install({ time: new Date(2024, 9, 15, 12, 0, 0) }); // mid-October, northern autumn
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const rec = (id, date, name, type = 'other', extra = {}) => ({ id, type, name, notes: '', date, privacy: 'hidden', ...extra });
    const debug = () => page.evaluate(() => TerraTerrarium.debug());
    const journal = list => page.evaluate(l => localStorage.setItem('terra.observations.v1', JSON.stringify(l)), list);

    await page.goto(origin + '/#home');
    await journal([rec('a', '2024-10-01', 'Sword fern', 'plant'), rec('b', '2024-10-02', 'Hermit crab'), rec('c', '2024-10-03', 'Ochre sea star'), rec('d', '2024-10-04', 'Giant green anemone'),
      rec('e', '2024-10-05', 'Red octopus'), rec('f', '2024-10-06', 'Ghost shrimp')]);
    await page.goto(origin + '/#terrarium');

    // Jars: forest open, tide pool unlocked by the crab, desert and rainforest locked with hints.
    assert.deepEqual(await page.locator('#jar-switcher button').evaluateAll(b => b.map(x => [x.dataset.jar, x.getAttribute('aria-pressed'), x.classList.contains('locked')])),
      [['forest', 'true', false], ['desert', 'false', true], ['tidepool', 'false', false], ['rainforest', 'false', true]]);
    await page.click('[data-jar="desert"]');
    assert.match(await page.locator('#jar-hint').textContent(), /Desert jar: Log a desert species/);
    assert.equal((await debug()).habitat, 'forest', 'locked jar does not open');
    let d = await debug();
    assert.deepEqual(d.residents.filter(r => r.id.startsWith('s:')).map(r => r.kind), ['fern'], 'tide-pool life is not in the forest jar');

    await page.click('[data-jar="tidepool"]');
    d = await debug();
    assert.equal(d.habitat, 'tidepool');
    assert.deepEqual(d.residents.map(r => r.kind).sort(), ['anemone', 'crab', 'octopus', 'seastar', 'shrimp']);
    assert.ok(Object.keys(d.decor).includes('d:tidepool'), 'tide-pool set reward (anchor) lives in its own jar');
    assert.equal(d.items.length, 0, 'achievement items stay in the forest jar');
    assert.match(await page.locator('#terrarium-sky').textContent(), /🦀 Autumn/);
    await page.reload();
    assert.equal((await debug()).habitat, 'tidepool', 'chosen jar remembered');
    await page.click('[data-jar="forest"]');
    assert.ok(!Object.keys((await debug()).decor).includes('d:tidepool'));

    // Weather off by default: nothing fetched.
    assert.equal(await page.locator('#weather-enabled').isChecked(), false);
    assert.equal(weatherCalls.length, 0);
    assert.equal(await page.locator('#terrarium-event').isVisible(), false);

    // Turn it on: rounded device location, rain in autumn → mushroom season.
    await page.check('#weather-enabled');
    await page.waitForFunction(() => /near you/.test(document.getElementById('weather-status').textContent));
    assert.equal(weatherCalls.length, 1);
    assert.match(weatherCalls[0], /\/api\/weather\?lat=37\.8&lon=-122\.4$/, 'only a rounded location is sent');
    assert.match(await page.locator('#weather-status').textContent(), /11°C, rain near you\. Location rounded to about 11 km\./);
    d = await debug();
    assert.deepEqual([d.weather, d.events, d.raining], ['rain', ['mushroom-season'], true]);
    assert.match(await page.locator('#terrarium-event').textContent(), /🍄 Mushroom season.*Autumn rain near you/);
    assert.match(await page.locator('#terrarium-sky').textContent(), /11°C rain near you/);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('terra.weather.v1')));
    assert.deepEqual([saved.enabled, saved.source, saved.lat, saved.lon, saved.data.kind], [true, 'device', 37.8, -122.4, 'rain']);

    // Cached for 30 minutes; refetched after.
    await page.reload();
    assert.equal(weatherCalls.length, 1, 'served from the cache');
    assert.equal((await debug()).weather, 'rain');
    weather = { ...weather, kind: 'storm', code: 95, temperature: 14 };
    await page.clock.fastForward(31 * 60 * 1000);
    await page.reload();
    await page.waitForFunction(() => TerraTerrarium.debug().weather === 'storm');
    assert.equal(weatherCalls.length, 2);
    assert.deepEqual((await debug()).events, ['mushroom-season', 'storm']);

    // Turning it off goes back to the calendar.
    await page.uncheck('#weather-enabled');
    d = await debug();
    assert.deepEqual([d.weather, d.events], [null, []]);

    // Location denied: falls back to the latest mapped observation (rounded).
    await context.clearPermissions();
    await journal([rec('m', '2024-10-07', 'Oak', 'plant', { privacy: 'exact', location: { version: 1, space: 'terra-geo-v1', kind: 'point', x: 174.763, y: -36.848 } })]);
    await page.reload();
    await page.check('#weather-enabled');
    await page.waitForFunction(() => /near you/.test(document.getElementById('weather-status').textContent), null, { timeout: 15000 });
    assert.match(weatherCalls[weatherCalls.length - 1], /lat=-36\.8&lon=174\.8$/);
    assert.match(await page.locator('#weather-status').textContent(), /from your latest mapped find/);

    // Sandbox: every jar open; weather preview drives events.
    await page.uncheck('#weather-enabled');
    await page.click('#terrarium-sandbox');
    assert.equal(await page.locator('#jar-switcher button.locked').count(), 0);
    await page.click('[data-jar="desert"]');
    await page.selectOption('#terrarium-weather', 'heat');
    assert.ok((await debug()).events.includes('heat'));
    assert.ok((await debug()).events.includes('migration'), 'latest mapped find is in New Zealand: southern spring');
    assert.ok((await debug()).residents.some(r => r.kind === 'cactus'));
    await page.click('[data-jar="forest"]');
    await page.selectOption('#terrarium-weather', 'frost');
    assert.ok((await debug()).events.includes('frost'));
    await page.click('#terrarium-sandbox');

    await page.setViewportSize({ width: 360, height: 800 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(outbound, []);
    assert.deepEqual(errors, [], errors.join(' | '));
    await context.close();
    console.log('PASS: habitat jars (locked hints, unlock by finds, remembered, residents and set rewards per jar), real weather opt-in (rounded device location, events banner, 30-minute cache, storm refresh, off → calendar, observation fallback), sandbox jar and weather previews, phone width, no outside network.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
