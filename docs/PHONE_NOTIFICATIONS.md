# Phone notifications: the plan

Status: not built. This is the plan to choose from.

## The constraint

kinlo has no server and no account, and there is no kinlo phone app. That is the point of it: your data stays on your computer. But it means there is nothing "out there" that could push a notification to your phone. Something else has to carry the reminder to the phone, and that something should be a thing you already trust.

Desktop notifications are built and work on Windows, macOS and Linux. They need kinlo to be running on that computer.

## The options

### A. Send reminders to your own calendar (recommended)

kinlo writes each reminder into a calendar you already have on your phone, such as iCloud, Google, Fastmail or Nextcloud, as an event with an alert. Your phone's calendar then notifies you exactly as it does for any other event.

- Works when your computer is off, because the reminder is sitting in the calendar.
- No new app on the phone. No kinlo server. No kinlo account.
- Reminder titles go to your calendar provider and nowhere else. That is a provider you already use.
- Changes follow: edit, snooze, tick off or delete a reminder in kinlo and the calendar entry updates the next time kinlo is open.
- Cost: this is a full build step. Connecting an account, creating and updating entries, repeating reminders, and handling being offline.
- Covers most people through one standard (CalDAV: iCloud, Fastmail, Nextcloud, and Google with a sign-in). Outlook would need separate work later.

### B. A push relay you set up yourself

You install a small free notification app on your phone (ntfy), pick a private channel name, and kinlo sends each reminder there.

- Quick to build: about a day.
- Needs an extra app on the phone.
- Reminder titles pass through the relay's server, unless you host the relay yourself.
- The relay only holds a message for up to three days, so a reminder set far ahead only reaches the phone if kinlo was opened within three days of it.

### C. A kinlo phone app with sync

The best experience in the long run: your people and reminders on your phone, not only notifications.

- It is a second product: a phone app, plus syncing between devices.
- Both are listed as "not in v0.1" in the build brief, for good reason. Sync is the hard part and it changes the privacy story.

### D. Export a calendar file

A button that saves reminders as a file you import into your phone's calendar.

- Trivial to build.
- A one-off copy. It does not update when reminders change, so it is not really notifications.

## Recommendation

Build **A** as its own step after v0.1.0 ships (step 10). It is the only option that works with the computer off, needs nothing new on the phone, and keeps the "no server, no account" promise.

If phone notifications are wanted sooner, **B** can be added first as a small optional setting, and kept alongside A afterwards for people who prefer it.

Leave **C** for a later major version, and skip **D**.

## What to decide

1. A, B, or both.
2. Whether it goes in before v0.1.0 or right after.
3. For A: which calendar you use yourself, so that one is built and tested first.
