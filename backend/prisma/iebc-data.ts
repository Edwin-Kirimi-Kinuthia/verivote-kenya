/**
 * VeriVote Kenya — IEBC Electoral Data
 *
 * One representative polling station per constituency (290 domestic + 15 diaspora).
 * Coordinates are approximate constituency centres — sufficient for nearest-station
 * matching at registration time.
 */

export interface IEBCStation {
  code:             string;
  name:             string;
  county:           string;
  constituency:     string;
  ward:             string;
  latitude:         number;
  longitude:        number;
  address:          string;
  registeredVoters: number;
  isDiaspora:       boolean;
  country:          string | null;
}

export const DOMESTIC_STATIONS: IEBCStation[] = [
  // ── 01 Mombasa ─────────────────────────────────────────────────────────────
  { code:'MOM-CHG-001', name:'Changamwe Primary School',    county:'Mombasa', constituency:'Changamwe',    ward:'Changamwe',      latitude:-4.0500, longitude:39.6200, address:'Changamwe, Mombasa',    registeredVoters:18500, isDiaspora:false, country:null },
  { code:'MOM-JOM-001', name:'Jomvu Primary School',        county:'Mombasa', constituency:'Jomvu',        ward:'Jomvu Kuu',      latitude:-4.0300, longitude:39.6800, address:'Jomvu, Mombasa',        registeredVoters:16200, isDiaspora:false, country:null },
  { code:'MOM-KIS-001', name:'Kisauni Secondary School',    county:'Mombasa', constituency:'Kisauni',      ward:'Kisauni',        latitude:-3.9800, longitude:39.7200, address:'Kisauni, Mombasa',      registeredVoters:22400, isDiaspora:false, country:null },
  { code:'MOM-NYL-001', name:'Nyali Primary School',        county:'Mombasa', constituency:'Nyali',        ward:'Nyali',          latitude:-4.0100, longitude:39.7300, address:'Nyali, Mombasa',        registeredVoters:24000, isDiaspora:false, country:null },
  { code:'MOM-LIK-001', name:'Likoni Primary School',       county:'Mombasa', constituency:'Likoni',       ward:'Likoni',         latitude:-4.0800, longitude:39.6600, address:'Likoni, Mombasa',       registeredVoters:20100, isDiaspora:false, country:null },
  { code:'MOM-MVI-001', name:'Mvita IEBC Hall',             county:'Mombasa', constituency:'Mvita',        ward:'Tudor',          latitude:-4.0600, longitude:39.6650, address:'Mvita, Mombasa',        registeredVoters:19800, isDiaspora:false, country:null },

  // ── 02 Kwale ───────────────────────────────────────────────────────────────
  { code:'KWL-MSM-001', name:'Msambweni Primary School',    county:'Kwale', constituency:'Msambweni',   ward:'Msambweni',       latitude:-4.4700, longitude:39.4900, address:'Msambweni, Kwale',       registeredVoters:15200, isDiaspora:false, country:null },
  { code:'KWL-LNG-001', name:'Lungalunga Primary School',   county:'Kwale', constituency:'Lungalunga',  ward:'Lungalunga',      latitude:-4.5500, longitude:39.1000, address:'Lungalunga, Kwale',      registeredVoters:14100, isDiaspora:false, country:null },
  { code:'KWL-MAT-001', name:'Matuga Primary School',       county:'Kwale', constituency:'Matuga',      ward:'Tsimba-Golini',   latitude:-4.1200, longitude:39.4400, address:'Matuga, Kwale',          registeredVoters:16800, isDiaspora:false, country:null },
  { code:'KWL-KIN-001', name:'Kinango Primary School',      county:'Kwale', constituency:'Kinango',     ward:'Kinango',         latitude:-3.9500, longitude:39.0500, address:'Kinango, Kwale',         registeredVoters:17300, isDiaspora:false, country:null },

  // ── 03 Kilifi ──────────────────────────────────────────────────────────────
  { code:'KLF-KLN-001', name:'Kilifi North Primary',        county:'Kilifi', constituency:'Kilifi North',  ward:'Tezo',           latitude:-3.3000, longitude:40.0300, address:'Tezo, Kilifi',           registeredVoters:16400, isDiaspora:false, country:null },
  { code:'KLF-KLS-001', name:'Kilifi South Primary',        county:'Kilifi', constituency:'Kilifi South',  ward:'Chasimba',       latitude:-3.6300, longitude:39.8500, address:'Chasimba, Kilifi',       registeredVoters:15800, isDiaspora:false, country:null },
  { code:'KLF-KAL-001', name:'Kaloleni Primary School',     county:'Kilifi', constituency:'Kaloleni',      ward:'Kaloleni',       latitude:-3.7600, longitude:39.6700, address:'Kaloleni, Kilifi',       registeredVoters:17200, isDiaspora:false, country:null },
  { code:'KLF-RAB-001', name:'Rabai Primary School',        county:'Kilifi', constituency:'Rabai',         ward:'Rabai/Kisurutini',latitude:-3.8700, longitude:39.6400, address:'Rabai, Kilifi',         registeredVoters:14900, isDiaspora:false, country:null },
  { code:'KLF-GAN-001', name:'Ganze Primary School',        county:'Kilifi', constituency:'Ganze',         ward:'Ganze',          latitude:-3.1000, longitude:39.8300, address:'Ganze, Kilifi',          registeredVoters:15100, isDiaspora:false, country:null },
  { code:'KLF-MLN-001', name:'Malindi Primary School',      county:'Kilifi', constituency:'Malindi',       ward:'Malindi Town',   latitude:-3.2194, longitude:40.1169, address:'Malindi Town, Kilifi',   registeredVoters:20300, isDiaspora:false, country:null },
  { code:'KLF-MGR-001', name:'Magarini Primary School',     county:'Kilifi', constituency:'Magarini',      ward:'Magarini',       latitude:-3.1500, longitude:40.2300, address:'Magarini, Kilifi',       registeredVoters:16600, isDiaspora:false, country:null },

  // ── 04 Tana River ──────────────────────────────────────────────────────────
  { code:'TNR-GRS-001', name:'Garsen Primary School',       county:'Tana River', constituency:'Garsen',    ward:'Garsen Central', latitude:-2.2833, longitude:40.1167, address:'Garsen, Tana River',     registeredVoters:14500, isDiaspora:false, country:null },
  { code:'TNR-GLO-001', name:'Galole Primary School',       county:'Tana River', constituency:'Galole',    ward:'Galole',         latitude:-1.6200, longitude:40.0600, address:'Galole, Tana River',     registeredVoters:13200, isDiaspora:false, country:null },
  { code:'TNR-BUR-001', name:'Bura Primary School',         county:'Tana River', constituency:'Bura',      ward:'Bura',           latitude:-1.1000, longitude:39.9400, address:'Bura, Tana River',       registeredVoters:12800, isDiaspora:false, country:null },

  // ── 05 Lamu ────────────────────────────────────────────────────────────────
  { code:'LAM-LME-001', name:'Lamu East Primary School',    county:'Lamu', constituency:'Lamu East',   ward:'Faza',           latitude:-1.8500, longitude:41.2200, address:'Faza, Lamu',             registeredVoters:11200, isDiaspora:false, country:null },
  { code:'LAM-LMW-001', name:'Lamu West Primary School',    county:'Lamu', constituency:'Lamu West',   ward:'Shela',          latitude:-2.2700, longitude:40.9000, address:'Shela, Lamu',            registeredVoters:12600, isDiaspora:false, country:null },

  // ── 06 Taita-Taveta ────────────────────────────────────────────────────────
  { code:'TTV-TWI-001', name:'Taveta Primary School',       county:'Taita-Taveta', constituency:'Taveta',    ward:'Taveta Central', latitude:-3.3967, longitude:37.6956, address:'Taveta Town',           registeredVoters:14800, isDiaspora:false, country:null },
  { code:'TTV-WDY-001', name:'Wundanyi Primary School',     county:'Taita-Taveta', constituency:'Wundanyi',  ward:'Wundanyi/Mbale', latitude:-3.3916, longitude:38.3534, address:'Wundanyi, Taita-Taveta', registeredVoters:15600, isDiaspora:false, country:null },
  { code:'TTV-MWT-001', name:'Mwatate Primary School',      county:'Taita-Taveta', constituency:'Mwatate',   ward:'Mwatate',        latitude:-3.5006, longitude:38.3744, address:'Mwatate, Taita-Taveta', registeredVoters:16100, isDiaspora:false, country:null },
  { code:'TTV-VOI-001', name:'Voi Primary School',          county:'Taita-Taveta', constituency:'Voi',       ward:'Voi',            latitude:-3.3959, longitude:38.5580, address:'Voi, Taita-Taveta',     registeredVoters:17300, isDiaspora:false, country:null },

  // ── 07 Garissa ─────────────────────────────────────────────────────────────
  { code:'GAR-GRT-001', name:'Garissa Township Primary',    county:'Garissa', constituency:'Garissa Township', ward:'Galbet',         latitude:-0.4532, longitude:39.6461, address:'Garissa Township',      registeredVoters:19200, isDiaspora:false, country:null },
  { code:'GAR-BAL-001', name:'Balambala Primary School',    county:'Garissa', constituency:'Balambala',        ward:'Balambala',      latitude:-0.7600, longitude:39.9700, address:'Balambala, Garissa',    registeredVoters:12400, isDiaspora:false, country:null },
  { code:'GAR-LAG-001', name:'Lagdera Primary School',      county:'Garissa', constituency:'Lagdera',          ward:'Modogashe',      latitude:0.2700,  longitude:40.1100, address:'Lagdera, Garissa',      registeredVoters:11800, isDiaspora:false, country:null },
  { code:'GAR-DAD-001', name:'Dadaab Primary School',       county:'Garissa', constituency:'Dadaab',           ward:'Dadaab',         latitude:0.0484,  longitude:40.3141, address:'Dadaab, Garissa',       registeredVoters:13600, isDiaspora:false, country:null },
  { code:'GAR-FAF-001', name:'Fafi Primary School',         county:'Garissa', constituency:'Fafi',             ward:'Nanighi',        latitude:-0.1400, longitude:40.5200, address:'Fafi, Garissa',         registeredVoters:11100, isDiaspora:false, country:null },
  { code:'GAR-IJA-001', name:'Ijara Primary School',        county:'Garissa', constituency:'Ijara',            ward:'Ijara',          latitude:-1.5700, longitude:40.5200, address:'Ijara, Garissa',        registeredVoters:10800, isDiaspora:false, country:null },

  // ── 08 Wajir ───────────────────────────────────────────────────────────────
  { code:'WJR-WJN-001', name:'Wajir North Primary',         county:'Wajir', constituency:'Wajir North',  ward:'Korondille',     latitude:2.3000, longitude:40.0600, address:'Wajir North',            registeredVoters:12100, isDiaspora:false, country:null },
  { code:'WJR-WJE-001', name:'Wajir East Primary',          county:'Wajir', constituency:'Wajir East',   ward:'Wagberi',        latitude:1.7500, longitude:40.3400, address:'Wajir East',             registeredVoters:13400, isDiaspora:false, country:null },
  { code:'WJR-TAR-001', name:'Tarbaj Primary School',       county:'Wajir', constituency:'Tarbaj',       ward:'Tarbaj',         latitude:1.4800, longitude:40.8200, address:'Tarbaj, Wajir',          registeredVoters:10200, isDiaspora:false, country:null },
  { code:'WJR-WJW-001', name:'Wajir West Primary',          county:'Wajir', constituency:'Wajir West',   ward:'Bute',           latitude:1.7500, longitude:39.5400, address:'Wajir West',             registeredVoters:11900, isDiaspora:false, country:null },
  { code:'WJR-ELD-001', name:'Eldas Primary School',        county:'Wajir', constituency:'Eldas',        ward:'Eldas',          latitude:1.1800, longitude:39.7200, address:'Eldas, Wajir',           registeredVoters:10600, isDiaspora:false, country:null },
  { code:'WJR-WJS-001', name:'Wajir South Primary',         county:'Wajir', constituency:'Wajir South',  ward:'Habaswein',      latitude:1.0100, longitude:39.4900, address:'Wajir South',            registeredVoters:11400, isDiaspora:false, country:null },

  // ── 09 Mandera ─────────────────────────────────────────────────────────────
  { code:'MND-MDE-001', name:'Mandera East Primary',        county:'Mandera', constituency:'Mandera East',  ward:'Mandera East',   latitude:3.9370, longitude:41.8600, address:'Mandera East',           registeredVoters:12500, isDiaspora:false, country:null },
  { code:'MND-BNS-001', name:'Banissa Primary School',      county:'Mandera', constituency:'Banissa',       ward:'Banissa',        latitude:4.1200, longitude:41.3600, address:'Banissa, Mandera',       registeredVoters:10200, isDiaspora:false, country:null },
  { code:'MND-MDN-001', name:'Mandera North Primary',       county:'Mandera', constituency:'Mandera North', ward:'Rhamu',          latitude:4.2900, longitude:41.5100, address:'Mandera North',          registeredVoters:11400, isDiaspora:false, country:null },
  { code:'MND-MDS-001', name:'Mandera South Primary',       county:'Mandera', constituency:'Mandera South', ward:'Mandera South',  latitude:3.8500, longitude:41.5400, address:'Mandera South',          registeredVoters:10800, isDiaspora:false, country:null },
  { code:'MND-MDW-001', name:'Mandera West Primary',        county:'Mandera', constituency:'Mandera West',  ward:'Bulagaduud',     latitude:3.7200, longitude:41.2700, address:'Mandera West',           registeredVoters:11200, isDiaspora:false, country:null },
  { code:'MND-LAF-001', name:'Lafey Primary School',        county:'Mandera', constituency:'Lafey',         ward:'Lafey',          latitude:4.0500, longitude:42.1500, address:'Lafey, Mandera',         registeredVoters:9800,  isDiaspora:false, country:null },

  // ── 10 Marsabit ────────────────────────────────────────────────────────────
  { code:'MSB-MOY-001', name:'Moyale Primary School',       county:'Marsabit', constituency:'Moyale',    ward:'Moyale Township', latitude:3.5259, longitude:39.0561, address:'Moyale, Marsabit',       registeredVoters:13200, isDiaspora:false, country:null },
  { code:'MSB-NHR-001', name:'North Horr Primary School',   county:'Marsabit', constituency:'North Horr',ward:'Dukana',          latitude:3.3300, longitude:37.0600, address:'North Horr, Marsabit',   registeredVoters:11400, isDiaspora:false, country:null },
  { code:'MSB-SAK-001', name:'Saku Primary School',         county:'Marsabit', constituency:'Saku',      ward:'Marsabit Central',latitude:2.3284, longitude:37.9899, address:'Saku, Marsabit',         registeredVoters:14600, isDiaspora:false, country:null },
  { code:'MSB-LAI-001', name:'Laisamis Primary School',     county:'Marsabit', constituency:'Laisamis',  ward:'Laisamis',        latitude:1.6200, longitude:37.8300, address:'Laisamis, Marsabit',     registeredVoters:12800, isDiaspora:false, country:null },

  // ── 11 Isiolo ──────────────────────────────────────────────────────────────
  { code:'ISL-ISN-001', name:'Isiolo North Primary',        county:'Isiolo', constituency:'Isiolo North', ward:'Isiolo Township', latitude:0.3500, longitude:37.5800, address:'Isiolo North',           registeredVoters:16200, isDiaspora:false, country:null },
  { code:'ISL-ISS-001', name:'Isiolo South Primary',        county:'Isiolo', constituency:'Isiolo South', ward:'Chari',           latitude:0.1200, longitude:38.2400, address:'Isiolo South',           registeredVoters:13400, isDiaspora:false, country:null },

  // ── 12 Meru ────────────────────────────────────────────────────────────────
  { code:'MRU-IGS-001', name:'Igembe South Primary',        county:'Meru', constituency:'Igembe South',   ward:'Igembe South',   latitude:0.3300, longitude:38.1500, address:'Igembe South, Meru',     registeredVoters:17400, isDiaspora:false, country:null },
  { code:'MRU-IGC-001', name:'Igembe Central Primary',      county:'Meru', constituency:'Igembe Central', ward:'Njia',           latitude:0.4000, longitude:38.0800, address:'Igembe Central, Meru',   registeredVoters:16800, isDiaspora:false, country:null },
  { code:'MRU-IGN-001', name:'Igembe North Primary',        county:'Meru', constituency:'Igembe North',   ward:'Antuambui',      latitude:0.5200, longitude:38.0300, address:'Igembe North, Meru',     registeredVoters:15900, isDiaspora:false, country:null },
  { code:'MRU-TGW-001', name:'Tigania West Primary',        county:'Meru', constituency:'Tigania West',   ward:'Akachiu',        latitude:0.2200, longitude:37.9400, address:'Tigania West, Meru',     registeredVoters:17100, isDiaspora:false, country:null },
  { code:'MRU-TGE-001', name:'Tigania East Primary',        county:'Meru', constituency:'Tigania East',   ward:'Kangeta',        latitude:0.2800, longitude:38.0900, address:'Tigania East, Meru',     registeredVoters:16300, isDiaspora:false, country:null },
  { code:'MRU-NIM-001', name:'North Imenti Primary',        county:'Meru', constituency:'North Imenti',   ward:'Municipality',   latitude:0.0600, longitude:37.6600, address:'North Imenti, Meru',     registeredVoters:22100, isDiaspora:false, country:null },
  { code:'MRU-BRI-001', name:'Buuri Primary School',        county:'Meru', constituency:'Buuri',          ward:'Kisima',         latitude:0.2200, longitude:37.2600, address:'Buuri, Meru',            registeredVoters:15200, isDiaspora:false, country:null },
  { code:'MRU-CIM-001', name:'Central Imenti Primary',      county:'Meru', constituency:'Central Imenti', ward:'Township',       latitude:0.0460, longitude:37.6487, address:'Central Imenti, Meru',   registeredVoters:21400, isDiaspora:false, country:null },
  { code:'MRU-SIM-001', name:'South Imenti Primary',        county:'Meru', constituency:'South Imenti',   ward:'Abogeta East',   latitude:-0.1200, longitude:37.7300, address:'South Imenti, Meru',    registeredVoters:18600, isDiaspora:false, country:null },

  // ── 13 Tharaka-Nithi ───────────────────────────────────────────────────────
  { code:'THN-MAR-001', name:'Maara Primary School',        county:'Tharaka-Nithi', constituency:'Maara',                ward:'Muthambi',      latitude:-0.1300, longitude:37.8200, address:'Maara, Tharaka-Nithi',    registeredVoters:18200, isDiaspora:false, country:null },
  { code:'THN-CIG-001', name:'Chuka Primary School',        county:'Tharaka-Nithi', constituency:'Chuka/Igambang\'ombe', ward:'Chuka',         latitude:-0.3380, longitude:37.6440, address:'Chuka, Tharaka-Nithi',    registeredVoters:19400, isDiaspora:false, country:null },
  { code:'THN-THR-001', name:'Tharaka Primary School',      county:'Tharaka-Nithi', constituency:'Tharaka',              ward:'Tharaka North', latitude:-0.2100, longitude:37.9300, address:'Tharaka, Tharaka-Nithi',  registeredVoters:16800, isDiaspora:false, country:null },

  // ── 14 Embu ────────────────────────────────────────────────────────────────
  { code:'EMB-MNY-001', name:'Manyatta Primary School',     county:'Embu', constituency:'Manyatta',      ward:'Nginda',         latitude:-0.5200, longitude:37.4600, address:'Manyatta, Embu',         registeredVoters:21400, isDiaspora:false, country:null },
  { code:'EMB-RNJ-001', name:'Runyenjes Primary School',    county:'Embu', constituency:'Runyenjes',     ward:'Central',        latitude:-0.5800, longitude:37.5800, address:'Runyenjes, Embu',        registeredVoters:19800, isDiaspora:false, country:null },
  { code:'EMB-MBS-001', name:'Mbeere South Primary',        county:'Embu', constituency:'Mbeere South',  ward:'Mbeti South',    latitude:-0.7800, longitude:37.5200, address:'Mbeere South, Embu',     registeredVoters:17200, isDiaspora:false, country:null },
  { code:'EMB-MBN-001', name:'Mbeere North Primary',        county:'Embu', constituency:'Mbeere North',  ward:'Makima',         latitude:-0.6500, longitude:37.6900, address:'Mbeere North, Embu',     registeredVoters:16800, isDiaspora:false, country:null },

  // ── 15 Kitui ───────────────────────────────────────────────────────────────
  { code:'KTI-MGN-001', name:'Mwingi North Primary',        county:'Kitui', constituency:'Mwingi North',  ward:'Mui',            latitude:-0.9200, longitude:38.0500, address:'Mwingi North, Kitui',    registeredVoters:16400, isDiaspora:false, country:null },
  { code:'KTI-MGW-001', name:'Mwingi West Primary',         county:'Kitui', constituency:'Mwingi West',   ward:'Tseikuru',       latitude:-1.0600, longitude:37.8800, address:'Mwingi West, Kitui',     registeredVoters:15800, isDiaspora:false, country:null },
  { code:'KTI-MGC-001', name:'Mwingi Central Primary',      county:'Kitui', constituency:'Mwingi Central',ward:'Mwingi Central', latitude:-1.0386, longitude:38.0607, address:'Mwingi Central, Kitui',  registeredVoters:17200, isDiaspora:false, country:null },
  { code:'KTI-KTW-001', name:'Kitui West Primary',          county:'Kitui', constituency:'Kitui West',    ward:'Mutomo',         latitude:-1.5200, longitude:37.6900, address:'Kitui West, Kitui',      registeredVoters:16900, isDiaspora:false, country:null },
  { code:'KTI-KTR-001', name:'Kitui Rural Primary',         county:'Kitui', constituency:'Kitui Rural',   ward:'Muumandu',       latitude:-1.4800, longitude:38.1800, address:'Kitui Rural, Kitui',     registeredVoters:15600, isDiaspora:false, country:null },
  { code:'KTI-KTC-001', name:'Kitui Central Primary',       county:'Kitui', constituency:'Kitui Central',  ward:'Township',      latitude:-1.3664, longitude:38.0165, address:'Kitui Central, Kitui',   registeredVoters:21200, isDiaspora:false, country:null },
  { code:'KTI-KTE-001', name:'Kitui East Primary',          county:'Kitui', constituency:'Kitui East',    ward:'Zombe/Mwitika',  latitude:-1.5800, longitude:38.3500, address:'Kitui East, Kitui',      registeredVoters:14800, isDiaspora:false, country:null },
  { code:'KTI-KTS-001', name:'Kitui South Primary',         county:'Kitui', constituency:'Kitui South',   ward:'Athi',           latitude:-2.1500, longitude:38.1800, address:'Kitui South, Kitui',     registeredVoters:15200, isDiaspora:false, country:null },

  // ── 16 Machakos ────────────────────────────────────────────────────────────
  { code:'MKS-MSG-001', name:'Masinga Primary School',      county:'Machakos', constituency:'Masinga',      ward:'Central',        latitude:-1.2800, longitude:37.6100, address:'Masinga, Machakos',      registeredVoters:17400, isDiaspora:false, country:null },
  { code:'MKS-YAT-001', name:'Yatta Primary School',        county:'Machakos', constituency:'Yatta',        ward:'Ndalani',        latitude:-1.1300, longitude:37.5200, address:'Yatta, Machakos',        registeredVoters:18600, isDiaspora:false, country:null },
  { code:'MKS-KGD-001', name:'Kangundo Primary School',     county:'Machakos', constituency:'Kangundo',     ward:'Kangundo North', latitude:-1.2400, longitude:37.3400, address:'Kangundo, Machakos',     registeredVoters:19200, isDiaspora:false, country:null },
  { code:'MKS-MTG-001', name:'Matungulu Primary School',    county:'Machakos', constituency:'Matungulu',    ward:'Matungulu North',latitude:-1.2100, longitude:37.4100, address:'Matungulu, Machakos',    registeredVoters:18400, isDiaspora:false, country:null },
  { code:'MKS-KTH-001', name:'Kathiani Primary School',     county:'Machakos', constituency:'Kathiani',     ward:'Upper Kaewa',    latitude:-1.3900, longitude:37.2100, address:'Kathiani, Machakos',     registeredVoters:17800, isDiaspora:false, country:null },
  { code:'MKS-MVK-001', name:'Mavoko Primary School',       county:'Machakos', constituency:'Mavoko',       ward:'Mavoko',         latitude:-1.3800, longitude:36.9800, address:'Mavoko, Machakos',       registeredVoters:28400, isDiaspora:false, country:null },
  { code:'MKS-MKT-001', name:'Machakos Town Hall',          county:'Machakos', constituency:'Machakos Town',ward:'Machakos Township',latitude:-1.5177, longitude:37.2634, address:'Machakos Town',        registeredVoters:24600, isDiaspora:false, country:null },
  { code:'MKS-MWL-001', name:'Mwala Primary School',        county:'Machakos', constituency:'Mwala',        ward:'Mbioni',         latitude:-1.6300, longitude:37.4600, address:'Mwala, Machakos',        registeredVoters:16800, isDiaspora:false, country:null },

  // ── 17 Makueni ─────────────────────────────────────────────────────────────
  { code:'MKN-MBN-001', name:'Mbooni Primary School',       county:'Makueni', constituency:'Mbooni',      ward:'Mbooni',         latitude:-1.8200, longitude:37.4900, address:'Mbooni, Makueni',        registeredVoters:16400, isDiaspora:false, country:null },
  { code:'MKN-KLM-001', name:'Kilome Primary School',       county:'Makueni', constituency:'Kilome',      ward:'Kasikeu',        latitude:-1.9600, longitude:37.3900, address:'Kilome, Makueni',        registeredVoters:15800, isDiaspora:false, country:null },
  { code:'MKN-KAT-001', name:'Kaiti Primary School',        county:'Makueni', constituency:'Kaiti',       ward:'Kaiti',          latitude:-1.9400, longitude:37.7400, address:'Kaiti, Makueni',         registeredVoters:16600, isDiaspora:false, country:null },
  { code:'MKN-MKN-001', name:'Makueni Primary School',      county:'Makueni', constituency:'Makueni',     ward:'Makueni',        latitude:-2.2558, longitude:37.8938, address:'Makueni Town',           registeredVoters:17200, isDiaspora:false, country:null },
  { code:'MKN-KBW-001', name:'Kibwezi West Primary',        county:'Makueni', constituency:'Kibwezi West',ward:'Masongaleni',    latitude:-2.3800, longitude:37.9700, address:'Kibwezi West, Makueni',  registeredVoters:15400, isDiaspora:false, country:null },
  { code:'MKN-KBE-001', name:'Kibwezi East Primary',        county:'Makueni', constituency:'Kibwezi East',ward:'Mtito Andei',    latitude:-2.6800, longitude:38.1700, address:'Kibwezi East, Makueni',  registeredVoters:14800, isDiaspora:false, country:null },

  // ── 18 Nyandarua ───────────────────────────────────────────────────────────
  { code:'NYD-KNP-001', name:'Kinangop Primary School',     county:'Nyandarua', constituency:'Kinangop',  ward:'Engineer',       latitude:-0.6800, longitude:36.5800, address:'Kinangop, Nyandarua',    registeredVoters:18200, isDiaspora:false, country:null },
  { code:'NYD-KPR-001', name:'Kipipiri Primary School',     county:'Nyandarua', constituency:'Kipipiri',  ward:'Wanjohi',        latitude:-0.5200, longitude:36.6700, address:'Kipipiri, Nyandarua',    registeredVoters:16400, isDiaspora:false, country:null },
  { code:'NYD-OLK-001', name:'Ol Kalou Primary School',     county:'Nyandarua', constituency:'Ol Kalou',  ward:'Ol Kalou',       latitude:-0.2682, longitude:36.3778, address:'Ol Kalou, Nyandarua',    registeredVoters:19800, isDiaspora:false, country:null },
  { code:'NYD-OJR-001', name:'Ol Jorok Primary School',     county:'Nyandarua', constituency:'Ol Jorok',  ward:'Murungaru',      latitude:0.0500,  longitude:36.5600, address:'Ol Jorok, Nyandarua',    registeredVoters:17200, isDiaspora:false, country:null },
  { code:'NYD-NDR-001', name:'Ndaragwa Primary School',     county:'Nyandarua', constituency:'Ndaragwa',  ward:'Ndaragwa',       latitude:0.1700,  longitude:36.7200, address:'Ndaragwa, Nyandarua',    registeredVoters:16800, isDiaspora:false, country:null },

  // ── 19 Nyeri ───────────────────────────────────────────────────────────────
  { code:'NYR-TTU-001', name:'Tetu Primary School',         county:'Nyeri', constituency:'Tetu',        ward:'Dedan Kimathi',  latitude:-0.6100, longitude:36.9600, address:'Tetu, Nyeri',            registeredVoters:17400, isDiaspora:false, country:null },
  { code:'NYR-KNI-001', name:'Kieni Primary School',        county:'Nyeri', constituency:'Kieni',       ward:'Gakawa',         latitude:-0.2800, longitude:37.0700, address:'Kieni, Nyeri',           registeredVoters:20200, isDiaspora:false, country:null },
  { code:'NYR-MTR-001', name:'Mathira Primary School',      county:'Nyeri', constituency:'Mathira',     ward:'Ruiga',          latitude:-0.4300, longitude:37.0800, address:'Mathira, Nyeri',         registeredVoters:18600, isDiaspora:false, country:null },
  { code:'NYR-OTH-001', name:'Othaya Primary School',       county:'Nyeri', constituency:'Othaya',      ward:'Othaya Township', latitude:-0.5800, longitude:36.9300, address:'Othaya, Nyeri',         registeredVoters:16400, isDiaspora:false, country:null },
  { code:'NYR-MKI-001', name:'Mukurwe-ini Primary School',  county:'Nyeri', constituency:'Mukurwe-ini', ward:'Mukurwe-ini West',latitude:-0.7100, longitude:36.9700, address:'Mukurwe-ini, Nyeri',    registeredVoters:17200, isDiaspora:false, country:null },
  { code:'NYR-NYT-001', name:'Nyeri Town Hall',             county:'Nyeri', constituency:'Nyeri Town',  ward:'Rware',          latitude:-0.4167, longitude:36.9511, address:'Nyeri Town',             registeredVoters:23400, isDiaspora:false, country:null },

  // ── 20 Kirinyaga ───────────────────────────────────────────────────────────
  { code:'KRN-MWA-001', name:'Mwea Primary School',         county:'Kirinyaga', constituency:'Mwea',            ward:'Mutithi',        latitude:-0.7200, longitude:37.4100, address:'Mwea, Kirinyaga',        registeredVoters:21400, isDiaspora:false, country:null },
  { code:'KRN-GCG-001', name:'Gichugu Primary School',      county:'Kirinyaga', constituency:'Gichugu',         ward:'Karumandi',      latitude:-0.5100, longitude:37.4000, address:'Gichugu, Kirinyaga',     registeredVoters:18600, isDiaspora:false, country:null },
  { code:'KRN-NDI-001', name:'Ndia Primary School',         county:'Kirinyaga', constituency:'Ndia',            ward:'Mukure',         latitude:-0.5800, longitude:37.3200, address:'Ndia, Kirinyaga',        registeredVoters:17800, isDiaspora:false, country:null },
  { code:'KRN-KRC-001', name:'Kirinyaga Central Primary',   county:'Kirinyaga', constituency:'Kirinyaga Central',ward:'Kagio',          latitude:-0.5594, longitude:37.2786, address:'Kerugoya, Kirinyaga',    registeredVoters:22200, isDiaspora:false, country:null },

  // ── 21 Murang'a ────────────────────────────────────────────────────────────
  { code:'MRG-KGM-001', name:'Kangema Primary School',      county:'Murang\'a', constituency:'Kangema',    ward:'Muguru',         latitude:-0.8100, longitude:36.9900, address:'Kangema, Murang\'a',     registeredVoters:17400, isDiaspora:false, country:null },
  { code:'MRG-MTY-001', name:'Mathioya Primary School',     county:'Murang\'a', constituency:'Mathioya',   ward:'Gitugi',         latitude:-0.7900, longitude:36.9200, address:'Mathioya, Murang\'a',    registeredVoters:16800, isDiaspora:false, country:null },
  { code:'MRG-KHR-001', name:'Kiharu Primary School',       county:'Murang\'a', constituency:'Kiharu',     ward:'Wangu',          latitude:-0.7200, longitude:37.1500, address:'Kiharu, Murang\'a',      registeredVoters:21200, isDiaspora:false, country:null },
  { code:'MRG-KGO-001', name:'Kigumo Primary School',       county:'Murang\'a', constituency:'Kigumo',     ward:'Kigumo',         latitude:-0.8400, longitude:37.0500, address:'Kigumo, Murang\'a',      registeredVoters:18600, isDiaspora:false, country:null },
  { code:'MRG-MRG-001', name:'Maragua Primary School',      county:'Murang\'a', constituency:'Maragua',    ward:'Kimorori/Wempa', latitude:-0.8900, longitude:37.0900, address:'Maragua, Murang\'a',     registeredVoters:19200, isDiaspora:false, country:null },
  { code:'MRG-KND-001', name:'Kandara Primary School',      county:'Murang\'a', constituency:'Kandara',    ward:'Ng\'araria',     latitude:-0.9200, longitude:37.0200, address:'Kandara, Murang\'a',     registeredVoters:17800, isDiaspora:false, country:null },
  { code:'MRG-GTG-001', name:'Gatanga Primary School',      county:'Murang\'a', constituency:'Gatanga',    ward:'Ithanga',        latitude:-1.0200, longitude:37.0500, address:'Gatanga, Murang\'a',     registeredVoters:18400, isDiaspora:false, country:null },

  // ── 22 Kiambu ──────────────────────────────────────────────────────────────
  { code:'KMB-GTS-001', name:'Gatundu South Primary',       county:'Kiambu', constituency:'Gatundu South', ward:'Gatundu',        latitude:-0.9600, longitude:36.9600, address:'Gatundu South, Kiambu',  registeredVoters:22400, isDiaspora:false, country:null },
  { code:'KMB-GTN-001', name:'Gatundu North Primary',       county:'Kiambu', constituency:'Gatundu North', ward:'Kiganjo/Mathua', latitude:-0.8800, longitude:37.0100, address:'Gatundu North, Kiambu',  registeredVoters:20600, isDiaspora:false, country:null },
  { code:'KMB-JJA-001', name:'Juja Primary School',         county:'Kiambu', constituency:'Juja',          ward:'Juja Farm',      latitude:-1.1100, longitude:37.0100, address:'Juja, Kiambu',           registeredVoters:28600, isDiaspora:false, country:null },
  { code:'KMB-THK-001', name:'Thika Town Hall',             county:'Kiambu', constituency:'Thika Town',    ward:'Township',       latitude:-1.0332, longitude:37.0693, address:'Thika Town, Kiambu',     registeredVoters:32400, isDiaspora:false, country:null },
  { code:'KMB-RRU-001', name:'Ruiru Primary School',        county:'Kiambu', constituency:'Ruiru',         ward:'Ruiru Township', latitude:-1.1461, longitude:36.9608, address:'Ruiru, Kiambu',          registeredVoters:38200, isDiaspora:false, country:null },
  { code:'KMB-GTR-001', name:'Githunguri Primary School',   county:'Kiambu', constituency:'Githunguri',    ward:'Githunguri',     latitude:-1.0700, longitude:36.7700, address:'Githunguri, Kiambu',     registeredVoters:21600, isDiaspora:false, country:null },
  { code:'KMB-KMB-001', name:'Kiambu Town Hall',            county:'Kiambu', constituency:'Kiambu',        ward:'Township',       latitude:-1.1731, longitude:36.8348, address:'Kiambu Town',            registeredVoters:26800, isDiaspora:false, country:null },
  { code:'KMB-KBA-001', name:'Kiambaa Primary School',      county:'Kiambu', constituency:'Kiambaa',       ward:'Cianda',         latitude:-1.2200, longitude:36.8700, address:'Kiambaa, Kiambu',        registeredVoters:24200, isDiaspora:false, country:null },
  { code:'KMB-KBT-001', name:'Kabete Primary School',       county:'Kiambu', constituency:'Kabete',        ward:'Muguga',         latitude:-1.2300, longitude:36.7200, address:'Kabete, Kiambu',         registeredVoters:28400, isDiaspora:false, country:null },
  { code:'KMB-KKY-001', name:'Kikuyu Primary School',       county:'Kiambu', constituency:'Kikuyu',        ward:'Kikuyu Township',latitude:-1.2544, longitude:36.6688, address:'Kikuyu, Kiambu',         registeredVoters:34600, isDiaspora:false, country:null },
  { code:'KMB-LMR-001', name:'Limuru Primary School',       county:'Kiambu', constituency:'Limuru',        ward:'Bibirioni',      latitude:-1.1182, longitude:36.6439, address:'Limuru, Kiambu',         registeredVoters:22800, isDiaspora:false, country:null },
  { code:'KMB-LAR-001', name:'Lari Primary School',         county:'Kiambu', constituency:'Lari',          ward:'Kirenga',        latitude:-0.9800, longitude:36.5900, address:'Lari, Kiambu',           registeredVoters:20400, isDiaspora:false, country:null },

  // ── 23 Turkana ─────────────────────────────────────────────────────────────
  { code:'TRK-TKN-001', name:'Turkana North Primary',       county:'Turkana', constituency:'Turkana North',  ward:'Lapur',          latitude:4.5800, longitude:35.7600, address:'Turkana North',          registeredVoters:12400, isDiaspora:false, country:null },
  { code:'TRK-TKW-001', name:'Turkana West Primary',        county:'Turkana', constituency:'Turkana West',   ward:'Kalobeyei',      latitude:3.5600, longitude:35.6500, address:'Turkana West',           registeredVoters:14800, isDiaspora:false, country:null },
  { code:'TRK-TKC-001', name:'Turkana Central Primary',     county:'Turkana', constituency:'Turkana Central', ward:'Lodwar Township', latitude:3.1191, longitude:35.5975, address:'Lodwar, Turkana',       registeredVoters:18200, isDiaspora:false, country:null },
  { code:'TRK-LOI-001', name:'Loima Primary School',        county:'Turkana', constituency:'Loima',          ward:'Turkwel',        latitude:2.6800, longitude:35.3700, address:'Loima, Turkana',         registeredVoters:11600, isDiaspora:false, country:null },
  { code:'TRK-TKS-001', name:'Turkana South Primary',       county:'Turkana', constituency:'Turkana South',  ward:'Kerio Delta',    latitude:2.0100, longitude:36.0800, address:'Turkana South',          registeredVoters:12800, isDiaspora:false, country:null },
  { code:'TRK-TKE-001', name:'Turkana East Primary',        county:'Turkana', constituency:'Turkana East',   ward:'Kapedo/Napeitom',latitude:2.7600, longitude:36.2200, address:'Turkana East',           registeredVoters:11200, isDiaspora:false, country:null },

  // ── 24 West Pokot ──────────────────────────────────────────────────────────
  { code:'WPK-PKS-001', name:'Pokot South Primary',         county:'West Pokot', constituency:'Pokot South',  ward:'Sekerr',         latitude:1.1700, longitude:35.4600, address:'Pokot South, West Pokot', registeredVoters:14600, isDiaspora:false, country:null },
  { code:'WPK-WPK-001', name:'West Pokot Primary',          county:'West Pokot', constituency:'West Pokot',   ward:'Kapenguria',     latitude:1.2393, longitude:35.1128, address:'Kapenguria, West Pokot',  registeredVoters:17200, isDiaspora:false, country:null },
  { code:'WPK-KCH-001', name:'Kacheliba Primary School',    county:'West Pokot', constituency:'Kacheliba',    ward:'Kacheliba',      latitude:1.6800, longitude:34.7600, address:'Kacheliba, West Pokot',   registeredVoters:13400, isDiaspora:false, country:null },
  { code:'WPK-SIG-001', name:'Sigor Primary School',        county:'West Pokot', constituency:'Sigor',        ward:'Masol',          latitude:1.3900, longitude:35.3700, address:'Sigor, West Pokot',       registeredVoters:14800, isDiaspora:false, country:null },

  // ── 25 Samburu ─────────────────────────────────────────────────────────────
  { code:'SMB-SBW-001', name:'Samburu West Primary',        county:'Samburu', constituency:'Samburu West',  ward:'Maralal Township',latitude:1.0968, longitude:36.6981, address:'Maralal, Samburu',        registeredVoters:14800, isDiaspora:false, country:null },
  { code:'SMB-SBN-001', name:'Samburu North Primary',       county:'Samburu', constituency:'Samburu North', ward:'Nachola',         latitude:2.1400, longitude:37.0200, address:'Samburu North',           registeredVoters:12600, isDiaspora:false, country:null },
  { code:'SMB-SBE-001', name:'Samburu East Primary',        county:'Samburu', constituency:'Samburu East',  ward:'Wamba West',      latitude:0.8600, longitude:37.6200, address:'Wamba, Samburu',          registeredVoters:13400, isDiaspora:false, country:null },

  // ── 26 Trans Nzoia ─────────────────────────────────────────────────────────
  { code:'TNZ-KWZ-001', name:'Kwanza Primary School',       county:'Trans Nzoia', constituency:'Kwanza',      ward:'Kwanza',         latitude:1.0600, longitude:34.8800, address:'Kwanza, Trans Nzoia',     registeredVoters:19400, isDiaspora:false, country:null },
  { code:'TNZ-END-001', name:'Endebess Primary School',     county:'Trans Nzoia', constituency:'Endebess',    ward:'Endebess',       latitude:1.1500, longitude:34.7800, address:'Endebess, Trans Nzoia',   registeredVoters:18200, isDiaspora:false, country:null },
  { code:'TNZ-SBT-001', name:'Saboti Primary School',       county:'Trans Nzoia', constituency:'Saboti',      ward:'Saboti',         latitude:1.0900, longitude:34.9700, address:'Saboti, Trans Nzoia',     registeredVoters:20600, isDiaspora:false, country:null },
  { code:'TNZ-KMN-001', name:'Kiminini Primary School',     county:'Trans Nzoia', constituency:'Kiminini',    ward:'Kiminini',       latitude:1.1437, longitude:35.0214, address:'Kiminini, Trans Nzoia',   registeredVoters:24200, isDiaspora:false, country:null },
  { code:'TNZ-CHR-001', name:'Cherangany Primary School',   county:'Trans Nzoia', constituency:'Cherangany',  ward:'Cherangany/Suwerwa',latitude:1.1000, longitude:35.1200, address:'Cherangany, Trans Nzoia', registeredVoters:22400, isDiaspora:false, country:null },

  // ── 27 Uasin Gishu ─────────────────────────────────────────────────────────
  { code:'UGS-SOY-001', name:'Soy Primary School',          county:'Uasin Gishu', constituency:'Soy',        ward:'Moi\'s Bridge',  latitude:0.6900, longitude:35.1700, address:'Soy, Uasin Gishu',        registeredVoters:22400, isDiaspora:false, country:null },
  { code:'UGS-TRB-001', name:'Turbo Primary School',        county:'Uasin Gishu', constituency:'Turbo',      ward:'Turbo',          latitude:0.6200, longitude:35.0400, address:'Turbo, Uasin Gishu',      registeredVoters:24600, isDiaspora:false, country:null },
  { code:'UGS-MOB-001', name:'Moiben Primary School',       county:'Uasin Gishu', constituency:'Moiben',     ward:'Moiben',         latitude:0.5600, longitude:35.4100, address:'Moiben, Uasin Gishu',     registeredVoters:21800, isDiaspora:false, country:null },
  { code:'UGS-ANB-001', name:'Ainabkoi Primary School',     county:'Uasin Gishu', constituency:'Ainabkoi',   ward:'Ainabkoi/Olare', latitude:0.4100, longitude:35.3200, address:'Ainabkoi, Uasin Gishu',   registeredVoters:22600, isDiaspora:false, country:null },
  { code:'UGS-KPS-001', name:'Kapseret Primary School',     county:'Uasin Gishu', constituency:'Kapseret',   ward:'Kapseret',       latitude:0.4800, longitude:35.2200, address:'Kapseret, Uasin Gishu',   registeredVoters:26400, isDiaspora:false, country:null },
  { code:'UGS-KSS-001', name:'Kesses Primary School',       county:'Uasin Gishu', constituency:'Kesses',     ward:'Racecourse',     latitude:0.4400, longitude:35.2700, address:'Kesses, Uasin Gishu',     registeredVoters:28200, isDiaspora:false, country:null },

  // ── 28 Elgeyo-Marakwet ─────────────────────────────────────────────────────
  { code:'EMK-MKE-001', name:'Marakwet East Primary',       county:'Elgeyo-Marakwet', constituency:'Marakwet East', ward:'Cherangany',  latitude:0.9200, longitude:35.7100, address:'Marakwet East',          registeredVoters:16800, isDiaspora:false, country:null },
  { code:'EMK-MKW-001', name:'Marakwet West Primary',       county:'Elgeyo-Marakwet', constituency:'Marakwet West', ward:'Lelan',        latitude:1.0200, longitude:35.6200, address:'Marakwet West',          registeredVoters:15600, isDiaspora:false, country:null },
  { code:'EMK-KYN-001', name:'Keiyo North Primary',         county:'Elgeyo-Marakwet', constituency:'Keiyo North',   ward:'Emsoo',        latitude:0.6900, longitude:35.5600, address:'Keiyo North',            registeredVoters:17200, isDiaspora:false, country:null },
  { code:'EMK-KYS-001', name:'Keiyo South Primary',         county:'Elgeyo-Marakwet', constituency:'Keiyo South',   ward:'Kamariny',     latitude:0.5100, longitude:35.5300, address:'Iten, Elgeyo-Marakwet',  registeredVoters:18400, isDiaspora:false, country:null },

  // ── 29 Nandi ───────────────────────────────────────────────────────────────
  { code:'NDI-TDT-001', name:'Tinderet Primary School',     county:'Nandi', constituency:'Tinderet',   ward:'Tinderet',       latitude:0.0400, longitude:35.0100, address:'Tinderet, Nandi',        registeredVoters:18600, isDiaspora:false, country:null },
  { code:'NDI-ALD-001', name:'Aldai Primary School',        county:'Nandi', constituency:'Aldai',      ward:'Kabwareng',      latitude:0.1200, longitude:35.3400, address:'Aldai, Nandi',           registeredVoters:19400, isDiaspora:false, country:null },
  { code:'NDI-NDH-001', name:'Nandi Hills Primary',         county:'Nandi', constituency:'Nandi Hills', ward:'Nandi Hills',   latitude:0.1014, longitude:35.1850, address:'Nandi Hills',             registeredVoters:22200, isDiaspora:false, country:null },
  { code:'NDI-CHM-001', name:'Chesumei Primary School',     county:'Nandi', constituency:'Chesumei',   ward:'Lelmokwo/Ngechek',latitude:0.2200, longitude:35.1700, address:'Chesumei, Nandi',        registeredVoters:20800, isDiaspora:false, country:null },
  { code:'NDI-EMG-001', name:'Emgwen Primary School',       county:'Nandi', constituency:'Emgwen',     ward:'Kapsoya',        latitude:0.2800, longitude:35.2600, address:'Emgwen, Nandi',          registeredVoters:24600, isDiaspora:false, country:null },
  { code:'NDI-MSP-001', name:'Mosop Primary School',        county:'Nandi', constituency:'Mosop',      ward:'Kabiyet',        latitude:0.4200, longitude:35.2400, address:'Mosop, Nandi',           registeredVoters:19200, isDiaspora:false, country:null },

  // ── 30 Baringo ─────────────────────────────────────────────────────────────
  { code:'BRN-TTY-001', name:'Tiaty Primary School',        county:'Baringo', constituency:'Tiaty',          ward:'Silale',         latitude:1.4200, longitude:36.0200, address:'Tiaty, Baringo',         registeredVoters:13800, isDiaspora:false, country:null },
  { code:'BRN-BRN-001', name:'Baringo North Primary',       county:'Baringo', constituency:'Baringo North',  ward:'Barwessa',       latitude:1.0800, longitude:35.9600, address:'Baringo North',          registeredVoters:16400, isDiaspora:false, country:null },
  { code:'BRN-BRC-001', name:'Baringo Central Primary',     county:'Baringo', constituency:'Baringo Central', ward:'Kabimoi',       latitude:0.4676, longitude:35.7516, address:'Kabarnet, Baringo',     registeredVoters:18200, isDiaspora:false, country:null },
  { code:'BRN-BRS-001', name:'Baringo South Primary',       county:'Baringo', constituency:'Baringo South',  ward:'Eldama Ravine',  latitude:0.0900, longitude:35.7200, address:'Baringo South',          registeredVoters:17400, isDiaspora:false, country:null },
  { code:'BRN-MGT-001', name:'Mogotio Primary School',      county:'Baringo', constituency:'Mogotio',        ward:'Mogotio',        latitude:0.2100, longitude:35.8900, address:'Mogotio, Baringo',       registeredVoters:16800, isDiaspora:false, country:null },
  { code:'BRN-ELR-001', name:'Eldama Ravine Primary',       county:'Baringo', constituency:'Eldama Ravine',  ward:'Ravine',         latitude:-0.0600, longitude:35.7100, address:'Eldama Ravine, Baringo', registeredVoters:20400, isDiaspora:false, country:null },

  // ── 31 Laikipia ────────────────────────────────────────────────────────────
  { code:'LKP-LKW-001', name:'Laikipia West Primary',       county:'Laikipia', constituency:'Laikipia West',  ward:'Ol Moran',       latitude:0.5200, longitude:36.6800, address:'Laikipia West',          registeredVoters:18600, isDiaspora:false, country:null },
  { code:'LKP-LKE-001', name:'Laikipia East Primary',       county:'Laikipia', constituency:'Laikipia East',  ward:'Thingithu',      latitude:0.2200, longitude:36.9400, address:'Nanyuki, Laikipia',      registeredVoters:24200, isDiaspora:false, country:null },
  { code:'LKP-LKN-001', name:'Laikipia North Primary',      county:'Laikipia', constituency:'Laikipia North', ward:'Mukogondo East', latitude:0.6200, longitude:37.1200, address:'Laikipia North',         registeredVoters:14800, isDiaspora:false, country:null },

  // ── 32 Nakuru ──────────────────────────────────────────────────────────────
  { code:'NKR-MOL-001', name:'Molo Primary School',         county:'Nakuru', constituency:'Molo',           ward:'Molo',           latitude:-0.2476, longitude:35.7346, address:'Molo, Nakuru',           registeredVoters:22400, isDiaspora:false, country:null },
  { code:'NKR-NJR-001', name:'Njoro Primary School',        county:'Nakuru', constituency:'Njoro',          ward:'Njoro',          latitude:-0.3382, longitude:35.9403, address:'Njoro, Nakuru',          registeredVoters:21800, isDiaspora:false, country:null },
  { code:'NKR-NVS-001', name:'Naivasha Primary School',     county:'Nakuru', constituency:'Naivasha',       ward:'Naivasha East',  latitude:-0.7173, longitude:36.4317, address:'Naivasha, Nakuru',       registeredVoters:28600, isDiaspora:false, country:null },
  { code:'NKR-GIL-001', name:'Gilgil Primary School',       county:'Nakuru', constituency:'Gilgil',         ward:'Gilgil',         latitude:-0.5098, longitude:36.3206, address:'Gilgil, Nakuru',         registeredVoters:22800, isDiaspora:false, country:null },
  { code:'NKR-KRS-001', name:'Kuresoi South Primary',       county:'Nakuru', constituency:'Kuresoi South',  ward:'Sirikwa',        latitude:-0.3800, longitude:35.5800, address:'Kuresoi South, Nakuru',  registeredVoters:20600, isDiaspora:false, country:null },
  { code:'NKR-KRN-001', name:'Kuresoi North Primary',       county:'Nakuru', constituency:'Kuresoi North',  ward:'Kiptororo',      latitude:-0.2100, longitude:35.6200, address:'Kuresoi North, Nakuru',  registeredVoters:19400, isDiaspora:false, country:null },
  { code:'NKR-SBK-001', name:'Subukia Primary School',      county:'Nakuru', constituency:'Subukia',        ward:'Subukia',        latitude:-0.1600, longitude:36.1100, address:'Subukia, Nakuru',        registeredVoters:18400, isDiaspora:false, country:null },
  { code:'NKR-RNG-001', name:'Rongai Primary School',       county:'Nakuru', constituency:'Rongai',         ward:'Mosop',          latitude:-0.1700, longitude:36.2200, address:'Rongai, Nakuru',         registeredVoters:22200, isDiaspora:false, country:null },
  { code:'NKR-BHT-001', name:'Bahati Primary School',       county:'Nakuru', constituency:'Bahati',         ward:'Bahati',         latitude:-0.1400, longitude:36.1800, address:'Bahati, Nakuru',         registeredVoters:20800, isDiaspora:false, country:null },
  { code:'NKR-NKW-001', name:'Nakuru Town West Hall',       county:'Nakuru', constituency:'Nakuru Town West',ward:'Kaptembwo',      latitude:-0.3178, longitude:36.0653, address:'Nakuru Town West',       registeredVoters:38400, isDiaspora:false, country:null },
  { code:'NKR-NKE-001', name:'Nakuru Town East Hall',       county:'Nakuru', constituency:'Nakuru Town East',ward:'Biashara',       latitude:-0.2827, longitude:36.0665, address:'Nakuru Town East',       registeredVoters:42200, isDiaspora:false, country:null },

  // ── 33 Narok ───────────────────────────────────────────────────────────────
  { code:'NRK-KGR-001', name:'Kilgoris Primary School',     county:'Narok', constituency:'Kilgoris',      ward:'Keyian',         latitude:-1.0100, longitude:34.9000, address:'Kilgoris, Narok',        registeredVoters:17600, isDiaspora:false, country:null },
  { code:'NRK-EMD-001', name:'Emurua Dikirr Primary',       county:'Narok', constituency:'Emurua Dikirr', ward:'Emurua Dikirr',  latitude:-1.1900, longitude:35.3400, address:'Emurua Dikirr, Narok',   registeredVoters:16200, isDiaspora:false, country:null },
  { code:'NRK-NRN-001', name:'Narok North Primary',         county:'Narok', constituency:'Narok North',   ward:'Olokurto',       latitude:-0.8600, longitude:35.9300, address:'Narok North',            registeredVoters:19800, isDiaspora:false, country:null },
  { code:'NRK-NRE-001', name:'Narok East Primary',          county:'Narok', constituency:'Narok East',    ward:'Mosiro',         latitude:-1.0800, longitude:36.0600, address:'Narok East',             registeredVoters:16800, isDiaspora:false, country:null },
  { code:'NRK-NRS-001', name:'Narok South Primary',         county:'Narok', constituency:'Narok South',   ward:'Majimoto/Naroosura',latitude:-1.3600, longitude:35.7800, address:'Narok South',         registeredVoters:15400, isDiaspora:false, country:null },
  { code:'NRK-NRW-001', name:'Narok West Primary',          county:'Narok', constituency:'Narok West',    ward:'Ilkisonko',      latitude:-1.0785, longitude:35.8716, address:'Narok Town',             registeredVoters:22400, isDiaspora:false, country:null },

  // ── 34 Kajiado ─────────────────────────────────────────────────────────────
  { code:'KJD-KJN-001', name:'Kajiado North Primary',       county:'Kajiado', constituency:'Kajiado North',   ward:'Ngong',          latitude:-1.3600, longitude:36.6400, address:'Ngong, Kajiado',         registeredVoters:32400, isDiaspora:false, country:null },
  { code:'KJD-KJC-001', name:'Kajiado Central Primary',     county:'Kajiado', constituency:'Kajiado Central', ward:'Kajiado',        latitude:-1.8526, longitude:36.7820, address:'Kajiado Town',           registeredVoters:18600, isDiaspora:false, country:null },
  { code:'KJD-KJE-001', name:'Kajiado East Primary',        county:'Kajiado', constituency:'Kajiado East',    ward:'Isinya',         latitude:-1.6700, longitude:37.0100, address:'Isinya, Kajiado',        registeredVoters:20400, isDiaspora:false, country:null },
  { code:'KJD-KJW-001', name:'Kajiado West Primary',        county:'Kajiado', constituency:'Kajiado West',    ward:'Keekonyokie',    latitude:-1.6200, longitude:36.4200, address:'Kajiado West',           registeredVoters:16800, isDiaspora:false, country:null },
  { code:'KJD-KJS-001', name:'Kajiado South Primary',       county:'Kajiado', constituency:'Kajiado South',   ward:'Entasopia',      latitude:-2.6800, longitude:36.8700, address:'Kajiado South',          registeredVoters:14200, isDiaspora:false, country:null },

  // ── 35 Kericho ─────────────────────────────────────────────────────────────
  { code:'KRC-KPE-001', name:'Kipkelion East Primary',      county:'Kericho', constituency:'Kipkelion East',  ward:'Londiani',       latitude:-0.1700, longitude:35.4700, address:'Kipkelion East, Kericho', registeredVoters:19400, isDiaspora:false, country:null },
  { code:'KRC-KPW-001', name:'Kipkelion West Primary',      county:'Kericho', constituency:'Kipkelion West',  ward:'Kipkelion',      latitude:-0.2600, longitude:35.3800, address:'Kipkelion West, Kericho', registeredVoters:18200, isDiaspora:false, country:null },
  { code:'KRC-ANM-001', name:'Ainamoi Primary School',      county:'Kericho', constituency:'Ainamoi',         ward:'Ainamoi',        latitude:-0.3689, longitude:35.2863, address:'Kericho, Kericho',        registeredVoters:28600, isDiaspora:false, country:null },
  { code:'KRC-BRT-001', name:'Bureti Primary School',       county:'Kericho', constituency:'Bureti',          ward:'Kapkatet',       latitude:-0.5200, longitude:35.3400, address:'Bureti, Kericho',         registeredVoters:20800, isDiaspora:false, country:null },
  { code:'KRC-BLG-001', name:'Belgut Primary School',       county:'Kericho', constituency:'Belgut',          ward:'Waldai',         latitude:-0.4400, longitude:35.4200, address:'Belgut, Kericho',         registeredVoters:18600, isDiaspora:false, country:null },
  { code:'KRC-SGS-001', name:'Sigowet/Soin Primary',        county:'Kericho', constituency:'Sigowet/Soin',    ward:'Soin',           latitude:-0.3200, longitude:35.4900, address:'Sigowet/Soin, Kericho',   registeredVoters:17200, isDiaspora:false, country:null },

  // ── 36 Bomet ───────────────────────────────────────────────────────────────
  { code:'BMT-STK-001', name:'Sotik Primary School',        county:'Bomet', constituency:'Sotik',         ward:'Ndanai/Abosi',    latitude:-0.6800, longitude:35.1400, address:'Sotik, Bomet',           registeredVoters:19400, isDiaspora:false, country:null },
  { code:'BMT-CPL-001', name:'Chepalungu Primary',          county:'Bomet', constituency:'Chepalungu',    ward:'Kongasis',        latitude:-0.8500, longitude:35.4400, address:'Chepalungu, Bomet',      registeredVoters:18200, isDiaspora:false, country:null },
  { code:'BMT-BME-001', name:'Bomet East Primary',          county:'Bomet', constituency:'Bomet East',    ward:'Bomet Central',   latitude:-0.7800, longitude:35.3900, address:'Bomet East',             registeredVoters:17600, isDiaspora:false, country:null },
  { code:'BMT-BMC-001', name:'Bomet Central Primary',       county:'Bomet', constituency:'Bomet Central', ward:'Ndaraweta',       latitude:-0.7857, longitude:35.3420, address:'Bomet Town',             registeredVoters:22800, isDiaspora:false, country:null },
  { code:'BMT-KNN-001', name:'Konoin Primary School',       county:'Bomet', constituency:'Konoin',        ward:'Mogogosiek',      latitude:-0.6200, longitude:35.4800, address:'Konoin, Bomet',          registeredVoters:16800, isDiaspora:false, country:null },

  // ── 37 Kakamega ────────────────────────────────────────────────────────────
  { code:'KKM-LGR-001', name:'Lugari Primary School',       county:'Kakamega', constituency:'Lugari',      ward:'Lugari',         latitude:0.3600, longitude:34.9400, address:'Lugari, Kakamega',       registeredVoters:20400, isDiaspora:false, country:null },
  { code:'KKM-LKY-001', name:'Likuyani Primary School',     county:'Kakamega', constituency:'Likuyani',    ward:'Likuyani',       latitude:0.2300, longitude:34.9800, address:'Likuyani, Kakamega',     registeredVoters:19600, isDiaspora:false, country:null },
  { code:'KKM-MLV-001', name:'Malava Primary School',       county:'Kakamega', constituency:'Malava',      ward:'Malava',         latitude:0.4500, longitude:34.8600, address:'Malava, Kakamega',       registeredVoters:21200, isDiaspora:false, country:null },
  { code:'KKM-LRM-001', name:'Lurambi Primary School',      county:'Kakamega', constituency:'Lurambi',     ward:'Sheywe',         latitude:0.2827, longitude:34.7519, address:'Kakamega Town',          registeredVoters:30400, isDiaspora:false, country:null },
  { code:'KKM-NVK-001', name:'Navakholo Primary School',    county:'Kakamega', constituency:'Navakholo',   ward:'Navakholo',      latitude:0.1800, longitude:34.8400, address:'Navakholo, Kakamega',    registeredVoters:18800, isDiaspora:false, country:null },
  { code:'KKM-MMW-001', name:'Mumias West Primary',         county:'Kakamega', constituency:'Mumias West', ward:'Mumias',         latitude:0.3320, longitude:34.4869, address:'Mumias, Kakamega',       registeredVoters:22600, isDiaspora:false, country:null },
  { code:'KKM-MME-001', name:'Mumias East Primary',         county:'Kakamega', constituency:'Mumias East', ward:'East Wanga',     latitude:0.3600, longitude:34.5600, address:'Mumias East, Kakamega',  registeredVoters:21400, isDiaspora:false, country:null },
  { code:'KKM-MTG-001', name:'Matungu Primary School',      county:'Kakamega', constituency:'Matungu',     ward:'Koyonzo',        latitude:0.3100, longitude:34.6200, address:'Matungu, Kakamega',      registeredVoters:20200, isDiaspora:false, country:null },
  { code:'KKM-BTR-001', name:'Butere Primary School',       county:'Kakamega', constituency:'Butere',      ward:'Butere Township', latitude:0.2000, longitude:34.4960, address:'Butere, Kakamega',      registeredVoters:19800, isDiaspora:false, country:null },
  { code:'KKM-KWS-001', name:'Khwisero Primary School',     county:'Kakamega', constituency:'Khwisero',    ward:'Khwisero',       latitude:0.1400, longitude:34.5800, address:'Khwisero, Kakamega',     registeredVoters:18400, isDiaspora:false, country:null },
  { code:'KKM-SHN-001', name:'Shinyalu Primary School',     county:'Kakamega', constituency:'Shinyalu',    ward:'Shinyalu',       latitude:0.2100, longitude:34.6900, address:'Shinyalu, Kakamega',     registeredVoters:17800, isDiaspora:false, country:null },
  { code:'KKM-IKM-001', name:'Ikolomani Primary School',    county:'Kakamega', constituency:'Ikolomani',   ward:'Idakho North',   latitude:0.3400, longitude:34.7400, address:'Ikolomani, Kakamega',    registeredVoters:17200, isDiaspora:false, country:null },

  // ── 38 Vihiga ──────────────────────────────────────────────────────────────
  { code:'VHG-VHG-001', name:'Vihiga Primary School',       county:'Vihiga', constituency:'Vihiga',    ward:'Vihiga',           latitude:-0.0700, longitude:34.7400, address:'Vihiga, Vihiga',         registeredVoters:22600, isDiaspora:false, country:null },
  { code:'VHG-SBT-001', name:'Sabatia Primary School',      county:'Vihiga', constituency:'Sabatia',   ward:'West Sabatia',     latitude:0.0100, longitude:34.6900, address:'Sabatia, Vihiga',        registeredVoters:24400, isDiaspora:false, country:null },
  { code:'VHG-HMI-001', name:'Hamisi Primary School',       county:'Vihiga', constituency:'Hamisi',    ward:'North Maragoli',   latitude:0.0670, longitude:34.7268, address:'Hamisi, Vihiga',         registeredVoters:21800, isDiaspora:false, country:null },
  { code:'VHG-LND-001', name:'Luanda Primary School',       county:'Vihiga', constituency:'Luanda',    ward:'Luanda Township',  latitude:0.0200, longitude:34.5300, address:'Luanda, Vihiga',         registeredVoters:26200, isDiaspora:false, country:null },
  { code:'VHG-EMH-001', name:'Emuhaya Primary School',      county:'Vihiga', constituency:'Emuhaya',   ward:'Central Bunyore',  latitude:0.0300, longitude:34.6300, address:'Emuhaya, Vihiga',        registeredVoters:22000, isDiaspora:false, country:null },

  // ── 39 Bungoma ─────────────────────────────────────────────────────────────
  { code:'BNG-MTE-001', name:'Mt. Elgon Primary School',    county:'Bungoma', constituency:'Mt. Elgon',   ward:'Cheptais',       latitude:1.2200, longitude:34.4100, address:'Mt. Elgon, Bungoma',     registeredVoters:17800, isDiaspora:false, country:null },
  { code:'BNG-SRS-001', name:'Sirisia Primary School',      county:'Bungoma', constituency:'Sirisia',     ward:'Lwandanyi',      latitude:0.6600, longitude:34.4600, address:'Sirisia, Bungoma',       registeredVoters:18600, isDiaspora:false, country:null },
  { code:'BNG-KBC-001', name:'Kabuchai Primary School',     county:'Bungoma', constituency:'Kabuchai',    ward:'Kabuchai/Chwele',latitude:0.4900, longitude:34.4800, address:'Kabuchai, Bungoma',      registeredVoters:19200, isDiaspora:false, country:null },
  { code:'BNG-BML-001', name:'Bumula Primary School',       county:'Bungoma', constituency:'Bumula',      ward:'Bumula',         latitude:0.5400, longitude:34.6300, address:'Bumula, Bungoma',        registeredVoters:18400, isDiaspora:false, country:null },
  { code:'BNG-KDY-001', name:'Kanduyi Primary School',      county:'Bungoma', constituency:'Kanduyi',     ward:'Township',       latitude:0.5636, longitude:34.5606, address:'Bungoma Town',           registeredVoters:28600, isDiaspora:false, country:null },
  { code:'BNG-WBE-001', name:'Webuye East Primary',         county:'Bungoma', constituency:'Webuye East', ward:'Mihuu',          latitude:0.6100, longitude:34.7800, address:'Webuye East, Bungoma',   registeredVoters:24200, isDiaspora:false, country:null },
  { code:'BNG-WBW-001', name:'Webuye West Primary',         county:'Bungoma', constituency:'Webuye West', ward:'Misikhu',        latitude:0.6200, longitude:34.7400, address:'Webuye West, Bungoma',   registeredVoters:22800, isDiaspora:false, country:null },
  { code:'BNG-KML-001', name:'Kimilili Primary School',     county:'Bungoma', constituency:'Kimilili',    ward:'Kimilili',       latitude:0.7900, longitude:34.7200, address:'Kimilili, Bungoma',      registeredVoters:21600, isDiaspora:false, country:null },
  { code:'BNG-TGR-001', name:'Tongaren Primary School',     county:'Bungoma', constituency:'Tongaren',    ward:'Mbakalo',        latitude:0.6900, longitude:34.8900, address:'Tongaren, Bungoma',      registeredVoters:20400, isDiaspora:false, country:null },

  // ── 40 Busia ───────────────────────────────────────────────────────────────
  { code:'BSA-TSN-001', name:'Teso North Primary',          county:'Busia', constituency:'Teso North',  ward:'Malaba Central', latitude:0.6500, longitude:34.2200, address:'Teso North, Busia',      registeredVoters:18400, isDiaspora:false, country:null },
  { code:'BSA-TSS-001', name:'Teso South Primary',          county:'Busia', constituency:'Teso South',  ward:'Ang\'urai South', latitude:0.5100, longitude:34.1700, address:'Teso South, Busia',     registeredVoters:17600, isDiaspora:false, country:null },
  { code:'BSA-NMB-001', name:'Nambale Primary School',      county:'Busia', constituency:'Nambale',     ward:'Nambale Township',latitude:0.4200, longitude:34.3400, address:'Nambale, Busia',        registeredVoters:17200, isDiaspora:false, country:null },
  { code:'BSA-MTY-001', name:'Matayos Primary School',      county:'Busia', constituency:'Matayos',     ward:'South Teso',     latitude:0.4100, longitude:34.1300, address:'Matayos, Busia',         registeredVoters:19800, isDiaspora:false, country:null },
  { code:'BSA-BTL-001', name:'Butula Primary School',       county:'Busia', constituency:'Butula',      ward:'Butula',         latitude:0.3500, longitude:34.0600, address:'Butula, Busia',          registeredVoters:18200, isDiaspora:false, country:null },
  { code:'BSA-FNY-001', name:'Funyula Primary School',      county:'Busia', constituency:'Funyula',     ward:'Bukhayo Central',latitude:0.2800, longitude:34.1000, address:'Funyula, Busia',         registeredVoters:17600, isDiaspora:false, country:null },
  { code:'BSA-BDL-001', name:'Budalangi Primary School',    county:'Busia', constituency:'Budalangi',   ward:'Budalangi Central',latitude:0.1800, longitude:34.0800, address:'Budalangi, Busia',     registeredVoters:17000, isDiaspora:false, country:null },

  // ── 41 Siaya ───────────────────────────────────────────────────────────────
  { code:'SYA-UGY-001', name:'Ugenya Primary School',       county:'Siaya', constituency:'Ugenya',      ward:'North East Ugenya',latitude:0.1800, longitude:34.4400, address:'Ugenya, Siaya',         registeredVoters:20400, isDiaspora:false, country:null },
  { code:'SYA-UGJ-001', name:'Ugunja Primary School',       county:'Siaya', constituency:'Ugunja',      ward:'Sidindi',         latitude:0.0700, longitude:34.3200, address:'Ugunja, Siaya',          registeredVoters:18600, isDiaspora:false, country:null },
  { code:'SYA-ALG-001', name:'Alego Usonga Primary',        county:'Siaya', constituency:'Alego Usonga',ward:'West Alego',      latitude:0.0200, longitude:34.5100, address:'Alego Usonga, Siaya',   registeredVoters:22400, isDiaspora:false, country:null },
  { code:'SYA-GEM-001', name:'Gem Primary School',          county:'Siaya', constituency:'Gem',         ward:'North Gem',       latitude:0.0500, longitude:34.3700, address:'Gem, Siaya',             registeredVoters:21600, isDiaspora:false, country:null },
  { code:'SYA-BND-001', name:'Bondo Primary School',        county:'Siaya', constituency:'Bondo',       ward:'Usigu',           latitude:-0.0607, longitude:34.2878, address:'Bondo, Siaya',          registeredVoters:20200, isDiaspora:false, country:null },
  { code:'SYA-RRD-001', name:'Rarieda Primary School',      county:'Siaya', constituency:'Rarieda',     ward:'West Uyoma',      latitude:-0.1300, longitude:34.2200, address:'Rarieda, Siaya',        registeredVoters:18800, isDiaspora:false, country:null },

  // ── 42 Kisumu ──────────────────────────────────────────────────────────────
  { code:'KSM-KSE-001', name:'Kisumu East Primary',         county:'Kisumu', constituency:'Kisumu East',    ward:'Kajulu',         latitude:-0.0900, longitude:34.8200, address:'Kisumu East',            registeredVoters:24600, isDiaspora:false, country:null },
  { code:'KSM-KSW-001', name:'Kisumu West Primary',         county:'Kisumu', constituency:'Kisumu West',    ward:'West Kisumu',    latitude:-0.1100, longitude:34.6800, address:'Kisumu West',            registeredVoters:22800, isDiaspora:false, country:null },
  { code:'KSM-KSC-001', name:'Kisumu Central Hall',         county:'Kisumu', constituency:'Kisumu Central', ward:'Railways',       latitude:-0.1021, longitude:34.7617, address:'Kisumu CBD',             registeredVoters:32400, isDiaspora:false, country:null },
  { code:'KSM-SME-001', name:'Seme Primary School',         county:'Kisumu', constituency:'Seme',           ward:'Central Seme',   latitude:-0.0600, longitude:34.5900, address:'Seme, Kisumu',           registeredVoters:19400, isDiaspora:false, country:null },
  { code:'KSM-NYD-001', name:'Nyando Primary School',       county:'Kisumu', constituency:'Nyando',         ward:'Lower Nyakach',  latitude:-0.3200, longitude:34.8100, address:'Nyando, Kisumu',         registeredVoters:18200, isDiaspora:false, country:null },
  { code:'KSM-MHR-001', name:'Muhoroni Primary School',     county:'Kisumu', constituency:'Muhoroni',       ward:'Muhoroni/Koru',  latitude:-0.1501, longitude:35.1972, address:'Muhoroni, Kisumu',       registeredVoters:20800, isDiaspora:false, country:null },
  { code:'KSM-NYK-001', name:'Nyakach Primary School',      county:'Kisumu', constituency:'Nyakach',        ward:'North Nyakach',  latitude:-0.4200, longitude:34.7600, address:'Nyakach, Kisumu',        registeredVoters:17600, isDiaspora:false, country:null },

  // ── 43 Homa Bay ────────────────────────────────────────────────────────────
  { code:'HMB-KSP-001', name:'Kasipul Primary School',      county:'Homa Bay', constituency:'Kasipul',              ward:'West Kasipul',   latitude:-0.6200, longitude:34.5200, address:'Kasipul, Homa Bay',      registeredVoters:20200, isDiaspora:false, country:null },
  { code:'HMB-KBK-001', name:'Kabondo Kasipul Primary',     county:'Homa Bay', constituency:'Kabondo Kasipul',      ward:'Kabondo West',   latitude:-0.5800, longitude:34.6400, address:'Kabondo Kasipul, Homa Bay', registeredVoters:19400, isDiaspora:false, country:null },
  { code:'HMB-KRC-001', name:'Karachuonyo Primary',         county:'Homa Bay', constituency:'Karachuonyo',          ward:'North Karachuonyo',latitude:-0.5400, longitude:34.3900, address:'Karachuonyo, Homa Bay', registeredVoters:20800, isDiaspora:false, country:null },
  { code:'HMB-RGW-001', name:'Rangwe Primary School',       county:'Homa Bay', constituency:'Rangwe',               ward:'West Rangwe',    latitude:-0.5700, longitude:34.4500, address:'Rangwe, Homa Bay',       registeredVoters:18200, isDiaspora:false, country:null },
  { code:'HMB-HBT-001', name:'Homa Bay Town Hall',          county:'Homa Bay', constituency:'Homa Bay Town',        ward:'Central',        latitude:-0.5238, longitude:34.4570, address:'Homa Bay Town',          registeredVoters:26400, isDiaspora:false, country:null },
  { code:'HMB-NDH-001', name:'Ndhiwa Primary School',       county:'Homa Bay', constituency:'Ndhiwa',               ward:'Kanyikela',      latitude:-0.8500, longitude:34.5900, address:'Ndhiwa, Homa Bay',       registeredVoters:18600, isDiaspora:false, country:null },
  { code:'HMB-MBT-001', name:'Mbita Primary School',        county:'Homa Bay', constituency:'Mbita',                ward:'Mfangano Island', latitude:-0.4300, longitude:34.2100, address:'Mbita, Homa Bay',       registeredVoters:17400, isDiaspora:false, country:null },
  { code:'HMB-SBA-001', name:'Suba Primary School',         county:'Homa Bay', constituency:'Suba',                 ward:'Lambwe',         latitude:-0.7100, longitude:34.2800, address:'Suba, Homa Bay',         registeredVoters:16200, isDiaspora:false, country:null },

  // ── 44 Migori ──────────────────────────────────────────────────────────────
  { code:'MGR-RNG-001', name:'Rongo Primary School',        county:'Migori', constituency:'Rongo',       ward:'North East Rongo',latitude:-0.8500, longitude:34.6600, address:'Rongo, Migori',          registeredVoters:21200, isDiaspora:false, country:null },
  { code:'MGR-AWD-001', name:'Awendo Primary School',       county:'Migori', constituency:'Awendo',      ward:'North Sakwa',     latitude:-0.7200, longitude:34.6000, address:'Awendo, Migori',         registeredVoters:20400, isDiaspora:false, country:null },
  { code:'MGR-SNE-001', name:'Suna East Primary',           county:'Migori', constituency:'Suna East',   ward:'God Jope',        latitude:-1.0634, longitude:34.4730, address:'Suna East, Migori',      registeredVoters:22600, isDiaspora:false, country:null },
  { code:'MGR-SNW-001', name:'Suna West Primary',           county:'Migori', constituency:'Suna West',   ward:'Wasimbete',       latitude:-1.0900, longitude:34.4200, address:'Suna West, Migori',      registeredVoters:20800, isDiaspora:false, country:null },
  { code:'MGR-URI-001', name:'Uriri Primary School',        county:'Migori', constituency:'Uriri',       ward:'West Kanyamkago', latitude:-0.8700, longitude:34.5200, address:'Uriri, Migori',          registeredVoters:18600, isDiaspora:false, country:null },
  { code:'MGR-NYT-001', name:'Nyatike Primary School',      county:'Migori', constituency:'Nyatike',     ward:'Kachieng',        latitude:-0.7400, longitude:34.2800, address:'Nyatike, Migori',        registeredVoters:17800, isDiaspora:false, country:null },
  { code:'MGR-KRW-001', name:'Kuria West Primary',          county:'Migori', constituency:'Kuria West',  ward:'Masaba North',    latitude:-1.3500, longitude:34.3600, address:'Kuria West, Migori',     registeredVoters:16400, isDiaspora:false, country:null },
  { code:'MGR-KRE-001', name:'Kuria East Primary',          county:'Migori', constituency:'Kuria East',  ward:'Ntimaru East',    latitude:-1.2800, longitude:34.6700, address:'Kuria East, Migori',     registeredVoters:15800, isDiaspora:false, country:null },

  // ── 45 Kisii ───────────────────────────────────────────────────────────────
  { code:'KSI-BNC-001', name:'Bonchari Primary School',     county:'Kisii', constituency:'Bonchari',                  ward:'Bogiakumu',      latitude:-0.7800, longitude:34.7900, address:'Bonchari, Kisii',        registeredVoters:22800, isDiaspora:false, country:null },
  { code:'KSI-SMG-001', name:'South Mugirango Primary',     county:'Kisii', constituency:'South Mugirango',           ward:'Bogetenga',      latitude:-0.8200, longitude:34.8100, address:'South Mugirango, Kisii',  registeredVoters:21600, isDiaspora:false, country:null },
  { code:'KSI-BBB-001', name:'Bomachoge Borabu Primary',    county:'Kisii', constituency:'Bomachoge Borabu',          ward:'Getenga',        latitude:-0.7500, longitude:34.8700, address:'Bomachoge Borabu, Kisii', registeredVoters:20400, isDiaspora:false, country:null },
  { code:'KSI-BBS-001', name:'Bobasi Primary School',       county:'Kisii', constituency:'Bobasi',                    ward:'Masige East',    latitude:-0.7200, longitude:34.8400, address:'Bobasi, Kisii',          registeredVoters:21200, isDiaspora:false, country:null },
  { code:'KSI-BMC-001', name:'Bomachoge Chache Primary',    county:'Kisii', constituency:'Bomachoge Chache',          ward:'Boochi/Tendere', latitude:-0.7900, longitude:34.8500, address:'Bomachoge Chache, Kisii', registeredVoters:20800, isDiaspora:false, country:null },
  { code:'KSI-NYM-001', name:'Nyaribari Masaba Primary',    county:'Kisii', constituency:'Nyaribari Masaba',          ward:'Gesusu',         latitude:-0.6600, longitude:34.7800, address:'Nyaribari Masaba, Kisii', registeredVoters:22400, isDiaspora:false, country:null },
  { code:'KSI-NYC-001', name:'Nyaribari Chache Primary',    county:'Kisii', constituency:'Nyaribari Chache',          ward:'Kisii Central',  latitude:-0.6814, longitude:34.7660, address:'Kisii Town',             registeredVoters:30600, isDiaspora:false, country:null },
  { code:'KSI-KCN-001', name:'Kitutu Chache North Primary', county:'Kisii', constituency:'Kitutu Chache North',      ward:'Boombori',       latitude:-0.7100, longitude:34.7200, address:'Kitutu Chache North',    registeredVoters:22000, isDiaspora:false, country:null },
  { code:'KSI-KCS-001', name:'Kitutu Chache South Primary', county:'Kisii', constituency:'Kitutu Chache South',      ward:'Kegati',         latitude:-0.7600, longitude:34.7600, address:'Kitutu Chache South',    registeredVoters:21400, isDiaspora:false, country:null },

  // ── 46 Nyamira ─────────────────────────────────────────────────────────────
  { code:'NYM-KTM-001', name:'Kitutu Masaba Primary',       county:'Nyamira', constituency:'Kitutu Masaba',    ward:'Ikonge',         latitude:-0.5700, longitude:34.9800, address:'Kitutu Masaba, Nyamira',  registeredVoters:21800, isDiaspora:false, country:null },
  { code:'NYM-WMG-001', name:'West Mugirango Primary',      county:'Nyamira', constituency:'West Mugirango',   ward:'Bogeka',         latitude:-0.6300, longitude:34.9200, address:'West Mugirango, Nyamira', registeredVoters:20400, isDiaspora:false, country:null },
  { code:'NYM-NMG-001', name:'North Mugirango Primary',     county:'Nyamira', constituency:'North Mugirango',  ward:'Nyamira North',  latitude:-0.5200, longitude:34.9300, address:'North Mugirango, Nyamira', registeredVoters:22200, isDiaspora:false, country:null },
  { code:'NYM-BRB-001', name:'Borabu Primary School',       county:'Nyamira', constituency:'Borabu',           ward:'Manga',          latitude:-0.6000, longitude:35.0300, address:'Borabu, Nyamira',         registeredVoters:19600, isDiaspora:false, country:null },

  // ── 47 Nairobi ─────────────────────────────────────────────────────────────
  { code:'NAI-WL-001',  name:'Westlands Primary School',    county:'Nairobi', constituency:'Westlands',         ward:'Parklands/Highridge',latitude:-1.2634, longitude:36.8045, address:'Waiyaki Way, Westlands',  registeredVoters:28600, isDiaspora:false, country:null },
  { code:'NAI-DGN-001', name:'Dagoretti North Primary',     county:'Nairobi', constituency:'Dagoretti North',   ward:'Kilimani',       latitude:-1.2900, longitude:36.7700, address:'Dagoretti North, Nairobi', registeredVoters:30400, isDiaspora:false, country:null },
  { code:'NAI-DGS-001', name:'Dagoretti South Primary',     county:'Nairobi', constituency:'Dagoretti South',   ward:'Kawangware',     latitude:-1.3100, longitude:36.7500, address:'Dagoretti South, Nairobi', registeredVoters:38600, isDiaspora:false, country:null },
  { code:'NAI-LGT-001', name:'Langata Primary School',      county:'Nairobi', constituency:'Langata',           ward:'Karen',          latitude:-1.3400, longitude:36.7300, address:'Langata, Nairobi',         registeredVoters:32400, isDiaspora:false, country:null },
  { code:'NAI-KB-001',  name:'Olympic Primary School',      county:'Nairobi', constituency:'Kibra',             ward:'Laini Saba',     latitude:-1.3119, longitude:36.7866, address:'Kibera Drive, Kibra',      registeredVoters:42600, isDiaspora:false, country:null },
  { code:'NAI-RYS-001', name:'Roysambu Primary School',     county:'Nairobi', constituency:'Roysambu',          ward:'Roysambu',       latitude:-1.2400, longitude:36.8800, address:'Roysambu, Nairobi',        registeredVoters:34200, isDiaspora:false, country:null },
  { code:'NAI-KSN-001', name:'Kasarani Primary School',     county:'Nairobi', constituency:'Kasarani',          ward:'Kasarani',       latitude:-1.2200, longitude:36.8900, address:'Kasarani, Nairobi',        registeredVoters:36400, isDiaspora:false, country:null },
  { code:'NAI-RRK-001', name:'Ruaraka Primary School',      county:'Nairobi', constituency:'Ruaraka',           ward:'Ruaraka',        latitude:-1.2400, longitude:36.9000, address:'Ruaraka, Nairobi',         registeredVoters:30800, isDiaspora:false, country:null },
  { code:'NAI-EMS-001', name:'Embakasi South Primary',      county:'Nairobi', constituency:'Embakasi South',    ward:'Imara Daima',    latitude:-1.3200, longitude:36.9200, address:'Embakasi South, Nairobi',  registeredVoters:36200, isDiaspora:false, country:null },
  { code:'NAI-EMN-001', name:'Embakasi North Primary',      county:'Nairobi', constituency:'Embakasi North',    ward:'Dandora Phase I', latitude:-1.2700, longitude:36.9100, address:'Embakasi North, Nairobi',  registeredVoters:38400, isDiaspora:false, country:null },
  { code:'NAI-EMC-001', name:'Embakasi Central Primary',    county:'Nairobi', constituency:'Embakasi Central',  ward:'Embakasi',       latitude:-1.2900, longitude:36.9100, address:'Embakasi Central, Nairobi', registeredVoters:36800, isDiaspora:false, country:null },
  { code:'NAI-EME-001', name:'Embakasi East Primary',       county:'Nairobi', constituency:'Embakasi East',     ward:'Mihango',        latitude:-1.3000, longitude:36.9400, address:'Embakasi East, Nairobi',   registeredVoters:40200, isDiaspora:false, country:null },
  { code:'NAI-EMW-001', name:'Embakasi West Primary',       county:'Nairobi', constituency:'Embakasi West',     ward:'Pipeline',       latitude:-1.3100, longitude:36.8800, address:'Embakasi West, Nairobi',   registeredVoters:42400, isDiaspora:false, country:null },
  { code:'NAI-MKD-001', name:'Makadara Primary School',     county:'Nairobi', constituency:'Makadara',          ward:'Makadara',       latitude:-1.3000, longitude:36.8700, address:'Makadara, Nairobi',        registeredVoters:36200, isDiaspora:false, country:null },
  { code:'NAI-KMK-001', name:'Kamukunji Primary School',    county:'Nairobi', constituency:'Kamukunji',         ward:'Pumwani',        latitude:-1.2800, longitude:36.8600, address:'Kamukunji, Nairobi',       registeredVoters:34800, isDiaspora:false, country:null },
  { code:'NAI-STR-001', name:'Starehe Primary School',      county:'Nairobi', constituency:'Starehe',           ward:'Nairobi Central', latitude:-1.2800, longitude:36.8200, address:'Starehe, Nairobi',        registeredVoters:32400, isDiaspora:false, country:null },
  { code:'NAI-MTR-001', name:'Mathare Primary School',      county:'Nairobi', constituency:'Mathare',           ward:'Mabatini',       latitude:-1.2600, longitude:36.8500, address:'Mathare, Nairobi',         registeredVoters:36600, isDiaspora:false, country:null },
];

