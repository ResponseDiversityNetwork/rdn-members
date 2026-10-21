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
  ADMIN: 'owen.petchey@uzh.ch',                 // system administrator: gets test invitations
  // The curator's address is kept out of this (public) code: set it as the script property
  // CURATOR_EMAIL (Project Settings > Script properties). Until it is set, curator emails go to ADMIN.
  get CURATOR() {
    return PropertiesService.getScriptProperties().getProperty('CURATOR_EMAIL') || this.ADMIN;
  },
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
  PHOTO: 'Photo',                 // File upload question in the photo form (added by hand)
  REMOVE_PHOTO: 'Remove my photo',   // photo form only
  CAREER: 'Career stage',
  APPROACH: 'Research approach',
  SYSTEMS: 'Systems',
  ORGANISMS: 'Organisms',
  LEVELS: 'Level of organisation',
  STRESSORS: 'Stressors studied',
  REGIONS: 'Regions of fieldwork',
  SHOW_ON_MAP: 'Show me on the public member map',
  SHOW_FIELDS: 'Details I agree to show on the map',
  MAILING_LIST: 'Add me to the RDN mailing list',   // old opt-in question; updateFormTexts replaces it
  MAILING_OPT_OUT: 'RDN mailing list',               // opt-out checkbox
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
  CAREER: ['Student (Bachelor\u2019s or Master\u2019s)', 'PhD student', 'Postdoctoral researcher',
           'Early-career independent researcher (e.g. assistant professor, junior group leader, lecturer)',
           'Established researcher (e.g. associate or full professor, senior scientist)',
           'Working outside academia (e.g. government agency, NGO, consultancy, industry)',
           'Retired or emeritus', 'Other'],
  APPROACH: ['Field observation', 'Experiments (lab/mesocosm)', 'Theory/modelling',
             'Data synthesis/meta-analysis', 'Applied/management'],
  // Ecosystems, from the RDN response diversity survey (Oikos appendix S1, question 8e). "Multiple" is left out:
  // members can tick several.
  SYSTEMS: ['Marine', 'Freshwater', 'Terrestrial (tropical)', 'Terrestrial (temperate)', 'Terrestrial (dry)',
            'Terrestrial (arctic and boreal)', 'Subterranean (e.g. soil)',
            'Not applicable (e.g. theory, socio-ecological analysis)', 'Other'],
  // Taxa, from the RDN response diversity survey (Oikos appendix S1, question 8f). "Multiple" is left out:
  // members can tick several.
  ORGANISMS: ['Plants', 'Microorganisms', 'Birds', 'Insects',
              'Other invertebrates (e.g. crustaceans, molluscs, worms)', 'Terrestrial mammals', 'Marine mammals', 'Fish',
              'Reptiles', 'Amphibians', 'Not applicable (e.g. theory, socio-ecological analysis)', 'Other'],
  LEVELS: ['Individuals/traits', 'Populations', 'Communities', 'Ecosystems', 'Social-ecological systems'],
  STRESSORS: ['Warming', 'Climate extremes/drought', 'Land-use change', 'Pollution', 'Invasive species',
              'Harvesting', 'Multiple stressors'],
  REGIONS: ['Europe', 'North America', 'Central America and the Caribbean', 'South America', 'Africa', 'Asia', 'Oceania', 'Antarctica',
            'Atlantic Ocean', 'Pacific Ocean', 'Indian Ocean', 'Arctic Ocean', 'Southern Ocean'],
  MAILING_OPT_OUT: 'Please don\u2019t add me to the RDN mailing list',
  MAILING_HELP: 'Members are added to the RDN mailing list unless they tick the box below. The list is a place ' +
                'for members to share information with each other: meetings and workshops, calls for collaboration, ' +
                'opportunities and news from the network. It is moderated. Tick the box if you would rather just be ' +
                'on the member map. You can change this at any time with your personal link. Emails about your ' +
                'membership itself, such as your personal link, are sent either way.',
  SHOW_FIELDS: ['Name', 'Institution', 'Email', 'Website or ORCID link', 'Research interests', 'Research attributes'],
  OTHER_HELP: 'If you tick \u201cOther\u201d, you can say more in your answer to \u201cResearch interests\u201d ' +
              '(a short phrase or a few keywords) on the \u201cAbout you\u201d page.',
  INTERESTS_HELP: 'A short phrase or a few keywords, e.g. \u2018Response diversity of plankton communities to heatwaves\u2019. ' +
                  'Shown on the map and searchable.',
  SHOW_FIELDS_HELP: 'Each option refers to your answer to that question earlier in the form; anything you leave unticked stays private. ' +
                    'Your city and country are always shown if you appear on the map.',
  // Uploading a photo is the consent to show it (no separate "Photo" tick since 2026-10-15).
  PHOTO_HELP: 'A head-and-shoulders photo works best. It is shown with your entry on the public member map ' +
              '(if you chose to appear on the map). A new photo replaces the old one.',
  REMOVE_PHOTO: 'Please remove my photo from the map and delete it',
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
