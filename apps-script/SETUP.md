# Apps Script setup

Do all of this signed in as **rdn.projectbase@gmail.com**.

> **Updating an installation made before 16 October 2026** (one membership form plus a small photo form, instead of two full forms):
> 1. Paste the new bundle over `Code.gs` and save.
> 2. Clear the test data (section 7, step 1). This is needed because test members on the old photo form can't be moved across.
> 3. Run `convertPhotoForm`. It turns Form B into the small photo form, keeping its upload question.
> 4. Run `installTriggers`, then `updateFormTexts`.
> 5. Optionally delete the `Responses B (photo)` tab in the private spreadsheet.

## 1. Create the script project

1. Go to https://script.google.com → **New project**. Rename it "RDN membership".
2. Open `apps-script/dist/RDN-membership.gs` in a text editor, select all, and copy. In the Apps Script editor, open `Code.gs`, select all, and paste over it. Click **Save** (the disk icon).
   - This one file bundles all the separate `.gs` files. It's regenerated with `apps-script/build.sh` whenever they change.
   - To update later, paste the new bundle over the whole of `Code.gs` again.
3. **Services (+)** → **Drive API** → **Add**. Keep the identifier `Drive`.

## 2. Run the setup

1. Select `setupMembership` in the function dropdown, then click **Run**.
2. Approve the permissions. Google warns that the app is unverified: click **Advanced → Go to RDN membership**.
3. Open **Execution log** and copy the seven links somewhere safe.

If you already ran the setup before 9 October, add a short-answer question titled `State/Province` (not required) under **City** in the membership form by hand.

The setup creates the membership form (Form A), the small photo form (Form B), a private spreadsheet (with tabs `Members` and `Form responses`), a public spreadsheet, and a photo folder.

## 3. Add the upload question to the photo form (by hand)

Apps Script can't create file-upload questions, so this step is manual.

1. Open the **photo form edit** link from the log.
2. Click the **Research interests** question, then **+ Add question**. The new question appears just below it.
3. Set the question type to **File upload**. If Google warns that respondents must sign in, click **Continue**.
4. Set it up as follows:
   - Title: `Photo` (exactly this)
   - Allow only specific file types: **Image**
   - Maximum number of files: **1**
   - Maximum file size: **10 MB**
   - Required: **off**
   - Description: leave it empty; `updateFormTexts` fills it in (uploading a photo is the consent to show it on the map).
5. Back in Apps Script, run `checkPhotoForm`. The log should say "OK".

## 4. Check the forms

1. Open the membership form's public link in a **private browser window**. It should open without asking you to sign in.
2. Run `testPhotoLink` and open the link it logs. The photo form should ask you to sign in, and show `TEST-REF-123` in "Member reference". Don't submit.
3. Send me the results.

## 5. Turn on the automation

1. Make sure every script file has its latest contents (see section 1).
2. Run `installTriggers`. Approve the new permissions it asks for.
   - Replies to the system's emails now go to rdn.projectbase@gmail.com, because a reply-to on another domain makes emails look like phishing. To receive them yourself, in that Gmail account go to **Settings → See all settings → Forwarding and POP/IMAP → Add a forwarding address**, add your own address, and confirm it.
   - Run `updateFormTexts` once, to add the cover page and the new confirmation message to forms created before 15 October.
   - From now on, submissions are handled automatically: geocoding, emails, curator approval and the public sheet.
   - The two test responses from section 4 were submitted before this, so they aren't in the `Members` tab. That's expected; section 7 clears them.
3. Open the **public** spreadsheet (link in the setup log) and choose **File → Share → Publish to web**:
   1. Under **Link**, choose the `public` tab and **Comma-separated values (.csv)**, then click **Publish**. Copy the URL.
   2. Choose the `summary` tab, CSV again, then **Publish**. Copy that URL too.
   3. Under **Published content & settings**, check that **Automatically republish when changes are made** is ticked.
4. In `index.qmd`, set `DATA_URL` to the first URL and `SUMMARY_URL` to the second, each in quotes. In `join.qmd`, replace `FORM_A_URL` and `FORM_B_URL` with the two public form links from the setup log.
5. Commit and push. The map at https://responsediversitynetwork.github.io/rdn-members/ is now live but empty until the first member is approved, and the "Demo" banner disappears.

### 5b. The leave form

1. Run `setupLeaveForm`. It creates a short "leave the network" form and its trigger, and logs the form's link.
2. Put that link in `join.qmd` in place of `LEAVE_FORM_URL`, then push.

Requests from this form appear in a `Leave requests` tab of the private spreadsheet, and the curator gets an email. Nothing is deleted until the curator ticks **Confirmed** in that row. The **Status** column then shows what was done. Leaving through the personal link still takes effect at once.

## 6. Test everything

Use your own addresses, plus a second address you can read.

| Test | What should happen |
|---|---|
| Submit Form A as a new member (show on map: Yes, mailing list: Yes) | You get a "Thank you for joining" email. The curator gets "New member to approve". A new row appears in `Members`. |
| Tick **Approved** in that row | You get "Welcome". The member appears on the map within about 5–10 minutes. The counts update. |
| Open the personal link from the email, change your email address, submit | The new and the old address each get an email. |
| Click the photo-form link in that email and upload a photo | The photo appears in the map popup within about 15 minutes. Your personal link stays the same. |
| Take a phone photo that has a location, upload it, then download the public copy (the `Photo URL` in `Members`) and check it has no location data | On a Mac: open it in Preview → **Tools → Show Inspector**. There should be no GPS tab. |
| Use the photo-form link again, tick **Remove my photo**, and submit | The photo is deleted, both the Drive copy and the public copy. |
| Submit with the city "Atlantis" | The curator gets a "could not find" note. Correct the city in `Members` and the row is placed again. |
| Open the personal link, tick **Leave the network**, submit | A "You have left" email arrives. The row, the response and any photo are deleted, and the member disappears from the map. |

