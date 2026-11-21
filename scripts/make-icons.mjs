#!/usr/bin/env node
// Builds every icon and installer image from the drawings in assets/icon/.
//
//   node scripts/make-icons.mjs
//
// To change the logo, replace the four SVG files there and run this again:
//   app.svg            the released app, 64px and larger
//   app-small.svg      the released app at 16 to 48px (heavier lines, so it still reads)
//   staging.svg        staging and dev builds, large
//   staging-small.svg  staging and dev builds, small
//
// It needs nothing beyond what the project already installs: the Tauri CLI draws the
// SVGs, and the .ico and .bmp files are written here by hand.

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const drawings = join(root, "assets", "icon");
const icons = join(root, "src-tauri", "icons");
const work = mkdtempSync(join(tmpdir(), "kinlo-icons-"));

const tauri = join(root, "node_modules", ".bin", process.platform === "win32" ? "tauri.cmd" : "tauri");
const draw = (svg, out, sizes) =>
  execFileSync(tauri, ["icon", join(drawings, svg), "-o", out, ...(sizes ? ["-p", sizes.join(",")] : [])], {
    stdio: "ignore",
    shell: process.platform === "win32",
  });

/** A Windows .ico holding the given PNG files, smallest first. */
function ico(pngPaths) {
  const images = pngPaths.map((path) => {
    const data = readFileSync(path);
    return { data, size: data.readUInt32BE(16) };
  });
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ data, size }, index) => {
    const at = 6 + 16 * index;
    header.writeUInt8(size >= 256 ? 0 : size, at); // width, 0 means 256
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt16LE(1, at + 4); // colour planes
    header.writeUInt16LE(32, at + 6); // bits per pixel
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

/** Reads an 8-bit RGBA PNG (what the Tauri CLI writes) into raw pixels. */
function readPng(path) {
  const file = readFileSync(path);
  const width = file.readUInt32BE(16);
  const height = file.readUInt32BE(20);
  if (file[24] !== 8 || file[25] !== 6 || file[28] !== 0) throw new Error(`${path} is not a plain RGBA PNG`);
  const chunks = [];
  for (let at = 8; at < file.length; ) {
    const length = file.readUInt32BE(at);
    if (file.toString("latin1", at + 4, at + 8) === "IDAT") chunks.push(file.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const corner = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner;
        const [a, b, c] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)];
        predicted = a <= b && a <= c ? left : b <= c ? up : corner;
      }
      pixels[y * stride + x] = (line[x] + predicted) & 0xff;
    }
  }
  return { width, height, pixels };
}

/** A blank picture filled top to bottom from one colour to another. */
function canvas(width, height, top, bottom = top) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const t = height > 1 ? y / (height - 1) : 0;
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) pixels[(y * width + x) * 3 + c] = Math.round(top[c] + (bottom[c] - top[c]) * t);
    }
  }
  return { width, height, pixels };
}

/** Draws an RGBA picture onto a canvas at a position, blending its transparency. */
function paste(target, image, left, top) {
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const tx = left + x;
      const ty = top + y;
      if (tx < 0 || ty < 0 || tx >= target.width || ty >= target.height) continue;
      const from = (y * image.width + x) * 4;
      const to = (ty * target.width + tx) * 3;
      const alpha = image.pixels[from + 3] / 255;
      for (let c = 0; c < 3; c++) {
        target.pixels[to + c] = Math.round(image.pixels[from + c] * alpha + target.pixels[to + c] * (1 - alpha));
      }
    }
  }
}

