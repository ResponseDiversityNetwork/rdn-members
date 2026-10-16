/**
 * One-off setup. Run setupMembership() once from the Apps Script editor.
 * It creates, in the rdn.projectbase account's Drive:
 *   - the membership form (no sign-in), "Form A" in the code;
 *   - the small photo form, "Form B" in the code (you add its upload question by hand, see SETUP.md);
 *   - the PRIVATE spreadsheet the membership form writes to, plus a "Members" tab;
 *   - the PUBLIC spreadsheet that will hold the map subset;
 *   - a Drive folder for the public photo copies.
 * It stores all their IDs as script properties and logs the links.
 * (Installations made before 16 October 2026 had a second full form as Form B: convert it with convertPhotoForm().)
 */
function setupMembership() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FORM_A_ID')) {
    throw new Error('Already set up (FORM_A_ID exists). To start again, delete the script properties first.');
  }
  const priv = SpreadsheetApp.create('RDN members (PRIVATE, do not share)');
  const pub = SpreadsheetApp.create('RDN members (PUBLIC map subset)');
  pub.getSheets()[0].setName('public');
  const photoFolder = DriveApp.createFolder('RDN member photos (PUBLIC copies)');

  const formA = FormApp.create('Response Diversity Network: membership');
  const formB = FormApp.create(PHOTO_FORM_TITLE);
  buildForm_(formA);
  const tabA = linkToSheet_(formA, priv, 'Form responses');
  const members = priv.getSheets().find(s => s.getName() === 'Sheet1') || priv.insertSheet();
  members.setName('Members');
  priv.setActiveSheet(members);
  priv.moveActiveSheet(1);

  const urlA = formA.shortenFormUrl(formA.getPublishedUrl());
  const urlB = formB.shortenFormUrl(formB.getPublishedUrl());
  formA.setDescription(formDescription_());
  props.setProperties({
    FORM_A_ID: formA.getId(), FORM_B_ID: formB.getId(),
    FORM_A_URL: urlA, FORM_B_URL: urlB,
    PRIVATE_SS_ID: priv.getId(), PUBLIC_SS_ID: pub.getId(),
    RESPONSES_A_TAB: tabA, RESPONSES_B_TAB: '',
    PHOTO_FOLDER_ID: photoFolder.getId(),
  });
  buildPhotoForm_(formB);

  Logger.log('Membership form, public link: ' + urlA);
  Logger.log('Membership form, edit:        ' + formA.getEditUrl());
  Logger.log('Photo form, edit (add the upload question here!): ' + formB.getEditUrl());
  Logger.log('Private spreadsheet:          ' + priv.getUrl());
  Logger.log('Public spreadsheet:           ' + pub.getUrl());
  Logger.log('Photo folder:                 ' + photoFolder.getUrl());
}

