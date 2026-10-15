/**
 * RDN membership: settings shared by all script files.
 * Runs in the rdn.projectbase@gmail.com account.
 */
const CONFIG = {
  ORG_NAME: 'Response Diversity Network',
  SENDER_NAME: 'Response Diversity Network (membership)',
  // Replies go to the sending account (rdn.projectbase@gmail.com) unless REPLY_TO is set. A reply-to on a
  // different domain makes emails look like phishing to some filters, so it is left empty.
  // Forward the account's mail to an organiser in Gmail settings instead.
  REPLY_TO: '',
  CONTACT_EMAIL: 'rdn.projectbase@gmail.com',   // shown to members as the address to write to
  LISTSERV_MANAGER: 'owen.petchey@uzh.ch',
  CURATOR: 'owen.petchey@uzh.ch',
  // Links in member emails point to this repo's GitHub Pages site (rdn-members).
  MAP_URL: 'https://responsediversitynetwork.github.io/rdn-members/',
  INFO_URL: 'https://responsediversitynetwork.github.io/rdn-members/join.html',
  PRIVACY_URL: 'https://responsediversitynetwork.github.io/rdn-members/join.html#privacy',
  PHOTO_SIZE_PX: 400,

  // While colleagues test the system: emails get "[Test]" in the subject and a note saying
  // entries will be deleted before launch. Set to false at launch.
  TEST_PHASE: true,

  // Mailing list. Until the list exists, requests are only recorded in the
  // Members tab; run emailMailingListRequests() once the list is ready, then set this to true
  // so each later request emails the manager straight away.
  LISTSERV_NOTIFY_EACH: false,

  // Inviting the existing members (Invite.gs)
  INVITES_TAB: 'Invites',
  INVITE_EMAIL_RESERVE: 40,      // emails kept back each day for replies to invitations and other notifications
  REMINDER_AFTER_DAYS: 14,
};

/**
 * Question titles. The script finds questions by title, so if you reword a
 * question in the Form editor, change it here too (in both forms).
 */
const Q = {
  NAME: 'Full name',
  EMAIL: 'Email address',
  INSTITUTION: 'Institution',
  CITY: 'City',
  STATE: 'State/Province',
  COUNTRY: 'Country',
  WEBSITE: 'Website or ORCID link',
  INTERESTS: 'Research interests',
  PHOTO: 'Photo',                 // File upload question, added by hand to the photo form only
  CAREER: 'Career stage',
  APPROACH: 'Research approach',
  SYSTEMS: 'Systems',
  ORGANISMS: 'Organisms',
  LEVELS: 'Level of organisation',
  STRESSORS: 'Stressors studied',
  REGIONS: 'Regions of fieldwork',
  SHOW_ON_MAP: 'Show me on the public member map',
  SHOW_FIELDS: 'Details I agree to show on the map',
  MAILING_LIST: 'Add me to the RDN mailing list',
  PRIVACY_OK: 'Privacy',
  MEMBER_REF: 'Member reference',
  LEAVE: 'Leave the network',
};

/** Question titles in the separate "leave the network" form (Leave.gs). */
const LQ = {
  EMAIL: 'Email address',
  NAME: 'Full name (optional)',
  MESSAGE: 'Anything you would like to tell us? (optional)',
  CONFIRM: 'Confirm',
};
const LEAVE_CONFIRM_OPTION = 'I want to leave the Response Diversity Network and have my entry deleted';

const OPTIONS = {
  CAREER: ['PhD student', 'Postdoc', 'Early-career researcher/faculty', 'Mid/senior researcher',
           'Practitioner/non-academic', 'Other'],
  APPROACH: ['Field observation', 'Experiments (lab/mesocosm)', 'Theory/modelling',
             'Data synthesis/meta-analysis', 'Applied/management'],
  // Ecosystems, from the RDN response diversity survey (Oikos appendix S1, question 8e). "Multiple" is left out:
  // members can tick several.
  SYSTEMS: ['Marine', 'Freshwater', 'Terrestrial (tropical)', 'Terrestrial (temperate)', 'Terrestrial (dry)',
            'Terrestrial (arctic and boreal)', 'Subterranean (e.g. soil)',
            'Not applicable (e.g. theory, socio-ecological analysis)', 'Other'],
  // Taxa, from the RDN response diversity survey (Oikos appendix S1, question 8f). "Multiple" is left out:
  // members can tick several.
  ORGANISMS: ['Plants', 'Microorganisms', 'Birds', 'Insects', 'Terrestrial mammals', 'Marine mammals', 'Fish',
              'Reptiles', 'Amphibians', 'Not applicable (e.g. theory, socio-ecological analysis)', 'Other'],
  LEVELS: ['Individuals/traits', 'Populations', 'Communities', 'Ecosystems', 'Social-ecological systems'],
  STRESSORS: ['Warming', 'Climate extremes/drought', 'Land-use change', 'Pollution', 'Invasive species',
              'Harvesting', 'Multiple stressors'],
  REGIONS: ['Europe', 'North America', 'South America', 'Africa', 'Asia', 'Oceania', 'Antarctica',
            'Atlantic Ocean', 'Pacific Ocean', 'Indian Ocean', 'Arctic Ocean', 'Southern Ocean'],
  SHOW_FIELDS: ['Name', 'Institution', 'Email', 'Website or ORCID link', 'Research interests', 'Research attributes'],
  INTERESTS_HELP: 'A short phrase or a few keywords, e.g. \u2018Response diversity of plankton communities to heatwaves\u2019. ' +
                  'Shown on the map and searchable.',
  SHOW_FIELDS_HELP: 'Each option refers to your answer to that question earlier in the form; anything you leave unticked stays private. ' +
                    'Your city and country are always shown if you appear on the map.',
  // Uploading a photo is the consent to show it (no separate "Photo" tick since 2026-10-15).
  PHOTO_HELP: 'Optional. A head-and-shoulders photo works best. If you add a photo, it is shown in your entry on the ' +
              'public member map (only if you chose to appear on the map). To stop showing it, remove it: use the link ' +
              'to the version of the form without a photo, in any of our emails.',
  YES: 'Yes',
  NO: 'No',
  PRIVACY_OK: 'I have read the privacy note',
  LEAVE: 'Leave the network and delete my entry',
};

/** Script properties are set by setupMembership() and read with prop_(). */
function prop_(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('Script property ' + key + ' is not set. Run setupMembership() first.');
  return v;
}