/** A 24-bit .bmp, the only kind the Windows installers accept. */
function bmp({ width, height, pixels }) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const file = Buffer.alloc(54 + rowSize * height);
  file.write("BM");
  file.writeUInt32LE(file.length, 2);
  file.writeUInt32LE(54, 10);
  file.writeUInt32LE(40, 14);
  file.writeInt32LE(width, 18);
  file.writeInt32LE(height, 22);
  file.writeUInt16LE(1, 26);
  file.writeUInt16LE(24, 28);
  file.writeUInt32LE(rowSize * height, 34);
  for (let y = 0; y < height; y++) {
    const row = 54 + (height - 1 - y) * rowSize; // rows are stored bottom up
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 3;
      file[row + x * 3] = pixels[from + 2]; // blue, green, red
      file[row + x * 3 + 1] = pixels[from + 1];
      file[row + x * 3 + 2] = pixels[from];
    }
  }
  return file;
}

/** One flavor: the large drawing, the small drawing, and where its files go. */
function flavor(large, small, out, keepAll) {
  const big = join(work, `${large}-big`);
  const little = join(work, `${large}-small`);
  draw(large, big);
  draw(small, little, [16, 24, 32, 48]);
  mkdirSync(out, { recursive: true });

  const names = keepAll
    ? [
        "128x128.png",
        "128x128@2x.png",
        "64x64.png",
        "icon.png",
        "icon.icns",
        "Square30x30Logo.png",
        "Square44x44Logo.png",
        "Square71x71Logo.png",
        "Square89x89Logo.png",
        "Square107x107Logo.png",
        "Square142x142Logo.png",
        "Square150x150Logo.png",
        "Square284x284Logo.png",
        "Square310x310Logo.png",
        "StoreLogo.png",
      ]
    : ["128x128.png", "128x128@2x.png", "icon.png", "icon.icns"];
  for (const name of names) copyFileSync(join(big, name), join(out, name));

  // Small sizes come from the heavier drawing.
  copyFileSync(join(little, "32x32.png"), join(out, "32x32.png"));
  writeFileSync(
    join(out, "icon.ico"),
    ico([
      join(little, "16x16.png"),
      join(little, "24x24.png"),
      join(little, "32x32.png"),
      join(little, "48x48.png"),
      join(big, "64x64.png"),
      join(big, "128x128@2x.png"), // 256px
    ]),
  );
  return { big, little };
}

const app = flavor("app.svg", "app-small.svg", icons, true);
flavor("staging.svg", "staging-small.svg", join(icons, "staging"), false);

// Pictures for the Windows installers. Sizes are fixed by the installer tools.
const installer = join(icons, "installer");
mkdirSync(installer, { recursive: true });
const DARK_TOP = [0x2c, 0x2c, 0x30];
const DARK_BOTTOM = [0x10, 0x10, 0x12];
const WHITE = [255, 255, 255];
const mark128 = readPng(join(app.big, "128x128.png"));
const mark48 = readPng(join(app.little, "48x48.png"));

// The .exe installer: a tall panel on its first and last pages, and a strip at the top
// right of the others.
const sidebar = canvas(164, 314, DARK_TOP, DARK_BOTTOM);
paste(sidebar, mark128, 18, 54);
writeFileSync(join(installer, "sidebar.bmp"), bmp(sidebar));

const header = canvas(150, 57, WHITE);
paste(header, mark48, 150 - 48 - 6, 4);
writeFileSync(join(installer, "header.bmp"), bmp(header));

// The .msi installer: text is drawn over the left of the banner and the right of the
// dialog picture, so those parts stay white.
const banner = canvas(493, 58, WHITE);
paste(banner, mark48, 493 - 48 - 8, 5);
writeFileSync(join(installer, "banner.bmp"), bmp(banner));

const dialog = canvas(493, 312, WHITE);
const panel = canvas(164, 312, DARK_TOP, DARK_BOTTOM);
for (let y = 0; y < 312; y++) panel.pixels.copy(dialog.pixels, y * 493 * 3, y * 164 * 3, (y + 1) * 164 * 3);
paste(dialog, mark128, 18, 54);
writeFileSync(join(installer, "dialog.bmp"), bmp(dialog));

rmSync(work, { recursive: true, force: true });
console.log("Icons and installer images written to src-tauri/icons.");
