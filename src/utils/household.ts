// Which household this device belongs to. Stored separately from device identity
// (`family-ledger:identity`, App.tsx) — a household is "which couple's ledger,"
// identity is "which of the two people in it is this phone."
const HOUSEHOLD_STORAGE_KEY = 'family-ledger:household';

export function getStoredHouseholdId(): string | null {
  try {
    return localStorage.getItem(HOUSEHOLD_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredHouseholdId(id: string) {
  try {
    localStorage.setItem(HOUSEHOLD_STORAGE_KEY, id);
  } catch {
    // localStorage unavailable (private mode, etc.) — falls back to 'default'
    // (or re-prompts) on the next load, but doesn't crash this one.
  }
}

const JOIN_PATH_RE = /^\/join\/([A-Za-z0-9_-]{6,32})$/;

// Pulls an invite code out of either a bare `/join/<code>` path or a full
// pasted URL containing one.
export function extractHouseholdIdFromText(text: string): string | null {
  const trimmed = text.trim();
  const bareMatch = trimmed.match(/^[A-Za-z0-9_-]{6,32}$/);
  if (bareMatch) return bareMatch[0];
  try {
    const url = new URL(trimmed);
    const pathMatch = url.pathname.match(JOIN_PATH_RE);
    if (pathMatch) return pathMatch[1];
  } catch {
    // not a full URL — fall through
  }
  return null;
}

// Priority order for figuring out which household this device belongs to:
// 1. A `/join/<id>` link just clicked (freshest signal — always wins)
// 2. A household id already remembered on this device
// 3. A pre-multi-tenancy device (has a saved identity, but never saved a
//    household id because that concept didn't exist yet) — bridge it to the
//    original household so already-installed apps keep working untouched
// 4. Nothing — this is a genuinely new device with no household to show yet
export function resolveHouseholdIdOnBoot(hasLegacyIdentity: boolean): { householdId: string | null; fromJoinLink: boolean } {
  if (typeof window !== 'undefined') {
    const pathMatch = window.location.pathname.match(JOIN_PATH_RE);
    if (pathMatch) {
      return { householdId: pathMatch[1], fromJoinLink: true };
    }
  }

  const stored = getStoredHouseholdId();
  if (stored) return { householdId: stored, fromJoinLink: false };

  if (hasLegacyIdentity) return { householdId: 'default', fromJoinLink: false };

  return { householdId: null, fromJoinLink: false };
}

export function buildInviteUrl(householdId: string): string {
  if (typeof window === 'undefined') return `/join/${householdId}`;
  return `${window.location.origin}/join/${householdId}`;
}

// Thin fetch wrapper that attaches the household id as a header so the server
// knows which household's ledger a request is for. Falls back to whatever's
// stored on this device when no id is passed explicitly.
export async function apiFetch(path: string, options: RequestInit = {}, householdId?: string): Promise<Response> {
  const id = householdId ?? getStoredHouseholdId() ?? undefined;
  const headers = new Headers(options.headers);
  if (id) headers.set('X-Household-Id', id);
  return fetch(path, { ...options, headers });
}
