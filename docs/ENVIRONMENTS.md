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
| Trigger | every push and pull request | push to `staging` | tag `v*` on `main` |
| Workflow | `.github/workflows/testing.yml` | `staging.yml` | `production.yml` |
| What runs | type check, unit tests, frontend build, `cargo fmt`, `clippy`, Rust tests, compile check on Windows and macOS | all of Testing, then installers for every platform | all of Testing, tag checks, then installers for every platform |
| Output | pass or fail | installers attached to the workflow run | a **draft** GitHub Release |
| Reaches users | no | no | only after someone presses Publish |

Staging and Production both run the full Testing suite first. A build never starts if a check fails.

Production has two extra guards: the tag must equal the app version (`v0.1.0` for version `0.1.0`), and the tagged commit must already be on `main`. A tag pushed from any other branch fails before anything is built.

## The three app flavors

| | dev | staging | production |
|---|---|---|---|
| Name | kinlo dev | kinlo staging | kinlo |
| Identifier | `app.kinlo.desktop.dev` | `app.kinlo.desktop.staging` | `app.kinlo.desktop` |
| Built by | `npm run app:dev` | `npm run app:build:staging` or the Staging workflow | `npm run app:build` or the Production workflow |
| Icon | light, dashed rings | light, dashed rings | dark, solid rings |
| Badge by the wordmark | dev | staging | none |

The operating system derives the data folder from the identifier, so each flavor has its own SQLite file. The keychain service name is derived from it too (`Channel::keychain_service` in `src-tauri/src/channel.rs`), so a staging build cannot read or overwrite the API keys of the released app. All three can be installed side by side.

The differences live in two small overlay files, `src-tauri/tauri.dev.conf.json` and `src-tauri/tauri.staging.conf.json`, merged over `tauri.conf.json`. The app code is identical. Unknown identifiers are treated as dev, never as production.

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
4. Bump the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (Testing fails if they disagree), then tag:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

5. Review the draft release, then publish.

## One-time repository setup

- Create the `staging` branch from `main`.
- Protect `main` and `staging`: require a pull request and require the Testing checks to pass.
- Optional: restrict who can push `v*` tags (Settings → Tags → rulesets).
