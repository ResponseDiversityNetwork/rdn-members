# rdn-members

The public member map for the Response Diversity Network.
Site: https://responsediversitynetwork.github.io/rdn-members/

- `index.qmd` is the map page, built with Quarto, Observable JS and Leaflet. The visitor's browser does all the work, so there is no server.
- `join.qmd` explains how to join, update and leave, and holds the privacy notice.
- `apps-script/` holds the Google Apps Script code (a copy for version control; it runs in the rdn.projectbase account).
- `data/demo-members.csv` holds fictional members, used while `DATA_URL` in `index.qmd` is `null`.
- `.github/workflows/publish.yml` renders the site and deploys it to GitHub Pages on every push to `main`.

## Where the real data comes from

The page never sees the private membership sheet. RDN's Apps Script (in the rdn.projectbase@gmail.com account) writes a **public subset** to a separate Google Sheet:

- only members who consented to the map;
- only the fields each member agreed to show;
- locations at city level.

That sheet is published to the web as CSV, and its URL is set as `DATA_URL` in `index.qmd`. Changes reach the map within about 5 minutes, and the site doesn't need rebuilding. **No member data is committed to this repo.**

## Public CSV columns (the contract between Apps Script and this page)

| column | content |
|---|---|
| id | random public id (not the form response id) |
| name, institution, email, website, interests | blank if the member chose not to show it |
| city, country | as entered |
| lat, lon | rounded to 2 decimals |
| career_stage | one value |
| approach, systems, organisms, levels, stressors, regions | several values, separated by `; ` |
| continent | from the geocoded country |
| photo_url | https link to a small public copy of the member's photo (EXIF removed); blank if none. Uploading a photo is the consent to show it. |

A second tab, `summary`, published as its own CSV (`SUMMARY_URL`), holds counts over **all** approved members, including those not on the map. Its columns are `metric, category, count`. The metrics are `members`, `countries` and `continents` (totals, with category left blank), plus `continent`, `career_stage` and `country`, one row per category. Countries with fewer than 3 members are left out of the `country` rows.

Filter options are built from the data, so a new answer option in the form shows up as a filter automatically.

## Preview locally

```
quarto preview
```

## Roles

The work is split into two roles, which can be held by different people:

- **System administrator:** keeps the system running and changes it. Works in the Apps Script project, the forms' settings, the Google account and this repo.
- **Curator:** looks after the members. Works only in two tabs of the private spreadsheet and answers members' questions.

The curator is not responsible for anything in the System administration section.

## Curator roles and responsibilities

The curator needs **edit access to the private spreadsheet** ("RDN members (PRIVATE, do not share)"), shared from rdn.projectbase@gmail.com, and receives the curator emails (the `CURATOR` address in `Config.gs`). Nothing else is needed: no access to the script, the forms or this repo.

**Regular tasks**

