"use client";

import React, { useEffect, useState } from "react";
import { isValidAdminSession, clearAdminSession, setAdminSession } from "../admin-session";
import { LockKeyhole, AlertCircle, ArrowRight } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isLocal, setIsLocal] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    }
    return false;
  });

  const [localAuth, setLocalAuth] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const local = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      if (local) {
        return sessionStorage.getItem("local_admin_auth") === "true";
      }
    }
    return false;
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const local = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      if (local) {
        return sessionStorage.getItem("local_admin_auth") === "true";
      }
      return isValidAdminSession();
    }
    return false;
  });

  const [isChecking, setIsChecking] = useState<boolean>(true);

  // Local PIN input state
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const local = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    setIsLocal(local);

    if (local) {
      const isAuthed = sessionStorage.getItem("local_admin_auth") === "true";
      setLocalAuth(isAuthed);
      setIsAuthenticated(isAuthed);
      setIsChecking(false);
      return;
    }

    // Production environment: existing auth check
    const valid = isValidAdminSession();
    if (!valid) {
      clearAdminSession();
      window.location.replace("/");
      return;
    }
    setIsAuthenticated(true);
    setIsChecking(false);
  }, []);

  const handleUnlockPin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pin.trim() === "1997") {
      sessionStorage.setItem("local_admin_auth", "true");
      // Establish local admin session in localStorage
      setAdminSession("local_admin_session", {
        id: "primary",
        name: "Local Admin",
        phone: "919638009880",
        displayPhone: "+91 96380 09880",
      });
      setLocalAuth(true);
      setIsAuthenticated(true);
      window.location.reload();
    } else {
      setPinError("Invalid security PIN. Access denied.");
      setPin("");
    }
  };

  // If local environment and not unlocked with PIN yet: show clean dark PIN entry modal
  if (isLocal && !localAuth) {
    return (
      <main className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#070b14] p-4 text-slate-100">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(249,115,22,0.15),_transparent_60%)] pointer-events-none" />
        <div className="relative w-full max-w-sm rounded-3xl border border-[#263653] bg-[#0f172a] p-7 text-center shadow-2xl shadow-black/80">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-500/30 bg-orange-500/10 text-orange-400 shadow-lg shadow-orange-950/40">
            <LockKeyhole size={28} />
          </div>

          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-orange-400">
            Local Development Admin
          </span>
          <h1 className="mt-1.5 text-xl font-black text-white">Enter Security PIN</h1>
          <p className="mt-1 text-xs text-slate-400">
            Enter the 4-digit PIN to unlock admin on localhost.
          </p>

          <form onSubmit={handleUnlockPin} className="mt-6 space-y-4">
            <div>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                autoFocus
                value={pin}
                onChange={(e) => {
                  setPinError(null);
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                }}
                placeholder="••••"
                aria-label="4-digit PIN"
                className="w-full text-center text-3xl font-mono font-bold tracking-[0.4em] py-3 rounded-2xl border border-slate-700 bg-slate-900/90 text-white placeholder-slate-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition"
              />
            </div>

            {pinError && (
              <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-400">
                <AlertCircle size={14} className="shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-sm py-3 px-4 shadow-lg shadow-orange-950/40 transition active:scale-[0.98] cursor-pointer"
            >
              <span>Unlock</span>
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </main>
    );
  }

  // Direct URL Lockout on production: Never render any admin UI if unauthenticated
  if (isChecking || !isAuthenticated) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#070b14]" />
    );
  }

  return <>{children}</>;
}
