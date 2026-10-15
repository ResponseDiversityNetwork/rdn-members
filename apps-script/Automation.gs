/**
 * What happens when someone submits a form.
 *
 * Triggers (created by installTriggers() in Admin.gs):
 *   onSubmitA:       the membership form (a new response, or an edit through a personal link);
 *   onPhotoSubmit:   the photo form;
 *   onLeaveRequest:  the leave form (Leave.gs);
 *   onSheetEdit:     a curator edits the Members or Leave requests tab;
 *   maintenanceTick: every 15 minutes, retries photos that weren't ready;
 *   dailyRebuild:    rebuilds the public sheet once a day as a safety net.
 *
 * Cases handled by handleSubmit_ (membership form):
 *   new:    a first submission → new Members row. Pending until approved, unless the response
 *           carries the member reference of an invited existing member.
 *   edit:   a submission through someone's personal link (same response) → row updated.
 *   moved:  a new response carrying a known member reference (e.g. an invitation reply after
 *           joining through the join page) → the row moves to the new response; the old one is deleted.
 *   leave:  "Leave the network" ticked → via a personal link, everything is deleted at once;
 *           on a fresh form, a leave request is queued for the curator instead.
 */

function onSubmitA(e) { handleSubmit_('A', e.response); }
function onPhotoSubmit(e) { handlePhotoSubmit_(e.response); }
function onSubmitB(e) { handlePhotoSubmit_(e.response); }   // old trigger name, until installTriggers is re-run

function formFor_(key) { return FormApp.openById(prop_(key === 'A' ? 'FORM_A_ID' : 'FORM_B_ID')); }

/** A response's answers as {question title: value}. Checkbox and upload answers are arrays. */
function answersOf_(response) {
  const a = {};
  response.getItemResponses().forEach(r => { a[r.getItem().getTitle()] = r.getResponse(); });
  return a;
}

function joinList_(v) {
  return Array.isArray(v) ? v.join('; ') : String(v === undefined || v === null ? '' : v).trim();
}

function handleSubmit_(formKey, response) {
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    const ans = answersOf_(response);
    const ref = String(ans[Q.MEMBER_REF] || '').trim();
    const leaving = [].concat(ans[Q.LEAVE] || []).length > 0;
    const m = readMembers_();

    let row = m.rows.find(r => r['Response ID'] === response.getId());
    let kind = row ? 'edit' : null;
    if (!row && ref) {
      row = m.rows.find(r => r['Member ref'] === ref);
      if (row) kind = 'moved';
    }

    if (leaving) {
      if (row) {
        doLeave_(m.sh, row, formKey, response, ans);   // via a personal link: takes effect at once
      } else {
        // A fresh form (no personal link) with "Leave" ticked: discard it, and if the email belongs to a
        // member, queue a leave request for the curator to confirm.
        deleteResponse_(formKey, response.getId(), [String(ans[Q.EMAIL] || '').trim().toLowerCase()]);
        deleteUploads_([].concat(ans[Q.PHOTO] || []));
        queueLeaveRequest_(ans[Q.EMAIL], ans[Q.NAME],
          'Ticked "Leave the network" on a new form, not via their personal link.', true);
      }
      rebuildPublic_();
      return;
    }

    let invite = null;
    if (!row) {
      kind = 'new';
      invite = ref ? markInviteResponded_(ref) : null;
    }

    const old = row ? Object.assign({}, row) : null;
    const rec = row || {};
    ANSWER_TO_COL.forEach(([q, c]) => { rec[c] = joinList_(ans[q]); });
    rec['Email'] = String(rec['Email']).trim().toLowerCase();
    rec['Form'] = formKey;
    rec['Response ID'] = response.getId();
    rec['Edit URL'] = response.getEditResponseUrl();
    rec['Updated'] = new Date();
    const notes = [];

    if (kind === 'new') {
      rec['Member ID'] = newMemberId_();
      rec['Member ref'] = invite ? ref : newMemberRef_();
      rec['Approved'] = !!invite;
      rec['Joined'] = invite && invite['Date joined'] ? invite['Date joined'] : new Date();
      if (!invite) {
        // An old-list member who joined through the join page (e.g. their invitation never arrived).
        const listed = inviteForEmail_(rec['Email']);
        if (listed) {
          if (listed['Date joined']) rec['Joined'] = listed['Date joined'];
          // Use their invitation's reference, so that a later reply via the invitation link updates this entry.
          if (listed['Member ref']) rec['Member ref'] = listed['Member ref'];
          markInviteState_(listed['Member ref'], 'responded');
          notes.push('This email is on the old member list (' + listed['Name'] + '). Approve to confirm.');
        }
      }
      const dup = m.rows.find(r => r['Email'] === rec['Email']);
      if (dup) notes.push('Same email as existing member ' + dup['Name'] + ' (' + dup['Member ID'] + ').');
    }

    // Location: geocoded on every submission, so the country name is always Google's spelling.
    const enteredCountry = rec['Country'];
    const g = geocode_(rec['City'], rec['State/Province'], enteredCountry);
    if (g) {
      rec['Lat'] = g.lat; rec['Lon'] = g.lon; rec['Country code'] = g.code;
      rec['Country'] = g.country || enteredCountry; rec['Continent'] = continentFor_(g.code);
    } else {
      rec['Lat'] = ''; rec['Lon'] = ''; rec['Country code'] = ''; rec['Continent'] = '';
      notes.push('Could not find "' + [rec['City'], rec['State/Province'], enteredCountry].filter(Boolean).join(', ') +
                 '" on the map. Correct City/Country in the Members tab.');
    }

    // Photos are handled by the photo form; a membership-form submission leaves them alone.

    // The member's entry moved to a new response: remove the old one.
    if (kind === 'moved' && old['Response ID'] && old['Response ID'] !== rec['Response ID']) {
      deleteResponse_(old['Form'] || 'A', old['Response ID'], [old['Email']]);
    }

    rec['Notes'] = notes.join(' ');
    writeMember_(m.sh, rec);

    // Emails
    if (kind === 'new') {
      if (rec['Approved']) {
        emailMember_(rec, response, 'welcome');
        if (isYes_(rec['Mailing list'])) listservNotify_('add', rec);
      } else {
        emailMember_(rec, response, 'received');
        emailCurator_(rec, notes);
      }
    } else if (kind === 'moved') {
      emailMember_(rec, response, 'linkChanged');
    }
    if (old) {
      const emailChanged = old['Email'] !== rec['Email'];
      if (emailChanged) {
        if (kind !== 'moved') emailMember_(rec, response, 'emailChanged');
        emailOldAddress_(old['Email'], rec['Email']);
      }
      if (rec['Approved']) {
        const was = isYes_(old['Mailing list']), now = isYes_(rec['Mailing list']);
        if (!was && now) listservNotify_('add', rec);
        else if (was && !now) listservNotify_('remove', old);
        else if (was && now && emailChanged) listservNotify_('change', rec, old['Email']);
      }
      if (notes.length && !old['Notes']) emailCurator_(rec, notes, true);
    }

    rebuildPublic_();
  } finally {
    lock.releaseLock();
  }
}

