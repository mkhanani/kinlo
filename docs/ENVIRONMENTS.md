# Testing, staging, production

kinlo has no server, so "environments" here means three stages every change passes through, and three flavors of the app that never share data.

```
feature branch ──PR──▶ staging ──PR──▶ main ──tag v*──▶ draft release ──Publish──▶ users
      │                   │                      │
   Testing             Staging               Production
 (checks only)   ("kinlo staging" build)    ("kinlo" build)
```

## The three stages

| | Testing | Staging | Production |
|---|---|---|---|
| Trigger | every pull request, and each merge to `main` | push to `staging` | "Run workflow" on `main`, or a tag `v*` on `main` |
| Workflow | `.github/workflows/testing.yml` | `staging.yml` | `production.yml` |
| What runs | type check, unit tests, frontend build, `cargo fmt`, `clippy`, Rust tests, compile check on Windows and macOS | all of Testing, then installers for every platform | all of Testing, tag checks, then signed installers for every platform and the update file |
| Output | pass or fail | installers attached to the workflow run | a **draft** GitHub Release |
| Reaches users | no | no | only after someone presses Publish |

Staging and Production both run the full Testing suite first. A build never starts if a check fails.

Production has extra guards: the version must equal the app version (`v0.1.0` for version `0.1.0`), the commit must already be on `main`, the update key must be set, and a version that has been published cannot be released again. A release started from any other branch fails before anything is built.

## Updates

The released app has a **Check for updates** button in Settings. It is the only way kinlo ever looks for a new version: nothing is checked in the background or at startup. The code is in `src-tauri/src/updates.rs` and `src/features/updates/`, and uses Tauri's updater plugin.

1. Pressing the button fetches `latest.json` from the newest published release (`https://github.com/mkhanani/kinlo/releases/latest/download/latest.json`). A draft is not "published", so nobody is offered a release before Publish is pressed.
2. If the version there is newer, **Update and restart** downloads the file for that system and kind of install.
3. The download is checked against the public key built into the app (`plugins.updater.pubkey` in `tauri.conf.json`). The signature also names the version it was made for, and that must match (`requireSignedVersion`), so an old release cannot be passed off as a new one. Anything that fails is discarded.
4. It is installed and kinlo starts again. On Windows the installer does this itself, showing a progress bar. A `.deb` or `.rpm` install asks for the system password.

Dev and staging builds do not have the button: their identifier is not the released one, and the Rust side refuses as well.

On the release side, the Production workflow builds with `src-tauri/tauri.release.conf.json`, which turns on signing, so every download gets a `.sig` file next to it. When all four builds are done, the last job runs `scripts/make-update-manifest.mjs`, which writes `latest.json` from those signatures and attaches it to the draft. It refuses to write the file if any system is missing or was signed for a different version.

### The update key

Signing needs a private key, kept as the repository secret `TAURI_SIGNING_PRIVATE_KEY` (Settings → Secrets and variables → Actions). It has no password. Production stops before building if the secret is missing.

- **Keep a copy somewhere safe**, such as a password manager. GitHub never shows a secret again.
- **If it is lost**, installed copies of kinlo can no longer be updated from the button, because nothing new can be signed in a way they accept. People would have to download the next version by hand once, built with a new key.
- **If it leaks**, treat it as lost: make a new one and replace the public key. By itself the key is not enough to push an update to anyone, since the app only downloads from this repository's releases, but it is the check that protects people if the repository or a download were tampered with.

To make a new key and switch to it:

```bash
npm run tauri signer generate -- --ci -w kinlo-update-key.txt
```

Put the contents of `kinlo-update-key.txt` in the secret, put the contents of `kinlo-update-key.txt.pub` in `plugins.updater.pubkey`, and delete both files. Only versions released after that carry the new key.

This is not code signing. It lets kinlo trust its own updates; it does not stop Windows or macOS from warning about an unsigned app on first install.

## Running on Windows, macOS and Linux

