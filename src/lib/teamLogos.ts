// Team & Player Logo / Flag Utilities for Taekwondo Tournament System

// Malaysian state flag SVG data URIs (fully self-contained, offline-resilient & crisp)
const MALAYSIAN_STATE_FLAGS: Record<string, string> = {
  selangor: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'%3E%3Crect width='600' height='300' fill='%23ff0000'/%3E%3Crect width='300' height='150' fill='%23ffcc00'/%3E%3Crect x='300' y='150' width='300' height='150' fill='%23ffcc00'/%3E%3Cpath d='M80 50 a40 40 0 1 0 55 55 a48 48 0 1 1 -55 -55' fill='%23ffffff'/%3E%3Cpolygon points='115,65 120,78 133,78 123,87 127,100 115,91 103,100 107,87 97,78 110,78' fill='%23ffffff'/%3E%3C/svg%3E",
  johor: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'%3E%3Crect width='600' height='300' fill='%23000080'/%3E%3Crect width='300' height='150' fill='%23cc0000'/%3E%3Cpath d='M110 45 a35 35 0 1 0 50 50 a42 42 0 1 1 -50 -50' fill='%23ffffff'/%3E%3Cpolygon points='150,60 154,72 166,72 156,80 160,92 150,84 140,92 144,80 134,72 146,72' fill='%23ffffff'/%3E%3C/svg%3E",
  "kuala lumpur": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'%3E%3Crect width='600' height='75' fill='%23000080'/%3E%3Crect y='75' width='600' height='50' fill='%23ffffff'/%3E%3Crect y='125' width='600' height='50' fill='%23cc0000'/%3E%3Crect y='175' width='600' height='50' fill='%23ffffff'/%3E%3Crect y='225' width='600' height='75' fill='%23000080'/%3E%3Cpath d='M275 110 a40 40 0 1 0 55 55 a48 48 0 1 1 -55 -55' fill='%23ffcc00'/%3E%3Ccircle cx='345' cy='150' r='18' fill='%23ffcc00'/%3E%3C/svg%3E",
  penang: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'%3E%3Crect width='200' height='300' fill='%230099ff'/%3E%3Crect x='200' width='200' height='300' fill='%23ffffff'/%3E%3Crect x='400' width='200' height='300' fill='%23ffcc00'/%3E%3Cpath d='M300 100 Q285 140 280 200 L320 200 Q315 140 300 100 Z' fill='%23663300'/%3E%3Ccircle cx='300' cy='100' r='25' fill='%23009933'/%3E%3C/svg%3E",
  perak: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'%3E%3Crect width='600' height='100' fill='%23ffffff'/%3E%3Crect y='100' width='600' height='100' fill='%23ffcc00'/%3E%3Crect y='200' width='600' height='100' fill='%23000000'/%3E%3C/svg%3E",
  kedah: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'%3E%3Crect width='600' height='300' fill='%23cc0000'/%3E%3Ccircle cx='120' cy='100' r='50' fill='%23ffcc00'/%3E%3Cpath d='M95 100 Q120 75 145 100 Q120 125 95 100 Z' fill='%23008000'/%3E%3Cpath d='M105 85 a25 25 0 1 0 35 35 a30 30 0 1 1 -35 -35' fill='%23008000'/%3E%3C/svg%3E",
  melaka: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'%3E%3Crect width='600' height='150' fill='%23cc0000'/%3E%3Crect y='150' width='600' height='150' fill='%23ffffff'/%3E%3Crect width='300' height='150' fill='%23000080'/%3E%3Cpath d='M110 45 a35 35 0 1 0 50 50 a42 42 0 1 1 -50 -50' fill='%23ffcc00'/%3E%3Cpolygon points='150,60 154,72 166,72 156,80 160,92 150,84 140,92 144,80 134,72 146,72' fill='%23ffcc00'/%3E%3C/svg%3E",
  "negeri sembilan": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'%3E%3Crect width='600' height='300' fill='%23ffcc00'/%3E%3Cpolygon points='0,0 300,0 0,150' fill='%23cc0000'/%3E%3Cpolygon points='300,0 300,150 0,150' fill='%23000000'/%3E%3C/svg%3E",
  pahang: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'%3E%3Crect width='600' height='150' fill='%23ffffff'/%3E%3Crect y='150' width='600' height='150' fill='%23000000'/%3E%3C/svg%3E",
  terengganu: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'%3E%3Crect width='600' height='300' fill='%23ffffff'/%3E%3Crect x='40' y='30' width='520' height='240' fill='%23000000'/%3E%3Cpath d='M275 110 a40 40 0 1 0 55 55 a48 48 0 1 1 -55 -55' fill='%23ffffff'/%3E%3Cpolygon points='315,125 320,138 333,138 323,147 327,160 315,151 303,160 307,147 297,138 310,138' fill='%23ffffff'/%3E%3C/svg%3E",
  kelantan: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'%3E%3Crect width='600' height='300' fill='%23cc0000'/%3E%3Ccircle cx='300' cy='150' r='60' fill='%23ffffff' fill-opacity='0.2'/%3E%3Cpath d='M275 110 a40 40 0 1 0 55 55 a48 48 0 1 1 -55 -55' fill='%23ffffff'/%3E%3Cpolygon points='315,125 320,138 333,138 323,147 327,160 315,151 303,160 307,147 297,138 310,138' fill='%23ffffff'/%3E%3C/svg%3E",
  sabah: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'%3E%3Crect width='600' height='100' fill='%230099ff'/%3E%3Crect y='100' width='600' height='100' fill='%23ffffff'/%3E%3Crect y='200' width='600' height='100' fill='%23cc0000'/%3E%3Cpolygon points='0,0 200,0 200,150 0,150' fill='%23003399'/%3E%3Cpolygon points='50,150 100,50 150,150' fill='%23002266'/%3E%3C/svg%3E",
  sarawak: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'%3E%3Crect width='600' height='300' fill='%23ffcc00'/%3E%3Cpolygon points='0,0 300,150 0,150' fill='%23cc0000'/%3E%3Cpolygon points='0,150 300,150 600,300 0,300' fill='%23000000'/%3E%3Ccircle cx='180' cy='150' r='20' fill='%23ffcc00'/%3E%3C/svg%3E",
  perlis: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'%3E%3Crect width='600' height='150' fill='%23ffcc00'/%3E%3Crect y='150' width='600' height='150' fill='%23000080'/%3E%3C/svg%3E",
  putrajaya: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'%3E%3Crect width='200' height='300' fill='%23000080'/%3E%3Crect x='200' width='200' height='300' fill='%23ffcc00'/%3E%3Crect x='400' width='200' height='300' fill='%23000080'/%3E%3Cpath d='M275 110 a40 40 0 1 0 55 55 a48 48 0 1 1 -55 -55' fill='%23cc0000'/%3E%3C/svg%3E",
  labuan: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'%3E%3Crect width='600' height='100' fill='%23000080'/%3E%3Crect y='100' width='600' height='100' fill='%23ffffff'/%3E%3Crect y='200' width='600' height='100' fill='%23cc0000'/%3E%3Cpath d='M275 110 a40 40 0 1 0 55 55 a48 48 0 1 1 -55 -55' fill='%23ffcc00'/%3E%3C/svg%3E",
};

