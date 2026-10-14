/**
 * Geocoding and continents.
 */

/**
 * Looks up "City, State/Province, Country" with Google's geocoder (English names).
 * Returns {lat, lon, code, country} or null if nothing was found.
 */
function geocode_(city, state, country) {
  const addr = [city, state, country].map(s => String(s || '').trim()).filter(Boolean).join(', ');
  if (!addr) return null;
  let res;
  try {
    res = Maps.newGeocoder().setLanguage('en').geocode(addr);
  } catch (e) {
    console.warn('Geocoder error for "' + addr + '": ' + e.message);
    return null;
  }
  if (!res || res.status !== 'OK' || !res.results || !res.results.length) return null;
  const r = res.results[0];
  const c = (r.address_components || []).find(x => (x.types || []).indexOf('country') >= 0);
  return {
    lat: r.geometry.location.lat,
    lon: r.geometry.location.lng,
    code: c ? c.short_name : '',
    country: c ? c.long_name : String(country || '').trim(),
  };
}

/** ISO 3166 alpha-2 country codes by continent. */
const CONTINENT_CODES_ = {
  'Africa': 'AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW',
  'Asia': 'AE AF AM AZ BD BH BN BT CC CN CX CY GE HK ID IL IN IO IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE',
  'Europe': 'AD AL AT AX BA BE BG BY CH CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK',
  'North America': 'AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI',
  'South America': 'AR BO BR CL CO EC FK GF GS GY PE PY SR UY VE',
  'Oceania': 'AS AU CK FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV UM VU WF WS',
  'Antarctica': 'AQ BV HM TF',
};
let CONTINENT_BY_CODE_ = null;

/** Continent name for a two-letter country code, or '' if unknown. */
function continentFor_(code) {
  if (!CONTINENT_BY_CODE_) {
    CONTINENT_BY_CODE_ = {};
    Object.keys(CONTINENT_CODES_).forEach(k => CONTINENT_CODES_[k].split(' ').forEach(c => { CONTINENT_BY_CODE_[c] = k; }));
  }
  return CONTINENT_BY_CODE_[String(code || '').toUpperCase()] || '';
}