/** Adds all questions to the membership form. */
function buildForm_(form) {
  form.setAllowResponseEdits(true)
      .setCollectEmail(false)          // email is a normal question, so the form needs no sign-in
      .setShowLinkToRespondAgain(false)
      .setProgressBar(true)
      .setConfirmationMessage(confirmationMessage_());
  if (typeof form.setPublished === 'function') form.setPublished(true);

  const minLen = (n, msg) => FormApp.createTextValidation()
      .requireTextLengthGreaterThanOrEqualTo(n).setHelpText(msg).build();

  // Section 1: about you
  form.addSectionHeaderItem().setTitle(COVER_TITLE).setHelpText(coverText_());
  form.addPageBreakItem().setTitle('About you');
  form.addTextItem().setTitle(Q.NAME).setRequired(true)
      .setValidation(minLen(2, 'Please enter your name.'));
  form.addTextItem().setTitle(Q.EMAIL).setRequired(true)
      .setHelpText('We send your personal link here. Shown on the map only if you tick "Email" below.')
      .setValidation(FormApp.createTextValidation().requireTextIsEmail()
        .setHelpText('Please enter a valid email address.').build());
  form.addTextItem().setTitle(Q.INSTITUTION);
  form.addTextItem().setTitle(Q.CITY).setRequired(true)
      .setHelpText('Used to place you on the map, at city level.')
      .setValidation(minLen(2, 'Please enter a city.'));
  form.addTextItem().setTitle(Q.STATE)
      .setHelpText('Optional. Helps place you correctly, e.g. Cambridge, Massachusetts vs Cambridge, UK.');
  form.addTextItem().setTitle(Q.COUNTRY).setRequired(true)
      .setValidation(minLen(2, 'Please enter a country.'));
  form.addTextItem().setTitle(Q.WEBSITE)
      .setHelpText('Full link starting with https://, e.g. https://orcid.org/0000-0000-0000-0000')
      .setValidation(FormApp.createTextValidation().requireTextIsUrl()
        .setHelpText('Please enter a full link starting with https://').build());
  form.addParagraphTextItem().setTitle(Q.INTERESTS).setRequired(true).setHelpText(OPTIONS.INTERESTS_HELP);

  // Section 2: research
  form.addPageBreakItem().setTitle('Your research')
      .setHelpText('These answers become the filters on the member map. Tick all that apply.');
  form.addMultipleChoiceItem().setTitle(Q.CAREER).setRequired(true).setChoiceValues(OPTIONS.CAREER);
  [[Q.APPROACH, OPTIONS.APPROACH], [Q.SYSTEMS, OPTIONS.SYSTEMS], [Q.ORGANISMS, OPTIONS.ORGANISMS],
   [Q.LEVELS, OPTIONS.LEVELS], [Q.STRESSORS, OPTIONS.STRESSORS], [Q.REGIONS, OPTIONS.REGIONS]]
    .forEach(([title, opts]) => {
      const item = form.addCheckboxItem().setTitle(title).setChoiceValues(opts);
      if (opts.indexOf('Other') >= 0) item.setHelpText(OPTIONS.OTHER_HELP);
    });

  // Section 3: consent
  form.addPageBreakItem().setTitle(CONSENT_SECTION_TITLE).setHelpText(consentHelp_());
  form.addMultipleChoiceItem().setTitle(Q.SHOW_ON_MAP).setRequired(true)
      .setChoiceValues([OPTIONS.YES, OPTIONS.NO]);
  form.addCheckboxItem().setTitle(Q.SHOW_FIELDS).setChoiceValues(OPTIONS.SHOW_FIELDS).setHelpText(OPTIONS.SHOW_FIELDS_HELP);
  form.addMultipleChoiceItem().setTitle(Q.MAILING_LIST).setRequired(true)
      .setChoiceValues([OPTIONS.YES, OPTIONS.NO])
      .setHelpText('If you choose Yes, we ask the mailing-list manager to add you.');
  form.addCheckboxItem().setTitle(Q.PRIVACY_OK).setRequired(true).setChoiceValues([OPTIONS.PRIVACY_OK]);

  // Section 4: only used through a personal link
  form.addPageBreakItem().setTitle(EXISTING_SECTION_TITLE).setHelpText(existingMembersHelp_());
  form.addTextItem().setTitle(Q.MEMBER_REF).setHelpText(MEMBER_REF_HELP);
  form.addCheckboxItem().setTitle(Q.LEAVE).setChoiceValues([OPTIONS.LEAVE]).setHelpText(leaveHelp_());
}

/** Sends a form's responses to the spreadsheet and returns the name of the new tab. */
function linkToSheet_(form, ss, tabName) {
  const before = new Set(ss.getSheets().map(s => s.getSheetId()));
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();
  const fresh = SpreadsheetApp.openById(ss.getId()).getSheets().find(s => !before.has(s.getSheetId()));
  if (fresh) fresh.setName(tabName);
  return fresh ? tabName : '';
}

/** Run after adding the upload question by hand: checks Form B looks right. */
function checkPhotoForm() {
  const form = FormApp.openById(prop_('FORM_B_ID'));
  const upload = form.getItems().find(i => i.getTitle() === Q.PHOTO);
  if (!upload) throw new Error('No question titled "' + Q.PHOTO + '" in the photo form yet.');
  if (upload.getType() !== FormApp.ItemType.FILE_UPLOAD) {
    throw new Error('"' + Q.PHOTO + '" exists but is not a File upload question.');
  }
  Logger.log('OK: the photo form has a File upload question titled "' + Q.PHOTO + '".');
}

/**
 * Logs the links to everything setupMembership() created, and checks both forms
 * have the questions the automation needs. Safe to run at any time.
 */
