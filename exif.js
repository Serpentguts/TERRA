"use strict";

// Minimal EXIF reader for JPEG photos: GPS position and the time the photo was taken.
// Many phones keep these in photos you pick from the gallery; some browsers strip GPS on upload,
// in which case TERRA falls back to your device's location at upload time (if you allow it).
const TerraExif = (() => {
  function read(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return {};
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset), size = view.getUint16(offset + 2);
      if (marker === 0xFFE1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966) return tiff(view, offset + 10, Math.min(view.byteLength, offset + 2 + size));
      if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) break;
      offset += 2 + size;
    }
    return {};
  }
  function tiff(view, start, end) {
    if (start + 8 > end) return {};
    const little = view.getUint16(start) === 0x4949;
    const u16 = o => view.getUint16(o, little), u32 = o => view.getUint32(o, little);
    const inRange = o => o >= start && o < end;
    const entries = ifd => {
      const out = {};
      if (!inRange(ifd + 2)) return out;
      const count = u16(ifd);
      for (let i = 0; i < count && i < 200; i++) {
        const e = ifd + 2 + i * 12;
        if (!inRange(e + 12)) break;
        out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 };
      }
      return out;
    };
    // Values of 4 bytes or fewer are stored inline in the entry; larger ones at an offset.
    const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    const valueAt = entry => (SIZE[entry.type] ?? 1) * entry.count <= 4 ? entry.at : start + u32(entry.at);
    const ascii = entry => { if (!entry) return null; const o = valueAt(entry); let s = ""; for (let i = 0; i < entry.count - 1 && inRange(o + i); i++) s += String.fromCharCode(view.getUint8(o + i)); return s; };
    const rationals = entry => { if (!entry) return null; const o = valueAt(entry), out = []; for (let i = 0; i < entry.count; i++) { if (!inRange(o + i * 8 + 7)) return null; const d = u32(o + i * 8 + 4); out.push(d ? u32(o + i * 8) / d : 0); } return out; };
    const root = entries(start + u32(start + 4));
    const result = {};
    const exif = root[0x8769] && entries(start + u32(root[0x8769].at));
    const taken = ascii(exif?.[0x9003]) ?? ascii(root[0x0132]);
    const m = taken && taken.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/);
    if (m) result.taken = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
    if (root[0x8825]) {
      const gps = entries(start + u32(root[0x8825].at));
      const lat = rationals(gps[2]), lon = rationals(gps[4]);
      const latRef = ascii(gps[1]) ?? "N", lonRef = ascii(gps[3]) ?? "E";
      const deg = v => v && v.length === 3 ? v[0] + v[1] / 60 + v[2] / 3600 : null;
      let la = deg(lat), lo = deg(lon);
      if (la !== null && lo !== null && (la !== 0 || lo !== 0)) {
        if (/S/i.test(latRef)) la = -la;
        if (/W/i.test(lonRef)) lo = -lo;
        if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) { result.lat = Math.round(la * 1e5) / 1e5; result.lon = Math.round(lo * 1e5) / 1e5; }
      }
    }
    return result;
  }
  return Object.freeze({ read });
})();
if (typeof module !== "undefined") module.exports = TerraExif;
