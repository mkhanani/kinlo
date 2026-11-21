# The assistant

kinlo's assistant is optional. Nothing else in the app depends on it, and until a model is connected it makes no network calls at all.

It is "bring your own key": you connect a model from Anthropic, OpenAI or Google with your own API key, or a model running on your own computer through Ollama. kinlo has no server and no account in between.

## What leaves the computer

Only what a question needs, and only to the provider you chose.

- Your question, the conversation so far, and the standing instructions (today's date, your first name, which side of kinlo is open).
- Whatever the assistant looks up to answer: for example the people a search finds, or one person's details and recent conversations.

Nothing is sent in the background, nothing is sent when the panel is closed, and the rest of your data is never uploaded. With Ollama nothing leaves the computer at all. Settings says which of these applies to the provider you have picked.

Conversations with the assistant are saved in kinlo's own database on your computer (`ai_threads` and `ai_messages`), so they are there when you come back. Deleting a conversation removes it from the database.

## Where keys are kept

In the operating system's keychain, and nowhere else:

| System | Keychain |
|---|---|
| macOS | Keychain |
| Windows | Credential Manager |
| Linux | the Secret Service (GNOME Keyring, KWallet) |

A key is never written to the database, to `localStorage`, to a file, or to a log. Once saved, Settings does not show it again; it can only be replaced or removed.

The web view reaches the keychain through two Rust commands, `set_key` and `get_key` (`src-tauri/src/keychain.rs`). They only accept the four known provider names, so they cannot be used to read anything else in the keychain. Each build flavor (dev, staging, production) uses its own keychain service name, so a test build cannot read the released app's keys.

On Linux this needs a keyring service to be running. Most desktops have one. Without it, saving a key fails with a message saying so, and the rest of kinlo is unaffected.

## Changes are always confirmed

The assistant can look things up by itself. It cannot change anything by itself.

When it wants to add a person, update one, log a conversation, set a reminder, add a deal or move one, kinlo shows a card with exactly what would be saved, and waits. Nothing is written until you press Confirm. Cancel leaves everything as it was, and so does sending another message without answering the card.

This is enforced in code, not by asking the model nicely: writing tools are marked as needing approval, and the tool only runs on a later turn, after your answer has been recorded (`src/ai/engine.ts`).

## What it can do

| Looks up (runs straight away) | Changes (confirmed first) |
|---|---|
| `search_contacts` | `create_contact` |
| `get_contact` | `update_contact` |
| `list_overdue_contacts` | `log_interaction` |
| `list_reminders` | `create_reminder` |
| `list_deals` (business side) | `create_deal`, `move_deal` (business side) |

The assistant works on the side of kinlo that is open, the same as the rest of the app. On the personal side it cannot see business contacts or the pipeline, and the other way round.

It cannot delete anything, and it cannot send messages; a drafted message is text for you to copy.

## Providers

| Provider | Key | Address |
|---|---|---|
| Anthropic | yes | fixed |
| OpenAI | yes | can be changed, for services that work like OpenAI's (LM Studio, OpenRouter and others) |
| Google | yes | fixed |
| Ollama | no | defaults to `http://localhost:11434`, can be changed |

Model names are fetched from the provider once a key is saved. If that fails, a model name can be typed in.

In the app, requests go through Tauri's HTTP plugin (`src/ai/http.ts`), because providers do not accept calls made directly from a web page. The plugin is allowed to reach any `http` or `https` address, which is what a custom address needs; kinlo's own code only ever calls the provider that is configured.

## For development

`src/ai/` holds everything: `providers.ts` (the adapter), `tools.ts`, `engine.ts` (one turn of the conversation, and the confirm-before-write rule), `chat.ts` (state and saving), `describe.ts` (the words on the cards) and `prompt.ts`.

To try the assistant without a key or any cost, run the stand-in model and point kinlo at it:

```bash
node scripts/fake-model.mjs
```

Then in Settings choose OpenAI, save any text as the key, set the address to `http://localhost:11500/v1` and pick `fake-1`. It follows a small script: ask who to catch up with, ask it to set a reminder, or ask it to add someone.

Tests use a scripted model (`src/ai/testing.ts`) and never touch the network.
