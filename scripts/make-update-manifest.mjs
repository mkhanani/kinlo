#!/usr/bin/env node
// Writes latest.json, the file a running kinlo reads when someone presses "Check for
// updates". It lists, for every system, where the new version is and the signature the
// app checks the download against.
//
//   node scripts/make-update-manifest.mjs v0.2.0 path/to/signatures > latest.json
//
// The folder holds the .sig files of one release, as the build wrote them. Every kind of
// download must have exactly one, or nothing is written: a release with a missing system
// would leave those people unable to update without saying why.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Each download kinlo publishes, and the names the updater looks it up by. An installed
 * app asks first for its own kind ("linux-x86_64-deb") and then for the plain system
 * ("linux-x86_64"), so every system also has one default.
 */
export const DOWNLOADS = [
  { what: "Windows installer", file: /_x64-setup\.exe$/, keys: ["windows-x86_64-nsis", "windows-x86_64"] },
  { what: "Windows MSI", file: /_x64_en-US\.msi$/, keys: ["windows-x86_64-msi"] },
  { what: "macOS Apple Silicon app", file: /_aarch64\.app\.tar\.gz$/, keys: ["darwin-aarch64-app", "darwin-aarch64"] },
  { what: "macOS Intel app", file: /_x64\.app\.tar\.gz$/, keys: ["darwin-x86_64-app", "darwin-x86_64"] },
  { what: "Linux AppImage", file: /_amd64\.AppImage$/, keys: ["linux-x86_64-appimage", "linux-x86_64"] },
  { what: "Linux .deb", file: /_amd64\.deb$/, keys: ["linux-x86_64-deb"] },
  { what: "Linux .rpm", file: /\.x86_64\.rpm$/, keys: ["linux-x86_64-rpm"] },
];

/** The version a signature says it was made for, read from its signed comment. */
export function signedVersion(signature) {
  let text;
  try {
    text = Buffer.from(signature.trim(), "base64").toString("utf8");
  } catch {
    return null;
  }
  return text.match(/^trusted comment:.*\bversion:([^\t\r\n]+)/m)?.[1] ?? null;
}

/**
 * Builds the manifest.
 *   tag         the release, such as "v0.2.0"
 *   signatures  [{ name: "kinlo_0.2.0_amd64.deb.sig", contents: "..." }]
 */
export function buildManifest({ tag, repository, signatures, now = new Date() }) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error(`"${tag}" is not a version like v0.2.0.`);
  const version = tag.slice(1);
  const problems = [];
  const platforms = {};

  for (const download of DOWNLOADS) {
    const found = signatures.filter(({ name }) => download.file.test(name.replace(/\.sig$/, "")));
    if (found.length !== 1) {
      problems.push(`${download.what}: expected one signature, found ${found.length}.`);
      continue;
    }
    const [{ name, contents }] = found;
    const asset = name.replace(/\.sig$/, "");
    const signature = contents.trim();
    const signedFor = signedVersion(signature);
    if (signedFor !== version) {
      problems.push(`${download.what}: ${name} was signed for version ${signedFor ?? "nothing"}, not ${version}.`);
      continue;
    }
    for (const key of download.keys) {
      platforms[key] = {
        signature,
        url: `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(asset)}`,
      };
    }
  }

  if (problems.length > 0) throw new Error(`The update file was not written.\n  ${problems.join("\n  ")}`);
  return { version, notes: "", pub_date: now.toISOString(), platforms };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [tag, folder] = process.argv.slice(2);
  if (!tag || !folder) {
    console.error("Usage: node scripts/make-update-manifest.mjs v0.2.0 path/to/signatures");
    process.exit(2);
  }
  try {
    const signatures = readdirSync(folder)
      .filter((name) => name.endsWith(".sig"))
      .map((name) => ({ name, contents: readFileSync(join(folder, name), "utf8") }));
    const manifest = buildManifest({
      tag,
      repository: process.env.GITHUB_REPOSITORY || "mkhanani/kinlo",
      signatures,
    });
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
