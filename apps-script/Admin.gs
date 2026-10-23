/**
 * Admin functions, run by hand from the Apps Script editor.
 */

const AUTOMATION_HANDLERS = ['onSubmitA', 'onSubmitB', 'onPhotoSubmit', 'onSheetEdit', 'maintenanceTick', 'dailyRebuild', 'onLeaveRequest'];

/** Turns the automation on (safe to run again; it replaces its own triggers). */
function installTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => AUTOMATION_HANDLERS.indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onSubmitA').forForm(prop_('FORM_A_ID')).onFormSubmit().create();
  ScriptApp.newTrigger('onPhotoSubmit').forForm(prop_('FORM_B_ID')).onFormSubmit().create();
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(prop_('PRIVATE_SS_ID')).onEdit().create();
  ScriptApp.newTrigger('maintenanceTick').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('dailyRebuild').timeBased().everyDays(1).atHour(3).create();
  const leaveId = PropertiesService.getScriptProperties().getProperty('LEAVE_FORM_ID');
  if (leaveId) ScriptApp.newTrigger('onLeaveRequest').forForm(leaveId).onFormSubmit().create();
  membersSheet_();
  rebuildPublic_();
  Logger.log('Automation is on. Triggers: ' + ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()).join(', '));
}

/** Turns the automation off (the invitation timer, if any, is left alone). */
function removeTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => AUTOMATION_HANDLERS.indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('Automation is off.');
}

/**
 * Subscribes every approved member who hasn't opted out to the Sympa list, in one go.
 * Run it once when switching the list on (then set CONFIG.LISTSERV_NOTIFY_EACH to true).
 * Safe to run again: Sympa ignores people who are already subscribed.
 */
function syncMailingList() {
  const rows = readMembers_().rows.filter(r => r['Approved'] === true && isYes_(r['Mailing list']));
  const cmds = rows.map(r => sympaAdd_(r['Email'], r['Name'])).filter(Boolean);
  sendSympa_(cmds);
  Logger.log('Sent ' + cmds.length + ' subscribe commands to ' + CONFIG.SYMPA_ADDRESS +
             '. Sympa reports the result by email to rdn.projectbase@gmail.com.' +
             (CONFIG.LISTSERV_NOTIFY_EACH ? '' : ' Now set LISTSERV_NOTIFY_EACH to true in Config.gs.'));
}
function emailMailingListRequests() { syncMailingList(); }   // old name

/**
 * Deletes ALL member data: every response in both forms, all uploaded photos,
 * the Members tab rows, the response tabs and the public sheet. For clearing test
 * entries before launch. To run it, first change ALLOW_CLEAR to true, then change it back.
 */
const ALLOW_CLEAR = false;

function clearTestData() {
  if (!ALLOW_CLEAR) throw new Error('Safety catch: set ALLOW_CLEAR = true in Admin.gs first (and back to false afterwards).');
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    // Uploaded photos (including any from responses that never reached the Members tab)
    const formB = formFor_('B');
    const uploads = [];
    formB.getResponses().forEach(resp => resp.getItemResponses().forEach(ir => {
      if (ir.getItem().getTitle() === Q.PHOTO) [].concat(ir.getResponse() || []).forEach(id => uploads.push(id));
    }));
    readMembers_().rows.forEach(r => listOf_(r['Photo uploads']).forEach(id => uploads.push(id)));
    deleteUploads_(uploads);
    const folder = DriveApp.getFolderById(prop_('PHOTO_FOLDER_ID'));
    const files = folder.getFiles();
    let photos = 0;
    while (files.hasNext()) { files.next().setTrashed(true); photos++; }

    const nA = formFor_('A').getResponses().length, nB = formB.getResponses().length;
    formFor_('A').deleteAllResponses();
    formB.deleteAllResponses();

    const ss = SpreadsheetApp.openById(prop_('PRIVATE_SS_ID'));
    const props = PropertiesService.getScriptProperties();
    ['RESPONSES_A_TAB', 'RESPONSES_B_TAB'].forEach(k => {
      const sh = ss.getSheetByName(props.getProperty(k) || '');
      if (sh && sh.getLastRow() > 1) deleteRowsSafely_(sh, 2, sh.getLastRow() - 1);
    });
    const leaveId = props.getProperty('LEAVE_FORM_ID');
    if (leaveId) FormApp.openById(leaveId).deleteAllResponses();
    const leaveSh = ss.getSheetByName(LEAVE_TAB);
    if (leaveSh && leaveSh.getLastRow() > 1) deleteRowsSafely_(leaveSh, 2, leaveSh.getLastRow() - 1);
    const members = membersSheet_();
    if (members.getLastRow() > 1) deleteRowsSafely_(members, 2, members.getLastRow() - 1);

    rebuildPublic_();
    Logger.log('Deleted ' + nA + ' + ' + nB + ' responses, ' + uploads.length + ' uploads, ' + photos +
               ' public photos, and all Members rows. Now set ALLOW_CLEAR back to false.');
  } finally {
    lock.releaseLock();
  }
}


