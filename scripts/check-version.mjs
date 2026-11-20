#!/usr/bin/env node
// Checks that package.json, tauri.conf.json and Cargo.toml agree on the version.
// Pass a tag (for example v0.1.0) to also check the tag matches.
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const versions = {
  "package.json": JSON.parse(read("package.json")).version,
  "src-tauri/tauri.conf.json": JSON.parse(read("src-tauri/tauri.conf.json")).version,
  "src-tauri/Cargo.toml": read("src-tauri/Cargo.toml").match(/^\[package\][^[]*?^version\s*=\s*"([^"]+)"/ms)?.[1],
};

const unique = new Set(Object.values(versions));
let ok = unique.size === 1 && !unique.has(undefined);

if (!ok) {
  console.error("Version mismatch:");
  for (const [file, v] of Object.entries(versions)) console.error(`  ${file}: ${v}`);
}

const tag = process.argv[2];
if (ok && tag) {
  const expected = `v${versions["package.json"]}`;
  if (tag !== expected) {
    console.error(`Tag ${tag} does not match the app version. Expected ${expected}.`);
    ok = false;
  }
}

if (!ok) process.exit(1);
console.log(`Version ${versions["package.json"]}${tag ? ` matches tag ${tag}` : " is consistent"}.`);
