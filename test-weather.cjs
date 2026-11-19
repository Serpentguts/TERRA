const assert = require('node:assert/strict');
const test = require('node:test');
const W = require('./weather.js');

const env = (season, phase = 'day', month = 10, southern = false) => ({ season, phase, month, southern });
const ids = list => list.map(e => e.id);

test('seasonal events come from real weather and the calendar', () => {
  assert.deepEqual(ids(W.events(env('autumn'), { kind: 'rain', temperature: 11 })), ['mushroom-season']);
  assert.deepEqual(ids(W.events(env('autumn'), { kind: 'cloudy', temperature: 11, precipitation: 0.6 })), ['mushroom-season'], 'recent rain counts');
  assert.deepEqual(ids(W.events(env('autumn'), { kind: 'clear', temperature: 11 })), []);
  assert.deepEqual(ids(W.events(env('spring', 'day', 3), null)), ['migration']);
  assert.deepEqual(ids(W.events(env('spring', 'day', 9, true), null)), ['migration'], 'southern spring migration in October');
  assert.deepEqual(ids(W.events(env('summer', 'night', 6), { kind: 'clear', temperature: 22 })), ['fireflies']);
  assert.deepEqual(ids(W.events(env('summer', 'night', 6), { kind: 'clear', temperature: 9 })), [], 'too cold for fireflies');
  assert.deepEqual(ids(W.events(env('summer', 'day', 6), { kind: 'storm', temperature: 25 })), ['storm']);
  assert.deepEqual(ids(W.events(env('winter', 'day', 0), { kind: 'snow', temperature: -2 })), ['snow'], 'snow day, not also frost');
  assert.deepEqual(ids(W.events(env('winter', 'day', 0), { kind: 'clear', temperature: -5 })), ['frost']);
  assert.deepEqual(ids(W.events(env('summer', 'day', 6), { kind: 'clear', temperature: 38 })), ['heat']);
  assert.deepEqual(ids(W.events(env('spring', 'day', 5), { kind: 'drizzle', temperature: 14 })), ['rainy']);
  assert.deepEqual(ids(W.events(env('autumn', 'day', 10), { kind: 'fog', temperature: 8 })), ['fog']);
  const autumnStorm = W.events(env('autumn'), { kind: 'storm', temperature: 12 });
  assert.deepEqual(ids(autumnStorm), ['mushroom-season', 'storm']);
  assert.equal(W.effect(autumnStorm, 'lightning'), true);
  assert.equal(W.boost(autumnStorm, 'glowcap'), 3);
  assert.equal(W.boost(autumnStorm, 'white-stag'), 1);
  assert.equal(W.effect([], 'fireflies'), undefined);
});

test('weather settings are validated, rounded, and refreshed at most every 30 minutes', () => {
  assert.deepEqual(W.parse(null), { version: 1, enabled: false, source: null, lat: null, lon: null, fetched: null, data: null });
  const s = W.parse(JSON.stringify({ version: 1, enabled: true, source: 'device', lat: 37.7749, lon: -122.4194, fetched: 1000, data: { kind: 'rain', temperature: 11 } }));
  assert.deepEqual([s.lat, s.lon], [37.8, -122.4]);
  assert.equal(W.stale(s, 1000 + 29 * 60000), false);
  assert.equal(W.stale(s, 1000 + 31 * 60000), true);
  assert.equal(W.stale({ ...s, data: null }, 1000), true);
  for (const bad of [{ version: 2 }, { version: 1, enabled: 'yes', source: null, lat: null, lon: null, fetched: null, data: null },
    { version: 1, enabled: true, source: 'gps', lat: 1, lon: 1, fetched: null, data: null }, { version: 1, enabled: true, source: 'device', lat: 95, lon: 1, fetched: null, data: null },
    { version: 1, enabled: true, source: 'device', lat: 1, lon: 1, fetched: 1, data: { kind: 'tornado' } }])
    assert.throws(() => W.parse(JSON.stringify(bad)), /Unsupported/);
});
