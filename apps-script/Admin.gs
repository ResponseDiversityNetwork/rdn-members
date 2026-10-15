/**
 * Admin functions, run by hand from the Apps Script editor.
 */

const AUTOMATION_HANDLERS = ['onSubmitA', 'onSubmitB', 'onSheetEdit', 'maintenanceTick', 'dailyRebuild', 'onLeaveRequest'];

/** Turns the automation on (safe to run again; it replaces its own triggers). */
function installTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => AUTOMATION_HANDLERS.indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onSubmitA').forForm(prop_('FORM_A_ID')).onFormSubmit().create();
  ScriptApp.newTrigger('onSubmitB').forForm(prop_('FORM_B_ID')).onFormSubmit().create();
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
 * Once the mailing list exists: emails the listserv manager everyone (approved) who
 * asked to join, one per line as "Name <email>", ready for a bulk subscribe.
 * Then set CONFIG.LISTSERV_NOTIFY_EACH to true so later changes are sent one by one.
 */
function emailMailingListRequests() {
  const rows = readMembers_().rows.filter(r => r['Approved'] === true && isYes_(r['Mailing list']));
  const lines = rows.map(r => String(r['Name']).replace(/[<>]/g, '') + ' <' + r['Email'] + '>');
  MailApp.sendEmail(mailOptions_({
    to: CONFIG.LISTSERV_MANAGER,
    subject: '[RDN list] ' + rows.length + ' members to subscribe',
    body: 'These members asked to join the RDN mailing list. One per line, for bulk subscribe:\n\n' + lines.join('\n') +
          '\n\nFrom now on you will get an email for each new request, change or removal.',
  }));
  Logger.log('Sent ' + rows.length + ' addresses to ' + CONFIG.LISTSERV_MANAGER +
             '. Now set LISTSERV_NOTIFY_EACH to true in Config.gs.');
}

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
