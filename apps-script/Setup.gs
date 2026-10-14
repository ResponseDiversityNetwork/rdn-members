/**
 * One-off setup. Run setupMembership() once from the Apps Script editor.
 * It creates, in the rdn.projectbase account's Drive:
 *   - Form A "RDN membership" (no photo, no sign-in);
 *   - Form B "RDN membership (with photo)" (you add the upload question by hand, see SETUP.md);
 *   - the PRIVATE spreadsheet that both forms write to, plus a "Members" tab;
 *   - the PUBLIC spreadsheet that will hold the map subset;
 *   - a Drive folder for the public photo copies.
 * It stores all their IDs as script properties and logs the links.
 */
function setupMembership() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FORM_A_ID')) {
    throw new Error('Already set up (FORM_A_ID exists). To start again, delete the script properties first.');
  }

  // Spreadsheets and folder
  const priv = SpreadsheetApp.create('RDN members (PRIVATE, do not share)');
  const pub = SpreadsheetApp.create('RDN members (PUBLIC map subset)');
  pub.getSheets()[0].setName('public');
  const photoFolder = DriveApp.createFolder('RDN member photos (PUBLIC copies)');

  // Forms
  const formA = FormApp.create('Response Diversity Network: membership');
  const formB = FormApp.create('Response Diversity Network: membership (with photo)');
  buildForm_(formA, false);
  buildForm_(formB, true);

  // Both forms write to the private spreadsheet, each to its own tab.
  const tabA = linkToSheet_(formA, priv, 'Responses A (no photo)');
  const tabB = linkToSheet_(formB, priv, 'Responses B (photo)');

  // Members tab: one row per member; filled by the automation (next step).
  const members = priv.getSheets().find(s => s.getName() === 'Sheet1') || priv.insertSheet();
  members.setName('Members');
  priv.setActiveSheet(members);
  priv.moveActiveSheet(1);

  const urlA = formA.shortenFormUrl(formA.getPublishedUrl());
  const urlB = formB.shortenFormUrl(formB.getPublishedUrl());
  formA.setDescription(
    'Join the ' + CONFIG.ORG_NAME + ', or update your entry.\n\n' +
    'Would you like a photo on the member map? Use the photo version of this form instead: ' + urlB +
    ' (Google requires you to sign in to upload a photo.)\n\n' +
    'How membership works, and our privacy notice: ' + CONFIG.INFO_URL);
  formB.setDescription(
    'Join the ' + CONFIG.ORG_NAME + ', or update your entry. This version lets you upload a photo for the map. ' +
    'Google requires you to sign in to a Google account to upload files.\n\n' +
    'Prefer not to sign in? Use the version without a photo: ' + urlA + '\n\n' +
    'How membership works, and our privacy notice: ' + CONFIG.INFO_URL);

  props.setProperties({
    FORM_A_ID: formA.getId(), FORM_B_ID: formB.getId(),
    FORM_A_URL: urlA, FORM_B_URL: urlB,
    PRIVATE_SS_ID: priv.getId(), PUBLIC_SS_ID: pub.getId(),
    RESPONSES_A_TAB: tabA, RESPONSES_B_TAB: tabB,
    PHOTO_FOLDER_ID: photoFolder.getId(),
  });

  Logger.log('Form A (no photo), public link:  ' + urlA);
  Logger.log('Form A, edit:                    ' + formA.getEditUrl());
  Logger.log('Form B (photo), public link:     ' + urlB);
  Logger.log('Form B, edit (add upload here!): ' + formB.getEditUrl());
  Logger.log('Private spreadsheet:             ' + priv.getUrl());
  Logger.log('Public spreadsheet:              ' + pub.getUrl());
  Logger.log('Photo folder:                    ' + photoFolder.getUrl());
}

