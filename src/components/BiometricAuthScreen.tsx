import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  KeyRound,
  RefreshCw,
  Fingerprint,
  ScanFace,
  ChevronRight,
  ShieldAlert,
  Smartphone,
  Delete,
} from 'lucide-react';
import { SpenderId } from '../types';

interface BiometricAuthScreenProps {
  onAuthenticated: (spender: SpenderId) => void;
  husbandName?: string;
  wifeName?: string;
  familyName?: string;
}

type AuthMode = 'faceid' | 'touchid' | 'passcode';

export const BiometricAuthScreen: React.FC<BiometricAuthScreenProps> = ({
  onAuthenticated,
  husbandName = 'Arjun',
  wifeName = 'Priya',
  familyName = 'Sharma Family',
}) => {
  const [authMode, setAuthMode] = useState<AuthMode>('faceid');
  const [selectedSpender, setSelectedSpender] = useState<SpenderId>('husband');
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'success' | 'failed'>('idle');
  const [passcode, setPasscode] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  // Play subtle Apple unlock chime using Web Audio API
  const playHapticTone = (type: 'success' | 'error' | 'tick') => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();

      if (type === 'tick') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, ctx.currentTime);
        gain.gain.setValueAtTime(0.02, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
      } else if (type === 'success') {
        // Dual ascending cheerful chime
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(880, now);
        osc2.frequency.setValueAtTime(1760, now + 0.08);

        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc1.stop(now + 0.08);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.25);
      } else if (type === 'error') {
        // Low rejection buzz
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, ctx.currentTime);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch {
      // Audio context might be restricted before interaction; safe to ignore
    }
  };

  // Trigger biometric scanning simulation
  const startBiometricScan = (mode = authMode, forceFail = false) => {
    if (scanState === 'scanning' || scanState === 'success') return;

    setScanState('scanning');
    setErrorMessage(null);
    setScanProgress(0);

    const startTime = Date.now();
    const duration = 1100;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setScanProgress(pct);

      if (elapsed >= duration) {
        clearInterval(interval);
        if (forceFail) {
          setScanState('failed');
          setIsShaking(true);
          setErrorMessage(mode === 'faceid' ? 'Face Not Recognized' : 'Fingerprint Mismatch');
          playHapticTone('error');
          setTimeout(() => setIsShaking(false), 500);
        } else {
          setScanState('success');
          playHapticTone('success');
          setTimeout(() => {
            onAuthenticated(selectedSpender);
          }, 650);
        }
      }
    }, 40);
  };

  // Auto trigger scan on mount for realistic iOS feel
  const hasMounted = useRef(false);
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      const timer = setTimeout(() => {
        startBiometricScan('faceid', false);
      }, 450);
      return () => clearTimeout(timer);
    }
  }, []);

  // Passcode handling
  const handleKeypadPress = (digit: string) => {
    if (passcode.length >= 4) return;
    playHapticTone('tick');
    const newPass = passcode + digit;
    setPasscode(newPass);

    if (newPass.length === 4) {
      // Any 4 digits or '1234' is accepted in demo, unless 0000 which simulates failure
      if (newPass === '0000') {
        setIsShaking(true);
        setErrorMessage('Incorrect Passcode');
        playHapticTone('error');
        setTimeout(() => {
          setPasscode('');
          setIsShaking(false);
        }, 600);
      } else {
        setScanState('success');
        playHapticTone('success');
        setTimeout(() => {
          onAuthenticated(selectedSpender);
        }, 500);
      }
    }
  };

  const handleDeleteDigit = () => {
    if (passcode.length > 0) {
      playHapticTone('tick');
      setPasscode(passcode.slice(0, -1));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-[110] flex flex-col items-center justify-between p-6 sm:p-10 bg-[#000000] text-white select-none overflow-y-auto"
    >
      {/* Top Header: Security Badge & Spouse Switcher */}
      <div className="w-full max-w-sm flex items-center justify-between pt-2">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-xs font-medium text-neutral-300">
          <Lock className="w-3 h-3 text-[#007AFF]" />
          <span>Local Biometric Vault</span>
        </div>

        {/* Switch authenticating user */}
        <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl text-xs">
          <button
            onClick={() => {
              setSelectedSpender('husband');
              setScanState('idle');
              setErrorMessage(null);
            }}
            className={`px-2.5 py-0.5 rounded-lg transition-colors ${
              selectedSpender === 'husband'
                ? 'bg-[#007AFF] text-white font-semibold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            {husbandName}
          </button>
          <button
            onClick={() => {
              setSelectedSpender('wife');
              setScanState('idle');
              setErrorMessage(null);
            }}
            className={`px-2.5 py-0.5 rounded-lg transition-colors ${
              selectedSpender === 'wife'
                ? 'bg-purple-600 text-white font-semibold'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            {wifeName}
          </button>
        </div>
      </div>

      {/* Center Biometric Simulation Container */}
      <motion.div
        animate={isShaking ? { x: [-12, 12, -8, 8, -4, 4, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="my-auto flex flex-col items-center text-center max-w-sm w-full space-y-6"
      >
        {/* App Logo & Verification Frame */}
        <div className="relative inline-flex items-center justify-center mx-auto">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-[24px] sm:rounded-[28px] overflow-hidden shadow-2xl border border-white/20 bg-neutral-900 flex items-center justify-center">
            <img
              src="/app-logo.jpg?v=3"
              alt="Couple Ledger Logo"
              className="w-full h-full object-cover object-center block"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="absolute -bottom-2.5 px-3 py-0.5 rounded-full bg-neutral-900/95 backdrop-blur-md border border-white/20 text-[11px] font-medium flex items-center gap-1.5 shadow-xl">
            {scanState === 'success' ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300 font-semibold">Verified</span>
              </>
            ) : scanState === 'failed' ? (
              <>
                <XCircle className="w-3.5 h-3.5 text-red-400" />
                <span className="text-red-300 font-semibold">Retry</span>
              </>
            ) : (
              <>
                <Lock className="w-3 h-3 text-[#007AFF]" />
                <span className="text-neutral-300">Biometrics</span>
              </>
            )}
          </div>
        </div>

        {/* Title & Prompt */}
        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            Family Ledger
          </h2>
          <p className="text-xs text-neutral-400 max-w-xs">
            {authMode === 'faceid' && `Authenticating ${selectedSpender === 'husband' ? husbandName : wifeName}'s Face ID`}
            {authMode === 'touchid' && `Place ${selectedSpender === 'husband' ? husbandName : wifeName}'s finger on Touch ID`}
            {authMode === 'passcode' && `Enter 4-Digit Passcode for ${familyName}`}
          </p>
        </div>

        {/* Biometric Visualizer / Keypad Area */}
        <div className="min-h-[170px] flex flex-col items-center justify-center w-full">
          {/* FACE ID MODE */}
          {authMode === 'faceid' && (
            <div className="flex flex-col items-center space-y-4">
              <div
                onClick={() => startBiometricScan('faceid', false)}
                className="relative w-28 h-28 rounded-3xl border-2 border-dashed border-white/20 hover:border-[#007AFF] bg-white/5 flex items-center justify-center cursor-pointer transition-colors group"
                title="Tap to scan Face ID"
              >
                {/* Corner brackets */}
                <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-[#007AFF]" />
                <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-[#007AFF]" />
                <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-[#007AFF]" />
                <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-[#007AFF]" />

                {/* Animated Radar Scanning Line */}
                {scanState === 'scanning' && (
                  <motion.div
                    animate={{ y: [-35, 35, -35] }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                    className="absolute w-20 h-0.5 bg-[#007AFF] shadow-[0_0_8px_#007AFF]"
                  />
                )}

                {scanState === 'success' ? (
                  <motion.div
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    className="text-emerald-400"
                  >
                    <CheckCircle2 className="w-14 h-14" />
                  </motion.div>
                ) : scanState === 'failed' ? (
                  <motion.div
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    className="text-red-400"
                  >
                    <XCircle className="w-14 h-14" />
                  </motion.div>
                ) : (
                  <ScanFace className="w-12 h-12 text-neutral-300 group-hover:text-white transition-colors" />
                )}
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-neutral-300">
                  {scanState === 'scanning' && 'Scanning Face...'}
                  {scanState === 'success' && 'Face ID Verified ✓'}
                  {scanState === 'failed' && (errorMessage || 'Face Not Recognized')}
                  {scanState === 'idle' && 'Tap or Glance to Authenticate'}
                </span>
                {scanState === 'idle' && (
                  <p className="text-[11px] text-neutral-500">
                    Camera stays 100% on-device
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TOUCH ID MODE */}
          {authMode === 'touchid' && (
            <div className="flex flex-col items-center space-y-4">
              <div
                onClick={() => startBiometricScan('touchid', false)}
                className="relative w-28 h-28 rounded-full border-2 border-white/20 hover:border-purple-500 bg-white/5 flex items-center justify-center cursor-pointer transition-colors group"
                title="Tap to scan Touch ID"
              >
                {/* Ripple rings while scanning */}
                {scanState === 'scanning' && (
                  <motion.div
                    animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0.1, 0.6] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                    className="absolute inset-0 rounded-full border border-purple-400"
                  />
                )}

                {scanState === 'success' ? (
                  <motion.div
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    className="text-emerald-400"
                  >
                    <CheckCircle2 className="w-14 h-14" />
                  </motion.div>
                ) : scanState === 'failed' ? (
                  <motion.div
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    className="text-red-400"
                  >
                    <XCircle className="w-14 h-14" />
                  </motion.div>
                ) : (
                  <Fingerprint className="w-12 h-12 text-neutral-300 group-hover:text-white transition-colors" />
                )}
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-neutral-300">
                  {scanState === 'scanning' && 'Reading Fingerprint...'}
                  {scanState === 'success' && 'Touch ID Verified ✓'}
                  {scanState === 'failed' && (errorMessage || 'Fingerprint Mismatch')}
                  {scanState === 'idle' && 'Tap sensor to authenticate'}
                </span>
              </div>
            </div>
          )}

          {/* PASSCODE KEYPAD MODE */}
          {authMode === 'passcode' && (
            <div className="flex flex-col items-center w-full max-w-[240px] space-y-5">
              {/* Passcode 4 Dots */}
              <div className="flex items-center gap-4 py-2">
                {[0, 1, 2, 3].map((idx) => {
                  const filled = passcode.length > idx;
                  return (
                    <div
                      key={idx}
                      className={`w-3.5 h-3.5 rounded-full border transition-all duration-150 ${
                        filled
                          ? 'bg-white border-white scale-110'
                          : 'border-white/40 bg-transparent'
                      }`}
                    />
                  );
                })}
              </div>

              {/* iOS Numeric Keypad */}
              <div className="grid grid-cols-3 gap-3 w-full">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    onClick={() => handleKeypadPress(num)}
                    className="w-14 h-14 mx-auto rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-lg font-semibold flex items-center justify-center transition-colors"
                  >
                    {num}
                  </button>
                ))}
                <div />
                <button
                  onClick={() => handleKeypadPress('0')}
                  className="w-14 h-14 mx-auto rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-lg font-semibold flex items-center justify-center transition-colors"
                >
                  0
                </button>
                <button
                  onClick={handleDeleteDigit}
                  className="w-14 h-14 mx-auto rounded-full hover:bg-white/10 active:bg-white/20 text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>

              <p className="text-[11px] text-neutral-500">
                Demo Passcode: <span className="text-neutral-300 font-mono">1234</span>
              </p>
            </div>
          )}
        </div>

        {/* Error / Feedback Alert Banner */}
        {errorMessage && (
          <div className="px-3 py-1.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-medium flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Action Controls: Trigger Scan / Test Failure */}
        {authMode !== 'passcode' && (
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => startBiometricScan(authMode, false)}
              disabled={scanState === 'scanning'}
              className="px-4 py-2 rounded-xl bg-[#007AFF] hover:bg-[#0071E3] active:scale-95 text-white text-xs font-semibold shadow-md flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanState === 'scanning' ? 'animate-spin' : ''}`} />
              <span>{scanState === 'failed' ? 'Retry Biometrics' : 'Scan Now'}</span>
            </button>

            {/* Test security rejection */}
            <button
              onClick={() => startBiometricScan(authMode, true)}
              disabled={scanState === 'scanning'}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-neutral-400 hover:text-red-300 text-xs font-medium transition-colors"
              title="Simulate unmatched face/fingerprint"
            >
              Simulate Failure
            </button>
          </div>
        )}
      </motion.div>

      {/* Bottom Switcher: Face ID vs Touch ID vs Passcode */}
      <div className="w-full max-w-sm flex items-center justify-center gap-4 py-3 border-t border-white/10">
        <button
          onClick={() => {
            setAuthMode('faceid');
            setScanState('idle');
            setErrorMessage(null);
          }}
          className={`flex items-center gap-1.5 text-xs transition-colors ${
            authMode === 'faceid' ? 'text-[#007AFF] font-semibold' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <ScanFace className="w-4 h-4" />
          <span>Face ID</span>
        </button>

        <span className="text-neutral-700">•</span>

        <button
          onClick={() => {
            setAuthMode('touchid');
            setScanState('idle');
            setErrorMessage(null);
          }}
          className={`flex items-center gap-1.5 text-xs transition-colors ${
            authMode === 'touchid' ? 'text-purple-400 font-semibold' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <Fingerprint className="w-4 h-4" />
          <span>Touch ID</span>
        </button>

        <span className="text-neutral-700">•</span>

        <button
          onClick={() => {
            setAuthMode('passcode');
            setScanState('idle');
            setErrorMessage(null);
            setPasscode('');
          }}
          className={`flex items-center gap-1.5 text-xs transition-colors ${
            authMode === 'passcode' ? 'text-amber-400 font-semibold' : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>Passcode</span>
        </button>
      </div>
    </motion.div>
  );
};
