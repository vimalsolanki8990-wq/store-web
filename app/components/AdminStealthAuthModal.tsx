"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, googleProvider } from "../firebase";
import { signInWithPopup, signOut } from "firebase/auth";
import { AUTHORIZED_ADMIN_EMAILS, MASTER_PIN, isAdminEmail } from "../admin-config";
import { setGoogleAdminSession, clearAdminSession } from "../admin-session";
import { ShieldCheck, Lock, CheckCircle2, AlertCircle, Loader2, X, KeyRound, ArrowRight } from "lucide-react";

export interface AdminStealthAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export { AUTHORIZED_ADMIN_EMAILS, MASTER_PIN };

export default function AdminStealthAuthModal({
  isOpen,
  onClose,
  onSuccess,
}: AdminStealthAuthModalProps) {
  const router = useRouter();

  // Step 1: "pin" | Step 2: "google"
  const [step, setStep] = useState<"pin" | "google">("pin");

  // 4-Digit PIN states
  const [pinDigits, setPinDigits] = useState<string[]>(["", "", "", ""]);
  const [pinError, setPinError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);

  // Google Auth states
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMsg, setAuthSuccessMsg] = useState<string | null>(null);

  // Input refs for 4 PIN boxes
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Reset modal state on open/close
  useEffect(() => {
    if (isOpen) {
      setStep("pin");
      setPinDigits(["", "", "", ""]);
      setPinError(null);
      setAuthError(null);
      setAuthSuccessMsg(null);
      setIsAuthenticating(false);

      // Auto-focus first PIN box
      const timer = setTimeout(() => {
        inputRefs[0].current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle ESC key to dismiss modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Handle individual PIN input change
  const handleDigitChange = (index: number, value: string) => {
    setPinError(null);

    // Handle paste of 4 digits
    if (value.length > 1) {
      const cleanDigits = value.replace(/\D/g, "").slice(0, 4).split("");
      const newDigits = ["", "", "", ""];
      cleanDigits.forEach((d, i) => {
        if (i < 4) newDigits[i] = d;
      });
      setPinDigits(newDigits);

      if (cleanDigits.length === 4) {
        verifyPin(newDigits.join(""));
      } else {
        const nextIdx = Math.min(cleanDigits.length, 3);
        inputRefs[nextIdx].current?.focus();
      }
      return;
    }

    // Only allow single digit
    const digit = value.replace(/\D/g, "").slice(-1);
    const updated = [...pinDigits];
    updated[index] = digit;
    setPinDigits(updated);

    if (digit) {
      // Auto-advance to next box
      if (index < 3) {
        inputRefs[index + 1].current?.focus();
      } else {
        // All 4 entered!
        const fullPin = updated.join("");
        verifyPin(fullPin);
      }
    }
  };

  // Handle Backspace and arrow navigation
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!pinDigits[index] && index > 0) {
        inputRefs[index - 1].current?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs[index - 1].current?.focus();
    } else if (e.key === "ArrowRight" && index < 3) {
      inputRefs[index + 1].current?.focus();
    }
  };

  // Verify Master PIN
  const verifyPin = (enteredPin: string) => {
    if (enteredPin === MASTER_PIN) {
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([60, 40, 60]);
        }
      } catch {}

      // Advance to Step 2
      setStep("google");
      setPinError(null);
    } else {
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(200);
        }
      } catch {}

      setIsShaking(true);
      setPinError("Invalid security PIN. Access denied.");
      setTimeout(() => {
        setIsShaking(false);
        setPinDigits(["", "", "", ""]);
        inputRefs[0].current?.focus();
      }, 450);
    }
  };

  // Step 2: Google Authentication Handler
  const handleGoogleSignIn = async () => {
    try {
      setIsAuthenticating(true);
      setAuthError(null);
      setAuthSuccessMsg(null);

      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const userEmail = user.email ? user.email.toLowerCase().trim() : "";

      if (userEmail && isAdminEmail(userEmail)) {
        // Authorized administrator verified!
        setGoogleAdminSession({
          email: userEmail,
          displayName: user.displayName || userEmail,
          uid: user.uid,
        });

        try {
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate([100, 50, 150]);
          }
        } catch {}

        setAuthSuccessMsg(`Access Granted: Welcome, ${user.displayName || userEmail}!`);

        if (onSuccess) {
          onSuccess();
        }

        // Redirect directly to /admin dashboard
        setTimeout(() => {
          onClose();
          router.push("/admin");
        }, 600);
      } else {
        // Unauthorized account!
        await signOut(auth);
        clearAdminSession();
        setAuthError(
          `Access Denied: ${userEmail || "This account"} is not registered in the authorized administrator directory.`
        );
      }
    } catch (err: unknown) {
      console.error("Google Auth error:", err);
      const code = err && typeof err === "object" && "code" in err ? String(err.code) : null;
      if (code === "auth/popup-closed-by-user") {
        setAuthError("Sign-in cancelled by user.");
      } else if (code === "auth/popup-blocked") {
        setAuthError("Pop-up was blocked by your browser. Please allow pop-ups for this site.");
      } else {
        setAuthError(err instanceof Error ? err.message : "Authentication failed. Try again.");
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stealth-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-700 bg-gradient-to-b from-[#111c32] via-[#0d1627] to-[#070b14] p-6 text-slate-100 shadow-2xl shadow-black/90 sm:p-7 animate-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 hover:bg-slate-800/80 hover:text-white transition focus:outline-none"
        >
          <X size={18} />
        </button>

        {/* Top Header Badge */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-lg shadow-emerald-950/40">
            {step === "pin" ? <KeyRound size={26} /> : <ShieldCheck size={28} />}
          </div>

          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400">
            Stealth Admin Gatekeeper
          </span>
          <h2
            id="stealth-modal-title"
            className="mt-1 text-xl font-black text-white sm:text-2xl tracking-tight"
          >
            {step === "pin" ? "Security Verification" : "Administrator Authorization"}
          </h2>
          <p className="mt-1.5 text-xs text-slate-400 leading-relaxed max-w-xs">
            {step === "pin"
              ? "Enter the 4-digit Master Security PIN to unlock administrator access."
              : "Verify your administrator identity via Google Sign-In."}
          </p>
        </div>

        {/* Step 1: Master PIN Input */}
        {step === "pin" && (
          <div className="mt-6 space-y-4">
            <div
              className={`flex justify-center items-center gap-3 ${
                isShaking ? "animate-shake" : ""
              }`}
            >
              {[0, 1, 2, 3].map((index) => (
                <input
                  key={index}
                  ref={inputRefs[index]}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={index === 0 ? 4 : 1}
                  value={pinDigits[index]}
                  onChange={(e) => handleDigitChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  aria-label={`PIN digit ${index + 1}`}
                  className={`w-13 h-14 sm:w-14 sm:h-15 text-center text-2xl font-bold rounded-2xl border bg-slate-900/90 text-white shadow-inner transition-all outline-none ${
                    pinError
                      ? "border-rose-500 ring-2 ring-rose-500/40 bg-rose-950/20 text-rose-200"
                      : pinDigits[index]
                      ? "border-emerald-500 ring-2 ring-emerald-500/30 text-emerald-400"
                      : "border-slate-700/80 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                  }`}
                />
              ))}
            </div>

            {pinError && (
              <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-400 text-center animate-in fade-in">
                <AlertCircle size={14} className="shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            <div className="pt-2 text-center">
              <span className="text-[11px] text-slate-500 font-medium">
                Protected by Zero-Hack Hardware Gatekeeper
              </span>
            </div>
          </div>
        )}

        {/* Step 2: Google Multi-Admin Auth */}
        {step === "google" && (
          <div className="mt-6 space-y-4 animate-in fade-in duration-300">
            {/* PIN Verified Chip */}
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-950/40 py-2 px-3 text-xs font-bold text-emerald-300 shadow-xs">
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
              <span>PIN 1997 Verified Successfully</span>
            </div>

            {/* Error Message if unauthorized */}
            {authError && (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-950/50 p-3.5 flex items-start gap-2.5 text-xs font-medium text-rose-200 shadow-sm animate-in fade-in">
                <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{authError}</span>
              </div>
            )}

            {/* Success Message if authorized */}
            {authSuccessMsg && (
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/60 p-3.5 flex items-center gap-2.5 text-xs font-bold text-emerald-200 shadow-sm animate-in fade-in">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span>{authSuccessMsg}</span>
              </div>
            )}

            {/* Google Sign-in Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isAuthenticating}
              className="flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border border-slate-600/80 bg-white hover:bg-slate-100 text-slate-900 font-bold text-sm px-4 py-3 shadow-lg shadow-black/40 transition active:scale-[0.98] disabled:opacity-75 disabled:cursor-wait"
            >
              {isAuthenticating ? (
                <>
                  <Loader2 size={18} className="animate-spin text-orange-600" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  {/* Google 4-Color SVG Logo */}
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.15z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.25 21.36 7.34 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.17 0 9.99 0 12s.46 3.83 1.26 5.42l4.02-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.25 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span>Sign In with Google Admin</span>
                </>
              )}
            </button>

            {/* Whitelisted Admins info notice */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3 text-center">
              <p className="text-[11px] text-slate-400">
                Only authenticated Google accounts in the <span className="text-emerald-400 font-semibold">multi-admin whitelist</span> are granted access.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