/** Adds all questions to a form. withPhoto adds the "Photo" display option. */
function buildForm_(form, withPhoto) {
  form.setAllowResponseEdits(true)
      .setCollectEmail(false)          // email is a normal question, so Form A needs no sign-in
      .setShowLinkToRespondAgain(false)
      .setProgressBar(true)
      .setConfirmationMessage(
        'Thank you. We will email you a personal link for updating your entry later. ' +
        'New entries appear on the map after a curator has checked them.');
  if (typeof form.setPublished === 'function') form.setPublished(true);

  const minLen = (n, msg) => FormApp.createTextValidation()
      .requireTextLengthGreaterThanOrEqualTo(n).setHelpText(msg).build();

  // Section 1: about you
  form.addSectionHeaderItem().setTitle('About you');
  form.addTextItem().setTitle(Q.NAME).setRequired(true)
      .setValidation(minLen(2, 'Please enter your name.'));
  form.addTextItem().setTitle(Q.EMAIL).setRequired(true)
      .setHelpText('We send your personal update link here. Shown on the map only if you tick "Email" below.')
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
  form.addParagraphTextItem().setTitle(Q.INTERESTS).setRequired(true)
      .setHelpText('One or two sentences. Searchable on the map.')
      .setValidation(FormApp.createParagraphTextValidation()
        .requireTextLengthGreaterThanOrEqualTo(30)
        .setHelpText('Please write at least 30 characters.').build());
  // Form B: the "Photo" File upload question goes here, added by hand (SETUP.md, step 3).

  // Section 2: research
  form.addPageBreakItem().setTitle('Your research')
      .setHelpText('These answers become the filters on the member map. Tick all that apply.');
  form.addMultipleChoiceItem().setTitle(Q.CAREER).setRequired(true).setChoiceValues(OPTIONS.CAREER);
  [[Q.APPROACH, OPTIONS.APPROACH], [Q.SYSTEMS, OPTIONS.SYSTEMS], [Q.ORGANISMS, OPTIONS.ORGANISMS],
   [Q.LEVELS, OPTIONS.LEVELS], [Q.STRESSORS, OPTIONS.STRESSORS], [Q.REGIONS, OPTIONS.REGIONS]]
    .forEach(([title, opts]) => form.addCheckboxItem().setTitle(title).setChoiceValues(opts));

  // Section 3: consent
  form.addPageBreakItem().setTitle('Consent and privacy').setHelpText(
    'We store your answers in RDN\'s Google account (Google Forms, Sheets and Drive), which may be ' +
    'outside Switzerland or the EU. Only a few RDN organisers can see them. ' +
    'If you agree, we show the details you choose below on a public map, with your location at city level only. ' +
    'You can change your answers or leave at any time with the personal link we email you. ' +
    'Full privacy notice: ' + CONFIG.PRIVACY_URL);
  form.addMultipleChoiceItem().setTitle(Q.SHOW_ON_MAP).setRequired(true)
      .setChoiceValues([OPTIONS.YES, OPTIONS.NO]);
  const fields = withPhoto ? OPTIONS.SHOW_FIELDS.concat([OPTIONS.SHOW_FIELDS_PHOTO]) : OPTIONS.SHOW_FIELDS;
  form.addCheckboxItem().setTitle(Q.SHOW_FIELDS).setChoiceValues(fields)
      .setHelpText('Your city and country are always shown if you appear on the map. Untick anything you want to keep private.');
  form.addMultipleChoiceItem().setTitle(Q.MAILING_LIST).setRequired(true)
      .setChoiceValues([OPTIONS.YES, OPTIONS.NO])
      .setHelpText('If you choose Yes, we ask the mailing-list manager to add you.');
  form.addCheckboxItem().setTitle(Q.PRIVACY_OK).setRequired(true).setChoiceValues([OPTIONS.PRIVACY_OK]);

  // Section 4: existing members only
  form.addPageBreakItem().setTitle('For existing members')
      .setHelpText('If you are joining for the first time, leave this page blank and submit.');
  form.addTextItem().setTitle(Q.MEMBER_REF)
      .setHelpText('Filled in automatically when you use a link from one of our emails. Please don\'t change it.');
  form.addCheckboxItem().setTitle(Q.LEAVE).setChoiceValues([OPTIONS.LEAVE])
      .setHelpText('Removes you from the map and the mailing list, and deletes your entry and any photo.');
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
  Logger.log('Form A (no photo), public link:  ' + p.getProperty('FORM_A_URL'));
  Logger.log('Form A, edit:                    ' + formA.getEditUrl());
  Logger.log('Form B (photo), public link:     ' + p.getProperty('FORM_B_URL'));
  Logger.log('Form B, edit:                    ' + formB.getEditUrl());
  Logger.log('Private spreadsheet:             ' + SpreadsheetApp.openById(prop_('PRIVATE_SS_ID')).getUrl());
  Logger.log('Public spreadsheet:              ' + SpreadsheetApp.openById(prop_('PUBLIC_SS_ID')).getUrl());
  Logger.log('Photo folder:                    ' + DriveApp.getFolderById(prop_('PHOTO_FOLDER_ID')).getUrl());

  const needed = Object.keys(Q).filter(k => k !== 'PHOTO').map(k => Q[k]);
  [['Form A', formA, needed], ['Form B', formB, needed.concat([Q.PHOTO])]].forEach(([label, form, titles]) => {
    const have = new Set(form.getItems().map(i => i.getTitle()));
    const missing = titles.filter(t => !have.has(t));
    Logger.log(label + ': ' + (missing.length ? 'MISSING questions: ' + missing.join(', ') : 'all questions present') +
               '; ' + form.getResponses().length + ' responses so far.');
  });
}
