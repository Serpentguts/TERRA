"use strict";

// Real local weather for the jar, and seasonal events built from weather + calendar.
// Off until you turn it on. Uses a location rounded to 0.1° (about 11 km): your device's,
// if you allow it, or else your latest mapped observation's. Fetched through the TERRA server
// (/api/weather → Open-Meteo) at most every 30 minutes, and cached here.
const TerraWeather = (() => {
  const KEY = "terra.weather.v1", MAX_AGE = 30 * 60 * 1000;
  const KINDS = ["clear", "cloudy", "fog", "drizzle", "rain", "snow", "storm"];
  const round1 = n => Math.round(n * 10) / 10;

  function parse(raw) {
    const empty = { version: 1, enabled: false, source: null, lat: null, lon: null, fetched: null, data: null };
    if (raw === null) return empty;
    const s = JSON.parse(raw);
    const okCoord = (v, lim) => v === null || (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim);
    if (!s || s.version !== 1 || typeof s.enabled !== "boolean" || ![null, "device", "observation"].includes(s.source) || !okCoord(s.lat, 90) || !okCoord(s.lon, 180) ||
        !(s.fetched === null || Number.isFinite(s.fetched)) || !(s.data === null || (typeof s.data === "object" && KINDS.includes(s.data.kind))))
      throw Error("Unsupported or damaged weather data");
    return { ...empty, ...s, lat: s.lat === null ? null : round1(s.lat), lon: s.lon === null ? null : round1(s.lon) };
  }
  const stale = (state, now = Date.now()) => !state.data || !state.fetched || now - state.fetched > MAX_AGE;

  // Seasonal events. env: { season, phase, month (0–11), southern }; weather: { kind, temperature, precipitation } or null.
  function events(env, weather) {
    const list = [], w = weather ?? null, t = w?.temperature, wet = w && (["drizzle", "rain", "storm"].includes(w.kind) || (w.precipitation ?? 0) > 0);
    const add = (id, name, icon, text, effects) => list.push({ id, name, icon, text, effects });
    if (env.season === "autumn" && wet) add("mushroom-season", "Mushroom season", "🍄", "Autumn rain near you: mushrooms are fruiting everywhere, and glowing ones are three times likelier.", { mushroomFlush: true, rareBoost: { glowcap: 3 } });
    const migration = env.southern ? [8, 9, 10] : [2, 3, 4];
    if (migration.includes(env.month) && env.season === "spring") add("migration", "Spring migration", "🐦", "Migrating birds are passing through. Watch the sky above the jar.", { migrants: true });
    if (env.season === "summer" && env.phase === "night" && (t === undefined || t === null || t >= 15)) add("fireflies", "Firefly night", "✨", "A warm summer night: twice the fireflies.", { fireflies: 2 });
    if (w?.kind === "storm") add("storm", "Thunderstorm", "⛈️", "A storm near you. Lightning, then a flush of mushrooms.", { lightning: true, mushroomFlush: true });
    if (w?.kind === "fog") add("fog", "Foggy day", "🌫️", "Fog near you. The jar is misty and quiet, and the moonlight moth is likelier at night.", { fog: true, rareBoost: { "luna-moth": 2 } });
    if (w?.kind === "snow") add("snow", "Snow day", "☃️", "It's snowing near you.", { snow: true });
    else if (typeof t === "number" && t <= 0) add("frost", "Frost", "❄️", "Below freezing near you: frost on every leaf.", { frost: true });
    if (typeof t === "number" && t >= 32) add("heat", "Heat wave", "☀️", "Hot near you: lizards are basking, and the desert jar shimmers.", { shimmer: true });
    if (["drizzle", "rain"].includes(w?.kind) && env.season !== "autumn") add("rainy", "Rainy day", "🌧️", "Rain near you: snails and frogs are out, and mushrooms grow faster.", { mushroomFlush: true });
    return list;
  }
  const effect = (list, name) => list.reduce((v, e) => e.effects[name] ?? v, undefined);
  const boost = (list, id) => list.reduce((m, e) => m * (e.effects.rareBoost?.[id] ?? 1), 1);

  async function fetchWeather(lat, lon) {
    const response = await fetch(`/api/weather?lat=${round1(lat)}&lon=${round1(lon)}`);
    let body = null;
    try { body = await response.json(); } catch { /* Non-JSON error. */ }
    if (!response.ok || !body || !KINDS.includes(body.kind)) throw Error(body?.message ?? "Couldn't get local weather right now.");
    return { kind: body.kind, temperature: body.temperature, precipitation: body.precipitation, time: body.time, source: body.source };
  }
  return Object.freeze({ KEY, KINDS, MAX_AGE, parse, stale, events, effect, boost, fetchWeather, round1 });
})();
if (typeof module !== "undefined") module.exports = TerraWeather;
