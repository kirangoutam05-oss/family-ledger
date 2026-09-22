// A device-level app lock: gates the UI with the OS's real Face ID/Touch ID
// (via WebAuthn's platform authenticator) or a PIN, so someone who picks up an
// unlocked phone can't just tap the app icon and see transaction data.
//
// Honest scope: this verifies presence on THIS device, client-side. It is not a
// server-verified credential tied to a backend account — the household's data is
// still reachable by anyone who has its invite link (see src/utils/household.ts).
// That split matches the app's threat model: stop casual/opportunistic viewing of
// an unlocked phone, not resist a determined attacker with sustained physical
// access to the device (no local-only lock can do that without a server secret).

const LOCK_STORAGE_KEY = 'family-ledger:lock';

export interface LockConfig {
  pinHash: string;
  salt: string;
  // How many digits the PIN is — only the hash is kept, so the unlock screen
  // needs this separately to know how many dots to show. Configs saved before
  // this field existed fall back to 6 (the old fixed dot count) wherever it's read.
  pinLength?: number;
  webauthnCredentialId?: string;
}

export function loadLockConfig(): LockConfig | null {
  try {
    const raw = localStorage.getItem(LOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.pinHash && parsed?.salt) return parsed as LockConfig;
    return null;
  } catch {
    return null;
  }
}

export function saveLockConfig(config: LockConfig) {
  try {
    localStorage.setItem(LOCK_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore — worst case, the setup screen reappears next launch
  }
}

export function clearLockConfig() {
  try {
    localStorage.removeItem(LOCK_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// Some people just don't want a PIN gate on a couple's expense app — this
// records that choice so AppLockSetupScreen doesn't keep asking. It only
// matters while there's no LockConfig; setting one up later clears it.
const LOCK_SKIPPED_KEY = 'family-ledger:lock-skipped';

export function isLockSkipped(): boolean {
  try {
    return localStorage.getItem(LOCK_SKIPPED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setLockSkipped(skipped: boolean) {
  try {
    if (skipped) {
      localStorage.setItem(LOCK_SKIPPED_KEY, 'true');
    } else {
      localStorage.removeItem(LOCK_SKIPPED_KEY);
    }
  } catch {
    // ignore
  }
}

function bufToBase64Url(buf: ArrayBuffer): string {
  let binary = '';
  new Uint8Array(buf).forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBuf(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function generateSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bufToBase64Url(bytes.buffer);
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const encoded = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return bufToBase64Url(digest);
}

export function isWebAuthnAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}

// Registers this device's platform authenticator (Face ID/Touch ID/fingerprint)
// as the biometric unlock for the app lock. Returns the new credential's id to
// store, or null if unsupported, declined, or it fails for any reason — callers
// treat that as "stick with PIN-only," never as an error to surface.
export async function registerBiometric(label: string): Promise<string | null> {
  if (!isWebAuthnAvailable()) return null;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const credential = (await navigator.credentials.create({
      publicKey: {
        rp: { name: 'KNKU' },
        user: { id: userId, name: label, displayName: label },
        challenge,
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
    if (!credential) return null;
    return bufToBase64Url(credential.rawId);
  } catch {
    return null;
  }
}

// Asks the platform authenticator to verify presence for a previously
// registered credential. Resolves true only on a genuine successful assertion —
// any cancellation, mismatch, or error resolves false, never throws.
export async function verifyBiometric(credentialId: string): Promise<boolean> {
  if (!isWebAuthnAvailable()) return false;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: base64UrlToBuf(credentialId), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}
