// Regenerates the raster brand icons in public/ from their SVG sources, so the
// PNG/ICO assets can never drift from the canonical vector artwork again.
//
//   public/apple-touch-icon.svg  → public/favicon.ico (16/32/48/64/96/128/256, PNG frames)
//   public/apple-touch-icon.svg  → public/icon-512.png
//   public/apple-touch-icon.svg  → public/apple-touch-icon.png (180×180, as declared in layout.tsx)
//
//   the same mark (public/favicon.svg geometry) → electron/assets/icon.png (512, rounded square),
//   icon.ico (16…256), icon.icns (macOS grid: rounded square inset in 1024, via `iconutil`, macOS
//   only) and tray-icon.png (32, dark mark with a light halo; macOS uses it as a template image).
//
// 67router: every raster comes from the app icon (light mark on a solid dark square), which
// reads on any tab strip. public/favicon.svg stays a vector-only, theme-adaptive mark.
//
// Usage:
//   npm i --no-save sharp
//   node scripts/ad-hoc/generate-brand-icons.mjs              # public/ + electron/assets/
//   node scripts/ad-hoc/generate-brand-icons.mjs --electron   # electron/assets/ only

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("sharp is required: npm i --no-save sharp");
  process.exit(1);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const publicDir = join(repoRoot, "public");
const electronDir = join(repoRoot, "electron", "assets");
const electronOnly = process.argv.includes("--electron");
const appleSvg = readFileSync(join(publicDir, "apple-touch-icon.svg"));

// apple-touch-icon.svg is authored on a 180×180 viewBox; scale density so each target
// size is rendered from the vector instead of upscaling a small raster.
// Palette quantization (8-bit, ≤256 colors) is only applied where asked:
// it keeps the ICO frames tiny, but measurably clips the antialiased
// gradient on large standalone PNGs (1242 → 253 distinct colors at 512px),
// so those stay truecolor.
const renderPng = (svg, viewBox, size, usePalette = false) =>
  sharp(svg, { density: 72 * (size / viewBox) })
    .resize(size, size)
    .png({ compressionLevel: 9, palette: usePalette, effort: 10 })
    .toBuffer();

// ICO container with PNG-compressed frames (identical layout to the icon the
// package previously shipped, but ~16 KB instead of ~141 KB).
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);

  let offset = 6 + 16 * frames.length;
  const entries = frames.map(({ size, png }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size === 256 ? 0 : size, 0); // width (0 means 256)
    e.writeUInt8(size === 256 ? 0 : size, 1); // height
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...frames.map((f) => f.png)]);
}

const icoSizes = [16, 32, 48, 64, 96, 128, 256];

if (!electronOnly) {
  const frames = [];
  for (const size of icoSizes) {
    frames.push({ size, png: await renderPng(appleSvg, 180, size, true) });
  }
  writeFileSync(join(publicDir, "favicon.ico"), buildIco(frames));

  writeFileSync(join(publicDir, "icon-512.png"), await renderPng(appleSvg, 180, 512));

  // layout.tsx declares apple-touch-icon.png as 180×180; its SVG source is
  // authored on a 180×180 viewBox.
  writeFileSync(join(publicDir, "apple-touch-icon.png"), await renderPng(appleSvg, 180, 180));

  console.log(
    `favicon.ico (${icoSizes.join("/")}), icon-512.png, apple-touch-icon.png regenerated`
  );
}

// ── Electron desktop icons ─────────────────────────────────────────────────
// The mark geometry is read from public/favicon.svg (256 viewBox) so desktop and web never drift.
const favicon = readFileSync(join(publicDir, "favicon.svg"), "utf8");
const markShapes = [...favicon.matchAll(/<(?:circle|path)\b[^>]*\/>/g)].map((m) => m[0]).join("");
if (!markShapes) throw new Error("public/favicon.svg: mark shapes not found");
const STROKE = 'fill="none" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"';

// App icon on a 1024 canvas: #0A0A0A rounded square (`inset` px margin), #FAFAFA mark. The mark
// keeps apple-touch-icon.svg's proportions (0.535 of the square, offset 21.5/18 of 180).
const appIconSvg = (inset) => {
  const side = 1024 - inset * 2;
  const k = side / 180;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">` +
      `<rect x="${inset}" y="${inset}" width="${side}" height="${side}" rx="${side * 0.225}" fill="#0a0a0a"/>` +
      `<g transform="translate(${inset + 21.5 * k} ${inset + 18 * k}) scale(${0.535 * k})" ${STROKE} stroke="#fafafa">${markShapes}</g>` +
      `</svg>`
  );
};
const fullIcon = appIconSvg(0);
// macOS icon grid: 824 px body centred in 1024 (Big Sur+ template).
const macIcon = appIconSvg(100);

// Tray: the bare mark, dark with a light halo so it reads on light and dark task bars.
const traySvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="-14 -14 284 284">` +
    `<g ${STROKE.replace('stroke-width="30"', 'stroke-width="58"')} stroke="#ffffff">${markShapes}</g>` +
    `<g ${STROKE} stroke="#141414">${markShapes}</g>` +
    `</svg>`
);

writeFileSync(join(electronDir, "icon.png"), await renderPng(fullIcon, 1024, 512));
writeFileSync(join(electronDir, "tray-icon.png"), await renderPng(traySvg, 284, 32));

const electronFrames = [];
for (const size of icoSizes) {
  electronFrames.push({ size, png: await renderPng(fullIcon, 1024, size) });
}
writeFileSync(join(electronDir, "icon.ico"), buildIco(electronFrames));

if (process.platform === "darwin") {
  const work = mkdtempSync(join(tmpdir(), "67router-icns-"));
  const iconset = join(work, "icon.iconset");
  mkdirSync(iconset);
  for (const base of [16, 32, 128, 256, 512]) {
    writeFileSync(join(iconset, `icon_${base}x${base}.png`), await renderPng(macIcon, 1024, base));
    writeFileSync(
      join(iconset, `icon_${base}x${base}@2x.png`),
      await renderPng(macIcon, 1024, base * 2)
    );
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", join(electronDir, "icon.icns")]);
  rmSync(work, { recursive: true, force: true });
  console.log("electron/assets: icon.png, icon.ico, icon.icns, tray-icon.png regenerated");
} else {
  console.log(
    "electron/assets: icon.png, icon.ico, tray-icon.png regenerated (icon.icns needs macOS iconutil)"
  );
}
