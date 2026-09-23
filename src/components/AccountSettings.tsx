import React, { useState } from 'react';
import { UserCog, Save, CheckCircle2, LogOut, Smartphone, UserPlus, ShieldCheck, KeyRound, MailCheck, MailWarning } from 'lucide-react';
import { LedgerState, SpenderId } from '../types';
import { AppLockSettings } from './AppLockSettings';
import { NotificationSettings } from './NotificationSettings';
import { CategoryPeriodSettings } from './CategoryPeriodSettings';
import { AuthAccount, AuthApiError, authChangePassword, authLogin, authSendVerification } from '../utils/auth';

interface AccountSettingsProps {
  ledger: LedgerState;
  authenticatedUser: SpenderId;
  onUpdateHousehold: (details: {
    familyName: string;
    husbandName: string;
    wifeName: string;
    currency: string;
  }) => Promise<void>;
  onUpdateCategoryPeriod: (period: 'month' | 'year' | 'all') => Promise<void>;
  onSwitchUser: () => void;
  onOpenSyncModal: () => void;
  onOpenLiveMobile: () => void;
  onLockConfigChanged: () => void;
  onEnableLock: () => void;
  // Real login (email/password), layered on top of the per-device identity
  // above — null until this device's role has actually signed up.
  authAccount: AuthAccount | null;
  onLogout: () => Promise<void>;
  onSecureAccount: () => void;
  // Called after successfully logging back in from the "session expired"
  // prompt below, so App.tsx can refresh authAccount without re-touching
  // household/identity (those are already correct on this device).
  onReauthenticate: (account: AuthAccount) => void;
  // Whether THIS role already has a login somewhere (signed up on another
  // device, or this device just isn't authenticated right now) — distinct
  // from authAccount, which only reflects whether *this* session is
  // currently logged in. Determines whether the CTA below offers signup
  // (no account yet) or login (account exists, just not here).
  roleHasAccount: boolean;
}

const CURRENCIES = [
  { symbol: '₹', label: 'INR' },
  { symbol: '$', label: 'USD' },
  { symbol: '€', label: 'EUR' },
  { symbol: '£', label: 'GBP' },
];

