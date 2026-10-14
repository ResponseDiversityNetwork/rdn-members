/**
 * Inviting the existing members to the new system.
 *
 * 1. Import the old list as a tab called "Invites" in the PRIVATE spreadsheet.
 *    Expected columns: Name, Organisation, Country, City, State/Province, Email,
 *    Status, Comments, Date joined.
 * 2. Run prepareInvites(). It adds tracking columns, gives each row a secret member
 *    reference, and flags rows it can't invite (no or invalid email, duplicate email).
 *    The Status and Comments columns are ignored.
 * 3. Run sendTestInvite(). It sends the first row's invitation to CONFIG.REPLY_TO only.
 * 4. Run startInvites(). It sends about 60 invitations a day (keeping email quota for replies), and
 *    sets a daily timer that continues until everyone is invited. The timer also sends one
 *    reminder REMINDER_AFTER_DAYS later to anyone who hasn't responded.
 *
 * When an invited person submits a form, the response carries their member reference.
 * The submit handler calls markInviteResponded_(ref), which records the reply and
 * returns the old row, so they skip curator approval and keep their "Date joined".
 */

const INVITE_COLS = ['Member ref', 'Invite state', 'Invited at', 'Reminded at', 'Responded at', 'Invite note'];

function invitesSheet_() {
  const sh = SpreadsheetApp.openById(prop_('PRIVATE_SS_ID')).getSheetByName(CONFIG.INVITES_TAB);
  if (!sh) throw new Error('No "' + CONFIG.INVITES_TAB + '" tab in the private spreadsheet. Import the old list first.');
  return sh;
}

/** Reads the Invites tab as objects keyed by header, plus a column-index lookup. */
function readInvites_() {
  const sh = invitesSheet_();
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim());
  const col = name => {
    const i = headers.indexOf(name);
    if (i < 0) throw new Error('Column "' + name + '" not found in the Invites tab.');
    return i;
  };
  const rows = values.slice(1).map((v, i) => {
    const o = {_row: i + 2};
    headers.forEach((h, j) => { o[h] = v[j]; });
    return o;
  });
  return {sh, headers, col, rows};
}

function setCell_(inv, row, colName, value) {
  inv.sh.getRange(row._row, inv.col(colName) + 1).setValue(value);
  row[colName] = value;
}

/** Step 2. Safe to run again; existing references and states are kept. */
function prepareInvites() {
  const sh = invitesSheet_();
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const missing = INVITE_COLS.filter(c => headers.indexOf(c) < 0);
  if (missing.length) sh.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);

  const inv = readInvites_();
  const seen = {};
  let ready = 0, flagged = 0;
  inv.rows.forEach(r => {
    if (!r['Member ref']) setCell_(inv, r, 'Member ref', newMemberRef_());
    if (r['Invite state'] && r['Invite state'] !== 'not invitable') return;   // already handled
    const email = String(r['Email'] || '').trim().toLowerCase();
    let note = '';
    if (!email) note = 'no email';
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) note = 'email looks invalid';
    else if (seen[email]) note = 'duplicate of row ' + seen[email];
    if (email && !seen[email]) seen[email] = r._row;
    setCell_(inv, r, 'Invite state', note ? 'not invitable' : 'ready');
    setCell_(inv, r, 'Invite note', note);
    note ? flagged++ : ready++;
  });
  sh.setFrozenRows(1);
  Logger.log(ready + ' rows ready to invite; ' + flagged + ' flagged (see the "Invite note" column).');
}

/** The prefilled answers for one old-list row. */
function inviteAnswers_(r) {
  const a = {};
  a[Q.NAME] = String(r['Name'] || '').trim();
  a[Q.EMAIL] = String(r['Email'] || '').trim();
  a[Q.INSTITUTION] = String(r['Organisation'] || '').trim();
  a[Q.CITY] = String(r['City'] || '').trim();
  a[Q.STATE] = String(r['State/Province'] || '').trim();
  a[Q.COUNTRY] = String(r['Country'] || '').trim();
  a[Q.MEMBER_REF] = r['Member ref'];
  return a;
}

function inviteEmail_(r, isReminder) {
  const first = String(r['Name'] || '').trim().split(/\s+/)[0] || 'colleague';
  const answers = inviteAnswers_(r);
  const linkA = prefillUrl_(formsCache_().a, answers);
  const linkB = prefillUrl_(formsCache_().b, answers);
  const subject = (isReminder ? 'Reminder: ' : '') + 'Please update your Response Diversity Network membership';
  const intro = isReminder
    ? 'A couple of weeks ago we invited you to move your RDN membership to our new system. If you have a couple of minutes, please do it now.'
    : 'The Response Diversity Network has a new membership system, with a public map of members. ' +
      'We have filled in what we already know about you. Please check it, add a few details about your research, and choose what (if anything) is shown on the map.';
  const html =
    '<p>Dear ' + esc_(first) + ',</p>' +
    '<p>' + esc_(intro) + ' It takes about two minutes.</p>' +
    '<p><a href="' + linkA + '"><b>Update my membership</b></a> (no sign-in needed)</p>' +
    '<p>Or, if you would like a photo on the map: <a href="' + linkB + '">update my membership and add a photo</a> ' +
    '(Google requires you to sign in to upload a photo).</p>' +
    '<p>Nothing about you is shown publicly unless you agree to it in the form. You can change your answers or leave at any time. ' +
    'See <a href="' + CONFIG.INFO_URL + '">how membership works and our privacy notice</a>, ' +
    'and the <a href="' + CONFIG.MAP_URL + '">member map</a>.</p>' +
    '<p>If you no longer want to be part of RDN, just reply to this email and we will remove you from our list.</p>' +
    '<p>Best wishes,<br>' + esc_(CONFIG.ORG_NAME) + '</p>';
  const text =
    'Dear ' + first + ',\n\n' + intro + ' It takes about two minutes.\n\n' +
    'Update my membership (no sign-in needed):\n' + linkA + '\n\n' +
    'Update my membership and add a photo (Google sign-in required):\n' + linkB + '\n\n' +
    'Nothing about you is shown publicly unless you agree to it in the form. You can change your answers or leave at any time.\n' +
    'How membership works, and our privacy notice: ' + CONFIG.INFO_URL + '\n\n' +
    'If you no longer want to be part of RDN, just reply to this email and we will remove you from our list.\n\n' +
    'Best wishes,\n' + CONFIG.ORG_NAME;
  return {subject, html, text};
}

