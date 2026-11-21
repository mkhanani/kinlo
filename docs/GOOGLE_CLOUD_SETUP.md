# Registering kinlo with Google

Google only lets an app write to someone's calendar if the app is registered in Google Cloud. This is that registration. It is free, needs no payment details, and takes about ten minutes.

It has to be done by whoever owns the kinlo project, in their own Google account, because Google holds that person responsible for the app. Nothing here is needed until calendar sync is built (step 10), but it can be done at any time.

Google renames these screens now and then. If a name below does not match, look for the nearest one; the order of the steps does not change.

## What you will end up with

Two values, a **Client ID** and a **Client secret**, saved as secrets in the GitHub repository. Do not paste them into chat, an issue, or a file in the repository.

## 1. Create a project

1. Open <https://console.cloud.google.com> and sign in.
2. Click the project picker in the top bar, then **New project**.
3. Name it `kinlo` and click **Create**.
4. When it has been created, select it in the project picker. Everything below happens inside this project.

## 2. Switch on the Calendar API

1. Open the menu (top left) and go to **APIs & Services**, then **Library**.
2. Search for `Google Calendar API` and open it.
3. Click **Enable**.

## 3. Describe the app

This is what people see on Google's sign-in page.

1. Open the menu and go to **Google Auth Platform**, then **Branding**.
2. If it says the platform is not configured yet, click **Get started**.
3. **App information:** App name `kinlo`. User support email: your address. Click **Next**.
4. **Audience:** choose **External**. Click **Next**.
5. **Contact information:** your email address. Click **Next**.
6. **Finish:** read and tick the Google API Services User Data Policy box. Click **Continue**, then **Create**.

## 4. Say what kinlo may touch

kinlo asks for one permission only: to make its own calendar and manage the events in it. It cannot see your other calendars or events.

1. In **Google Auth Platform**, open **Data Access**.
2. Click **Add or remove scopes**.
3. At the bottom, under **Manually add scopes**, paste this exactly:

   ```
   https://www.googleapis.com/auth/calendar.app.created
   ```

4. Click **Add to table**, then **Update**, then **Save**.
5. Note which heading Google puts it under: **Non-sensitive**, **Sensitive** or **Restricted**. That decides how much review step 7 needs, so pass it on.

## 5. Let yourself sign in

A new registration starts in "Testing". In that state only the people listed here can sign in.

1. In **Google Auth Platform**, open **Audience**.
2. Under **Test users**, click **Add users**.
3. Enter the Google address whose calendar is on your phone, plus anyone else who will try it. Click **Save**.

Two limits apply while it says Testing: at most 100 test users, and each sign-in lasts seven days before kinlo has to ask again.

## 6. Create the desktop client

1. In **Google Auth Platform**, open **Clients**.
2. Click **Create client**.
3. **Application type:** choose **Desktop app**. Not "Web application" and not "TVs and Limited Input devices".
4. **Name:** `kinlo desktop`. This name is only shown to you.
5. Leave "Use this client for an AI-powered agent" unticked if it appears.
6. Click **Create**.
7. Google shows a **Client ID** and a **Client secret**. Keep this window open for the next part, or click **Download JSON** to keep a copy on your computer.

A desktop client needs no redirect address. Leave anything about redirect URIs alone.

## 7. Save the two values in GitHub

1. Open <https://github.com/mkhanani/kinlo/settings/secrets/actions>.
2. Click **New repository secret**. Name: `GOOGLE_CLIENT_ID`. Value: the Client ID. Click **Add secret**.
3. Click **New repository secret** again. Name: `GOOGLE_CLIENT_SECRET`. Value: the Client secret. Click **Add secret**.

The build puts these into the app when it is packaged. That is normal for a desktop app: Google says so in its own documentation, and the secret alone cannot be used to reach anybody's calendar. Keeping it out of the source code is still tidier.

That is everything needed to build and try calendar sync.

## Later: opening it to everyone

Do this only when calendar sync works and is about to be released.

1. In **Audience**, click **Publish app**. The status changes from Testing to In production. Anyone can then sign in, and the seven-day limit ends.
2. What happens next depends on the heading from step 4:
   - **Non-sensitive:** nothing more to do.
   - **Sensitive:** Google asks for verification. Until it is granted, the sign-in page shows an "unverified app" warning and at most 100 people can sign in. Verification is free. It needs a home page and a privacy policy on a web address you own, and a short explanation of why the permission is needed. It usually takes days to a few weeks.
   - **Restricted:** a much heavier review. This would be a reason to reconsider the approach, so say so before going further.

The privacy policy is short for kinlo, since the app sends nothing to anyone but Google, and it can be drafted when the time comes.

## If something goes wrong

- **"Access blocked: kinlo has not completed the Google verification process"** when signing in: the address is not in the test users list from step 5.
- **The scope will not add in step 4:** the Calendar API from step 2 is not enabled, or the wrong project is selected in the top bar.
- **Sign-in stops working after a week:** expected while the status is Testing. Sign in again, or publish the app.