export const DIASPORA_STATIONS: IEBCStation[] = [
  { code:'DIA-UK-001',  name:'Kenya High Commission London',    county:'Diaspora', constituency:'Diaspora', ward:'United Kingdom',     latitude:51.5033, longitude:-0.1195, address:'45 Portland Place, London W1B 1AS',          registeredVoters:5200, isDiaspora:true, country:'United Kingdom' },
  { code:'DIA-US-001',  name:'Kenya Embassy Washington DC',    county:'Diaspora', constituency:'Diaspora', ward:'United States',       latitude:38.9022, longitude:-77.0477, address:'2249 R Street NW, Washington DC 20008',    registeredVoters:4800, isDiaspora:true, country:'United States' },
  { code:'DIA-US-002',  name:'Kenya Consulate New York',       county:'Diaspora', constituency:'Diaspora', ward:'United States',       latitude:40.7128, longitude:-74.0060, address:'866 UN Plaza, New York NY 10017',          registeredVoters:3600, isDiaspora:true, country:'United States' },
  { code:'DIA-CA-001',  name:'Kenya High Commission Ottawa',   county:'Diaspora', constituency:'Diaspora', ward:'Canada',              latitude:45.4215, longitude:-75.6919, address:'415 Laurier Ave E, Ottawa ON K1N 6R4',     registeredVoters:2800, isDiaspora:true, country:'Canada' },
  { code:'DIA-AU-001',  name:'Kenya High Commission Canberra', county:'Diaspora', constituency:'Diaspora', ward:'Australia',           latitude:-35.3081, longitude:149.1245, address:'GPOB 1990 Yarralumla, Canberra ACT 2600', registeredVoters:2400, isDiaspora:true, country:'Australia' },
  { code:'DIA-GR-001',  name:'Kenya Embassy Berlin',           county:'Diaspora', constituency:'Diaspora', ward:'Germany',             latitude:52.5200, longitude:13.4050, address:'Markgrafenstrasse 63, 10969 Berlin',        registeredVoters:2200, isDiaspora:true, country:'Germany' },
  { code:'DIA-AE-001',  name:'Kenya Embassy Abu Dhabi',        county:'Diaspora', constituency:'Diaspora', ward:'United Arab Emirates',latitude:24.4539, longitude:54.3773, address:'Corniche Road, Abu Dhabi',                 registeredVoters:6400, isDiaspora:true, country:'United Arab Emirates' },
  { code:'DIA-SA-001',  name:'Kenya Embassy Riyadh',           county:'Diaspora', constituency:'Diaspora', ward:'Saudi Arabia',        latitude:24.6877, longitude:46.7219, address:'Riyadh Diplomatic Quarter',                registeredVoters:8200, isDiaspora:true, country:'Saudi Arabia' },
  { code:'DIA-QA-001',  name:'Kenya Embassy Doha',             county:'Diaspora', constituency:'Diaspora', ward:'Qatar',               latitude:25.2867, longitude:51.5332, address:'Al Waab Street, Doha',                     registeredVoters:3200, isDiaspora:true, country:'Qatar' },
  { code:'DIA-ZA-001',  name:'Kenya High Commission Pretoria', county:'Diaspora', constituency:'Diaspora', ward:'South Africa',        latitude:-25.7460, longitude:28.1881, address:'302 Brooks Street, Pretoria',             registeredVoters:2600, isDiaspora:true, country:'South Africa' },
  { code:'DIA-ET-001',  name:'Kenya Embassy Addis Ababa',      county:'Diaspora', constituency:'Diaspora', ward:'Ethiopia',            latitude:9.0167,  longitude:38.7500, address:'Jimma Road, Addis Ababa',                  registeredVoters:1800, isDiaspora:true, country:'Ethiopia' },
  { code:'DIA-UG-001',  name:'Kenya Embassy Kampala',          county:'Diaspora', constituency:'Diaspora', ward:'Uganda',              latitude:0.3476,  longitude:32.5825, address:'41 Nakasero Road, Kampala',               registeredVoters:2200, isDiaspora:true, country:'Uganda' },
  { code:'DIA-TZ-001',  name:'Kenya High Commission Dar es Salaam', county:'Diaspora', constituency:'Diaspora', ward:'Tanzania',   latitude:-6.7924, longitude:39.2083, address:'NIC Investment House, Dar es Salaam',       registeredVoters:1900, isDiaspora:true, country:'Tanzania' },
  { code:'DIA-FR-001',  name:'Kenya Embassy Paris',            county:'Diaspora', constituency:'Diaspora', ward:'France',              latitude:48.8566, longitude:2.3522,  address:'3 Rue Cimarosa, 75116 Paris',              registeredVoters:1600, isDiaspora:true, country:'France' },
  { code:'DIA-CH-001',  name:'Kenya Mission Geneva',           county:'Diaspora', constituency:'Diaspora', ward:'Switzerland',         latitude:46.2044, longitude:6.1432,  address:'Rue de Vermont 37-39, Geneva 1202',        registeredVoters:1400, isDiaspora:true, country:'Switzerland' },
];

export const ALL_STATIONS: IEBCStation[] = [...DOMESTIC_STATIONS, ...DIASPORA_STATIONS];