function showSetup() {
  const p = PropertiesService.getScriptProperties();
  const formA = FormApp.openById(prop_('FORM_A_ID'));
  const formB = FormApp.openById(prop_('FORM_B_ID'));
  Logger.log('Membership form, public link: ' + p.getProperty('FORM_A_URL'));
  Logger.log('Membership form, edit:        ' + formA.getEditUrl());
  Logger.log('Photo form, edit:             ' + formB.getEditUrl());
  Logger.log('Leave form, public link:      ' + (p.getProperty('LEAVE_FORM_URL') || '(not set up yet: run setupLeaveForm)'));
  Logger.log('Private spreadsheet:          ' + SpreadsheetApp.openById(prop_('PRIVATE_SS_ID')).getUrl());
  Logger.log('Public spreadsheet:           ' + SpreadsheetApp.openById(prop_('PUBLIC_SS_ID')).getUrl());
  Logger.log('Photo folder:                 ' + DriveApp.getFolderById(prop_('PHOTO_FOLDER_ID')).getUrl());
  const neededA = Object.keys(Q).filter(k => k !== 'PHOTO' && k !== 'REMOVE_PHOTO').map(k => Q[k]);
  const neededB = [Q.PHOTO, Q.REMOVE_PHOTO, Q.MEMBER_REF];
  [['Membership form', formA, neededA], ['Photo form', formB, neededB]].forEach(([label, form, titles]) => {
    const have = new Set(form.getItems().map(i => i.getTitle()));
    const missing = titles.filter(t => !have.has(t));
    Logger.log(label + ': ' + (missing.length ? 'MISSING questions: ' + missing.join(', ') : 'all questions present') +
               '; ' + form.getResponses().length + ' responses so far.');
  });
}


const CONSENT_SECTION_TITLE = 'Consent and privacy';

/** The text at the top of the membership form. */
function formDescription_() {
  return 'Join the ' + CONFIG.ORG_NAME + ', or update your entry. It takes about five minutes.\n\n' +
    'About membership and privacy: ' + CONFIG.INFO_URL;
}

/** The short privacy note at the top of the consent section. */
function consentHelp_() {
  return 'We store your answers in RDN\'s Google account (Google Forms, Sheets and Drive), which may be ' +
    'outside Switzerland or the EU. Only a few RDN organisers can see them. ' +
    'If you agree, we show the details you choose below on a public map, with your location at city level only. ' +
    'You can change your answers or leave at any time with your personal link. ' +
    'Full privacy notice: ' + CONFIG.PRIVACY_URL;
}

/**
 * Rewrites all explanatory texts and option lists in the existing forms from the current Config:
 * the membership form (description, cover page, consent note, confirmation message, option lists,
 * last page) and the photo form. Questions' answers and responses are not touched.
 */
function updateFormTexts() {
  const form = FormApp.openById(prop_('FORM_A_ID'));
  const log = what => Logger.log('Membership form: ' + what + ' updated.');
  const byTitle = (type, title) => form.getItems(type).find(i => i.getTitle() === title);
  form.setDescription(formDescription_()); log('description');
  form.setConfirmationMessage(confirmationMessage_()); log('confirmation message');
  ensureCoverPage_(form); log('cover page');
  const consent = byTitle(FormApp.ItemType.PAGE_BREAK, CONSENT_SECTION_TITLE);
  if (consent) { consent.asPageBreakItem().setHelpText(consentHelp_()); log('privacy note'); }
  const fieldsItem = byTitle(FormApp.ItemType.CHECKBOX, Q.SHOW_FIELDS);
  if (fieldsItem) { fieldsItem.asCheckboxItem().setChoiceValues(OPTIONS.SHOW_FIELDS).setHelpText(OPTIONS.SHOW_FIELDS_HELP); log('"' + Q.SHOW_FIELDS + '"'); }
  const career = byTitle(FormApp.ItemType.MULTIPLE_CHOICE, Q.CAREER);
  if (career) { career.asMultipleChoiceItem().setChoiceValues(OPTIONS.CAREER); log('"' + Q.CAREER + '" options'); }
  [[Q.SYSTEMS, OPTIONS.SYSTEMS], [Q.ORGANISMS, OPTIONS.ORGANISMS]].forEach(([title, opts]) => {
    const it = byTitle(FormApp.ItemType.CHECKBOX, title);
    if (it) { it.asCheckboxItem().setChoiceValues(opts).setHelpText(OPTIONS.OTHER_HELP); log('"' + title + '" options'); }
  });
  const interests = byTitle(FormApp.ItemType.PARAGRAPH_TEXT, Q.INTERESTS);
  if (interests) { interests.asParagraphTextItem().setHelpText(OPTIONS.INTERESTS_HELP).clearValidation(); log('research interests'); }
  const existing = byTitle(FormApp.ItemType.PAGE_BREAK, EXISTING_SECTION_TITLE) ||
                   byTitle(FormApp.ItemType.PAGE_BREAK, OLD_EXISTING_SECTION_TITLE);
  if (existing) existing.asPageBreakItem().setTitle(EXISTING_SECTION_TITLE).setHelpText(existingMembersHelp_());
  const ref = byTitle(FormApp.ItemType.TEXT, Q.MEMBER_REF);
  if (ref) ref.asTextItem().setHelpText(MEMBER_REF_HELP);
  const leaveItem = byTitle(FormApp.ItemType.CHECKBOX, Q.LEAVE);
  if (leaveItem) leaveItem.asCheckboxItem().setHelpText(leaveHelp_());
  log('last page');
  photoFormTexts_(FormApp.openById(prop_('FORM_B_ID')));
  Logger.log('Photo form: texts updated.');
}


