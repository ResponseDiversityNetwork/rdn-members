// Minimal in-memory mock of the Google Apps Script services used by the RDN scripts.
const fs = require('fs'), vm = require('vm');

function makeEnv() {
  let uid = 0; const id = p => p + (++uid);
  const mails = [], log = [];

  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, {sh, r, c, nr, nc}); }
    getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j)); o.push(row); } return o; }
    setValues(v) { if (v.length !== this.nr || v[0].length !== this.nc) throw new Error(`setValues size mismatch ${v.length}x${v[0].length} vs ${this.nr}x${this.nc}`); v.forEach((row, i) => row.forEach((x, j) => this.sh.set(this.r + i, this.c + j, x))); return this; }
    setValue(x) { this.sh.set(this.r, this.c, x); return this; }
    setFontWeight() { return this; } setDataValidation() { return this; } setNumberFormat() { return this; }
    getRow() { return this.r; } getColumn() { return this.c; } getNumRows() { return this.nr; } getNumColumns() { return this.nc; }
    getSheet() { return this.sh; }
  }
  class Sheet {
    constructor(name, rows = 1000) { this.name = name; this.data = []; this.max = rows; this.frozen = 0; this.id = ++uid; }
    get(r, c) { return (this.data[r - 1] || [])[c - 1] ?? ''; }
    set(r, c, x) {
      if (r > this.max) throw new Error('row beyond max');
      if (typeof x === 'string' && x.startsWith("'")) x = x.slice(1);
      else if (typeof x === 'string' && /^=/.test(x)) x = {FORMULA: x};
      (this.data[r - 1] ??= [])[c - 1] = x;
    }
    getName() { return this.name; } getSheetId() { return this.id; }
    setName(n) { this.name = n; return this; }
    getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
    getLastRow() { for (let i = this.data.length; i > 0; i--) if ((this.data[i - 1] || []).some(v => v !== '' && v !== undefined && v !== null)) return i; return 0; }
    getLastColumn() { return Math.max(0, ...this.data.map(r => (r || []).length)); }
    getMaxRows() { return this.max; }
    getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
    appendRow(row) { const r = this.getLastRow() + 1; if (r > this.max) this.max = r; row.forEach((x, j) => this.set(r, j + 1, x)); }
    deleteRows(s, n) { if (this.max - n <= this.frozen) throw new Error("You can't delete all the rows that are not frozen"); this.data.splice(s - 1, n); this.max -= n; }
    deleteRow(r) { this.deleteRows(r, 1); }
    insertRowAfter() { this.max++; }
    insertRowsAfter(a, n) { this.max += n; }
    clearContents() { this.data = []; }
    setFrozenRows(n) { this.frozen = n; } getFrozenRows() { return this.frozen; } setFrozenColumns() {}
    rowsAsObjects() { const [h, ...rest] = this.data.slice(0, this.getLastRow()); return rest.map(r => Object.fromEntries(h.map((k, i) => [k, (r || [])[i] ?? '']))); }
  }
  class SS {
    constructor(name) { this.id = id('ss'); this.name = name; this.sheets = [new Sheet('Sheet1')]; }
    getId() { return this.id; } getUrl() { return 'https://sheets/' + this.id; }
    getSheets() { return this.sheets; }
    getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
    insertSheet(n, i) { const s = new Sheet(n || 'Sheet' + (this.sheets.length + 1)); i === 0 ? this.sheets.unshift(s) : this.sheets.push(s); return s; }
    setActiveSheet() {} moveActiveSheet() {}
  }
  const sheetsById = {};

  const ItemType = {TEXT: 'TEXT', PARAGRAPH_TEXT: 'PARAGRAPH_TEXT', MULTIPLE_CHOICE: 'MULTIPLE_CHOICE', CHECKBOX: 'CHECKBOX', FILE_UPLOAD: 'FILE_UPLOAD'};
  class Item {
    constructor(title, type, choices) { Object.assign(this, {title, type, choices: choices || []}); }
    getTitle() { return this.title; } getType() { return this.type; }
    getChoices() { return this.choices.map(v => ({getValue: () => v})); }
    mk() { return {asItem: this, createResponse: v => ({item: this, v})}; }
    asTextItem() { return this.mk(); } asParagraphTextItem() { return this.mk(); }
    asMultipleChoiceItem() { return Object.assign(this.mk(), {getChoices: () => this.getChoices()}); }
    asCheckboxItem() { return Object.assign(this.mk(), {getChoices: () => this.getChoices()}); }
  }
  class Response {
    constructor(form, answers) { this.id = id('resp'); this.form = form; this.answers = answers; this.ts = new Date(); }
    getTimestamp() { return this.ts; }
    getId() { return this.id; }
    getItemResponses() { return Object.entries(this.answers).filter(([, v]) => v !== '' && v !== undefined && !(Array.isArray(v) && !v.length))
      .map(([t, v]) => ({getItem: () => this.form.items.find(i => i.title === t) || new Item(t, 'TEXT'), getResponse: () => v})); }
    getEditResponseUrl() { return 'https://forms/' + this.form.id + '/edit/' + this.id; }
  }
  class Form {
    constructor(withPhoto, Q, O) {
      this.id = id('form'); this.responses = [];
      const t = (title, type, ch) => new Item(title, type, ch);
      if (withPhoto === 'photo') {   // the small photo form
        this.items = [t(Q.PHOTO, 'FILE_UPLOAD'), t(Q.REMOVE_PHOTO, 'CHECKBOX', [O.REMOVE_PHOTO]), t(Q.MEMBER_REF, 'TEXT')];
        this.tab = null; this.Q = Q; return;
      }
      this.items = [t(Q.NAME, 'TEXT'), t(Q.EMAIL, 'TEXT'), t(Q.INSTITUTION, 'TEXT'), t(Q.CITY, 'TEXT'), t(Q.STATE, 'TEXT'), t(Q.COUNTRY, 'TEXT'),
        t(Q.WEBSITE, 'TEXT'), t(Q.INTERESTS, 'PARAGRAPH_TEXT'), ...(withPhoto ? [t(Q.PHOTO, 'FILE_UPLOAD')] : []),
        t(Q.CAREER, 'MULTIPLE_CHOICE', O.CAREER), t(Q.APPROACH, 'CHECKBOX', O.APPROACH), t(Q.SYSTEMS, 'CHECKBOX', O.SYSTEMS),
        t(Q.ORGANISMS, 'CHECKBOX', O.ORGANISMS), t(Q.LEVELS, 'CHECKBOX', O.LEVELS), t(Q.STRESSORS, 'CHECKBOX', O.STRESSORS), t(Q.REGIONS, 'CHECKBOX', O.REGIONS),
        t(Q.SHOW_ON_MAP, 'MULTIPLE_CHOICE', [O.YES, O.NO]), t(Q.SHOW_FIELDS, 'CHECKBOX', O.SHOW_FIELDS),
        t(Q.MAILING_LIST, 'MULTIPLE_CHOICE', [O.YES, O.NO]), t(Q.PRIVACY_OK, 'CHECKBOX', [O.PRIVACY_OK]), t(Q.MEMBER_REF, 'TEXT'), t(Q.LEAVE, 'CHECKBOX', [O.LEAVE])];
      this.tab = null; this.Q = Q;
    }
    getId() { return this.id; } getItems() { return this.items; }
    getTitle() { return 'membership'; } getPublishedUrl() { return 'https://forms/' + this.id; }
    getResponses() { return this.responses.slice(); }
    getResponse(rid) { const r = this.responses.find(x => x.id === rid); if (!r) throw new Error('no response ' + rid); return r; }
    deleteResponse(rid) { const n = this.responses.length; this.responses = this.responses.filter(r => r.id !== rid); if (n === this.responses.length) throw new Error('no such response'); }
    deleteAllResponses() { this.responses = []; }
    createResponse() { const parts = []; return {withItemResponse(x) { parts.push(x); return this; }, toPrefilledUrl: () => 'https://forms/' + this.id + '/prefill?' + parts.map(p => encodeURIComponent(p.item.title) + '=' + encodeURIComponent([].concat(p.v).join('|'))).join('&')}; }
    // test helpers
    submit(answers) { const r = new Response(this, answers); this.responses.push(r); this.toTab(r); return r; }
    edit(r, changes) { Object.assign(r.answers, changes); r.ts = new Date(Date.now() + 5000); this.toTab(r, true); return r; }
    toTab(r, isEdit) {
      if (!this.tab) return;
      const titles = ['Timestamp'].concat(this.items.map(i => i.title));
      if (this.tab.getLastRow() === 0) this.tab.appendRow(titles);
      const row = ['now'].concat(this.items.map(i => [].concat(r.answers[i.title] ?? '').join(', ')));
      if (isEdit && r._tabRow) row.forEach((v, j) => this.tab.set(r._tabRow, j + 1, v));
      else { this.tab.appendRow(row); r._tabRow = this.tab.getLastRow(); }
    }
  }

  const files = {};   // id → {name, trashed, sharing, folder, thumb}
  class File {
    constructor(f) { this.f = f; }
    getId() { return this.f.id; } setTrashed(t) { this.f.trashed = t; } setSharing(a) { this.f.sharing = a; }
  }
  const folders = {};
  const geo = {
    'Zurich, Switzerland': {lat: 47.3769, lng: 8.5417, code: 'CH', country: 'Switzerland'},
    'Zürich, Switzerland': {lat: 47.3769, lng: 8.5417, code: 'CH', country: 'Switzerland'},
    'Cambridge, Massachusetts, USA': {lat: 42.3736, lng: -71.1097, code: 'US', country: 'United States'},
    'Nairobi, Kenya': {lat: -1.2921, lng: 36.8219, code: 'KE', country: 'Kenya'},
    'Bern, Switzerland': {lat: 46.948, lng: 7.4474, code: 'CH', country: 'Switzerland'},
  };
  let triggers = [];
  const props = {};
  const ctx = {
    console, Logger: {log: x => log.push(String(x))},
    Session: {getEffectiveUser: () => ({getEmail: () => 'rdn.projectbase@gmail.com'})},
    PropertiesService: {getScriptProperties: () => ({getProperty: k => props[k] ?? null, setProperties: o => Object.assign(props, o), setProperty: (k, v) => { props[k] = v; }})},
    SpreadsheetApp: {
      create: n => { const s = new SS(n); sheetsById[s.id] = s; return s; },
      openById: i => { if (!sheetsById[i]) throw new Error('no ss ' + i); return sheetsById[i]; },
      flush() {}, newDataValidation: () => ({requireCheckbox() { return this; }, build: () => ({})}),
    },
    FormApp: {ItemType, DestinationType: {SPREADSHEET: 'S'}, openById: i => formsById[i]},
    MailApp: {sendEmail: m => mails.push(m), getRemainingDailyQuota: () => 100},
    Maps: {newGeocoder: () => ({setLanguage() { return this; }, geocode: a => {
      const g = geo[a]; return g ? {status: 'OK', results: [{geometry: {location: {lat: g.lat, lng: g.lng}},
        address_components: [{types: ['country'], short_name: g.code, long_name: g.country}]}]} : {status: 'ZERO_RESULTS', results: []};
    }})},
    DriveApp: {
      getFileById: i => { if (!files[i]) throw new Error('no file'); return new File(files[i]); },
      getFolderById: fid => ({
        createFile: blob => { const f = {id: id('pub'), name: blob.name, folder: fid, trashed: false}; files[f.id] = f; return new File(f); },
        getFilesByName: n => { const l = Object.values(files).filter(f => f.folder === fid && f.name === n && !f.trashed); return {hasNext: () => l.length > 0, next: () => new File(l.shift())}; },
        getFiles: () => { const l = Object.values(files).filter(f => f.folder === fid && !f.trashed); return {hasNext: () => l.length > 0, next: () => new File(l.shift())}; },
      }),
      Access: {ANYONE_WITH_LINK: 'anyone'}, Permission: {VIEW: 'view'},
    },
    Drive: {Files: {get: i => ({thumbnailLink: files[i] && files[i].thumbReady ? 'https://thumb/' + i + '=s220' : '', mimeType: 'image/jpeg'})}},
    UrlFetchApp: {fetch: () => ({getResponseCode: () => 200, getHeaders: () => ({'Content-Type': 'image/jpeg'}),
      getBlob: () => ({setName(n) { this.name = n; return this; }})})},
    ScriptApp: {getOAuthToken: () => 't', getProjectTriggers: () => triggers, deleteTrigger: t => { triggers = triggers.filter(x => x !== t); },
      newTrigger: h => { const b = {forForm: () => b, forSpreadsheet: () => b, onFormSubmit: () => b, onEdit: () => b, timeBased: () => b, everyMinutes: () => b, everyDays: () => b, atHour: () => b,
        create: () => triggers.push({getHandlerFunction: () => h})}; return b; }},
    LockService: {getScriptLock: () => ({waitLock() {}, tryLock: () => true, releaseLock() {}})},
    Utilities: {getUuid: () => require('crypto').randomUUID()},
    Date, Math, JSON, Set, Object, Array, String, Number,
  };
  const formsById = {};
  vm.createContext(ctx);
  const D = require('path').join(__dirname, '..') + '/';
  for (const f of fs.readdirSync(D).filter(f => f.endsWith('.gs'))) vm.runInContext(fs.readFileSync(D + f, 'utf8').replace('const ALLOW_CLEAR = false;', 'var ALLOW_CLEAR = false;'), ctx, {filename: f});
  const run = code => vm.runInContext(code, ctx);

  // Build the objects setupMembership() would create
  const Q = run('Q'), O = run('OPTIONS');
  const priv = ctx.SpreadsheetApp.create('priv'); priv.sheets[0].setName('Members');
  const pub = ctx.SpreadsheetApp.create('pub');
  const fA = new Form(false, Q, O), fB = new Form('photo', Q, O);
  formsById[fA.id] = fA; formsById[fB.id] = fB;
  const fL = new Form(false, Q, O); fL.items = []; formsById[fL.id] = fL;   // the leave form (answers matched by title)
  fA.tab = priv.insertSheet('Responses A (no photo)'); fA.tab.setFrozenRows(1);
  Object.assign(props, {FORM_A_ID: fA.id, FORM_B_ID: fB.id, PRIVATE_SS_ID: priv.id, PUBLIC_SS_ID: pub.id,
    RESPONSES_A_TAB: 'Responses A (no photo)', RESPONSES_B_TAB: '', PHOTO_FOLDER_ID: 'photos', LEAVE_FORM_ID: fL.id, CURATOR_EMAIL: 'curator@example.org'});
  const upload = (ready = true) => { const f = {id: id('upl'), name: 'me.jpg', folder: 'uploads', trashed: false, thumbReady: ready}; files[f.id] = f; return f.id; };

  return {ctx, run, mails, log, priv, pub, fA, fB, fL, files, triggers: () => triggers, upload, O, Q};
}
module.exports = {makeEnv};