let FORMS_CACHE_ = null;
function formsCache_() {
  if (!FORMS_CACHE_) FORMS_CACHE_ = {a: FormApp.openById(prop_('FORM_A_ID')), b: FormApp.openById(prop_('FORM_B_ID'))};
  return FORMS_CACHE_;
}

function esc_(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}

function sendInvite_(to, r, isReminder) {
  const m = inviteEmail_(r, isReminder);
  MailApp.sendEmail({to, subject: m.subject, body: m.text, htmlBody: m.html,
                     name: CONFIG.SENDER_NAME, replyTo: CONFIG.REPLY_TO});
}

/** Step 3. Sends the first ready row's invitation to CONFIG.REPLY_TO only. */
function sendTestInvite() {
  const r = readInvites_().rows.find(x => x['Invite state'] === 'ready');
  if (!r) throw new Error('No row is "ready". Run prepareInvites() first.');
  sendInvite_(CONFIG.REPLY_TO, r, false);
  Logger.log('Test invitation for row ' + r._row + ' (' + r['Name'] + ') sent to ' + CONFIG.REPLY_TO);
}

/** Step 4. Sends today's batch and sets the daily timer. */
function startInvites() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'inviteTick')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('inviteTick').timeBased().everyDays(1).atHour(9).create();
  inviteTick();
}

/** Runs daily: reminders first, then new invitations, within the quota. Stops itself when done. */
function inviteTick() {
  const inv = readInvites_();
  let budget = MailApp.getRemainingDailyQuota() - CONFIG.INVITE_EMAIL_RESERVE;
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  let sent = 0, reminded = 0;

  inv.rows.forEach(r => {
    if (budget <= 0 || r['Invite state'] !== 'invited' || r['Reminded at']) return;
    if ((now - new Date(r['Invited at'])) < CONFIG.REMINDER_AFTER_DAYS * dayMs) return;
    try {
      sendInvite_(String(r['Email']).trim(), r, true);
      setCell_(inv, r, 'Reminded at', now);
      reminded++; budget--;
    } catch (e) { setCell_(inv, r, 'Invite note', 'reminder failed: ' + e.message); }
  });

  inv.rows.forEach(r => {
    if (budget <= 0 || r['Invite state'] !== 'ready') return;
    try {
      sendInvite_(String(r['Email']).trim(), r, false);
      setCell_(inv, r, 'Invite state', 'invited');
      setCell_(inv, r, 'Invited at', now);
      sent++; budget--;
    } catch (e) { setCell_(inv, r, 'Invite note', 'send failed: ' + e.message); }
  });

  const notYet = inv.rows.filter(r => r['Invite state'] === 'ready').length;
  const awaitingReminder = inv.rows.filter(r => r['Invite state'] === 'invited' && !r['Reminded at']).length;
  if (!notYet && !awaitingReminder) {
    ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'inviteTick')
      .forEach(t => ScriptApp.deleteTrigger(t));
  }
  Logger.log('Today: invited ' + sent + ', reminded ' + reminded + '. Not yet invited: ' + notYet +
             '. Invited, no reply, reminder not yet due: ' + awaitingReminder + '.');
}

/**
 * Called by the submit handler when a new response has a member reference.
 * Returns the old-list row if the reference belongs to an invitation, else null.
 */
function markInviteResponded_(ref) {
  const r = markInviteState_(ref, 'responded');
  return r;
}

/** Sets an invitation's state (if the Invites tab and the reference exist). Returns the row or null. */
function markInviteState_(ref, state) {
  if (!ref) return null;
  const ss = SpreadsheetApp.openById(prop_('PRIVATE_SS_ID'));
  if (!ss.getSheetByName(CONFIG.INVITES_TAB)) return null;
  const inv = readInvites_();
  if (inv.headers.indexOf('Member ref') < 0) return null;
  const r = inv.rows.find(x => x['Member ref'] === ref);
  if (!r) return null;
  if (state === 'responded' && !r['Responded at']) setCell_(inv, r, 'Responded at', new Date());
  setCell_(inv, r, 'Invite state', state);
  return r;
}

/** Progress summary in the log. */
function inviteProgress() {
  const counts = {};
  readInvites_().rows.forEach(r => { const s = r['Invite state'] || '(blank)'; counts[s] = (counts[s] || 0) + 1; });
  Logger.log(JSON.stringify(counts, null, 2));
}

/** Switches off the daily invitation timer (invitations and reminders stop; nothing is deleted). */
function stopInvites() {
  const ts = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'inviteTick');
  ts.forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log(ts.length ? 'Invitation timer switched off.' : 'No invitation timer was running.');
}