// Aliases for Malaysian states and territories
const STATE_ALIASES: Record<string, string> = {
  sgr: "selangor",
  sel: "selangor",
  jhr: "johor",
  joh: "johor",
  kl: "kuala lumpur",
  wpkl: "kuala lumpur",
  "w.p. kuala lumpur": "kuala lumpur",
  "wp kuala lumpur": "kuala lumpur",
  png: "penang",
  pen: "penang",
  "pulau pinang": "penang",
  prk: "perak",
  kdh: "kedah",
  ked: "kedah",
  mlk: "melaka",
  malacca: "melaka",
  ns: "negeri sembilan",
  n9: "negeri sembilan",
  "n. sembilan": "negeri sembilan",
  "n.sembilan": "negeri sembilan",
  phg: "pahang",
  trg: "terengganu",
  ktn: "kelantan",
  kel: "kelantan",
  sbh: "sabah",
  swk: "sarawak",
  pls: "perlis",
  pj: "putrajaya",
  ptj: "putrajaya",
  lbn: "labuan",
};

// Common Country Codes / Names mapped to ISO-2 country codes for flagcdn
const COUNTRY_CODES: Record<string, string> = {
  mas: "my",
  mys: "my",
  malaysia: "my",
  sgp: "sg",
  sin: "sg",
  singapore: "sg",
  kor: "kr",
  korea: "kr",
  "south korea": "kr",
  usa: "us",
  america: "us",
  "united states": "us",
  tha: "th",
  thailand: "th",
  ina: "id",
  idn: "id",
  indonesia: "id",
  phi: "ph",
  philippines: "ph",
  vie: "vn",
  vnm: "vn",
  vietnam: "vn",
  gbr: "gb",
  uk: "gb",
  "great britain": "gb",
  eng: "gb",
  jpn: "jp",
  japan: "jp",
  chn: "cn",
  china: "cn",
  tpe: "tw",
  taiwan: "tw",
  "chinese taipei": "tw",
  hkg: "hk",
  "hong kong": "hk",
  aus: "au",
  australia: "au",
  can: "ca",
  canada: "ca",
  ind: "in",
  india: "in",
  fra: "fr",
  france: "fr",
  ger: "de",
  deu: "de",
  germany: "de",
  esp: "es",
  spain: "es",
  ita: "it",
  italy: "it",
  bra: "br",
  brazil: "br",
  egy: "eg",
  tur: "tr",
  turkey: "tr",
  iri: "ir",
  iran: "ir",
  uzb: "uz",
  uzbekistan: "uz",
  jor: "jo",
  jordan: "jo",
  kaz: "kz",
  kazakhstan: "kz",
  mex: "mx",
  mexico: "mx",
  mgl: "mn",
  mongolia: "mn",
  nep: "np",
  nepal: "np",
  nzl: "nz",
  "new zealand": "nz",
  brn: "bn",
  brunei: "bn",
  mya: "mm",
  myanmar: "mm",
  cam: "kh",
  cambodia: "kh",
  lao: "la",
  laos: "la",
};

