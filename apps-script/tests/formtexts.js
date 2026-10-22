// Checks updateFormTexts() and convertPhotoForm() against mock forms that are as strict as Apps Script
// where it matters (moveItem takes indexes; add*() returns typed items without as*() methods).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const T = {PARAGRAPH_TEXT: 'PARAGRAPH_TEXT', TEXT: 'TEXT', CHECKBOX: 'CHECKBOX', SECTION_HEADER: 'SECTION_HEADER',
           PAGE_BREAK: 'PAGE_BREAK', MULTIPLE_CHOICE: 'MULTIPLE_CHOICE', FILE_UPLOAD: 'FILE_UPLOAD'};
let nextId = 1;
function mkItem(form, type, title) {
  const it = {form, type, title, help: '', choices: [], required: false, validation: 'min 30', id: nextId++};
  Object.assign(it, {
    getId: () => it.id, getTitle: () => it.title, getType: () => it.type, getIndex: () => it.form.items.indexOf(it),
    setTitle(t) { it.title = t; return it; }, setHelpText(h) { it.help = h; return it; },
    setChoiceValues(c) { it.choices = c; return it; }, setRequired(r) { it.required = r; return it; },
    clearValidation() { it.validation = null; return it; },
  });
  it.asSectionHeaderItem = it.asPageBreakItem = it.asCheckboxItem = it.asParagraphTextItem = it.asTextItem = it.asMultipleChoiceItem = () => it;
  return it;
}
function typed(it) { return {getId: it.getId, setTitle(t) { it.setTitle(t); return this; }, setHelpText(h) { it.setHelpText(h); return this; },
  setChoiceValues(c) { it.setChoiceValues(c); return this; }}; }
function mkForm(id, layout) {
  const f = {id, items: [], desc: '', conf: '', title: '', responses: 3, dest: true, edits: true};
  const add = (type, title) => { const it = mkItem(f, type, title); f.items.push(it); return it; };
  layout(add);
  Object.assign(f, {
    getItems: t => f.items.filter(i => !t || i.type === t),
    addSectionHeaderItem: () => typed(add(T.SECTION_HEADER, '')), addPageBreakItem: () => typed(add(T.PAGE_BREAK, '')),
    addCheckboxItem: () => typed(add(T.CHECKBOX, '')), addTextItem: () => typed(add(T.TEXT, '')),
    getItemById: i => f.items.find(x => x.id === i),
    moveItem(from, to) {
      if (typeof from !== 'number' || typeof to !== 'number') throw new Error('moveItem: parameters don\'t match the method signature');
      const [it] = f.items.splice(from, 1); f.items.splice(to, 0, it);
    },
    deleteItem(it) { f.items.splice(f.items.indexOf(it), 1); },
    setDescription(d) { f.desc = d; return f; }, setConfirmationMessage(c) { f.conf = c; return f; }, setTitle(t) { f.title = t; return f; },
    deleteAllResponses() { f.responses = 0; }, removeDestination() { f.dest = false; },
    setAllowResponseEdits(v) { f.edits = v; return f; }, setShowLinkToRespondAgain() { return f; }, setProgressBar() { return f; },
  });
  return f;
}
// The old full membership form, as both forms looked before 16 Oct (Form B also had the upload question).
const oldLayout = withPhoto => add => {
  add(T.SECTION_HEADER, 'Before you start: about our emails'); add(T.PAGE_BREAK, 'About you');
  add(T.TEXT, 'Full name'); add(T.TEXT, 'Email address'); add(T.TEXT, 'Country'); add(T.PARAGRAPH_TEXT, 'Research interests');
  if (withPhoto) add(T.FILE_UPLOAD, 'Photo');
  add(T.PAGE_BREAK, 'Your research');
  add(T.MULTIPLE_CHOICE, 'Career stage').setChoiceValues(['PhD student', 'Postdoc', 'Mid/senior researcher']);
  add(T.CHECKBOX, 'Systems').setChoiceValues(['Terrestrial', 'Urban']);
  add(T.CHECKBOX, 'Organisms').setChoiceValues(['Plants', 'Vertebrates']);
  add(T.PAGE_BREAK, 'Consent and privacy');
  add(T.CHECKBOX, 'Details I agree to show on the map').setChoiceValues(['Name', 'Website', 'Photo']);
  add(T.MULTIPLE_CHOICE, 'Add me to the RDN mailing list').setChoiceValues(['Yes', 'No']);
  add(T.CHECKBOX, 'Regions of fieldwork').setChoiceValues(['Europe', 'North America', 'South America']);
  add(T.CHECKBOX, 'Research approach'); add(T.CHECKBOX, 'Level of organisation'); add(T.CHECKBOX, 'Stressors studied');
  add(T.PAGE_BREAK, 'For existing members'); add(T.TEXT, 'Member reference'); add(T.CHECKBOX, 'Leave the network');
};
const forms = {A: mkForm('A', oldLayout(false)), B: mkForm('B', oldLayout(true))};
const props = {FORM_A_ID: 'A', FORM_B_ID: 'B', RESPONSES_B_TAB: 'Responses B (photo)'};
const ctx = {Logger: {log() {}}, console, FormApp: {ItemType: T, openById: i => forms[i]},
  PropertiesService: {getScriptProperties: () => ({getProperty: k => props[k], setProperty: (k, v) => { props[k] = v; }})},
  readMembers_: () => ({rows: []})};
