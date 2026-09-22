import {
  siSwiggy,
  siZomato,
  siNetflix,
  siSpotify,
  siUber,
  siUbereats,
  siBigbasket,
  siGoogleplay,
  siGooglepay,
  siPhonepe,
  siPaytm,
  siHdfcbank,
  siIcicibank,
  siAxisbank,
  siAirtel,
  siJio,
  siBookmyshow,
  siMcdonalds,
  siApple,
  siZerodha,
} from 'simple-icons';

export interface BrandIcon {
  title: string;
  hex: string;
  // Solid single-path icons (Simple Icons, Font Awesome) set `path`; the
  // handful of outline/multi-element icons below (no solid-glyph source
  // exists for these) set `bodyHtml` + `viewBox`/`strokeWidth` instead.
  path?: string;
  bodyHtml?: string;
  viewBox?: string;
  strokeWidth?: number;
}

// Amazon and LinkedIn aren't in Simple Icons (both were pulled from that
// project after takedown requests) — sourced instead from Font Awesome Free
// 6 (CC BY 4.0), same solid-glyph style as everything above.
const faAmazon: BrandIcon = {
  title: 'Amazon',
  hex: 'FF9900',
  viewBox: '0 0 448 512',
  path:
    'M257.2 162.7c-48.7 1.8-169.5 15.5-169.5 117.5c0 109.5 138.3 114 183.5 43.2c6.5 10.2 35.4 37.5 45.3 46.8l56.8-56S341 288.9 341 261.4V114.3C341 89 316.5 32 228.7 32C140.7 32 94 87 94 136.3l73.5 6.8c16.3-49.5 54.2-49.5 54.2-49.5c40.7-.1 35.5 29.8 35.5 69.1m0 86.8c0 80-84.2 68-84.2 17.2c0-47.2 50.5-56.7 84.2-57.8zm136 163.5c-7.7 10-70 67-174.5 67S34.2 408.5 9.7 379c-6.8-7.7 1-11.3 5.5-8.3C88.5 415.2 203 488.5 387.7 401c7.5-3.7 13.3 2 5.5 12m39.8 2.2c-6.5 15.8-16 26.8-21.2 31c-5.5 4.5-9.5 2.7-6.5-3.8s19.3-46.5 12.7-55c-6.5-8.3-37-4.3-48-3.2c-10.8 1-13 2-14-.3c-2.3-5.7 21.7-15.5 37.5-17.5c15.7-1.8 41-.8 46 5.7c3.7 5.1 0 27.1-6.5 43.1',
};

const faLinkedin: BrandIcon = {
  title: 'LinkedIn',
  hex: '0A66C2',
  viewBox: '0 0 448 512',
  path:
    'M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3c0-17.8-14.4-32.3-32-32.3M135.4 416H69V202.2h66.5V416zm-33.2-243c-21.3 0-38.5-17.3-38.5-38.5S80.9 96 102.2 96c21.2 0 38.5 17.3 38.5 38.5c0 21.3-17.2 38.5-38.5 38.5m282.1 243h-66.4V312c0-24.8-.5-56.7-34.5-56.7c-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5c67.2 0 79.7 44.3 79.7 101.9z',
};

// No brand has a solid-glyph icon in any freely-licensed set for these four
// (India-regional and/or trademark-sensitive) — outline icons from
// Arcticons (CC BY-SA 4.0) instead, rendered stroke-only.
const arcMyntra: BrandIcon = {
  title: 'Myntra',
  hex: 'FF3F6C',
  viewBox: '0 0 48 48',
  strokeWidth: 3,
  bodyHtml:
    '<ellipse cx="28.311" cy="24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" rx="13.871" ry="4.22" transform="rotate(-68.92 28.311 24)"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M32.727 24.215q.227.647.48 1.303c2.756 7.148 6.752 12.263 8.927 11.425s1.703-7.312-1.052-14.46s-6.752-12.264-8.927-11.426"/><ellipse cx="10.856" cy="24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" rx="13.871" ry="4.22" transform="rotate(-68.92 10.856 24)"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M15.272 24.215q.227.647.48 1.303c2.06 5.343 4.812 9.55 6.98 10.984M24 23.49q-.18-.501-.374-1.008c-2.756-7.148-6.752-12.263-8.927-11.425"/>',
};

const arcFlipkart: BrandIcon = {
  title: 'Flipkart',
  hex: '2874F0',
  viewBox: '0 0 48 48',
  strokeWidth: 2.5,
  bodyHtml:
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M22.652 42.514H8.756A3.25 3.25 0 0 1 5.5 39.258V11.285m3.256-5.77h30.488m3.256 5.57v28.173a3.25 3.25 0 0 1-3.256 3.256h-8.993"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m22.652 42.514l1.505-5.782s-14.75-.97-16.289-.97"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m12.442 32.176l12.893-.767s.42-7.945 6.038-10.382c6.013-2.608 8.555-.707 8.699 1.367a2.55 2.55 0 0 1-.861 2.15c-1.443 1.168-3.968.175-5.156 1.444s-1.52 2.144-1.752 5.522l2.842.02s1.326.11 1.388 1.254s-.722 3.879-2.236 3.858s-2.976-.094-2.976-.094s-.613 4.377-1.07 5.966"/><path fill="none" stroke="currentColor" d="M5.67 11.131h36.72"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M5.5 11.285L9.203 7.45L8.43 5.486m2.334 28.449l4.714.174m16.917-21.062c0 4.637-3.759 7.04-8.395 7.04s-8.394-2.403-8.394-7.04M42.5 11.086l-3.645-3.637l.774-1.963"/><path fill="none" stroke="currentColor" d="m9.203 7.449l.162 3.386m29.49-3.386l-.161 3.386"/>',
};

