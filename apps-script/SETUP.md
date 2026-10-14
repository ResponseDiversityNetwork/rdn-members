# Apps Script setup

Do all of this signed in as **rdn.projectbase@gmail.com**.

## 1. Create the script project

1. Go to https://script.google.com → **New project**. Rename it "RDN membership".
2. Create one script file for each `.gs` file in this folder, with the same name: `Config`, `Setup`, `Photos`, `Switching`, `Invite`, `Geo`, `Members`, `Automation`, `Emails`, `Public`, `Admin`. Use **+ → Script** for each, then paste in its contents. Delete the empty `Code.gs`. When you get updated files from me later, replace the contents of every file.
3. **Services (+)** → **Drive API** → **Add**. Keep the identifier `Drive`.

## 2. Run the setup

1. Select `setupMembership` in the function dropdown, then click **Run**.
2. Approve the permissions. Google warns that the app is unverified: click **Advanced → Go to RDN membership**.
3. Open **Execution log** and copy the seven links somewhere safe.

If you already ran the setup before 9 October, add a short-answer question titled `State/Province` (not required) under **City** in both forms by hand.

The setup creates two forms, a private spreadsheet (with tabs `Members`, `Responses A (no photo)` and `Responses B (photo)`), a public spreadsheet, and a photo folder.

## 3. Add the photo question to Form B (by hand)

Apps Script can't create file-upload questions, so this step is manual.

1. Open the **Form B edit** link from the log.
2. Click the **Research interests** question, then **+ Add question**. The new question appears just below it.
3. Set the question type to **File upload**. If Google warns that respondents must sign in, click **Continue**.
4. Set it up as follows:
   - Title: `Photo` (exactly this)
   - Allow only specific file types: **Image**
   - Maximum number of files: **1**
   - Maximum file size: **10 MB**
   - Required: **off**
   - Description (⋮ → Description): *Optional. A head-and-shoulders photo works best. Shown in a small circle on the map only if you tick "Photo" under the details you agree to show.*
5. Back in Apps Script, run `checkPhotoForm`. The log should say "OK".

## 4. Check the forms

1. Open both public form links in a **private browser window**.
   - Form A should open without asking you to sign in.
   - Form B should ask you to sign in.
2. Submit Form A once with test answers. Then run `testSwitchLink` and open the link it logs. Your answers should be filled in on Form B, with `TEST-REF-123` on the last page.
3. Submit Form B once with a photo. Then run `testPublishPhoto` and open the logged link in a private window. You should see a small copy of the photo. If it says "not ready", wait a minute and run it again.
4. Send me the results.

## 5. Turn on the automation

1. Make sure every script file has its latest contents (see section 1).
2. Run `installTriggers`. Approve the new permissions it asks for.
   - From now on, submissions are handled automatically: geocoding, emails, curator approval and the public sheet.
   - The two test responses from section 4 were submitted before this, so they aren't in the `Members` tab. That's expected; section 7 clears them.
3. Open the **public** spreadsheet (link in the setup log) and choose **File → Share → Publish to web**:
   1. Under **Link**, choose the `public` tab and **Comma-separated values (.csv)**, then click **Publish**. Copy the URL.
   2. Choose the `summary` tab, CSV again, then **Publish**. Copy that URL too.
   3. Under **Published content & settings**, check that **Automatically republish when changes are made** is ticked.
4. Put the links into **both** sites. The main RDN website is the real one (member emails link to it); the rdn-members site is the test bed until the website's `new-image` branch goes live.
   - **RDN-website** (`new-image` branch): in `data/sources.json`, set `data_url` to the first URL and `summary_url` to the second. In `_variables.yml`, replace `FORM_A_URL` and `FORM_B_URL` with the two public form links from the setup log.
   - **rdn-members**: in `index.qmd`, set `DATA_URL` and `SUMMARY_URL` (each in quotes). In `join.qmd`, replace `FORM_A_URL` and `FORM_B_URL`.
5. Commit and push both. The maps are now live but empty until the first member is approved, and the "Demo" banner disappears.

## 6. Test everything

Use your own addresses, plus a second address you can read.

| Test | What should happen |
|---|---|
| Submit Form A as a new member (show on map: Yes, mailing list: Yes) | You get a "Thank you for joining" email. The curator gets "New member to approve". A new row appears in `Members`. |
| Tick **Approved** in that row | You get "Welcome". The member appears on the map within about 5–10 minutes. The counts update. |
| Open the personal link from the email, change your email address, submit | The new and the old address each get an email. |
| Click "Switch to the form with a photo" in that email, upload a photo, and tick **Photo** under the details to show | A "now with a photo" email arrives. The photo appears in the map popup. The old Form A response is gone. |
| Take a phone photo that has a location, upload it, then download the public copy (the `Photo URL` in `Members`) and check it has no location data | On a Mac: open it in Preview → **Tools → Show Inspector**. There should be no GPS tab. |
| Click "switch to the form without a photo" and submit | The photo is deleted, both the Drive copy and the public copy. |
| Submit with the city "Atlantis" | The curator gets a "could not find" note. Correct the city in `Members` and the row is placed again. |
| Open the personal link, tick **Leave the network**, submit | A "You have left" email arrives. The row, the response and any photo are deleted, and the member disappears from the map. |

Problems show in Apps Script under **Executions**. Emails that couldn't be sent, for example because the daily limit was reached, are listed in a `Failed emails` tab.

## 7. Clear test entries and launch

1. In `Admin.gs`, change `ALLOW_CLEAR = false` to `true` and save. Run `clearTestData`, then change it back to `false` and save. This deletes **all** responses, photos and member rows.
2. Invite the existing members (next section).
3. When the mailing list exists:
   1. Run `emailMailingListRequests`. It emails the list manager everyone who opted in, one per line, ready for a bulk subscribe.
   2. Set `LISTSERV_NOTIFY_EACH: true` in `Config.gs`. From then on the manager gets one email per subscribe, unsubscribe or address change.

## Day to day

- **New members:** the curator gets an email and ticks **Approved** in the `Members` tab.
- **Fixing a location:** edit City, State/Province or Country in `Members`, and the row is placed again.
- **Your own notes:** use the `Curator notes` column. The script overwrites the other columns when a member edits their entry.
- **Map looks out of date:** run `rebuildPublicNow`.
- **Turning everything off:** run `removeTriggers`.

## Inviting the existing members

Do this after section 7, step 1, and only once the RDN website's `new-image` branch is live: the invitation emails link to its `members.html` and `join.html` pages.

1. In the **private** spreadsheet, choose **File → Import → Upload**, pick the old member list, and select **Insert new sheet(s)**. Rename the new tab to `Invites`. The headings must stay as they are: Name, Organisation, Country, City, State/Province, Email, Status, Comments, Date joined.
2. Run `prepareInvites`. It adds tracking columns and marks each row `ready` or `not invitable`. The reason for each `not invitable` row is in **Invite note**, for example a missing or duplicate email. The Status and Comments columns are ignored. Fix those rows if you can, then run it again.
3. Run `sendTestInvite`. It sends the first row's invitation to you only. Open both links and check that the answers are filled in.
4. Run `startInvites`. It sends about 60 invitations a day, so 164 take three days. A Gmail account can send about 100 emails a day, and the rest are kept for replies to the invitations. A daily timer then sends one reminder, 14 days after the invitation, to anyone who hasn't responded, and switches itself off when everything is sent.
5. Check progress at any time in the `Invites` tab, or run `inviteProgress`.

If someone replies asking to be removed, set their **Invite state** to `removed`.
