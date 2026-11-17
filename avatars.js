"use strict";

// Profile pictures: a set of drawn nature icons, or the person's own photo.
// Icons are line drawings on a 24×24 grid, drawn in the same style as the tab bar.
const TerraAvatars = (() => {
  const ICONS = Object.freeze([
    { id: "mushroom", label: "Mushroom", tint: "#f4e2d6", ink: "#7a3b26",
      d: "M3 12C3 6.5 7 4 12 4s9 2.5 9 8Z M9.5 12v5.5a2.5 2 0 0 0 5 0V12 M8 8.5h.01 M12.5 7h.01 M16 9h.01" },
    { id: "leaf", label: "Leaf", tint: "#deeedb", ink: "#2d5a35",
      d: "M5 19C4 10 10 4 20 4c0 10-6 16-15 15Z M5 19l8.5-8.5 M10 14H7 M13 11V8" },
    { id: "fern", label: "Fern", tint: "#e0eee3", ink: "#25553f",
      d: "M12 21V4 M12 7.5 9 5.5 M12 7.5l3-2 M12 11.5 8 9 M12 11.5l4-2.5 M12 15.5 7 12.5 M12 15.5l5-3" },
    { id: "cactus", label: "Cactus", tint: "#e7efd6", ink: "#3f5a22",
      d: "M10 20V6a2 2 0 0 1 4 0v14 M10 14H7.5A2 2 0 0 1 5.5 12V9.5 M14 11.5h2.5a2 2 0 0 0 2-2V7 M6 20h12" },
    { id: "mantis", label: "Mantis", tint: "#e2f0d0", ink: "#3d6420",
      d: "M4 6 8.5 4.5 7.5 9Z M5.5 5.3C5 3.5 4 2.5 2.5 2 M7.6 4.8C8 3 9 2 10.5 1.8 M8 8.5l4.5 5 M9.6 10.3 6 13l1.5-3 M10.7 11.5 7.3 14.6l1.5-2.8 M12.5 13.5c4 .5 7.5 3.5 8.5 7.5-4.5 0-8-3-8.5-7.5Z M12.8 14.2 9.5 20.5 M14.3 15.6 13.2 22" },
    { id: "beetle", label: "Beetle", tint: "#e3e5f1", ink: "#2f3b6a",
      d: "M12 8c-3.5 0-6 2.5-6 6.5S8.5 21 12 21s6-2 6-6.5S15.5 8 12 8Z M12 8v13 M9.5 5.5a2.5 2.5 0 0 1 5 0V8h-5Z M6.5 12 3.5 10.5 M6 15.5H3 M7 19l-2.5 2 M17.5 12l3-1.5 M18 15.5h3 M17 19l2.5 2 M10.5 3 9 1.5 M13.5 3 15 1.5" },
    { id: "butterfly", label: "Butterfly", tint: "#f2e3f0", ink: "#6b2f62",
      d: "M12 8v12 M12 11C10 6 4 3.5 3 6.5s3 6 9 5Z M12 11c2-5 8-7.5 9-4.5s-3 6-9 5Z M12 12.5c-4 0-7 2-6 4.5s4.5 1.5 6-3Z M12 12.5c4 0 7 2 6 4.5s-4.5 1.5-6-3Z M11.5 8 9.5 4.5 M12.5 8l2-3.5" },
    { id: "snail", label: "Snail", tint: "#f2e9d6", ink: "#6e4c1f",
      d: "M2.5 19h17a2 2 0 0 0 2-2 M8 19V12a6 6 0 1 1 6 6.5 M14 18.5a4 4 0 1 1 4-4.5 M18 14a2 2 0 1 1-2-2 M5.5 19 4 13 M4 13 3 10 M4.5 13.5l2.5-3" },
    { id: "frog", label: "Frog", tint: "#d9efe4", ink: "#1f5a43",
      d: "M3 15.5c0-3.5 4-6 9-6s9 2.5 9 6-4 5-9 5-9-1.5-9-5Z M5 9.5a2.5 2.5 0 1 1 5 0 M14 9.5a2.5 2.5 0 1 1 5 0 M7.5 8.5h.01 M16.5 8.5h.01 M8 15.5c2.5 1.5 5.5 1.5 8 0" },
    { id: "owl", label: "Owl", tint: "#efe5d6", ink: "#5e4325",
      d: "M6 20V10.5a6 6 0 0 1 12 0V20Z M6 10.5 5 5l4 2.5 M18 10.5 19 5l-4 2.5 M9.5 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M14.5 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M12 13.5l-1 1.5h2Z M9 17.5h.01 M12 18h.01 M15 17.5h.01" },
    { id: "fox", label: "Fox", tint: "#f8e0cd", ink: "#8a3f12",
      d: "M4 4.5 9 9h6l5-4.5-1.5 8.5L12 20l-6.5-7Z M9.5 12.5h.01 M14.5 12.5h.01 M11 16h2l-1 1.2Z M4 4.5 6 10 M20 4.5 18 10" },
    { id: "bear", label: "Bear", tint: "#ece0d2", ink: "#5a3a22",
      d: "M12 20.5a7 6.5 0 1 0 0-13 7 6.5 0 1 0 0 13Z M7.2 9A2.5 2.5 0 1 1 5 5.8 M16.8 9A2.5 2.5 0 1 0 19 5.8 M9.5 12.5h.01 M14.5 12.5h.01 M12 18.5a2.5 2 0 1 0 0-4 2.5 2 0 1 0 0 4Z M11.3 15.6h1.4" }
  ]);
  const byId = Object.fromEntries(ICONS.map(icon => [icon.id, icon]));
  // Earlier versions stored a symbol; map each to the nearest drawn icon.
  const LEGACY = Object.freeze({ "🌿": "leaf", "🍄": "mushroom", "🐦": "owl", "❧": "fern" });
  const PHOTO_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;
  const MAX_PHOTO_CHARS = 300000;
  const SVG = "http://www.w3.org/2000/svg";

  const iconId = value => byId[value] ? value : LEGACY[value] ?? null;
  const isValid = (avatar, photo) => (photo === undefined || (typeof photo === "string" && photo.length <= MAX_PHOTO_CHARS && PHOTO_PATTERN.test(photo))) &&
    (avatar === "photo" ? typeof photo === "string" : iconId(avatar) !== null);
  const labelFor = (avatar, photo) => avatar === "photo" && photo ? "your photo" : byId[iconId(avatar) ?? "leaf"].label;

  function iconSvg(id) {
    const icon = byId[id] ?? byId.leaf;
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", icon.d);
    svg.append(path);
    return svg;
  }
  // Fill an avatar container with the chosen icon or photo.
  function render(container, avatar, photo) {
    container.replaceChildren();
    container.classList.toggle("is-photo", avatar === "photo" && !!photo);
    if (avatar === "photo" && photo) {
      const img = document.createElement("img");
      img.src = photo; img.alt = "";
      container.style.removeProperty("--avatar-tint"); container.style.removeProperty("--avatar-ink");
      container.append(img);
    } else {
      const icon = byId[iconId(avatar) ?? "leaf"];
      container.style.setProperty("--avatar-tint", icon.tint);
      container.style.setProperty("--avatar-ink", icon.ink);
      container.append(iconSvg(icon.id));
    }
  }
  // Crop to a centred square and shrink to 256px. Re-encoding drops all file metadata,
  // including any location the camera stored.
  async function photoFromFile(file) {
    if (!(file instanceof File) || !file.type.startsWith("image/")) throw Error("Choose an image file (JPEG, PNG, WebP, GIF or AVIF).");
    if (file.size > 15 * 1024 * 1024) throw Error("That image is over 15 MB. Choose a smaller one.");
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode().catch(() => { throw Error("That image couldn't be opened. Try a different file."); });
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      if (!side) throw Error("That image couldn't be opened. Try a different file.");
      const size = Math.min(256, side);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size); // Transparent PNGs get a white background.
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
      for (const quality of [0.85, 0.7, 0.5]) {
        const data = canvas.toDataURL("image/jpeg", quality);
        if (data.length <= MAX_PHOTO_CHARS && PHOTO_PATTERN.test(data)) return data;
      }
      throw Error("That image couldn't be made small enough. Try a different file.");
    } finally { URL.revokeObjectURL(url); }
  }
  return Object.freeze({ ICONS, LEGACY, iconId, isValid, labelFor, iconSvg, render, photoFromFile });
})();
if (typeof module !== "undefined") module.exports = TerraAvatars;