/**
 * Normalizes a club or athlete string for dictionary matching
 */
export function normalizeKey(text?: string | null): string {
  if (!text) return "";
  return text
    .trim()
    .toLowerCase()
    .replace(/[()[\]{}]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Resolves a built-in flag (Malaysian State or World Country) from a given name or club text
 */
export function resolveBuiltInFlag(nameOrClub?: string | null): string | null {
  if (!nameOrClub) return null;
  const raw = nameOrClub.trim().toLowerCase();
  const cleaned = normalizeKey(nameOrClub);

  // 1. Direct state lookup
  if (MALAYSIAN_STATE_FLAGS[cleaned]) {
    return MALAYSIAN_STATE_FLAGS[cleaned];
  }
  if (STATE_ALIASES[cleaned] && MALAYSIAN_STATE_FLAGS[STATE_ALIASES[cleaned]]) {
    return MALAYSIAN_STATE_FLAGS[STATE_ALIASES[cleaned]];
  }

  // 2. Multi-word string containing state name (e.g. "PERSATUAN TAEKWONDO SELANGOR", "KELAB KEDAH")
  const stateKeys = Object.keys(MALAYSIAN_STATE_FLAGS);
  for (const s of stateKeys) {
    const wordBoundaryRegex = new RegExp(`\\b${s}\\b`, 'i');
    if (wordBoundaryRegex.test(raw)) {
      return MALAYSIAN_STATE_FLAGS[s];
    }
  }

  // Check state aliases inside strings (e.g., "(KL)", "- KL", "JHR")
  const aliasKeys = Object.keys(STATE_ALIASES);
  for (const a of aliasKeys) {
    const aliasRegex = new RegExp(`(?:^|[^a-z0-9])${a}(?:$|[^a-z0-9])`, 'i');
    if (aliasRegex.test(raw)) {
      const canonicalState = STATE_ALIASES[a];
      if (MALAYSIAN_STATE_FLAGS[canonicalState]) {
        return MALAYSIAN_STATE_FLAGS[canonicalState];
      }
    }
  }

  // 3. Country lookup
  if (COUNTRY_CODES[cleaned]) {
    return `https://flagcdn.com/w80/${COUNTRY_CODES[cleaned]}.png`;
  }
  for (const [countryName, isoCode] of Object.entries(COUNTRY_CODES)) {
    const countryRegex = new RegExp(`\\b${countryName}\\b`, 'i');
    if (countryRegex.test(raw)) {
      return `https://flagcdn.com/w80/${isoCode}.png`;
    }
  }

  return null;
}

/**
 * Generate a deterministic high-contrast monogram sports shield SVG data URI
 */
export function generateClubMonogramBadge(clubName?: string | null): string {
  const name = (clubName || "TKD").trim().toUpperCase();
  const words = name.replace(/[^A-Z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  
  let initials = "TKD";
  if (words.length >= 2) {
    initials = (words[0][0] + words[1][0]).slice(0, 3);
  } else if (words.length === 1 && words[0].length >= 2) {
    initials = words[0].slice(0, 2);
  } else if (words.length === 1) {
    initials = words[0][0];
  }

  // Deterministic palette based on string hash
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const palettes = [
    { bg: "%230f172a", border: "%233b82f6", text: "%23ffffff", accent: "%2360a5fa" },
    { bg: "%231e1b4b", border: "%23818cf8", text: "%23ffffff", accent: "%23a5b4fc" },
    { bg: "%23064e3b", border: "%2310b981", text: "%23ffffff", accent: "%2334d399" },
    { bg: "%23701a75", border: "%23d946ef", text: "%23ffffff", accent: "%23f0abfc" },
    { bg: "%237c2d12", border: "%23f97316", text: "%23ffffff", accent: "%23fb923c" },
    { bg: "%23134e4a", border: "%2314b8a6", text: "%23ffffff", accent: "%232dd4bf" }
  ];
  const p = palettes[Math.abs(hash) % palettes.length];

  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 5 L90 20 L90 55 C90 75 50 95 50 95 C50 95 10 75 10 55 L10 20 Z' fill='${p.bg}' stroke='${p.border}' stroke-width='4'/%3E%3Cpath d='M50 12 L82 24 L82 52 C82 68 50 85 50 85 C50 85 18 68 18 52 L18 24 Z' fill='none' stroke='${p.accent}' stroke-width='1.5' stroke-dasharray='3 2' opacity='0.7'/%3E%3Ctext x='50' y='58' font-family='Arial, sans-serif' font-weight='900' font-size='${initials.length > 2 ? '22' : '26'}' fill='${p.text}' text-anchor='middle' letter-spacing='0.5'%3E${initials}%3C/text%3E%3C/svg%3E`;
}

/**
 * Resolves the final logo or flag URL for a competitor (with priority order):
 * 1. Direct logo/flag URL passed on the match
 * 2. Custom mapped club or athlete logo in local/synced storage
 * 3. Recognized Country or Malaysian State flag
 * 4. (Optional) Generated monogram badge or null
 */
export function getPlayerLogoOrFlag(
  club?: string | null,
  name?: string | null,
  customLogos?: Record<string, string> | null,
  directLogo?: string | null,
  generateFallback = false
): string | null {
  // 1. Direct logo
  if (directLogo && typeof directLogo === "string" && directLogo.trim()) {
    return directLogo.trim();
  }

  // 2. Custom logos dictionary lookup
  if (customLogos) {
    const clubKey = normalizeKey(club);
    const nameKey = normalizeKey(name);

    if (clubKey && customLogos[clubKey]) {
      return customLogos[clubKey];
    }
    if (nameKey && customLogos[nameKey]) {
      return customLogos[nameKey];
    }

    // Substring or prefix check in custom logos
    for (const [k, url] of Object.entries(customLogos)) {
      if (k && url) {
        if (clubKey && (clubKey === k || clubKey.includes(k) || k.includes(clubKey))) {
          return url;
        }
        if (nameKey && (nameKey === k || nameKey.includes(k))) {
          return url;
        }
      }
    }
  }

  // 3. Built-in State / Country flag
  const clubFlag = resolveBuiltInFlag(club);
  if (clubFlag) return clubFlag;

  const nameFlag = resolveBuiltInFlag(name);
  if (nameFlag) return nameFlag;

  // 4. Optional fallback monogram shield
  if (generateFallback && (club || name)) {
    return generateClubMonogramBadge(club || name);
  }

  return null;
}

/**
 * List of sample standard flags for demo/quick assignment
 */
export const AVAILABLE_DEMO_FLAGS = [
  { name: "Malaysia", code: "my", type: "country", url: "https://flagcdn.com/w80/my.png" },
  { name: "Selangor", code: "sgr", type: "state", url: MALAYSIAN_STATE_FLAGS["selangor"] },
  { name: "Johor", code: "jhr", type: "state", url: MALAYSIAN_STATE_FLAGS["johor"] },
  { name: "Kuala Lumpur", code: "kl", type: "state", url: MALAYSIAN_STATE_FLAGS["kuala lumpur"] },
  { name: "Penang", code: "png", type: "state", url: MALAYSIAN_STATE_FLAGS["penang"] },
  { name: "Perak", code: "prk", type: "state", url: MALAYSIAN_STATE_FLAGS["perak"] },
  { name: "Kedah", code: "kdh", type: "state", url: MALAYSIAN_STATE_FLAGS["kedah"] },
  { name: "Melaka", code: "mlk", type: "state", url: MALAYSIAN_STATE_FLAGS["melaka"] },
  { name: "Negeri Sembilan", code: "ns", type: "state", url: MALAYSIAN_STATE_FLAGS["negeri sembilan"] },
  { name: "Pahang", code: "phg", type: "state", url: MALAYSIAN_STATE_FLAGS["pahang"] },
  { name: "Terengganu", code: "trg", type: "state", url: MALAYSIAN_STATE_FLAGS["terengganu"] },
  { name: "Kelantan", code: "ktn", type: "state", url: MALAYSIAN_STATE_FLAGS["kelantan"] },
  { name: "Sabah", code: "sbh", type: "state", url: MALAYSIAN_STATE_FLAGS["sabah"] },
  { name: "Sarawak", code: "swk", type: "state", url: MALAYSIAN_STATE_FLAGS["sarawak"] },
  { name: "Singapore", code: "sg", type: "country", url: "https://flagcdn.com/w80/sg.png" },
  { name: "South Korea", code: "kr", type: "country", url: "https://flagcdn.com/w80/kr.png" },
  { name: "USA", code: "us", type: "country", url: "https://flagcdn.com/w80/us.png" },
  { name: "Thailand", code: "th", type: "country", url: "https://flagcdn.com/w80/th.png" },
  { name: "Indonesia", code: "id", type: "country", url: "https://flagcdn.com/w80/id.png" },
  { name: "Philippines", code: "ph", type: "country", url: "https://flagcdn.com/w80/ph.png" },
  { name: "Vietnam", code: "vn", type: "country", url: "https://flagcdn.com/w80/vn.png" },
  { name: "Great Britain", code: "gb", type: "country", url: "https://flagcdn.com/w80/gb.png" },
  { name: "Japan", code: "jp", type: "country", url: "https://flagcdn.com/w80/jp.png" },
  { name: "Australia", code: "au", type: "country", url: "https://flagcdn.com/w80/au.png" },
];
