#!/usr/bin/env node
// Desktop smoke test. Launches the real app on whatever system this runs on, walks the
// welcome setup and adds a person using only the keyboard, takes screenshots along the
// way, then reads the app's database to check what actually happened.
//
// Used by the "Desktop smoke" workflow on Windows, macOS and Linux. Expects a debug
// build of the staging flavor: npx tauri build --debug --no-bundle --config src-tauri/tauri.staging.conf.json
//
// It fails if the app does not start, crashes, or does not create and migrate its
// database. Keyboard driving is reported but does not fail the run by itself, because
// some hosted machines do not let scripts send keystrokes.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const out = join(root, "smoke-out");
mkdirSync(out, { recursive: true });

const IDENTIFIER = "app.kinlo.desktop.staging";
const WINDOW_TITLE = "kinlo staging";
const os = process.platform; // win32 | darwin | linux
const binary = join(root, "src-tauri", "target", "debug", os === "win32" ? "kinlo.exe" : "kinlo");

const dataDir =
  os === "win32"
    ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), IDENTIFIER)
    : os === "darwin"
      ? join(homedir(), "Library", "Application Support", IDENTIFIER)
      : join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), IDENTIFIER);
const database = join(dataDir, "kinlo.db");

const log = (...parts) => console.log("[smoke]", ...parts);
// Every helper call has a time limit, so a system that refuses scripted input fails fast
// instead of hanging the whole run.
const run = (file, args) =>
  execFileSync(file, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 20_000 });
const powershell = (script) => run("powershell", ["-NoProfile", "-NonInteractive", "-Command", script]);
const osascript = (script) => run("osascript", ["-e", script]);

let keyboardWorks = true;

/** Saves a picture of the whole screen. Never fails the run. */
function shot(name) {
  const file = join(out, `${name}.png`);
  try {
    if (os === "win32") {
      powershell(
        `Add-Type -AssemblyName System.Windows.Forms,System.Drawing;` +
          `$b=[System.Windows.Forms.SystemInformation]::VirtualScreen;` +
          `$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height;` +
          `$g=[System.Drawing.Graphics]::FromImage($bmp);` +
          `$g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size);` +
          `$bmp.Save('${file.replace(/'/g, "''")}')`,
      );
    } else if (os === "darwin") {
      run("screencapture", ["-x", file]);
    } else {
      run("import", ["-window", "root", file]);
    }
    log("screenshot", name);
  } catch (error) {
    log(`screenshot ${name} failed:`, String(error.message).split("\n")[0]);
  }
}

/** Brings the app's window to the front. */
function focus() {
  try {
    if (os === "win32") {
      powershell(`$w=New-Object -ComObject WScript.Shell; $null=$w.AppActivate('${WINDOW_TITLE}')`);
    } else if (os === "darwin") {
      osascript(`tell application "System Events" to set frontmost of (first process whose name is "kinlo") to true`);
    } else {
      run("xdotool", ["mousemove", "640", "700", "click", "1"]);
    }
  } catch (error) {
    keyboardWorks = false;
    log("focus failed:", String(error.message).split("\n")[0]);
  }
}

/** Types plain text (letters, digits and spaces only). */
function type(text) {
  try {
    if (os === "win32") {
      powershell(`$w=New-Object -ComObject WScript.Shell; $null=$w.AppActivate('${WINDOW_TITLE}'); Start-Sleep -Milliseconds 200; $w.SendKeys('${text}')`);
    } else if (os === "darwin") {
      osascript(`tell application "System Events" to keystroke "${text}"`);
    } else {
      run("xdotool", ["type", "--delay", "40", text]);
    }
  } catch (error) {
    keyboardWorks = false;
    log(`typing "${text}" failed:`, String(error.message).split("\n")[0]);
  }
}

