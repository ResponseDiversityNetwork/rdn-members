/**
 * All emails the automation sends. Edit the wording here.
 * Paragraphs are small bits of HTML; the plain-text version is made from them.
 */

function mail_(to, subject, paragraphs) {
  if (CONFIG.TEST_PHASE) {
    paragraphs = ['<i>This is a test of the new RDN membership system. Test entries will be deleted before launch. ' +
                  'Thank you for helping!</i>'].concat(paragraphs);
  }
  const html = paragraphs.map(p => '<p>' + p + '</p>').join('\n');
  const text = paragraphs
    .map(p => p.replace(/<a href="([^"]+)">([^<]+)<\/a>/g, '$2: $1').replace(/<br>/g, '\n').replace(/<[^>]+>/g, ''))
    .map(p => p.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"))
    .join('\n\n');
  try {
    MailApp.sendEmail(mailOptions_({to, subject, body: text, htmlBody: html}));
  } catch (e) {
    // e.g. the daily email limit is used up. Don't let a failed email stop the rest of the update.
    console.error('Email to ' + to + ' ("' + subject + '") failed: ' + e.message);
    const ss = SpreadsheetApp.openById(prop_('PRIVATE_SS_ID'));
    const sh = ss.getSheetByName('Failed emails') || ss.insertSheet('Failed emails');
    if (sh.getLastRow() === 0) sh.appendRow(['When', 'To', 'Subject', 'Error']);
    sh.appendRow([new Date(), to, subject, e.message]);
  }
}

/** Adds the sender name, and a reply-to only if one is configured. */
function mailOptions_(o) {
  o.name = CONFIG.SENDER_NAME;
  if (CONFIG.REPLY_TO) o.replyTo = CONFIG.REPLY_TO;
  return o;
}

function link_(url, label) { return '<a href="' + esc_(url) + '">' + esc_(label) + '</a>'; }

function firstName_(name) { return String(name || '').trim().split(/\s+/)[0] || 'colleague'; }

/** The paragraphs every member email ends with: personal link, photo link, footer. */
function memberLinks_(rec) {
  const hasPhoto = !!(rec['Photo URL'] || rec['Photo pending']);
  return [
    'Your personal link, for changing your answers or leaving the network: ' + link_(rec['Edit URL'], 'my membership entry') +
      '. Please keep this email.',
    (hasPhoto ? 'To change or remove your photo: ' : 'To add a photo to your map entry: ') +
      link_(photoLink_(rec['Member ref']), 'photo form') + ' (Google asks you to sign in to upload a photo).',
    'Best wishes,<br>' + esc_(CONFIG.ORG_NAME) + '<br><small>Membership and privacy: ' + esc_(CONFIG.INFO_URL) + '</small>',
  ];
}

function emailMember_(rec, response, kind) {
  const hi = 'Dear ' + esc_(firstName_(rec['Name'])) + ',';
  const onMap = isYes_(rec['Show on map']);
  const subjects = {
    received: 'Response Diversity Network: membership received',
    welcome: 'Response Diversity Network: membership details saved',
    linkChanged: 'Response Diversity Network: membership details saved',
    emailChanged: 'Response Diversity Network: email address changed',
  };
  const bodies = {
    received: 'Thank you for joining the Response Diversity Network. A curator will check your entry, usually within a few days. ' +
      (onMap ? 'After that you will appear on the member map.' : 'You chose not to appear on the public member map.'),
    welcome: 'Thank you for updating your Response Diversity Network membership. ' +
      (onMap ? 'You will appear on the member map within about 10 minutes.' : 'You chose not to appear on the public member map.'),
    linkChanged: 'Thank you, your membership details are saved. Your personal link has changed: please use the one below.',
    emailChanged: 'The email address on your membership is now this one. We have also let your previous address know.',
  };
  mail_(rec['Email'], subjects[kind], [hi, bodies[kind]].concat(memberLinks_(rec)));
}

function emailApproved_(rec) {
  const onMap = isYes_(rec['Show on map']);
  mail_(rec['Email'], 'Response Diversity Network: membership confirmed', [
    'Dear ' + esc_(firstName_(rec['Name'])) + ',',
    'Your membership of the Response Diversity Network has been confirmed. ' +
      (onMap ? 'You will appear on the member map within about 10 minutes.' : 'You chose not to appear on the public member map.'),
  ].concat(memberLinks_(rec)));
}

function emailOldAddress_(oldEmail, newEmail) {
  if (!oldEmail) return;
  mail_(oldEmail, 'Response Diversity Network: email address changed', [
    'The email address on your Response Diversity Network membership was changed from this address to ' +
      esc_(newEmail) + '.',
    'If you did not make this change, please reply to this email.',
    'Best wishes,<br>' + esc_(CONFIG.ORG_NAME),
  ]);
}

function emailLeft_(email, name) {
  mail_(email, 'Response Diversity Network: you have left', [
    'Dear ' + esc_(firstName_(name)) + ',',
    'You have left the Response Diversity Network. We have removed you from the member map and deleted your entry and any photo.' +
      (CONFIG.LISTSERV_NOTIFY_EACH ? ' We have asked the mailing-list manager to unsubscribe you.' : ''),
    'If this was a mistake, you are welcome to join again: ' + link_(CONFIG.INFO_URL, CONFIG.INFO_URL),
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


function emailLeaveReceived_(email, name) {
  mail_(email, 'Response Diversity Network: request to leave received', [
    'Dear ' + esc_(firstName_(name)) + ',',
    'We have received a request to remove this email address from the Response Diversity Network. ' +
      'A curator will confirm it, usually within a few days, and we will email you when it is done.',
    'If you did not make this request, please reply to this email.',
    'Best wishes,<br>' + esc_(CONFIG.ORG_NAME),
  ]);
}

function emailCuratorLeave_(email, matched, message) {
  const ss = SpreadsheetApp.openById(prop_('PRIVATE_SS_ID'));
  mail_(CONFIG.CURATOR, '[RDN] Request to leave: ' + email, [
    'Someone has asked to leave the network using the leave form.',
    '<b>Email:</b> ' + esc_(email) + '<br><b>Found:</b> ' + esc_(matched) +
      (message ? '<br><b>Message:</b> ' + esc_(message) : ''),
    'To carry it out, tick <b>Confirmed</b> in its row of the "' + LEAVE_TAB + '" tab. ' +
      'Their entry, photos and form response are then deleted, and they get a confirmation email.',
    link_(ss.getUrl(), 'Open the private spreadsheet'),
  ]);
}
