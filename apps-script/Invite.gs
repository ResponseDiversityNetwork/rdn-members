/**
 * Inviting the existing members to the new system.
 *
 * 1. Import the old list as a tab called "Invites" in the PRIVATE spreadsheet.
 *    Expected columns: Name, Organisation, Country, City, State/Province, Email,
 *    Status, Comments, Date joined.
 * 2. Run prepareInvites(). It adds tracking columns, gives each row a secret member
 *    reference, and flags rows it can't invite (no or invalid email, duplicate email).
 *    The Status and Comments columns are ignored.
 * 3. Run sendTestInvite(). It sends the first row's invitation to CONFIG.CURATOR only.
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
  const first = firstName_(r['Name']);
  const answers = inviteAnswers_(r);
  const linkA = prefillUrl_(formsCache_().a, answers);
  const linkB = prefillUrl_(formsCache_().b, answers);
  const subject = isReminder ? 'Reminder: your Response Diversity Network membership'
                             : 'Response Diversity Network: your membership in our new system';
  const intro = isReminder
    ? 'A couple of weeks ago we asked you to move your Response Diversity Network membership to our new system. If you have two minutes, please do it now.'
    : 'The Response Diversity Network has a new membership system, with a map of members. ' +
      'We have filled in what we already know about you. Please check it, add a few details about your research, ' +
      'and choose what, if anything, is shown on the map. It takes about two minutes.';
  const paragraphs = [
    'Dear ' + esc_(first) + ',',
    esc_(intro),
    '<b>' + link_(linkA, 'Open my membership form') + '</b> (Google Forms, no sign-in needed).',
    'If you would like a photo on the map, use the ' + link_(linkB, 'photo version of the form') +
      ' instead (Google Forms; it needs a Google sign-in).',
    'Nothing about you is shown publicly unless you agree to it in the form. You can change your answers or leave at any time. ' +
      'More about membership and privacy: ' + link_(CONFIG.INFO_URL, CONFIG.INFO_URL),
    'So that our emails reach you, please add ' + esc_(CONFIG.CONTACT_EMAIL) + ' to your contacts. ' +
      'If you no longer want to be part of the network, just reply to this email.',
    'Best wishes,<br>' + esc_(CONFIG.ORG_NAME),
  ];
  return {subject, paragraphs};
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
  const html = m.paragraphs.map(p => '<p>' + p + '</p>').join('\n');
  const text = m.paragraphs
    .map(p => p.replace(/<a href="([^"]+)">([^<]+)<\/a>/g, '$2: $1').replace(/<br>/g, '\n').replace(/<[^>]+>/g, ''))
    .map(p => p.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"))
    .join('\n\n');
  // Sent directly (not via mail_) so that a failure is recorded in the Invites tab and retried.
  MailApp.sendEmail(mailOptions_({to, subject: m.subject, body: text, htmlBody: html}));
}

/** Step 3. Sends the first ready row's invitation to CONFIG.CURATOR only. */
function sendTestInvite() {
  const r = readInvites_().rows.find(x => x['Invite state'] === 'ready');
  if (!r) throw new Error('No row is "ready". Run prepareInvites() first.');
  sendInvite_(CONFIG.CURATOR, r, false);
  Logger.log('Test invitation for row ' + r._row + ' (' + r['Name'] + ') sent to ' + CONFIG.CURATOR);
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


/** The old-list row with this email address, or null (also null if there is no Invites tab). */
function inviteForEmail_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return null;
  const ss = SpreadsheetApp.openById(prop_('PRIVATE_SS_ID'));
  if (!ss.getSheetByName(CONFIG.INVITES_TAB)) return null;
  return readInvites_().rows.find(r => String(r['Email'] || '').trim().toLowerCase() === email) || null;
}

/**
 * Writes an "Invite links" tab: one row per old-list member who has not responded yet,
 * with their personal pre-filled links. Download it as CSV for a mail merge from your own
 * email account (e.g. Word mail merge to Outlook), which organisations' filters trust more.
 */
function exportInviteLinks() {
  const rows = readInvites_().rows.filter(r => ['ready', 'invited'].indexOf(r['Invite state']) >= 0);
  const out = rows.map(r => {
    const a = inviteAnswers_(r);
    return [String(r['Name'] || '').trim(), firstName_(r['Name']), String(r['Email'] || '').trim(),
            prefillUrl_(formsCache_().a, a), prefillUrl_(formsCache_().b, a), r['Invite state']];
  });
  writeTab_(SpreadsheetApp.openById(prop_('PRIVATE_SS_ID')), 'Invite links',
            ['Name', 'FirstName', 'Email', 'LinkNoPhoto', 'LinkWithPhoto', 'InviteState'], out);
  Logger.log('Wrote ' + out.length + ' rows to the "Invite links" tab (members who have not responded yet).');
}
