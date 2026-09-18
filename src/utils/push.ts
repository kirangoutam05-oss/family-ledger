import { SpenderId } from '../types';
import { apiFetch } from './household';

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function getExistingSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

// Registers the service worker, asks for OS notification permission (the
// explicit opt-in moment — never called on load), subscribes to push, and
// hands the subscription to the server so it can target this spender later.
export async function subscribeToPush(role: SpenderId): Promise<boolean> {
  if (!isPushSupported()) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const keyRes = await apiFetch('/api/push/vapid-key');
  if (!keyRes.ok) return false;
  const { publicKey } = await keyRes.json();

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const res = await apiFetch('/api/ledger/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, subscription: subscription.toJSON() }),
  });
  return res.ok;
}

export async function unsubscribeFromPush(role: SpenderId): Promise<void> {
  try {
    const subscription = await getExistingSubscription();
    if (subscription) await subscription.unsubscribe();
  } catch {
    // best-effort — still tell the server to forget this role's subscription
  }
  await apiFetch('/api/ledger/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
}

export async function isSubscribedToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const subscription = await getExistingSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}
