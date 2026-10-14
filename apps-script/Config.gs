/**
 * RDN membership: settings shared by all script files.
 * Runs in the rdn.projectbase@gmail.com account.
 */
const CONFIG = {
  ORG_NAME: 'Response Diversity Network',
  SENDER_NAME: 'Response Diversity Network (membership)',
  REPLY_TO: 'owen.petchey@uzh.ch',
  LISTSERV_MANAGER: 'owen.petchey@uzh.ch',
  CURATOR: 'owen.petchey@uzh.ch',
  // Links in member emails point to this repo's GitHub Pages site (rdn-members).
  MAP_URL: 'https://responsediversitynetwork.github.io/rdn-members/',
  INFO_URL: 'https://responsediversitynetwork.github.io/rdn-members/join.html',
  PRIVACY_URL: 'https://responsediversitynetwork.github.io/rdn-members/join.html#privacy',
  PHOTO_SIZE_PX: 400,

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

const OPTIONS = {
  CAREER: ['PhD student', 'Postdoc', 'Early-career researcher/faculty', 'Mid/senior researcher',
           'Practitioner/non-academic', 'Other'],
  APPROACH: ['Field observation', 'Experiments (lab/mesocosm)', 'Theory/modelling',
             'Data synthesis/meta-analysis', 'Applied/management'],
  SYSTEMS: ['Terrestrial', 'Freshwater', 'Marine', 'Agricultural', 'Urban', 'Microbial'],
  ORGANISMS: ['Plants', 'Invertebrates', 'Vertebrates', 'Microbes', 'Algae/phytoplankton', 'Fungi',
              'Whole communities'],
  LEVELS: ['Individuals/traits', 'Populations', 'Communities', 'Ecosystems', 'Social-ecological systems'],
  STRESSORS: ['Warming', 'Climate extremes/drought', 'Land-use change', 'Pollution', 'Invasive species',
              'Harvesting', 'Multiple stressors'],
  REGIONS: ['Europe', 'North America', 'South America', 'Africa', 'Asia', 'Oceania', 'Antarctica',
            'Atlantic Ocean', 'Pacific Ocean', 'Indian Ocean', 'Arctic Ocean', 'Southern Ocean'],
  SHOW_FIELDS: ['Name', 'Institution', 'Email', 'Website', 'Research interests', 'Research attributes'],
  SHOW_FIELDS_PHOTO: 'Photo',       // extra option, photo form only
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
