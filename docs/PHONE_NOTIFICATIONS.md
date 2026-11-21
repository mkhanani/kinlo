# Phone notifications: the plan

Status: not built.

**Decided:** option A, sending reminders to your own calendar, with **Google Calendar** built and tested first. It is planned as step 10, right after v0.1.0 ships.

The options that were weighed are kept below for the record.

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

## What step 10 will involve

- **Signing in to Google.** kinlo opens Google's own sign-in page in your browser. It asks for access to one thing only: a calendar named "kinlo" that it creates for itself. It cannot read your other calendars or events.
- **Where the sign-in is kept.** In the operating system's keychain, next to the AI keys. Never in the database.
- **What gets written.** Each open reminder becomes an event at its due time with an alert, in the "kinlo" calendar. Editing, snoozing, finishing or deleting the reminder updates or removes the event. Repeating reminders become repeating events.
- **When it syncs.** Whenever a reminder changes while kinlo is open, and once at launch to catch up.
- **Turning it off.** One switch in Settings disconnects and can remove the "kinlo" calendar.
- **One thing needed from you.** Google only allows this through an app registration in Google Cloud, which is free and takes about ten minutes. It has to belong to the project's owner, so you would create it and paste two values into the build. Until Google has reviewed the app, its sign-in page shows an "unverified app" warning; review is free but takes days to weeks.

Other calendars (iCloud, Fastmail, Nextcloud) use a common standard and can follow once Google works.
