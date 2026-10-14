/**
 * The "Members" tab of the private spreadsheet: one row per member, kept up to
 * date by the automation. Curators tick "Approved" here. You can also correct
 * City / State/Province / Country here; the row is then geocoded again.
 * "Notes" is written by the script; use "Curator notes" for your own notes.
 * Other columns are overwritten when the member next edits their entry.
 */

const MEMBER_COLS = [
  'Approved', 'Member ID', 'Name', 'Email', 'Institution', 'City', 'State/Province', 'Country',
  'Country code', 'Continent', 'Lat', 'Lon', 'Website', 'Research interests',
  'Career stage', 'Research approach', 'Systems', 'Organisms', 'Level of organisation',
  'Stressors studied', 'Regions of fieldwork',
  'Show on map', 'Details shown', 'Mailing list',
  'Photo uploads', 'Photo URL', 'Photo pending',
  'Form', 'Response ID', 'Edit URL', 'Member ref', 'Joined', 'Updated', 'Notes', 'Curator notes',
];

/** Form question → Members column, for the plain answers copied across. */
const ANSWER_TO_COL = [
  [Q.NAME, 'Name'], [Q.EMAIL, 'Email'], [Q.INSTITUTION, 'Institution'], [Q.CITY, 'City'],
  [Q.STATE, 'State/Province'], [Q.COUNTRY, 'Country'], [Q.WEBSITE, 'Website'],
  [Q.INTERESTS, 'Research interests'], [Q.CAREER, 'Career stage'], [Q.APPROACH, 'Research approach'],
  [Q.SYSTEMS, 'Systems'], [Q.ORGANISMS, 'Organisms'], [Q.LEVELS, 'Level of organisation'],
  [Q.STRESSORS, 'Stressors studied'], [Q.REGIONS, 'Regions of fieldwork'],
  [Q.SHOW_ON_MAP, 'Show on map'], [Q.SHOW_FIELDS, 'Details shown'], [Q.MAILING_LIST, 'Mailing list'],
];

function membersSheet_() {
  const ss = SpreadsheetApp.openById(prop_('PRIVATE_SS_ID'));
  let sh = ss.getSheetByName('Members');
  if (!sh) sh = ss.insertSheet('Members', 0);
  const first = sh.getRange(1, 1, 1, MEMBER_COLS.length).getValues()[0];
  if (String(first[0]) !== MEMBER_COLS[0]) {
    sh.getRange(1, 1, 1, MEMBER_COLS.length).setValues([MEMBER_COLS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setFrozenColumns(3);
  }
  return sh;
}

/** Reads all members as objects (keyed by column name) with _row = sheet row number. */
function readMembers_() {
  const sh = membersSheet_();
  const last = sh.getLastRow();
  const values = last > 1 ? sh.getRange(2, 1, last - 1, MEMBER_COLS.length).getValues() : [];
  const rows = values
    .map((v, i) => {
      const o = {_row: i + 2};
      MEMBER_COLS.forEach((c, j) => { o[c] = v[j]; });
      return o;
    })
    .filter(o => o['Member ID'] || o['Response ID']);
  return {sh, rows};
}

/** Text a member typed is stored as text, never as a formula. */
function safeText_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') return v;
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

/** Writes rec to its row (rec._row) or appends a new row. */
function writeMember_(sh, rec) {
  const row = MEMBER_COLS.map(c => {
    const v = rec[c];
    if (c === 'Approved' || c === 'Photo pending') return v === true;
    if (v instanceof Date || typeof v === 'number') return v;
    return safeText_(v === undefined ? '' : String(v));
  });
  if (rec._row) {
    sh.getRange(rec._row, 1, 1, row.length).setValues([row]);
  } else {
    sh.appendRow(row);
    rec._row = sh.getLastRow();
    sh.getRange(rec._row, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  }
}

function deleteMemberRow_(sh, rec) {
  if (rec._row) deleteRowsSafely_(sh, rec._row, 1);
}

/** Sheets refuses to delete every non-frozen row, so keep one spare row at the bottom. */
function deleteRowsSafely_(sh, start, count) {
  if (count < 1) return;
  if (start + count - 1 >= sh.getMaxRows()) sh.insertRowAfter(sh.getMaxRows());
  sh.deleteRows(start, count);
}

/** A short random public id, e.g. "m4f9c2a1b". */
function newMemberId_() {
  return 'm' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

function isYes_(v) { return String(v || '').trim() === OPTIONS.YES; }

/** Splits a stored "a; b; c" cell into a list. */
function listOf_(v) {
  return String(v || '').split(';').map(s => s.trim()).filter(Boolean);
}