const arcPvr: BrandIcon = {
  title: 'PVR',
  hex: 'C8102E',
  viewBox: '0 0 48 48',
  strokeWidth: 3,
  bodyHtml:
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M5 34.329V13.67h3.699c3.823 0 6.922 3.106 6.922 6.938s-3.099 6.938-6.922 6.938H5m27.379 6.783V13.67h3.698c3.824 0 6.923 3.106 6.923 6.938s-3.1 6.938-6.923 6.938H32.38m3.697.001l6.763 6.777M29.818 10.8l-6.602 26.4l-6.598-26.4"/>',
};

const arcDominos: BrandIcon = {
  title: "Domino's",
  hex: '0078AE',
  viewBox: '0 0 48 48',
  strokeWidth: 2.5,
  bodyHtml:
    '<rect width="17.47" height="35.91" x="15.27" y="6.04" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" rx=".9" transform="rotate(45 23.999 24)"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m17.82 17.82l12.36 12.36"/><circle cx="30.55" cy="17.45" r="2.98" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><circle cx="21.85" cy="30.51" r="2.98" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><circle cx="13.12" cy="30.51" r="2.98" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>',
};

// UPI apps — CRED and BHIM aren't in any solid-glyph set either, same
// Arcticons outline treatment as the merchants above.
const arcCred: BrandIcon = {
  title: 'CRED',
  hex: '1A1A1A',
  viewBox: '0 0 48 48',
  strokeWidth: 2.5,
  bodyHtml:
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M41.013 33.553L24.027 43.5l-17.04-9.947V4.5h34.026z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M36.651 21.872v9.232L24.02 38.5l-12.671-7.396V14.5H24m-8.355-5h21.006v7.715"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m30.485 29.71l-6.472 3.79l-8.302-4.846v-6.056"/>',
};

const arcBhim: BrandIcon = {
  title: 'BHIM',
  hex: '072654',
  viewBox: '0 0 48 48',
  strokeWidth: 2.5,
  bodyHtml:
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M30.801 22.51a1.284 1.284 0 0 1-.294 1.592m.294-1.592L21.171 4.5L10.19 42.346l20.316-18.244m7.146-.451a1.284 1.284 0 0 1-.294 1.592m.294-1.592l-9.51-17.97l-2.219 7.424m11.435 12.138L17.194 43.5l2.884-9.93"/>',
};

// Recognizable merchant + UPI-app logos for the handful of brands that show
// up constantly in a real household's transactions — everything else still
// falls back to the plain category icon, this is additive, not a
// replacement for it. Matched against whatever text the caller hands in
// (title, and usually bank/notes too), first match wins, so more specific
// brands (Uber Eats, Google Pay) are checked before their more general
// parent (Uber, Google Play).
const BRAND_RULES: { pattern: RegExp; icon: BrandIcon }[] = [
  { pattern: /swiggy/i, icon: siSwiggy },
  { pattern: /zomato/i, icon: siZomato },
  { pattern: /netflix/i, icon: siNetflix },
  { pattern: /spotify/i, icon: siSpotify },
  { pattern: /uber\s*eats/i, icon: siUbereats },
  { pattern: /\buber\b/i, icon: siUber },
  { pattern: /big\s*basket/i, icon: siBigbasket },
  { pattern: /g\s*-?\s*pay|google\s*pay/i, icon: siGooglepay },
  { pattern: /google\s*play/i, icon: siGoogleplay },
  { pattern: /phonepe/i, icon: siPhonepe },
  { pattern: /paytm/i, icon: siPaytm },
  { pattern: /hdfc/i, icon: siHdfcbank },
  { pattern: /icici/i, icon: siIcicibank },
  { pattern: /axis\s*bank/i, icon: siAxisbank },
  { pattern: /airtel/i, icon: siAirtel },
  { pattern: /\bjio\b/i, icon: siJio },
  { pattern: /bookmyshow/i, icon: siBookmyshow },
  { pattern: /mcdonald/i, icon: siMcdonalds },
  { pattern: /apple\s*(media|music|app\s*store|itunes|icloud|tv)?/i, icon: siApple },
  { pattern: /zerodha/i, icon: siZerodha },
  { pattern: /amazon/i, icon: faAmazon },
  { pattern: /linkedin/i, icon: faLinkedin },
  { pattern: /myntra/i, icon: arcMyntra },
  { pattern: /flipkart/i, icon: arcFlipkart },
  { pattern: /\bpvr\b/i, icon: arcPvr },
  { pattern: /domino'?s/i, icon: arcDominos },
  { pattern: /\bcred\b/i, icon: arcCred },
  { pattern: /\bbhim\b/i, icon: arcBhim },
];

// Accepts any number of text fields (title, bank name, notes, ...) and
// matches against all of them combined, so a UPI app named only in
// `bankName` (e.g. "GPay UPI") still resolves to its own icon.
export function getBrandIcon(...sources: (string | undefined | null)[]): BrandIcon | null {
  const text = sources.filter(Boolean).join(' ');
  if (!text) return null;
  const match = BRAND_RULES.find((r) => r.pattern.test(text));
  return match ? match.icon : null;
}