| When | What to do | Where |
|---|---|---|
| Email "[RDN] New member to approve" | Check the entry looks genuine (a real person with a plausible research connection), then tick **Approved**. The member is emailed and appears on the map within about 10 minutes. | `Members` tab |
| Email with a note, e.g. "Could not find … on the map" | Correct **City**, **State/Province** or **Country**. The row is placed on the map again automatically. | `Members` tab |
| Note "This email is on the old member list" | An existing member joined through the join page instead of their invitation. Approve if it's them. | `Members` tab |
| Note "Same email as existing member" | Someone joined twice. Keep the newer row; ask the system administrator to remove the older one, or ask the member to leave with the older personal link. | `Members` tab |
| Email "[RDN] Leave request" | Check the request is plausible (e.g. it came from the member's own address, or the member confirmed by email), then tick **Confirmed**. The member is removed and emailed. Leave it unticked if in doubt. | `Leave requests` tab |
| Email "Photo with an unknown member reference" | Nothing to do; the photo was discarded. If the member writes, send them their **Photo link** (below). | – |

**Helping members**

- **"My email never arrived" or "I lost my personal link":** in their `Members` row, copy **Edit URL** (their personal link) and **Photo link**, and send both from your own address. Check first that the request comes from the member's own email address, because anyone with the personal link can change or delete the entry.
- **"Please remove me" by email:** ask them to use their personal link or the leave form; or, if the request clearly comes from them, pass it to the system administrator.
- **During invitations:** if someone replies asking to be removed from the old list, set their **Invite state** to `removed` in the `Invites` tab.

**Rules for the spreadsheet**

- Edit only **Approved**, **City**, **State/Province**, **Country** and **Curator notes** in `Members`, and **Confirmed** in `Leave requests`. Other columns are overwritten when a member edits their entry, or are used by the system.
- Don't rename, move, sort or delete tabs or columns, and don't delete rows. Ask the system administrator.
- Keep the private spreadsheet private: don't share it, download it or copy member details elsewhere.

## System administration

The system administrator needs the login for **rdn.projectbase@gmail.com**, which owns everything: the script, the forms, both spreadsheets and the photo folder. At least two people should be able to sign in (recovery details and 2-step verification backup codes kept somewhere both can reach), so the system doesn't depend on one person.

Step-by-step instructions for setup, testing and invitations are in [`apps-script/SETUP.md`](apps-script/SETUP.md). This section explains the whole system.

### How it was set up

1. **Google account.** rdn.projectbase@gmail.com was created for the network. Emails to members are sent from it; replies go to its inbox and are forwarded by Gmail to the organisers.
2. **Apps Script project** "RDN membership" in that account, with the Drive advanced service turned on. Its code is the bundle `apps-script/dist/RDN-membership.gs`, pasted over `Code.gs`.
3. **`setupMembership()`** (run once) created:
   - the **membership form** ("Form A", no sign-in) and the **photo form** ("Form B", sign-in required by Google for uploads);
   - the **private spreadsheet**, with the `Members` tab and the membership form's response tab (`Form responses`, earlier `Responses A (no photo)`);
   - the **public spreadsheet**, with the `public` and `summary` tabs;
   - the **photo folder** for the small public copies of photos;
   - script properties holding all their ids (see `showSetup()`).
4. **By hand:** the photo upload question in the photo form (Apps Script can't create upload questions); later `convertPhotoForm()` turned an earlier second full form into the small photo form.
5. **`setupLeaveForm()`** created the **leave form** and the `Leave requests` tab.
6. **`installTriggers()`** turned on the automation (below).
7. **Publishing:** the `public` and `summary` tabs were published to the web as CSV (File → Share → Publish to web), and their URLs set as `DATA_URL` and `SUMMARY_URL` in `index.qmd`.
8. **Site:** this repo, published to GitHub Pages by GitHub Actions on every push to `main`.

### How it works

```
Membership form ──► onSubmitA ──► Members tab (private) ──► public + summary tabs ──► CSV ──► map page
Photo form ───────► onPhotoSubmit ──► photo folder (public copy) ──┘
Leave form ───────► onLeaveRequest ──► Leave requests tab ──► curator ticks Confirmed ──► member removed
Curator edits ────► onSheetEdit (approve, re-geocode, confirm leave)
Timers: maintenanceTick (15 min), dailyRebuild (03:00), inviteTick (daily, during invitations)
```

**Joining and updating.** Each submission of the membership form runs `onSubmitA`, which:
- geocodes City/State/Country (and fills in country code and continent);
- writes or updates the person's row in `Members`;
- emails the member (with their personal link, which is the form's "edit response" link, and their photo-form link) and, for new members, the curator;
- rebuilds the public tabs.

New members appear on the map only after the curator approves them. Invited existing members who reply through their invitation link are approved automatically: the link carries a secret **member reference** that ties the reply to their row in the `Invites` tab.

**Photos.** The photo form identifies the member by the member reference in the link from their emails. A new photo replaces the old one; "Remove my photo" deletes it. The script publishes a ~400 px copy made by Google (which strips location data) to the public photo folder. The photo form's own responses are deleted straight away.

**Leaving.** Ticking "Leave the network" through a personal link removes the member at once. Any other route (the leave form, or ticking it on a fresh form) creates a row in `Leave requests` that the curator must confirm, so nobody can remove someone else.

**Public data.** After every change, `rebuildPublic_()` rewrites the public spreadsheet: only approved members who agreed to be on the map, only the fields they chose, locations rounded to city level, plus summary counts. The map page reads the published CSVs; the site never needs rebuilding for data changes.

**Invitations.** The old list sits in the `Invites` tab. `prepareInvites()` checks it and gives each row a member reference; `startInvites()` sends about 60 invitations a day and one reminder after 14 days; `exportInviteLinks()` lists people who haven't replied, for a mail merge from a personal address.

**Emails.** Sent with `MailApp` from rdn.projectbase@gmail.com (about 100 a day for a Gmail account). Failed sends are listed in the `Failed emails` tab. Script-sent emails don't appear in the account's Sent folder. Some institutions quarantine them; the form's cover page and the join page explain the alternatives.

**Code layout** (`apps-script/`):

| File | Contents |
|---|---|
| `Config.gs` | Settings (addresses, URLs, test mode), question titles (`Q`) and answer options (`OPTIONS`) |
| `Setup.gs` | Creating the forms; all form texts; `updateFormTexts`, `showSetup`, `convertPhotoForm` |
| `Automation.gs` | The trigger handlers: submissions, curator edits, timers |
| `Members.gs` | The `Members` tab: columns, reading and writing rows |
| `Emails.gs` | Every email's wording |
| `Public.gs` | The public and summary tabs |
| `Photos.gs`, `Links.gs`, `Geo.gs` | Photo publishing, prefilled links, geocoding |
| `Invite.gs`, `Leave.gs` | Invitations; leave requests |
| `Admin.gs` | Triggers, `diagnose`, `processMissedResponses`, `clearTestData`, other tools |
| `build.sh` | Bundles the files into `dist/RDN-membership.gs` |
| `tests/` | Simulations of every flow against mock Google services |

### How to change it

**The basic cycle** for any change to the script:

1. Edit the `.gs` file(s) in `apps-script/`.
2. Run the tests: `node apps-script/tests/flows.js` and `node apps-script/tests/formtexts.js`.
3. Run `apps-script/build.sh`, then paste `dist/RDN-membership.gs` over `Code.gs` in the Apps Script editor and save.
4. If the change affects form texts or options, run `updateFormTexts`. If Google asks for new permissions, tick **Select all**.
5. Commit and push.

Editing the code directly in the Apps Script editor works too, but the change is lost the next time the bundle is pasted. Always make changes in the repo.

**Common changes**

| Change | How |
|---|---|
| Wording of an email | `Emails.gs` (invitations: `Invite.gs`) |
| Form descriptions, cover page, help texts | `Setup.gs` (the text functions and constants), then `updateFormTexts` |
| Answer options (career stage, systems, organisms …) | `OPTIONS` in `Config.gs`, then `updateFormTexts`. New options appear in the map's filters automatically. |
| Curator or mailing-list address, sender name | `CONFIG` in `Config.gs` |
| End of the test phase | `TEST_PHASE: false` in `Config.gs`; empty `_test-banner.qmd` |
| Mailing list ready | Run `emailMailingListRequests`, then set `LISTSERV_NOTIFY_EACH: true` |
| Map page, join page, privacy notice | `index.qmd`, `join.qmd`; push to publish |

**Changes that need more care**

- **Question titles are how the script finds answers.** Rewording a question in the Form editor breaks it unless `Q` in `Config.gs` is changed to match. Formatting (bold) can be changed in the editor safely.
- **Adding a question** needs: the question in the form (or in `buildForm_` plus a manual add), a title in `Q`, a column in `MEMBER_COLS` and a line in `ANSWER_TO_COL` (`Members.gs`), and, if it should be public, a column in `Public.gs` and in the map page. Add new `Members` columns at the end.
- **Renaming tabs:** the script finds tabs by name. Use `renameResponsesTab()` for the response tab; don't rename `Members`, `Leave requests`, `Invites`, `public` or `summary`.
- **Public CSV columns** are the contract with the map page (see the table above): change both sides together.
- **Removing data:** `clearTestData()` deletes **all** members, responses and photos. It only runs when `ALLOW_CLEAR` in `Admin.gs` is set to `true`; set it back to `false` straight after.

### Troubleshooting

| Problem | What to run or check |
|---|---|
| Something seems not to be working | `diagnose`: logs the triggers, emails left today, the latest responses and `Members` rows, and failed emails |
| A submission isn't in `Members` | `processMissedResponses`, after checking `onSubmitA` is under **Triggers** |
| No triggers, or they've stopped | `installTriggers` (as rdn.projectbase@gmail.com) |
| "You do not have permission to call …" | Run any function in the editor and approve again, ticking **Select all**. Authorisation links contain `/u/N/`, which must match the rdn.projectbase account's position in the browser; a private window with only that account signed in avoids this. |
| Map out of date | `rebuildPublicNow` |
| Emails not arriving | The `Failed emails` tab; the recipient's junk folder or quarantine; see join.html#emails |
| Failures of automatic runs | Google emails "Summary of failures for Google Apps Script" to rdn.projectbase@gmail.com; details under **Executions** |
| Turn everything off | `removeTriggers` (and `stopInvites` during invitations) |