vm.createContext(ctx);
const D = path.join(__dirname, '..');
for (const f of ['Config.gs', 'Setup.gs']) vm.runInContext(fs.readFileSync(path.join(D, f), 'utf8'), ctx);
const find = (f, t) => f.items.find(i => i.title === t);

// 1. Convert the old Form B into the photo form
ctx.readMembers_ = () => ({rows: [{Form: 'B'}]});
assert.throws(() => vm.runInContext('convertPhotoForm()', ctx), /clearTestData/, 'refuses while members use the old form');
ctx.readMembers_ = () => ({rows: []});
vm.runInContext('convertPhotoForm()', ctx);
const B = forms.B;
assert.deepStrictEqual(B.items.map(i => i.title), ['Photo', 'Remove my photo', 'Member reference'], 'photo form questions and order');
assert(find(B, 'Member reference').required && B.responses === 0 && !B.dest && !B.edits, 'ref required; responses cleared; unlinked; no edits');
assert(/your photo/.test(B.title) && /link in one of our emails/.test(B.desc) && /shown with your entry/.test(find(B, 'Photo').help), 'photo form texts');
assert.strictEqual(props.RESPONSES_B_TAB, '', 'responses tab B no longer used');
assert(/from the link in our email/.test(find(B, 'Member reference').help), 'photo form: reference help');
vm.runInContext('convertPhotoForm()', ctx);   // running it again changes nothing
assert.deepStrictEqual(B.items.map(i => i.title), ['Photo', 'Remove my photo', 'Member reference'], 'idempotent');