const COVER_TITLE = 'Before you start: about our emails';

/** The cover page, kept short; the details are on the join page (#emails). Plain text (Forms shows no formatting). */
function coverText_() {
  const c = CONFIG.CONTACT_EMAIL;
  return '\u2022 After you submit, we email you a personal link for changing your entry or leaving later. ' +
    'It comes from ' + c + ': please add that address to your contacts.\n' +
    '\u2022 The same link is shown on the page after you submit (\u201cEdit your response\u201d). Please bookmark it.\n' +
    '\u2022 No email and no link? Write to ' + c + '. If our emails don\u2019t arrive: ' + CONFIG.INFO_URL + '#emails\n' +
    '\u2022 Want to leave? If you opened this form with your personal link, all required questions will be prefilled ' +
    'so you can click Next through to the last page, tick \u201cLeave the network\u201d, and press Submit. ' +
    'You can also leave with the Leave form: ' + leaveFormUrl_();
}

/** The leave form's public link, or the join page's Leave section if the leave form isn't set up. */
function leaveFormUrl_() {
  return PropertiesService.getScriptProperties().getProperty('LEAVE_FORM_URL') || (CONFIG.INFO_URL + '#leave');
}

function confirmationMessage_() {
  return 'Saved, thank you. The \u201cEdit your response\u201d link below is your personal link for changing your entry ' +
    'or leaving the network. Please bookmark it.';
}

/**
 * Makes the first page of an existing form the cover page (adds it if missing, otherwise
 * updates its text and position). The "About you" section header becomes a page break after it.
 * Safe to run again, including after a run that stopped half-way.
 * Note: Form.moveItem() needs plain Items or indexes, so typed items are re-fetched by id.
 */
function ensureCoverPage_(form) {
  let cover = form.getItems().find(i => i.getTitle() === COVER_TITLE);
  if (!cover) cover = form.getItemById(form.addSectionHeaderItem().setTitle(COVER_TITLE).getId());
  cover.asSectionHeaderItem().setHelpText(coverText_());
  if (cover.getIndex() !== 0) form.moveItem(cover.getIndex(), 0);

  const oldHeader = form.getItems(FormApp.ItemType.SECTION_HEADER).find(i => i.getTitle() === 'About you');
  if (oldHeader) form.deleteItem(oldHeader);
  let page = form.getItems(FormApp.ItemType.PAGE_BREAK).find(i => i.getTitle() === 'About you');
  if (!page) page = form.getItemById(form.addPageBreakItem().setTitle('About you').getId());
  if (page.getIndex() !== 1) form.moveItem(page.getIndex(), 1);
}


const EXISTING_SECTION_TITLE = 'Before you submit';
const OLD_EXISTING_SECTION_TITLE = 'For existing members';   // renamed by updateFormTexts
// Membership form: empty for new members; filled in only when the form is opened from one of our links.
const MEMBER_REF_HELP = 'Please ignore this question and anything filled in here. It is only for internal administration.';
// Photo form: always reached through a link from our emails, so it is always filled in.
const PHOTO_REF_HELP = 'Filled in automatically from the link in our email. Please don\u2019t change it.';

