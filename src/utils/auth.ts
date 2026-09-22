// Thin client for the /api/auth/* routes added in server.ts. Unlike
// `apiFetch` in household.ts, these calls carry the login session cookie
// (browsers include same-origin cookies by default) rather than the
// X-Household-Id header — the server derives the household from the
// verified session once one exists.

export interface AuthAccount {
  email: string;
  role: 'husband' | 'wife';
  householdId: string;
}

async function parseJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function authSignup(params: {
  email: string;
  password: string;
  role: 'husband' | 'wife';
  householdId: string;
}): Promise<AuthAccount> {
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Household-Id': params.householdId },
    body: JSON.stringify({ email: params.email, password: params.password, role: params.role }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Could not create your login.');
  return { email: data.account.email, role: data.account.role, householdId: data.account.householdId };
}

export async function authLogin(email: string, password: string): Promise<AuthAccount> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Could not log in.');
  return { email: data.email, role: data.role, householdId: data.householdId };
}

export async function authLogout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
}

export async function authMe(): Promise<AuthAccount | null> {
  try {
    const res = await fetch('/api/auth/me');
    const data = await parseJson(res);
    if (!data.authenticated) return null;
    return { email: data.email, role: data.role, householdId: data.householdId };
  } catch {
    return null;
  }
}

export async function authHouseholdStatus(
  householdId: string
): Promise<{ husbandHasAccount: boolean; wifeHasAccount: boolean }> {
  try {
    const res = await fetch('/api/auth/household-status', { headers: { 'X-Household-Id': householdId } });
    const data = await parseJson(res);
    return { husbandHasAccount: !!data.husbandHasAccount, wifeHasAccount: !!data.wifeHasAccount };
  } catch {
    return { husbandHasAccount: false, wifeHasAccount: false };
  }
}

export async function authForgotPassword(email: string): Promise<void> {
  await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  }).catch(() => {});
}

export async function authResetPassword(token: string, newPassword: string): Promise<void> {
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Could not reset your password.');
}

export async function authChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Could not change your password.');
}