// 2. Update the membership form's texts (twice: must be idempotent)
for (const run of [1, 2]) {
  vm.runInContext('updateFormTexts()', ctx);
  const A = forms.A, t = A.items.map(i => i.type + ':' + i.title);
  assert.strictEqual(t[0], 'SECTION_HEADER:Keeping track of your membership');
  assert.strictEqual(t[1], 'SECTION_HEADER:Want to leave?'); assert.strictEqual(t[2], 'PAGE_BREAK:About you');
  assert(!t.some(x => x.includes('about our emails')), 'old cover renamed, not duplicated');
  assert.strictEqual(t.filter(x => x.includes('Want to leave?')).length, 1, 'one leave box');
  const cover = A.items[0].help;
  assert(cover.split('\n').length === 5 && /contacts/.test(cover) && /Edit your response/.test(cover) && /#emails/.test(cover), 'cover: five lines');
  assert(/Next through to the last page/.test(A.items[1].help) && /forms|#leave/.test(A.items[1].help) && !/^Want to leave/.test(A.items[1].help), 'leave box text');
  assert(A.conf.length < 200 && /Edit your response/.test(A.conf), 'short confirmation');
  assert(!/photo/i.test(A.desc) && /five minutes/.test(A.desc), 'description: no photo-form talk');
  assert(!find(A, 'For existing members'), 'old last-page title renamed');
  assert(/Joining: nothing to do/.test(find(A, 'Before you submit').help) && /Leaving with your personal link/.test(find(A, 'Before you submit').help), 'last page: what to do');
  for (const q of ['Research approach', 'Level of organisation', 'Stressors studied', 'Regions of fieldwork', 'Systems', 'Organisms', 'Career stage']) {
    const it = find(A, q);
    assert(it.choices.includes('Other') && /If you tick \u201cOther\u201d, you can say more in your answer to \u201cResearch interests\u201d \(a short phrase or a few keywords\) on the \u201cAbout you\u201d page\./.test(it.help), q + ': Other + note');
  }
  for (const q of ['Research approach', 'Systems', 'Organisms', 'Level of organisation', 'Stressors studied', 'Regions of fieldwork'])
    assert(/^If more than one option applies, please tick all that apply/.test(find(A, q).help), q + ': tick all that apply');
  assert(!/tick all that apply/.test(find(A, 'Career stage').help), 'career stage (one answer): no tick-all note');
  assert(!find(A, 'Organisms').choices.some(c => /Not applicable/.test(c)), 'Organisms: no "Not applicable"');
  assert(!find(A, 'Systems').choices.some(c => /Not applicable/.test(c)), 'Systems: no "Not applicable"');
  assert(!find(A, 'Add me to the RDN mailing list'), 'old mailing-list question removed');
  const ml = find(A, 'RDN mailing list');
  assert(ml && ml.type === 'CHECKBOX' && A.items.indexOf(ml) === A.items.indexOf(find(A, 'Details I agree to show on the map')) + 1, 'opt-out box in the old place');
  assert(/moderated/.test(ml.help) && /share information/.test(ml.help) && ml.choices.length === 1, 'mailing-list help');
  assert(find(A, 'Regions of fieldwork').choices[2] === 'Central America and the Caribbean', 'Central America after North America');
  assert(find(A, 'Organisms').choices.indexOf('Other invertebrates (e.g. crustaceans, molluscs, worms)') === find(A, 'Organisms').choices.indexOf('Insects') + 1, 'other invertebrates after insects');
  assert(/whatever form you like/.test(find(A, 'Country').help), 'country help');
  assert(/Please ignore this question/.test(find(A, 'Member reference').help), 'membership form: reference help says to ignore it');
  assert(/Only works if you opened this form with your personal link/.test(find(A, 'Leave the network').help) && /#leave|forms/.test(find(A, 'Leave the network').help), 'leave tick');
  assert(/rdn-members\/join.html#privacy/.test(find(A, 'Consent and privacy').help), 'privacy link');
  assert(find(A, 'Details I agree to show on the map').choices.includes('Website or ORCID link') && !find(A, 'Details I agree to show on the map').choices.includes('Photo'), 'display options');
  assert(find(A, 'Organisms').choices.includes('Amphibians') && find(A, 'Systems').choices.includes('Subterranean (e.g. soil)'), 'survey lists');
  assert(/Research interests/.test(find(A, 'Systems').help) && /Research interests/.test(find(A, 'Organisms').help), '"Other" notes');
  const cs = find(A, 'Career stage').choices;
  assert(cs.length === 8 && cs.includes('Retired or emeritus') && !cs.includes('Mid/senior researcher'), 'career stage options');
  const ri = find(A, 'Research interests');
  assert(/short phrase or a few keywords/.test(ri.help) && ri.validation === null, 'interests');
}
console.log('convertPhotoForm + updateFormTexts: all checks passed.');