/**
 * Handles membership-form submissions that the automation missed (e.g. while its trigger
 * wasn't installed): responses not yet in Members, and edits made after a row was last updated.
 * Safe to run again; nothing is done twice.
 */
function processMissedResponses() {
  const m = readMembers_();
  const updated = {};
  m.rows.forEach(r => { if (r['Response ID']) updated[r['Response ID']] = new Date(r['Updated'] || 0).getTime(); });
  let n = 0;
  formFor_('A').getResponses().forEach(resp => {
    const seen = updated[resp.getId()];
    if (seen === undefined || resp.getTimestamp().getTime() > seen + 1000) {
      handleSubmit_('A', resp);
      n++;
    }
  });
  Logger.log(n ? 'Handled ' + n + ' missed submission(s).' : 'No missed submissions.');
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'onSubmitA')) {
    Logger.log('Warning: the onSubmitA trigger is not installed, so new submissions are not handled. Run installTriggers.');
  }
}

/** Logs what the automation knows: triggers, the latest form responses, Members rows, failed emails. */
function diagnose() {
  const L = s => Logger.log(s);
  L('Running as: ' + Session.getEffectiveUser().getEmail());
  L('Triggers: ' + (ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()).join(', ') || 'none'));
  L('Emails left today: ' + MailApp.getRemainingDailyQuota());
  L('Curator emails go to: ' + CONFIG.CURATOR + '; system administrator: ' + CONFIG.ADMIN);
  const formA = formFor_('A');
  L('Membership form: ' + formA.getTitle() + ' | ' + formA.getPublishedUrl());
  const m = readMembers_();
  const byResp = {};
  m.rows.forEach(r => { byResp[r['Response ID']] = r; });
  const resps = formA.getResponses();
  L('Membership form responses: ' + resps.length + ' (latest 5 below)');
  resps.slice(-5).forEach(resp => {
    const a = answersOf_(resp);
    const row = byResp[resp.getId()];
    L('  ' + resp.getTimestamp() + ' | ' + a[Q.EMAIL] + ' | ref ' + (a[Q.MEMBER_REF] || '-') + ' | ' +
      (row ? 'in Members (updated ' + row['Updated'] + ', approved ' + row['Approved'] + ')' : 'NOT in Members'));
  });
  L('Members rows: ' + m.rows.length + ' (latest 5 below)');
  m.rows.slice(-5).forEach(r => L('  ' + r['Email'] + ' | form ' + r['Form'] + ' | approved ' + r['Approved'] +
                                    ' | updated ' + r['Updated'] + ' | notes: ' + (r['Notes'] || '-')));
  const ss = SpreadsheetApp.openById(prop_('PRIVATE_SS_ID'));
  const failed = ss.getSheetByName('Failed emails');
  if (failed && failed.getLastRow() > 1) {
    L('Failed emails (latest 5):');
    failed.getRange(Math.max(2, failed.getLastRow() - 4), 1, Math.min(5, failed.getLastRow() - 1), 4).getValues()
      .forEach(v => L('  ' + v.join(' | ')));
  } else L('Failed emails: none');
  const inv = ss.getSheetByName(CONFIG.INVITES_TAB);
  L('Invites tab: ' + (inv ? (inv.getLastRow() - 1) + ' rows' : 'none'));
}

/** Fills in "Photo link" for any member rows that lack it (e.g. rows made before the column existed). */
function fillPhotoLinks() {
  const m = readMembers_();
  let n = 0;
  m.rows.forEach(r => {
    if (!r['Photo link'] && r['Member ref']) { r['Photo link'] = photoLink_(r['Member ref']); writeMember_(m.sh, r); n++; }
  });
  Logger.log('Photo links filled in for ' + n + ' members.');
}

/**
 * Renames the membership form's response tab in the private spreadsheet (default
 * "Form responses") and updates the script's record of its name, so leaving still
 * deletes the right rows. Safe to run again.
 */
function renameResponsesTab(newName) {
  newName = (typeof newName === 'string' && newName.trim()) ? newName.trim() : 'Form responses';
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.openById(prop_('PRIVATE_SS_ID'));
  const oldName = props.getProperty('RESPONSES_A_TAB') || '';
  const sh = ss.getSheetByName(oldName);
  if (!sh) {
    if (ss.getSheetByName(newName)) {
      props.setProperty('RESPONSES_A_TAB', newName);
      Logger.log('The tab is already called "' + newName + '". The script now uses that name.');
      return;
    }
    throw new Error('No tab called "' + oldName + '" in the private spreadsheet. If you renamed it by hand, ' +
                    'run renameResponsesTab again after changing the name back.');
  }
  if (oldName === newName) { Logger.log('Already called "' + newName + '". Nothing to do.'); return; }
  if (ss.getSheetByName(newName)) throw new Error('There is already a tab called "' + newName + '". Delete or rename it first.');
  sh.setName(newName);
  props.setProperty('RESPONSES_A_TAB', newName);
  Logger.log('Renamed "' + oldName + '" to "' + newName + '", and the script now uses the new name.');
}