/** Text of the last page. */
function existingMembersHelp_() {
  return '\u2022 Joining: nothing to do here, just press Submit.\n' +
    '\u2022 Updating with your personal link: nothing to do here, just press Submit.\n' +
    '\u2022 Leaving with your personal link: tick \u201cLeave the network\u201d below, and press Submit.';
}

/** Help text of the "Leave the network" tick. */
function leaveHelp_() {
  return 'Only works if you opened this form with your personal link. No link? Use the leave form: ' + leaveFormUrl_();
}


// ---------- The photo form ("Form B") ----------

const PHOTO_FORM_TITLE = 'Response Diversity Network: your photo';

/** Sets up a new, empty photo form (the upload question is added by hand afterwards). */
function buildPhotoForm_(form) {
  form.setCollectEmail(false).setAllowResponseEdits(false).setShowLinkToRespondAgain(false);
  if (typeof form.setPublished === 'function') form.setPublished(true);
  form.addCheckboxItem().setTitle(Q.REMOVE_PHOTO).setChoiceValues([OPTIONS.REMOVE_PHOTO]);
  form.addTextItem().setTitle(Q.MEMBER_REF).setRequired(true).setHelpText(PHOTO_REF_HELP);
  photoFormTexts_(form);
}

function photoFormTexts_(form) {
  form.setTitle(PHOTO_FORM_TITLE)
      .setDescription('Add, change or remove the photo shown with your entry on the ' + CONFIG.ORG_NAME + ' member map. ' +
        'Please open this form with the link in one of our emails, so that the photo goes to your entry. ' +
        'Google asks you to sign in to upload a photo.\n\nAbout membership and privacy: ' + CONFIG.INFO_URL)
      .setConfirmationMessage('Thank you. Your photo will be updated on the map within about 15 minutes.');
  const photo = form.getItems().find(i => i.getTitle() === Q.PHOTO);
  if (photo) photo.setHelpText(OPTIONS.PHOTO_HELP);
  const ref = form.getItems(FormApp.ItemType.TEXT).find(i => i.getTitle() === Q.MEMBER_REF);
  if (ref) ref.asTextItem().setHelpText(PHOTO_REF_HELP);
}

/**
 * One-off, for installations made before 16 October 2026: turns the old second membership
 * form ("with photo") into the small photo form. Keeps its upload question; deletes all other
 * questions and all its responses; adds "Remove my photo"; stops it writing to the spreadsheet.
 * Run clearTestData() first (it refuses to run while members still use the old form).
 */
function convertPhotoForm() {
  if (readMembers_().rows.some(r => r['Form'] === 'B')) {
    throw new Error('Some members still use the old photo form. Run clearTestData() first (it is all test data).');
  }
  const form = FormApp.openById(prop_('FORM_B_ID'));
  form.deleteAllResponses();
  try { form.removeDestination(); } catch (e) { /* not linked */ }
  form.getItems().forEach(item => {
    const t = item.getTitle();
    if (t !== Q.PHOTO && t !== Q.MEMBER_REF && t !== Q.REMOVE_PHOTO) form.deleteItem(item);
  });
  if (!form.getItems().some(i => i.getTitle() === Q.REMOVE_PHOTO)) {
    form.addCheckboxItem().setTitle(Q.REMOVE_PHOTO).setChoiceValues([OPTIONS.REMOVE_PHOTO]);
  }
  let ref = form.getItems(FormApp.ItemType.TEXT).find(i => i.getTitle() === Q.MEMBER_REF);
  if (!ref) ref = form.getItemById(form.addTextItem().setTitle(Q.MEMBER_REF).getId());
  ref.asTextItem().setRequired(true);
  // Order: Photo, Remove my photo, Member reference
  const idx = title => form.getItems().findIndex(i => i.getTitle() === title);
  if (idx(Q.PHOTO) > 0) form.moveItem(idx(Q.PHOTO), 0);
  if (idx(Q.REMOVE_PHOTO) !== 1) form.moveItem(idx(Q.REMOVE_PHOTO), 1);
  form.setAllowResponseEdits(false).setShowLinkToRespondAgain(false).setProgressBar(false);
  photoFormTexts_(form);
  PropertiesService.getScriptProperties().setProperty('RESPONSES_B_TAB', '');
  Logger.log('Photo form ready: ' + form.getItems().map(i => i.getTitle()).join(' | '));
  Logger.log('Now run installTriggers. You can delete the old "Responses B (photo)" tab in the private spreadsheet.');
}
