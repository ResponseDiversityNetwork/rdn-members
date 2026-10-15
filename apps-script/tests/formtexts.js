// Checks updateFormTexts(): cover page, confirmation message, privacy note and display options,
// on mock forms laid out as setupMembership() created them (before the cover page existed).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const T = {TEXT: 'TEXT', CHECKBOX: 'CHECKBOX', SECTION_HEADER: 'SECTION_HEADER', PAGE_BREAK: 'PAGE_BREAK', MULTIPLE_CHOICE: 'MULTIPLE_CHOICE'};
function mkItem(type, title) {
  const it = {type, title, help: '', choices: [],
    getTitle: () => it.title, getType: () => it.type, setTitle(t) { it.title = t; return it; }, setHelpText(h) { it.help = h; return it; },
    setChoiceValues(c) { it.choices = c; return it; }};
  it.asSectionHeaderItem = it.asPageBreakItem = it.asCheckboxItem = () => it;
  return it;
}
function mkForm(id, withPhoto) {
  const f = {id, items: [], desc: '', conf: ''};
  const add = (type, title) => { const it = mkItem(type, title); f.items.push(it); return it; };
  add(T.SECTION_HEADER, 'About you'); add(T.TEXT, 'Full name'); add(T.TEXT, 'Email address');
  if (withPhoto) add('FILE_UPLOAD', 'Photo');
  add(T.PAGE_BREAK, 'Your research'); add(T.PAGE_BREAK, 'Consent and privacy');
  add(T.CHECKBOX, 'Details I agree to show on the map').setChoiceValues(['Name', 'Website']);
  add(T.PAGE_BREAK, 'For existing members');
  Object.assign(f, {
    getItems: t => f.items.filter(i => !t || i.type === t),
    addSectionHeaderItem: () => add(T.SECTION_HEADER, ''), addPageBreakItem: () => add(T.PAGE_BREAK, ''),
    moveItem(it, i) { f.items.splice(f.items.indexOf(it), 1); f.items.splice(i, 0, it); },
    deleteItem(it) { f.items.splice(f.items.indexOf(it), 1); },
    setDescription(d) { f.desc = d; }, setConfirmationMessage(c) { f.conf = c; },
  });
  return f;
}
const forms = {A: mkForm('A', false), B: mkForm('B', true)};
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
console.log('updateFormTexts: all checks passed (run twice).');