"It compiles" is not the same as "it works". The **Desktop smoke** workflow (`.github/workflows/smoke.yml`, `scripts/smoke.mjs`) builds the staging flavor and runs it on real Windows, macOS and Linux machines on every pull request and every push to `staging`. On each one it:

1. starts the app and waits for it to create its database,
2. walks the welcome setup and adds a person using only the keyboard,
3. takes screenshots along the way,
4. reads the app's database afterwards to check all migrations ran, the setup finished and the person was saved.
5. saves, reads and removes a test entry in that system's real keychain (Credential Manager on Windows, Keychain on macOS, GNOME Keyring on Linux), which is where API keys for the assistant are kept.

The screenshots are attached to the run, and the latest set for each system is kept on the branches `smoke-results/windows`, `smoke-results/macos` and `smoke-results/linux`, where they can be browsed on GitHub.

It fails if the app does not start, crashes, or does not migrate its database. It is not a required check, because hosted machines sometimes refuse scripted keystrokes; when that happens the run passes with a warning and the screenshots still show the app on screen.

## The three app flavors

| | dev | staging | production |
|---|---|---|---|
| Name | kinlo dev | kinlo staging | kinlo |
| Identifier | `app.kinlo.desktop.dev` | `app.kinlo.desktop.staging` | `app.kinlo.desktop` |
| Built by | `npm run app:dev` | `npm run app:build:staging` or the Staging workflow | `npm run app:build` or the Production workflow |
| Icon | light, dashed rings | light, dashed rings | dark, solid rings |
| Badge by the wordmark | dev | staging | none |

The operating system derives the data folder from the identifier, so each flavor has its own SQLite file. The keychain service name is derived from it too (`Channel::keychain_service` in `src-tauri/src/channel.rs`), so a staging build cannot read or overwrite the API keys of the released app. All three can be installed side by side.

The icons are drawn in `assets/icon/` as four SVG files: the released app and the staging flavor, each in a large version and a heavier one for 16 to 48px, where thin lines disappear. `npm run icons` rebuilds every icon file and the Windows installer pictures from them. To change the logo, replace those drawings and run it.

The differences live in two small overlay files, `src-tauri/tauri.dev.conf.json` and `src-tauri/tauri.staging.conf.json`, merged over `tauri.conf.json`. A third, `tauri.release.conf.json`, only turns on update signing and is used by the Production workflow alone, so building from source needs no key. The app code is identical. Unknown identifiers are treated as dev, never as production.

Rule for new code: anything stored outside the app data folder must be keyed by channel.

## Day to day

```bash
npm run app:dev            # run the dev flavor with hot reload
```

```bash
npm run check              # everything the Testing stage runs, locally
```

1. Branch from `staging`, open a pull request back into `staging`. Testing must be green.
2. Merge. The Staging workflow builds installers. Download them from the run's Artifacts and try the change with real use.
3. When staging is good, open a pull request from `staging` into `main` and merge.
4. Bump the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (Testing fails if they disagree), and get that onto `main` the same way.
5. Start the release, either way:
   - **From GitHub:** Actions → Production → Run workflow, on `main`, and type the version, for example `v0.1.0`.
   - **From a terminal:**

     ```bash
     git tag v0.1.0 origin/main && git push origin v0.1.0
     ```

   Both run the same checks and builds. Started from GitHub, no tag exists until the draft is published; GitHub creates it then.
6. Review the draft release. It should hold the installers, a `.sig` file for each, and `latest.json`. Then publish. From that moment, **Check for updates** in an installed kinlo offers the new version.

## Repository setup

`main` and `staging` exist. What makes the stages a gate rather than a habit is branch protection on both, set in Settings → Rules → Rulesets:

- Require a pull request before merging.
- Require these status checks to pass:
  - `Frontend (types, tests, build)`
  - `Rust (fmt, clippy, tests)`
  - `Compiles on windows-latest`
  - `Compiles on macos-latest`
- Block force pushes and deletions.
- Optional: a tag ruleset that restricts who can create `v*` tags.

After a `staging` → `main` merge, GitHub shows `staging` as a commit or two behind `main`. Those are merge commits only and can be ignored.
