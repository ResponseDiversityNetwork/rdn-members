/**
 * All emails the automation sends. Edit the wording here.
 * Paragraphs are small bits of HTML; the plain-text version is made from them.
 */

function mail_(to, subject, paragraphs) {
  const html = paragraphs.map(p => '<p>' + p + '</p>').join('\n');
  const text = paragraphs
    .map(p => p.replace(/<a href="([^"]+)">([^<]+)<\/a>/g, '$2: $1').replace(/<br>/g, '\n').replace(/<[^>]+>/g, ''))
    .map(p => p.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"))
    .join('\n\n');
  try {
    MailApp.sendEmail({to, subject, body: text, htmlBody: html, name: CONFIG.SENDER_NAME, replyTo: CONFIG.REPLY_TO});
  } catch (e) {
    // e.g. the daily email limit is used up. Don't let a failed email stop the rest of the update.
    console.error('Email to ' + to + ' ("' + subject + '") failed: ' + e.message);
    const ss = SpreadsheetApp.openById(prop_('PRIVATE_SS_ID'));
    const sh = ss.getSheetByName('Failed emails') || ss.insertSheet('Failed emails');
    if (sh.getLastRow() === 0) sh.appendRow(['When', 'To', 'Subject', 'Error']);
    sh.appendRow([new Date(), to, subject, e.message]);
  }
}

function link_(url, label) { return '<a href="' + esc_(url) + '">' + esc_(label) + '</a>'; }

function firstName_(name) { return String(name || '').trim().split(/\s+/)[0] || 'colleague'; }

/** The paragraphs every member email ends with: personal link, switch link, how to leave. */
function memberLinks_(rec, response) {
  const resp = response || formFor_(rec['Form']).getResponse(rec['Response ID']);
  const other = formFor_(otherKey_(rec['Form']));
  const sw = switchLink_(resp, other, rec['Member ref']);
  const swText = rec['Form'] === 'A'
    ? 'Would you like a photo on the map? ' + link_(sw, 'Switch to the form with a photo') +
      ' (your answers are filled in; Google requires you to sign in to upload a photo).'
    : 'To remove your photo, or to stop needing to sign in: ' + link_(sw, 'switch to the form without a photo') +
      ' (your answers are filled in).';
  return [
    '<b>Your personal link</b> for changing your entry at any time: ' + link_(rec['Edit URL'], 'update my entry') +
      '. Please keep this email; anyone with the link can change your entry.',
    swText,
    'To leave the network, open your personal link, tick "Leave the network" on the last page, and submit.',
    'How membership works, and our privacy notice: ' + link_(CONFIG.INFO_URL, CONFIG.INFO_URL),
    'Best wishes,<br>' + esc_(CONFIG.ORG_NAME),
  ];
}

function emailMember_(rec, response, kind) {
  const hi = 'Dear ' + esc_(firstName_(rec['Name'])) + ',';
  const onMap = isYes_(rec['Show on map']);
  const subjects = {
    received: 'Thank you for joining the Response Diversity Network',
    welcome: 'Your Response Diversity Network membership is updated',
    switchedToPhoto: 'Your RDN membership: now with a photo',
    switchedToNoPhoto: 'Your RDN membership: photo removed',
    emailChanged: 'Your RDN membership email address has changed',
  };
  const bodies = {
    received: 'Thank you for joining. A curator will check your entry, usually within a few days. ' +
      (onMap ? 'After that you will appear on the ' + link_(CONFIG.MAP_URL, 'member map') + '.'
             : 'You chose not to appear on the public map.'),
    welcome: 'Thank you for updating your membership. ' +
      (onMap ? 'You will appear on the ' + link_(CONFIG.MAP_URL, 'member map') + ' within about 10 minutes.'
             : 'You chose not to appear on the public map.'),
    switchedToPhoto: 'Your entry has moved to the form with a photo. Your previous personal link no longer works; please use the new one below.',
    switchedToNoPhoto: 'Your entry has moved to the form without a photo, and we have deleted your photo. ' +
      'Your previous personal link no longer works; please use the new one below.',
    emailChanged: 'The email address on your membership is now this one. We have also let your previous address know.',
  };
  mail_(rec['Email'], subjects[kind], [hi, bodies[kind]].concat(memberLinks_(rec, response)));
}

function emailApproved_(rec) {
  const onMap = isYes_(rec['Show on map']);
  mail_(rec['Email'], 'Welcome to the Response Diversity Network', [
    'Dear ' + esc_(firstName_(rec['Name'])) + ',',
    'Your membership has been confirmed. ' +
      (onMap ? 'You will appear on the ' + link_(CONFIG.MAP_URL, 'member map') + ' within about 10 minutes.'
             : 'You chose not to appear on the public map.'),
  ].concat(memberLinks_(rec)));
}

function emailOldAddress_(oldEmail, newEmail) {
  if (!oldEmail) return;
  mail_(oldEmail, 'Your RDN membership email address has changed', [
    'The email address on your Response Diversity Network membership was changed from this address to ' +
      esc_(newEmail) + '.',
    'If you did not make this change, please reply to this email.',
    'Best wishes,<br>' + esc_(CONFIG.ORG_NAME),
  ]);
}

function emailLeft_(email, name) {
  mail_(email, 'You have left the Response Diversity Network', [
    'Dear ' + esc_(firstName_(name)) + ',',
    'You have left the Response Diversity Network. We have removed you from the member map and deleted your entry and any photo.' +
      (CONFIG.LISTSERV_NOTIFY_EACH ? ' We have asked the mailing-list manager to unsubscribe you.' : ''),
    'If this was a mistake, you are welcome to ' + link_(CONFIG.INFO_URL, 'join again') + '.',
    'Best wishes,<br>' + esc_(CONFIG.ORG_NAME),
  ]);
}

function emailCurator_(rec, notes, isUpdate) {
  const ss = SpreadsheetApp.openById(prop_('PRIVATE_SS_ID'));
  const lines = [
    ['Name', rec['Name']], ['Email', rec['Email']], ['Institution', rec['Institution']],
    ['Place', [rec['City'], rec['State/Province'], rec['Country']].filter(Boolean).join(', ')],
    ['Career stage', rec['Career stage']], ['Research interests', rec['Research interests']],
    ['Website', rec['Website']], ['Show on map', rec['Show on map']], ['Mailing list', rec['Mailing list']],
  ].map(([k, v]) => '<b>' + k + ':</b> ' + esc_(v || '–'));
  mail_(CONFIG.CURATOR, (isUpdate ? '[RDN] Check entry: ' : '[RDN] New member to approve: ') + rec['Name'], [
    isUpdate ? 'An entry needs a look.' : 'A new member has joined. If it looks genuine, tick <b>Approved</b> in their row of the Members tab.',
  ].concat(notes.length ? ['<b>Note:</b> ' + esc_(notes.join(' '))] : [])
   .concat([lines.join('<br>'), link_(ss.getUrl(), 'Open the private spreadsheet')]));
}

/**
 * Asks the listserv manager to add, remove or change a subscription.
 * Does nothing while CONFIG.LISTSERV_NOTIFY_EACH is false (mailing list not set up yet).
 */
function listservNotify_(action, rec, oldEmail) {
  if (!CONFIG.LISTSERV_NOTIFY_EACH) return;
  const who = rec['Name'] + ' <' + rec['Email'] + '>';
  const subject = {add: '[RDN list] Please subscribe ', remove: '[RDN list] Please unsubscribe ',
                   change: '[RDN list] Please change address for '}[action] + rec['Name'];
  const body = {
    add: 'Please subscribe: ' + esc_(who),
    remove: 'Please unsubscribe: ' + esc_(who),
    change: 'Please unsubscribe ' + esc_(oldEmail) + ' and subscribe ' + esc_(who),
  }[action];
  mail_(CONFIG.LISTSERV_MANAGER, subject, [body, 'Sent automatically by the RDN membership system.']);
}
