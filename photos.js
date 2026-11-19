"use strict";

// Observation photos, kept only in this browser (IndexedDB, which holds far more than the
// journal's localStorage). Each photo is re-encoded as JPEG, which drops all file metadata
// including any GPS location, and stored twice: a viewing copy (longest side 1280px) and a
// square thumbnail for grids. Nothing is uploaded. Journal backups don't include photos yet.
const TerraPhotos = (() => {
  const DB = "terra-photos", STORE = "photos", MAX_PER_OBSERVATION = 4;
  let opening = null;
  function open() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) { reject(Error("unavailable")); return; }
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("observationId", "observationId");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? Error("unavailable"));
      request.onblocked = () => reject(Error("blocked"));
    });
    opening.catch(() => { opening = null; });
    return opening;
  }
  const done = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error ?? Error("failed")); });
  const all = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });

  async function encode(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const draw = (w, h, sx, sy, sw, sh) => {
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error("encode")), "image/jpeg", 0.82));
      };
      const { naturalWidth: w, naturalHeight: h } = img;
      if (!w || !h) throw Error("decode");
      const scale = Math.min(1, 1280 / Math.max(w, h)), side = Math.min(w, h), thumb = Math.min(360, side);
      return {
        full: await draw(Math.round(w * scale), Math.round(h * scale), 0, 0, w, h),
        thumb: await draw(thumb, thumb, (w - side) / 2, (h - side) / 2, side, side)
      };
    } finally { URL.revokeObjectURL(url); }
  }
  // Save up to four photos for an observation. Returns how many were saved.
  async function save(observationId, files) {
    const images = files.filter(file => file instanceof Blob && file.type.startsWith("image/")).slice(0, MAX_PER_OBSERVATION);
    if (!images.length) return 0;
    const encoded = [];
    for (const file of images) { try { encoded.push(await encode(file)); } catch { /* Skip images the browser can't open. */ } }
    if (!encoded.length) return 0;
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    encoded.forEach((photo, index) => store.put({ id: `${observationId}:${index}`, observationId, index, ...photo, savedAt: new Date().toISOString() }));
    await done(tx);
    document.dispatchEvent(new CustomEvent("terra:photos-changed", { detail: { observationId } }));
    return encoded.length;
  }
  async function forObservation(observationId) {
    const db = await open();
    const rows = await all(db.transaction(STORE).objectStore(STORE).index("observationId").getAll(observationId));
    return rows.sort((a, b) => a.index - b.index);
  }
  // First thumbnail for each observation id, for grids and lists.
  async function covers(ids) {
    const db = await open();
    const rows = await all(db.transaction(STORE).objectStore(STORE).getAll());
    const wanted = new Set(ids), map = new Map();
    for (const row of rows.sort((a, b) => a.index - b.index)) if (wanted.has(row.observationId) && !map.has(row.observationId)) map.set(row.observationId, row.thumb);
    return map;
  }
  // How many photos each observation has, for exports.
  async function counts() {
    const db = await open();
    const rows = await all(db.transaction(STORE).objectStore(STORE).getAll());
    const map = new Map();
    for (const row of rows) map.set(row.observationId, (map.get(row.observationId) ?? 0) + 1);
    return map;
  }
  async function remove(observationIds) {
    if (!observationIds.length) return;
    const db = await open();
    // Find the keys first, then delete in one transaction without waiting in between.
    const ids = new Set(observationIds);
    const rows = await all(db.transaction(STORE).objectStore(STORE).getAll());
    const tx = db.transaction(STORE, "readwrite");
    for (const row of rows) if (ids.has(row.observationId)) tx.objectStore(STORE).delete(row.id);
    await done(tx);
    document.dispatchEvent(new CustomEvent("terra:photos-changed", { detail: {} }));
  }
  return Object.freeze({ save, forObservation, covers, counts, remove, MAX_PER_OBSERVATION });
})();
