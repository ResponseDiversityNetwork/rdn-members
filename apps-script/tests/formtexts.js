// Checks updateFormTexts(): cover page, confirmation message, privacy note and display options,
// on mock forms laid out as setupMembership() created them (before the cover page existed).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const T = {PARAGRAPH_TEXT: 'PARAGRAPH_TEXT', TEXT: 'TEXT', CHECKBOX: 'CHECKBOX', SECTION_HEADER: 'SECTION_HEADER', PAGE_BREAK: 'PAGE_BREAK', MULTIPLE_CHOICE: 'MULTIPLE_CHOICE'};
let nextId = 1;
function mkItem(type, title) {
  const it = {type, title, help: '', choices: [], id: nextId++, getId: () => it.id,
    getTitle: () => it.title, getType: () => it.type, setTitle(t) { it.title = t; return it; }, setHelpText(h) { it.help = h; return it; },
    setChoiceValues(c) { it.choices = c; return it; }};
  it.asSectionHeaderItem = it.asPageBreakItem = it.asCheckboxItem = it.asParagraphTextItem = () => it;
  it.validation = 'min 30'; it.clearValidation = () => { it.validation = null; return it; };
  it.getIndex = () => it.form.items.indexOf(it);
  return it;
}
function typed(it) { return {getId: it.getId, setTitle(t) { it.setTitle(t); return this; }, setHelpText(h) { it.setHelpText(h); return this; }}; }
function mkForm(id, withPhoto) {
  const f = {id, items: [], desc: '', conf: ''};
  const add = (type, title) => { const it = mkItem(type, title); it.form = f; f.items.push(it); return it; };
  add(T.SECTION_HEADER, 'About you'); add(T.TEXT, 'Full name'); add(T.TEXT, 'Email address'); add(T.PARAGRAPH_TEXT, 'Research interests');
  if (withPhoto) add('FILE_UPLOAD', 'Photo');
  add(T.PAGE_BREAK, 'Your research'); add(T.PAGE_BREAK, 'Consent and privacy');
  add(T.CHECKBOX, 'Details I agree to show on the map').setChoiceValues(['Name', 'Website']);
  add(T.PAGE_BREAK, 'For existing members');
  Object.assign(f, {
    getItems: t => f.items.filter(i => !t || i.type === t),
    // add*() return typed items: no as*() methods, like Apps Script's SectionHeaderItem / PageBreakItem
    addSectionHeaderItem: () => typed(add(T.SECTION_HEADER, '')), addPageBreakItem: () => typed(add(T.PAGE_BREAK, '')),
    getItemById: id => f.items.find(i => i.id === id),
    moveItem(from, to) {
      if (typeof from !== 'number' || typeof to !== 'number') throw new Error('moveItem: parameters don\'t match the method signature');
      const [it] = f.items.splice(from, 1); f.items.splice(to, 0, it);
    },
    deleteItem(it) { f.items.splice(f.items.indexOf(it), 1); },
    setDescription(d) { f.desc = d; }, setConfirmationMessage(c) { f.conf = c; },
  });
  return f;
}
const forms = {A: mkForm('A', false), B: mkForm('B', true)};
// State left by the failed run on 15 Oct: Form A has the cover header at the END, old header still there.
{ const c = mkItem(T.SECTION_HEADER, 'Before you start: about our emails'); c.form = forms.A; forms.A.items.push(c); }
const props = {FORM_A_ID: 'A', FORM_B_ID: 'B', FORM_A_URL: 'https://forms.gle/a', FORM_B_URL: 'https://forms.gle/b'};
const log = [];
const ctx = {Logger: {log: x => log.push(x)}, console, FormApp: {ItemType: T, openById: id => forms[id]},
  PropertiesService: {getScriptProperties: () => ({getProperty: k => props[k]})}};
vm.createContext(ctx);
const D = path.join(__dirname, '..');
for (const f of ['Config.gs', 'Setup.gs']) vm.runInContext(fs.readFileSync(path.join(D, f), 'utf8'), ctx);
const titles = f => f.items.map(i => i.type + ':' + i.title);
for (const run of [1, 2]) {   // running twice must not add a second cover page
  vm.runInContext('updateFormTexts()', ctx);
  for (const k of ['A', 'B']) {
    const f = forms[k], t = titles(f);
    assert.strictEqual(t[0], 'SECTION_HEADER:Before you start: about our emails', k + ' cover first');
    assert.strictEqual(t[1], 'PAGE_BREAK:About you', k + ' page break after cover');
    assert.strictEqual(t.filter(x => x.includes('about our emails')).length, 1, k + ' one cover');
    assert(!t.includes('SECTION_HEADER:About you'), k + ' old header removed');
    assert(/quarantine/.test(f.items[0].help) && /Edit your response/.test(f.items[0].help), k + ' cover text');
    assert(/Edit your response/.test(f.conf), k + ' confirmation');
    assert(/rdn-members\/join.html#privacy/.test(f.items.find(i => i.title === 'Consent and privacy').help), k + ' privacy link');
    assert(f.items.find(i => i.title === 'Details I agree to show on the map').choices.includes('Website or ORCID link'), k + ' option renamed');
  }
}
assert(forms.B.items.some(i => i.title === 'Photo'), 'photo question kept');
for (const k of ['A', 'B']) {
  const it = forms[k].items.find(i => i.title === 'Research interests');
  assert(/short phrase or a few keywords/.test(it.help) && it.validation === null, k + ' interests: new help text, no length limit');
}
assert(/shown in your entry on the public member map/.test(forms.B.items.find(i => i.title === 'Photo').help), 'photo question explains it is shown');
for (const k of ['A', 'B']) assert(!forms[k].items.find(i => i.title === 'Details I agree to show on the map').choices.includes('Photo'), k + ' no Photo tick');
console.log('updateFormTexts: all checks passed (run twice).');