/**
 * The photo form: identifies the member by the reference in the link from their email, then
 * publishes the new photo (replacing any old one) or removes it. The form response itself is not kept.
 */
function handlePhotoSubmit_(response) {
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    const ans = answersOf_(response);
    const ref = String(ans[Q.MEMBER_REF] || '').trim();
    const uploads = [].concat(ans[Q.PHOTO] || []);
    const remove = [].concat(ans[Q.REMOVE_PHOTO] || []).length > 0;
    try { formFor_('B').deleteResponse(response.getId()); } catch (e) { /* ignore */ }
    const m = readMembers_();
    const rec = ref ? m.rows.find(r => r['Member ref'] === ref) : null;
    if (!rec) {
      deleteUploads_(uploads);
      mail_(CONFIG.CURATOR, '[RDN] Photo discarded: unknown member reference', [
        'Someone used the photo form without a valid member reference (' + esc_(ref || 'empty') + '), so the photo was discarded. ' +
        'If they write to you, send them the photo link from their own membership emails.']);
      return;
    }
    const oldUploads = listOf_(rec['Photo uploads']);
    if (remove) {
      deleteUploads_(oldUploads.concat(uploads));
      deletePublicPhoto_(rec['Member ID']);
      rec['Photo uploads'] = ''; rec['Photo URL'] = ''; rec['Photo pending'] = false;
    } else if (uploads.length) {
      deleteUploads_(oldUploads.filter(id => uploads.indexOf(id) < 0));
      const url = publishPhoto_(uploads[0], rec['Member ID']);
      rec['Photo uploads'] = uploads.join('; ');
      rec['Photo URL'] = url || '';
      rec['Photo pending'] = !url;
    } else {
      return;   // nothing to do
    }
    rec['Updated'] = new Date();
    writeMember_(m.sh, rec);
    rebuildPublic_();
  } finally {
    lock.releaseLock();
  }
}

/** Deletes everything about a member who ticked "Leave the network". */
function doLeave_(sh, row, formKey, response, ans) {
  const email = String(ans[Q.EMAIL] || '').trim().toLowerCase();
  const emails = [email].concat(row ? [row['Email']] : []);
  // The response that was just submitted
  deleteResponse_(formKey, response.getId(), emails);
  deleteUploads_([].concat(ans[Q.PHOTO] || []));
  if (row) removeMember_(sh, row, emails, response.getId());
  if (email) emailLeft_(email, ans[Q.NAME]);
}

