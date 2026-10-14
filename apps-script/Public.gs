/**
 * Builds the PUBLIC spreadsheet that the map reads. It has two tabs, each published to the web as CSV:
 *   public:  one row per approved member who agreed to be on the map, with only the
 *            details they chose to show and coordinates rounded to 2 decimals;
 *   summary: counts over ALL approved members (no names), for the summary on the map page.
 * Column layouts must match README.md ("Public CSV columns").
 */

const PUBLIC_COLS = ['id', 'name', 'institution', 'city', 'country', 'lat', 'lon', 'email', 'website', 'interests',
                     'career_stage', 'approach', 'systems', 'organisms', 'levels', 'stressors', 'regions',
                     'continent', 'photo_url'];
const SUMMARY_MIN_COUNTRY = 3;

function publicRow_(r) {
  const shown = new Set(listOf_(r['Details shown']));
  const show = (label, value) => shown.has(label) ? value : '';
  const attrs = shown.has('Research attributes');
  let web = String(r['Website'] || '').trim();
  if (web && !/^https?:\/\//i.test(web)) web = 'https://' + web;
  const round = x => Math.round(Number(x) * 100) / 100;
  return {
    id: r['Member ID'],
    name: show('Name', r['Name']),
    institution: show('Institution', r['Institution']),
    city: r['City'],
    country: r['Country'],
    lat: round(r['Lat']),
    lon: round(r['Lon']),
    email: show('Email', r['Email']),
    website: show('Website', web),
    interests: show('Research interests', r['Research interests']),
    career_stage: attrs ? r['Career stage'] : '',
    approach: attrs ? r['Research approach'] : '',
    systems: attrs ? r['Systems'] : '',
    organisms: attrs ? r['Organisms'] : '',
    levels: attrs ? r['Level of organisation'] : '',
    stressors: attrs ? r['Stressors studied'] : '',
    regions: attrs ? r['Regions of fieldwork'] : '',
    continent: r['Continent'],
    photo_url: show(OPTIONS.SHOW_FIELDS_PHOTO, r['Photo URL']),
  };
}

function summaryRows_(approved) {
  const count = (key) => {
    const c = {};
    approved.forEach(r => { const k = String(r[key] || '').trim(); if (k) c[k] = (c[k] || 0) + 1; });
    return c;
  };
  const countries = count('Country'), continents = count('Continent'), stages = count('Career stage');
  const rows = [
    ['members', '', approved.length],
    ['countries', '', Object.keys(countries).length],
    ['continents', '', Object.keys(continents).length],
  ];
  Object.keys(continents).sort().forEach(k => rows.push(['continent', k, continents[k]]));
  Object.keys(stages).sort().forEach(k => rows.push(['career_stage', k, stages[k]]));
  Object.keys(countries).sort().forEach(k => {
    if (countries[k] >= SUMMARY_MIN_COUNTRY) rows.push(['country', k, countries[k]]);
  });
  return rows;
}

/** Replaces a tab's contents with header + rows, all stored as plain text. */
function writeTab_(ss, name, header, rows) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  const all = [header].concat(rows).map(r => r.map(v => safeText_(v === null || v === undefined ? '' : v)));
  if (sh.getMaxRows() < all.length + 1) sh.insertRowsAfter(sh.getMaxRows(), all.length + 1 - sh.getMaxRows());
  sh.getRange(1, 1, all.length, header.length).setValues(all);
  // Trim spare rows so the published CSV has no trailing blank lines.
  if (sh.getMaxRows() > all.length + 1) sh.deleteRows(all.length + 2, sh.getMaxRows() - all.length - 1);
}

function rebuildPublic_() {
  const approved = readMembers_().rows.filter(r => r['Approved'] === true);
  const onMap = approved.filter(r => isYes_(r['Show on map']) && r['Lat'] !== '' && r['Lon'] !== '');
  const ss = SpreadsheetApp.openById(prop_('PUBLIC_SS_ID'));
  writeTab_(ss, 'public', PUBLIC_COLS, onMap.map(r => { const p = publicRow_(r); return PUBLIC_COLS.map(c => p[c]); }));
  writeTab_(ss, 'summary', ['metric', 'category', 'count'], summaryRows_(approved));
}

/** Run by hand to rebuild the public sheet now. */
function rebuildPublicNow() {
  rebuildPublic_();
  Logger.log('Public sheet rebuilt.');
}