Problems show in Apps Script under **Executions**. Emails that couldn't be sent, for example because the daily limit was reached, are listed in a `Failed emails` tab.

## 7. Clear test entries and launch

0. End the test phase: set `TEST_PHASE: false` in `Config.gs` (emails stop saying "[Test]"), rebuild and paste the script, and empty `_test-banner.qmd` (or delete its two `include` lines in `index.qmd` and `join.qmd`), then push.
1. In `Admin.gs`, change `ALLOW_CLEAR = false` to `true` and save. Run `clearTestData`, then change it back to `false` and save. This deletes **all** responses, photos and member rows.
2. Invite the existing members (next section).
3. When the mailing list exists:
   1. Run `emailMailingListRequests`. It emails the list manager everyone who opted in, one per line, ready for a bulk subscribe.
   2. Set `LISTSERV_NOTIFY_EACH: true` in `Config.gs`. From then on the manager gets one email per subscribe, unsubscribe or address change.

## Day to day

- **Member says our emails don't arrive:** in their `Members` row, copy **Edit URL** (their personal link) and **Photo link**, and send both from your own address.
- **Photos:** members add, change or remove them with the photo-form link in any of our emails. A photo submitted without a valid member reference is discarded, and you get an email.
- **New members:** the curator gets an email and ticks **Approved** in the `Members` tab.
- **Fixing a location:** edit City, State/Province or Country in `Members`, and the row is placed again.
- **Your own notes:** use the `Curator notes` column. The script overwrites the other columns when a member edits their entry.
- **Map looks out of date:** run `rebuildPublicNow`.
- **A submission got no email and isn't in `Members`:** check that `onSubmitA` is listed under **Triggers** (run `installTriggers` if not), then run `processMissedResponses`.
- **Leave requests:** the curator gets an email and ticks **Confirmed** in the `Leave requests` tab.
- **Turning everything off:** run `removeTriggers`.

## Inviting the existing members

**Plan.** Some organisations quarantine emails from a new Gmail sender, so the invitations use three routes, and you only send one email yourself:

1. **Announcement from you, a few days before.** One email from your own address to all members (in BCC). Tell them that an invitation is coming from rdn.projectbase@gmail.com, to add it to their contacts or send it a short email, and to check their quarantine. Also tell them that if nothing arrives, they can simply join at the join page with the same email address.
2. **Invitations from the system**, as below. Each one has the member's details pre-filled.
3. **Fallbacks**, needing no extra work:
   - a member who joins through the join page with an email address on the old list is recognised: the curator email says so, and they keep their original joining date and get no reminder;
   - after about two weeks, `exportInviteLinks` writes an `Invite links` tab of everyone who hasn't responded, with their personal pre-filled links. Download it as CSV and send those few emails as one mail merge from your own account (for example Word → Mailings → Start Mail Merge → Email Messages, using Outlook), using the fields FirstName and Link.


Do this after section 7, step 1. The invitation emails link to the rdn-members site's map and join pages.

1. In the **private** spreadsheet, choose **File → Import → Upload**, pick the old member list, and select **Insert new sheet(s)**. Rename the new tab to `Invites`. The headings must stay as they are: Name, Organisation, Country, City, State/Province, Email, Status, Comments, Date joined.
2. Run `prepareInvites`. It adds tracking columns and marks each row `ready` or `not invitable`. The reason for each `not invitable` row is in **Invite note**, for example a missing or duplicate email. The Status and Comments columns are ignored. Fix those rows if you can, then run it again.
3. Run `sendTestInvite`. It sends the first row’s invitation to you (the curator address) only. Open the link and check that the answers are filled in.
4. Run `startInvites`. It sends about 60 invitations a day, so 164 take three days. A Gmail account can send about 100 emails a day, and the rest are kept for replies to the invitations. A daily timer then sends one reminder, 14 days after the invitation, to anyone who hasn't responded, and switches itself off when everything is sent.
5. Check progress at any time in the `Invites` tab, or run `inviteProgress`.

If someone replies asking to be removed, set their **Invite state** to `removed`.

### Testing the invitations first

Do this before importing the real list, with test rows only, so no real member can get an email.

1. In the private spreadsheet, add a tab called `Invites`. Paste these headings into A1: Name, Organisation, Country, City, State/Province, Email, Status, Comments, Date joined. Below them add three test rows:
   - you, with a real address you can read;
   - you again, with a second address you can read, a city and state (e.g. Cambridge, Massachusetts, USA), and a date such as 2021-05-01;
   - a row with no email, to check that it gets flagged.
2. Run `prepareInvites`. Two rows should be `ready` and one `not invitable` ("no email").
3. Run `sendTestInvite`. One invitation arrives at the curator address. Open its link: name, email, organisation, city, state and country should be filled in, with a member reference on the last page.
4. Run `startInvites`. Both test addresses get an invitation, and a daily `inviteTick` timer appears under **Triggers**.
5. Reply to the first invitation through its link. Fill in the rest and submit. Check that:
   - you get a "Your Response Diversity Network membership is updated" email, and no curator email;
   - the person is in `Members`, already **Approved**, with **Joined** taken from the Invites row;
   - the Invites row shows `responded`;
   - the person appears on the map within about 10 minutes.
6. Test the reminder without waiting 14 days: in the second row, change **Invited at** to a date more than 14 days ago, then run `inviteTick`. A "Reminder: ..." email should arrive.
7. Reply to the reminder through its link. Then use the photo-form link in the email you get back to add a photo.
8. Run `stopInvites`, delete the `Invites` tab, and clear the test data (section 7, step 1). Then follow the steps above with the real list.