/**
 * Deletes everything about a member: their form response and its sheet row, photos,
 * Members row; marks their invitation "left"; asks the listserv manager to unsubscribe them.
 */
function removeMember_(sh, row, emails, skipResponseId) {
  emails = (emails || []).concat([row['Email']]);
  if (row['Response ID'] && row['Response ID'] !== skipResponseId) deleteResponse_(row['Form'], row['Response ID'], emails);
  deleteUploads_(listOf_(row['Photo uploads']));
  deletePublicPhoto_(row['Member ID']);
  markInviteState_(row['Member ref'], 'left');
  if (row['Approved'] === true && isYes_(row['Mailing list'])) listservNotify_('remove', row);
  deleteMemberRow_(sh, row);
}

/** Deletes a response from its form and its row in the form's responses tab. */
function deleteResponse_(formKey, responseId, emails) {
  try { formFor_(formKey).deleteResponse(responseId); } catch (e) { /* already gone */ }
  const tabName = PropertiesService.getScriptProperties().getProperty(formKey === 'A' ? 'RESPONSES_A_TAB' : 'RESPONSES_B_TAB');
  const sh = tabName && SpreadsheetApp.openById(prop_('PRIVATE_SS_ID')).getSheetByName(tabName);
  if (!sh || sh.getLastRow() < 2) return;
  const values = sh.getDataRange().getValues();
  const col = values[0].map(String).indexOf(Q.EMAIL);
  if (col < 0) return;
  const targets = emails.filter(Boolean).map(s => String(s).trim().toLowerCase());
  for (let i = values.length - 1; i >= 1; i--) {
    if (targets.indexOf(String(values[i][col]).trim().toLowerCase()) >= 0) deleteRowsSafely_(sh, i + 1, 1);
  }
}

/**
 * Curator edits in the Members tab. Ticking "Approved" publishes the member and
 * emails them; changing City / State/Province / Country geocodes the row again.
 */
function onSheetEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() === LEAVE_TAB && e.range.getRow() >= 2) return onLeaveSheetEdit_(e);
  if (sh.getName() !== 'Members' || e.range.getRow() < 2) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    const firstCol = e.range.getColumn(), lastCol = firstCol + e.range.getNumColumns() - 1;
    const touched = c => { const i = MEMBER_COLS.indexOf(c) + 1; return i >= firstCol && i <= lastCol; };
    const rows = readMembers_().rows.filter(r => r._row >= e.range.getRow() &&
                                                 r._row < e.range.getRow() + e.range.getNumRows());
    rows.forEach(rec => {
      if (touched('City') || touched('State/Province') || touched('Country')) {
        const g = geocode_(rec['City'], rec['State/Province'], rec['Country']);
        if (g) {
          rec['Lat'] = g.lat; rec['Lon'] = g.lon; rec['Country code'] = g.code;
          rec['Country'] = g.country; rec['Continent'] = continentFor_(g.code);
          rec['Notes'] = '';
        } else {
          rec['Notes'] = 'Still could not find this place on the map.';
        }
        writeMember_(sh, rec);
      }
      if (touched('Approved') && rec['Approved'] === true && String(e.oldValue).toUpperCase() !== 'TRUE') {
        emailApproved_(rec);
        if (isYes_(rec['Mailing list'])) listservNotify_('add', rec);
      }
    });
    rebuildPublic_();
  } finally {
    lock.releaseLock();
  }
}

/** Every 15 minutes: publishes photos whose thumbnail wasn't ready at submit time. */
function maintenanceTick() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const m = readMembers_();
    let changed = false;
    m.rows.filter(r => r['Photo pending'] === true).forEach(rec => {
      const ids = listOf_(rec['Photo uploads']);
      if (!ids.length) { rec['Photo pending'] = false; writeMember_(m.sh, rec); return; }
      const url = publishPhoto_(ids[0], rec['Member ID']);
      const age = Date.now() - new Date(rec['Updated']).getTime();
      if (url || age > 2 * 24 * 3600 * 1000) {   // give up after 2 days
        rec['Photo URL'] = url || '';
        rec['Photo pending'] = false;
        if (!url) rec['Notes'] = (rec['Notes'] ? rec['Notes'] + ' ' : '') + 'Photo could not be processed.';
        writeMember_(m.sh, rec);
        changed = true;
      }
    });
    if (changed) rebuildPublic_();
  } finally {
    lock.releaseLock();
  }
}

function dailyRebuild() {
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try { rebuildPublic_(); } finally { lock.releaseLock(); }
}
