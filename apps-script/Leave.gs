/**
 * A short, separate "leave the network" form for people who don't have (or don't want to use)
 * their personal link. Requests are queued in the "Leave requests" tab of the private spreadsheet
 * and only carried out when a curator ticks "Confirmed".
 * (Leaving through the personal link, by ticking "Leave the network", still takes effect at once.)
 *
 * Setup: run setupLeaveForm() once. It creates the form and its trigger and logs its link.
 */

const LEAVE_TAB = 'Leave requests';
const LEAVE_COLS = ['Confirmed', 'Requested', 'Email', 'Name given', 'Message', 'Found', 'Member ID', 'Status', 'Done at'];

function setupLeaveForm() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('LEAVE_FORM_ID')) throw new Error('The leave form already exists: ' + p.getProperty('LEAVE_FORM_URL'));
  const f = FormApp.create('Response Diversity Network: leave the network');
  f.setDescription('Use this form to ask to leave the ' + CONFIG.ORG_NAME + '. A curator will confirm your request, ' +
      'usually within a few days. We then remove you from the member map and the mailing list, delete your entry, ' +
      'and email you to confirm.\n\nIf you have your personal link (the "Edit your response" link, or the link in our emails), ' +
      'you can also leave straight away: open it, tick "Leave the network" on the last page, and submit.')
   .setCollectEmail(false)
   .setAllowResponseEdits(false)
   .setShowLinkToRespondAgain(false)
   .setConfirmationMessage('Thank you. A curator will confirm your request, usually within a few days, ' +
      'and we will email you when it is done.');
  if (typeof f.setPublished === 'function') f.setPublished(true);
  f.addTextItem().setTitle(LQ.EMAIL).setRequired(true)
   .setHelpText('The email address you used for your RDN membership.')
   .setValidation(FormApp.createTextValidation().requireTextIsEmail().setHelpText('Please enter a valid email address.').build());
  f.addTextItem().setTitle(LQ.NAME);
  f.addParagraphTextItem().setTitle(LQ.MESSAGE);
  f.addCheckboxItem().setTitle(LQ.CONFIRM).setRequired(true).setChoiceValues([LEAVE_CONFIRM_OPTION]);
  const url = f.shortenFormUrl(f.getPublishedUrl());
  p.setProperties({LEAVE_FORM_ID: f.getId(), LEAVE_FORM_URL: url});
  ScriptApp.newTrigger('onLeaveRequest').forForm(f).onFormSubmit().create();
  leaveSheet_();
  Logger.log('Leave form, public link: ' + url);
  Logger.log('Leave form, edit:        ' + f.getEditUrl());
}

function leaveSheet_() {
  const ss = SpreadsheetApp.openById(prop_('PRIVATE_SS_ID'));
  let sh = ss.getSheetByName(LEAVE_TAB);
  if (!sh) {
    sh = ss.insertSheet(LEAVE_TAB);
    sh.getRange(1, 1, 1, LEAVE_COLS.length).setValues([LEAVE_COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Trigger: a leave request was submitted. Queues it, tells the curator, and acknowledges it. */
function onLeaveRequest(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    const ans = answersOf_(e.response);
    const email = String(ans[LQ.EMAIL] || '').trim().toLowerCase();
    const nameGiven = String(ans[LQ.NAME] || '').trim();
    const message = String(ans[LQ.MESSAGE] || '').trim();
    const member = readMembers_().rows.find(r => r['Email'] === email);
    const listed = member ? null : inviteForEmail_(email);
    const found = member ? 'Member: ' + member['Name'] + ' (' + member['Member ID'] + ')'
                : listed ? 'Only on the old member list: ' + listed['Name']
                : 'No member with this email address';
    const sh = leaveSheet_();
    sh.appendRow([false, new Date(), email, safeText_(nameGiven), safeText_(message), found,
                  member ? member['Member ID'] : '', 'Waiting for curator', '']);
    sh.getRange(sh.getLastRow(), 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    // The request is now in the tab; don't keep a second copy in the form.
    try { FormApp.openById(prop_('LEAVE_FORM_ID')).deleteResponse(e.response.getId()); } catch (err) { /* ignore */ }
    if (member || listed) emailLeaveReceived_(email, member ? member['Name'] : listed['Name']);
    emailCuratorLeave_(email, found, message);
  } finally {
    lock.releaseLock();
  }
}

/** Called from onSheetEdit when the curator edits the Leave requests tab. */
function onLeaveSheetEdit_(e) {
  const confirmedCol = LEAVE_COLS.indexOf('Confirmed') + 1;
  const first = e.range.getColumn(), last = first + e.range.getNumColumns() - 1;
  if (confirmedCol < first || confirmedCol > last) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    const sh = leaveSheet_();
    let changed = false;
    for (let r = e.range.getRow(); r < e.range.getRow() + e.range.getNumRows(); r++) {
      const v = sh.getRange(r, 1, 1, LEAVE_COLS.length).getValues()[0];
      const req = {};
      LEAVE_COLS.forEach((c, i) => { req[c] = v[i]; });
      if (req['Confirmed'] !== true || String(req['Status']).indexOf('Done') === 0) continue;
      const status = carryOutLeave_(req);
      sh.getRange(r, LEAVE_COLS.indexOf('Status') + 1, 1, 2).setValues([[status, new Date()]]);
      changed = true;
    }
    if (changed) rebuildPublic_();
  } finally {
    lock.releaseLock();
  }
}

/** Deletes the member (and/or marks them removed on the old list). Returns a status text. */
function carryOutLeave_(req) {
  const email = String(req['Email'] || '').trim().toLowerCase();
  const m = readMembers_();
  const member = (req['Member ID'] && m.rows.find(r => r['Member ID'] === req['Member ID'])) ||
                 m.rows.find(r => r['Email'] === email);
  const listed = inviteForEmail_(email);
  if (member) removeMember_(m.sh, member, [email]);
  if (listed) markInviteState_(listed['Member ref'], 'removed');
  if (!member && !listed) return 'Done: nothing to delete (no member with this email)';
  emailLeft_(member ? member['Email'] : email, member ? member['Name'] : listed['Name']);
  return member ? 'Done: entry deleted' : 'Done: removed from the old member list';
}