/** Presses Enter, or a shortcut: the palette (Ctrl+K) or the assistant (Ctrl+J). Cmd on macOS. */
function press(key) {
  const letter = key === "assistant" ? "j" : "k";
  try {
    if (os === "win32") {
      const keys = key === "enter" ? "{ENTER}" : `^${letter}`;
      powershell(`$w=New-Object -ComObject WScript.Shell; $null=$w.AppActivate('${WINDOW_TITLE}'); Start-Sleep -Milliseconds 200; $w.SendKeys('${keys}')`);
    } else if (os === "darwin") {
      osascript(
        key === "enter"
          ? `tell application "System Events" to key code 36`
          : `tell application "System Events" to keystroke "${letter}" using command down`,
      );
    } else {
      run("xdotool", ["key", key === "enter" ? "Return" : `ctrl+${letter}`]);
    }
  } catch (error) {
    keyboardWorks = false;
    log(`pressing ${key} failed:`, String(error.message).split("\n")[0]);
  }
}

if (!existsSync(binary)) {
  console.error(`[smoke] No app at ${binary}. Build it first.`);
  process.exit(1);
}

log(`system: ${os}, app: ${binary}`);
log(`data folder: ${dataDir}`);

let exited = null;
let appOutput = "";
/** Starts the app and collects what it prints. */
function launch() {
  exited = null;
  const child = spawn(binary, [], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, WEBKIT_DISABLE_DMABUF_RENDERER: "1", WEBKIT_DISABLE_COMPOSITING_MODE: "1" },
  });
  child.stdout.on("data", (chunk) => (appOutput += chunk));
  child.stderr.on("data", (chunk) => (appOutput += chunk));
  child.gone = new Promise((done) =>
    child.on("exit", (code, signal) => {
      exited = { code, signal };
      done();
    }),
  );
  return child;
}

/**
 * Stops the app and waits until it has really gone. Only one copy of kinlo may run, so a
 * second start made too soon would hand over to the copy that is still closing and exit.
 */