export const AccountSettings: React.FC<AccountSettingsProps> = ({
  ledger,
  authenticatedUser,
  onUpdateHousehold,
  onUpdateCategoryPeriod,
  onSwitchUser,
  onOpenSyncModal,
  onOpenLiveMobile,
  onLockConfigChanged,
  onEnableLock,
  authAccount,
  onLogout,
  onSecureAccount,
  onReauthenticate,
  roleHasAccount,
}) => {
  const [familyName, setFamilyName] = useState(ledger.familyName);
  const [husbandName, setHusbandName] = useState(ledger.husbandName);
  const [wifeName, setWifeName] = useState(ledger.wifeName);
  const [currency, setCurrency] = useState(ledger.currency);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);

  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Set when a session-gated action comes back 401 — the device still shows
  // "Logged in" (from a stale authAccount fetched earlier), but the login
  // session itself has actually expired/gone invalid, so every such action
  // would otherwise silently keep failing with no way to recover short of
  // clearing the device's local identity entirely.
  const [sessionExpired, setSessionExpired] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [isReauthing, setIsReauthing] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);

  // For the "an account exists for this role, just not logged in on this
  // device" case — a real login form (we don't already know the email
  // here, unlike the session-expired prompt above).
  const [showInlineLogin, setShowInlineLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleInlineLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const account = await authLogin(loginEmail, loginPassword);
      onReauthenticate(account);
      setShowInlineLogin(false);
      setLoginEmail('');
      setLoginPassword('');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Could not log in.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogoutClick = async () => {
    setIsLoggingOut(true);
    await onLogout();
  };

  const handleResendVerification = async () => {
    setIsSendingVerification(true);
    setVerificationError(null);
    try {
      await authSendVerification();
      setVerificationSent(true);
    } catch (err) {
      if (err instanceof AuthApiError && err.status === 401) {
        setSessionExpired(true);
      } else {
        setVerificationError(err instanceof Error ? err.message : 'Could not send the verification email.');
      }
    } finally {
      setIsSendingVerification(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    setIsChangingPassword(true);
    try {
      await authChangePassword(currentPassword, newPassword);
      setPasswordChanged(true);
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => {
        setPasswordChanged(false);
        setShowChangePassword(false);
      }, 1500);
    } catch (err) {
      if (err instanceof AuthApiError && err.status === 401) {
        setSessionExpired(true);
      } else {
        setPasswordError(err instanceof Error ? err.message : 'Could not change your password.');
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleReauthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authAccount) return;
    setIsReauthing(true);
    setReauthError(null);
    try {
      const account = await authLogin(authAccount.email, reauthPassword);
      onReauthenticate(account);
      setSessionExpired(false);
      setReauthPassword('');
    } catch (err) {
      setReauthError(err instanceof Error ? err.message : 'Could not log in.');
    } finally {
      setIsReauthing(false);
    }
  };

  const currentName = authenticatedUser === 'husband' ? ledger.husbandName : ledger.wifeName;

  const canSave =
    familyName.trim().length > 0 && husbandName.trim().length > 0 && wifeName.trim().length > 0;

  const isDirty =
    familyName.trim() !== ledger.familyName ||
    husbandName.trim() !== ledger.husbandName ||
    wifeName.trim() !== ledger.wifeName ||
    currency !== ledger.currency;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || !isDirty) return;
    setIsSaving(true);
    setError(null);
    try {
      await onUpdateHousehold({
        familyName: familyName.trim(),
        husbandName: husbandName.trim(),
        wifeName: wifeName.trim(),
        currency,
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div className="px-1">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Account</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
          Update your household name, partner names, and currency.
        </p>
      </div>

      {/* Signed-in identity */}
      <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 ${
              authenticatedUser === 'husband' ? 'bg-blue-500' : 'bg-purple-500'
            }`}
          >
            <UserCog className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
              Signed in as {currentName}
            </div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">On this device</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onSwitchUser}
          className="px-3 py-1.5 rounded-xl border border-black/[0.08] dark:border-white/[0.12] text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:border-[#9333EA] hover:text-[#9333EA] transition-colors flex items-center gap-1.5 shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Switch</span>
        </button>
      </div>

      {/* Login & Security — the real email/password account, separate from
          "Switch" above (which only swaps which device-identity this phone
          remembers, and never touches the login session). */}
      {authAccount && sessionExpired ? (
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-amber-400/40 shadow-xs space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                Your session expired
              </div>
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                Log back in as {authAccount.email} to continue
              </div>
            </div>
          </div>
          <form onSubmit={handleReauthenticate} className="space-y-2.5">
            <input
              type="password"
              value={reauthPassword}
              onChange={(e) => setReauthPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              required
              className="w-full px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
            />
            {reauthError && <p className="text-[11px] text-red-600 dark:text-red-400">{reauthError}</p>}
            <button
              type="submit"
              disabled={isReauthing}
              className="w-full py-2 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-all"
            >
              {isReauthing ? 'Logging in…' : 'Log in'}
            </button>
          </form>
        </div>
      ) : authAccount ? (
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate">Logged in</div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">{authAccount.email}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogoutClick}
              disabled={isLoggingOut}
              className="px-3 py-1.5 rounded-xl border border-black/[0.08] dark:border-white/[0.12] text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:border-red-400 hover:text-red-600 transition-colors disabled:opacity-50 shrink-0"
            >
              {isLoggingOut ? 'Logging out…' : 'Log Out'}
            </button>
          </div>

          {/* Verification status — a signed-up email isn't confirmed to
              actually belong to whoever typed it until they click the
              emailed link, which matters since this email is also the
              password-recovery destination. */}
          {authAccount.emailVerified ? (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              <MailCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Email verified</span>
            </div>
          ) : verificationSent ? (
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
              <MailCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Verification email sent — check your inbox</span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30">
              <div className="flex items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-300 font-medium min-w-0">
                <MailWarning className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Email not verified yet</span>
              </div>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={isSendingVerification}
                className="text-[11px] font-semibold text-[#9333EA] disabled:opacity-50 shrink-0"
              >
                {isSendingVerification ? 'Sending…' : 'Resend'}
              </button>
            </div>
          )}
          {verificationError && <p className="text-[11px] text-red-600 dark:text-red-400">{verificationError}</p>}

          <button
            type="button"
            onClick={() => {
              setShowChangePassword((v) => !v);
              setPasswordError(null);
            }}
            className="w-full text-left text-xs font-semibold text-[#9333EA] flex items-center gap-1.5"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{showChangePassword ? 'Cancel' : 'Change password'}</span>
          </button>

          {showChangePassword && (
            <form onSubmit={handleChangePassword} className="space-y-2.5 pt-1">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                required
                className="w-full px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min. 8 characters)"
                required
                minLength={8}
                className="w-full px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
              />
              {passwordError && <p className="text-[11px] text-red-600 dark:text-red-400">{passwordError}</p>}
              <button
                type="submit"
                disabled={isChangingPassword}
                className="w-full py-2 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-all flex items-center justify-center gap-1.5"
              >
                {passwordChanged ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Password changed</span>
                  </>
                ) : (
                  <span>{isChangingPassword ? 'Saving…' : 'Save new password'}</span>
                )}
              </button>
            </form>
          )}
        </div>
      ) : roleHasAccount ? (
        // An account already exists for this role (signed up elsewhere, or
        // this device just isn't authenticated right now) — offer login,
        // not signup, since signing up again would just 409 as "already
        // registered."
        <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-[#9333EA]/30 shadow-xs space-y-3">
          {!showInlineLogin ? (
            <button
              type="button"
              onClick={() => setShowInlineLogin(true)}
              className="w-full flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center text-[#9333EA] shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-neutral-900 dark:text-white">Log in</div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    This device isn't logged in yet — your account already exists
                  </div>
                </div>
              </div>
            </button>
          ) : (
            <form onSubmit={handleInlineLogin} className="space-y-2.5">
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="Email"
                autoFocus
                required
                className="w-full px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
              />
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Password"
                required
                className="w-full px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
              />
              {loginError && <p className="text-[11px] text-red-600 dark:text-red-400">{loginError}</p>}
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-2 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-all"
              >
                {isLoggingIn ? 'Logging in…' : 'Log in'}
              </button>
            </form>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={onSecureAccount}
          className="w-full p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-[#9333EA]/30 shadow-xs flex items-center justify-between gap-3 hover:border-[#9333EA] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center text-[#9333EA] shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-neutral-900 dark:text-white">Secure your account</div>
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Set an email &amp; password so you can log in from any device
              </div>
            </div>
          </div>
        </button>
      )}

      {/* Editable household details */}
      <form
        onSubmit={handleSubmit}
        className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs space-y-4"
      >
        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
            Household name
          </label>
          <input
            type="text"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
              Partner 1's name
            </label>
            <input
              type="text"
              value={husbandName}
              onChange={(e) => setHusbandName(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
              Partner 2's name
            </label>
            <input
              type="text"
              value={wifeName}
              onChange={(e) => setWifeName(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-800 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#9333EA]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
            Currency
          </label>
          <div className="grid grid-cols-4 gap-2">
            {CURRENCIES.map((c) => (
              <button
                key={c.symbol}
                type="button"
                onClick={() => setCurrency(c.symbol)}
                className={`py-2 rounded-xl border text-xs font-semibold transition-all ${
                  currency === c.symbol
                    ? 'bg-[#9333EA] border-[#9333EA] text-white shadow-xs'
                    : 'border-black/10 dark:border-white/10 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                {c.symbol} {c.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSave || !isDirty || isSaving}
          className="w-full py-2.5 rounded-lg bg-[#9333EA] hover:bg-[#7E22CE] disabled:opacity-40 text-white text-xs font-bold shadow-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
        >
          {justSaved ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Saved</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving…' : 'Save Changes'}</span>
            </>
          )}
        </button>
      </form>

      {/* Per-device app lock: change PIN, toggle Face ID / Touch ID */}
      <AppLockSettings personLabel={currentName} onLockConfigChanged={onLockConfigChanged} onEnableLock={onEnableLock} />

      {/* Per-device push notification opt-in */}
      <NotificationSettings authenticatedUser={authenticatedUser} />

      {/* Shared "Amount vs Category" time window */}
      <CategoryPeriodSettings
        period={ledger.categoryBreakdownPeriod ?? 'month'}
        onChange={onUpdateCategoryPeriod}
      />

      {/* Invite partner shortcut */}
      <button
        type="button"
        onClick={onOpenLiveMobile}
        className="w-full p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs flex items-center justify-between gap-3 hover:border-[#9333EA] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-[#9333EA] shrink-0">
            <UserPlus className="w-5 h-5" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-neutral-900 dark:text-white">Invite Partner</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Scan to join this household
            </div>
          </div>
        </div>
      </button>

      {/* Devices & sync shortcut */}
      <button
        type="button"
        onClick={onOpenSyncModal}
        className="w-full p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.06] shadow-xs flex items-center justify-between gap-3 hover:border-[#9333EA] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-300 shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-neutral-900 dark:text-white">Devices & Sync</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Paired devices, reset household data
            </div>
          </div>
        </div>
      </button>
    </div>
  );
};