async function stop(child) {
  child.kill();
  await Promise.race([child.gone, sleep(10_000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([child.gone, sleep(5_000)]);
  }
  await sleep(1500);
}
const app = launch();

// The first start is the slowest: the web view starts up and the database is created.
// Wait until the app has made its database (it does that before showing anything), for
// up to two minutes on a slow machine, then give the first screen a moment to settle.
const started = Date.now();
while (!existsSync(database) && exited === null && Date.now() - started < 120_000) await sleep(1000);
log(`database ${existsSync(database) ? "appeared" : "did not appear"} after ${Math.round((Date.now() - started) / 1000)}s`);
await sleep(6000);
const aliveAfterStart = exited === null;
shot("1-welcome");

// Welcome setup, keyboard only.
focus();
await sleep(600);
press("enter"); // Get started
await sleep(1500);
type("Smoke");
await sleep(400);
press("enter"); // name
await sleep(1500);
press("enter"); // look
await sleep(1500);
press("enter"); // assistant: not now
await sleep(1500);
press("enter"); // bring your people: skip
await sleep(1800);
shot("2-sides");
type("b"); // I want both
await sleep(3500);
shot("3-home");

// Add a person from the command palette.
press("palette");
await sleep(1200);
type("add person");
await sleep(900);
press("enter");
await sleep(1600);
type("Ada Lovelace");
await sleep(400);
press("enter");
await sleep(2500);
shot("4-person");

const aliveAtEnd = exited === null;
await stop(app);

// The assistant, start to finish, against a stand-in model on this machine: a question
// goes out, the answer is streamed back, a tool runs, and the reply is saved. Nothing
// leaves the computer and no key is needed. The stand-in is connected by writing the same
// three settings the Settings screen writes, while the app is closed.
let assistantTried = false;
if (existsSync(database) && aliveAtEnd && keyboardWorks) {
  assistantTried = true;
  const model = spawn(process.execPath, [join(root, "scripts", "fake-model.mjs")], { stdio: "ignore" });
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(database);
    const save = db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    save.run("aiProvider", JSON.stringify("ollama"));
    save.run("aiBaseUrl", JSON.stringify("http://127.0.0.1:11500"));
    save.run("aiModel", JSON.stringify("fake-1"));
    db.close();

    const second = launch();
    await sleep(9000);
    focus();
    await sleep(600);

    // In the panel: two requests and a lookup. A healthy app answers in a second or two.
    press("assistant");
    await sleep(2000);
    shot("5-panel");
    type("who should I catch up with");
    await sleep(500);
    press("enter");
    await sleep(12000);
    shot("6-answer");

    // Quick add from the palette: a lookup, then a change that waits to be confirmed.
    press("palette");
    await sleep(1200);
    type("please remind me about zoe tomorrow");
    await sleep(1500);
    press("enter"); // Quick add, the only match for a sentence
    await sleep(9000);
    shot("7-quick-add");
    press("enter"); // confirm the card
    await sleep(6000);
    shot("8-quick-add-saved");
    await stop(second);
  } catch (error) {
    log("assistant step failed:", String(error.message).split("\n")[0]);
  } finally {
    model.kill();
  }
}
writeFileSync(join(out, "app-output.txt"), appOutput);

// What the app left behind.
const expectedMigrations = readdirSync(join(root, "src-tauri", "migrations")).filter((f) => f.endsWith(".sql")).length;
const result = {
  system: os,
  aliveAfterStart,
  aliveAtEnd,
  databaseCreated: existsSync(database),
  migrationsApplied: 0,
  expectedMigrations,
  keyboardWorks,
  onboarded: false,
  sides: null,
  people: [],
  assistantTried,
  assistantAsked: false,
  assistantAnswered: false,
  quickAddSaved: false,
};

if (result.databaseCreated) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(database, { readOnly: true });
  result.migrationsApplied = db.prepare("SELECT count(*) AS n FROM _sqlx_migrations WHERE success").get().n;
  const settings = Object.fromEntries(db.prepare("SELECT key, value FROM settings").all().map((r) => [r.key, JSON.parse(r.value)]));
  result.onboarded = settings.onboarded === true;
  result.sides = settings.sides ?? null;
  result.people = db.prepare("SELECT name FROM contacts").all().map((r) => r.name);
  const said = db.prepare("SELECT role, content FROM ai_messages ORDER BY rowid").all();
  result.assistantAsked = said.some((m) => m.role === "user");
  // The stand-in ends its answer to this question with one of two sentences.
  result.assistantAnswered = said.some(
    (m) => m.role === "assistant" && /overdue|caught up/i.test(String(m.content)),
  );
  // Told to "remind" about someone it cannot find, the stand-in first asks to add her.
  // Either of the things it asks for being saved shows the whole round trip worked.
  result.quickAddSaved =
    result.people.some((name) => name.startsWith("Zo")) ||
    db.prepare("SELECT count(*) AS n FROM reminders WHERE title LIKE 'Call Zo%'").get().n > 0;
  db.close();
}
result.droveTheApp = result.onboarded && result.people.includes("Ada Lovelace");

writeFileSync(join(out, "result.json"), JSON.stringify(result, null, 2));
log("result", JSON.stringify(result, null, 2));

const problems = [];
if (!result.aliveAfterStart) problems.push("the app exited during startup");
if (!result.aliveAtEnd) problems.push("the app exited while it was being used");
if (!result.databaseCreated) problems.push("the app did not create its database");
if (result.migrationsApplied !== expectedMigrations) {
  problems.push(`only ${result.migrationsApplied} of ${expectedMigrations} migrations were applied`);
}

if (result.assistantAsked && !result.assistantAnswered) {
  problems.push("the assistant was asked a question and no answer was saved");
}

if (problems.length) {
  console.error("[smoke] FAILED:", problems.join("; "));
  console.error(appOutput.slice(-2000));
  process.exit(1);
}
if (!result.droveTheApp) {
  // Shown as a warning on the run, without failing it.
  console.log("::warning::The app started and migrated its database, but the keyboard walk-through did not complete on this system.");
}
if (result.droveTheApp && !result.assistantAsked) {
  console.log("::warning::The assistant panel could not be tried on this system: the question did not reach it.");
}
if (result.droveTheApp && result.assistantTried && !result.quickAddSaved) {
  console.log("::warning::Quick add did not save its reminder on this system. See the screenshots.");
}
log(
  result.droveTheApp
    ? `PASSED: started, set up and used by keyboard.${result.assistantAnswered ? " The assistant answered." : ""}${result.quickAddSaved ? " Quick add saved a reminder." : ""}`
    : "PASSED (start and database only).",
);
