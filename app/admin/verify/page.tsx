"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, ShieldAlert, Loader2, LockKeyhole } from "lucide-react";
import { verifyAndConsumeToken, AdminProfile } from "../../admin-session";

function AdminTokenVerifier() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"verifying" | "success" | "expired">("verifying");
  const [verifiedAdmin, setVerifiedAdmin] = useState<AdminProfile | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(2);
  const hasExecutedRef = useRef(false);

  useEffect(() => {
    if (hasExecutedRef.current) return;
    hasExecutedRef.current = true;

    async function executeVerification() {
      if (!token) {
        setStatus("expired");
        setToastMessage("Link Expired");
        startRedirectToHome();
        return;
      }

      try {
        const result = await verifyAndConsumeToken(token);
        if (result.success) {
          setVerifiedAdmin(result.admin || null);
          setStatus("success");
          setToastMessage(`Welcome, ${result.admin?.name || "Admin"}! Opening panel...`);
          // Redirect cleanly to /admin
          setTimeout(() => {
            router.replace("/admin");
          }, 700);
        } else {
          setStatus("expired");
          setToastMessage(result.error || "Link Expired");
          startRedirectToHome();
        }
      } catch (err) {
        console.error("Verification error:", err);
        setStatus("expired");
        setToastMessage("Link Expired");
        startRedirectToHome();
      }
    }

    function startRedirectToHome() {
      // Redirect to / within 2 seconds
      let remaining = 2;
      const interval = setInterval(() => {
        remaining -= 1;
        if (remaining >= 0) {
          setCountdown(remaining);
        }
        if (remaining <= 0) {
          clearInterval(interval);
          router.replace("/");
        }
      }, 1000);
    }

    executeVerification();
  }, [token, router]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b14] px-4 py-10 text-slate-100">
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(249,115,22,0.18),_transparent_60%)]" />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md border text-sm font-bold transition-all animate-in fade-in slide-in-from-top-4 ${
            status === "success"
              ? "bg-emerald-950/90 text-emerald-200 border-emerald-500/40 shadow-emerald-950/50"
              : status === "expired"
              ? "bg-rose-950/90 text-rose-200 border-rose-500/40 shadow-rose-950/50"
              : "bg-slate-900/90 text-slate-200 border-slate-700 shadow-black/50"
          }`}
        >
          {status === "success" ? (
            <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
          ) : (
            <ShieldAlert size={18} className="text-rose-400 shrink-0" />
          )}
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Center Verification Card */}
      <section className="relative w-full max-w-md rounded-3xl border border-[#263653] bg-gradient-to-b from-[#111c32] to-[#0c1322] p-8 text-center shadow-2xl shadow-black/50">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-500/10 text-orange-300 shadow-lg shadow-orange-950/20">
          {status === "verifying" ? (
            <Loader2 size={30} className="animate-spin text-orange-400" />
          ) : status === "success" ? (
            <ShieldCheck size={32} className="text-emerald-400 animate-in zoom-in-75" />
          ) : (
            <LockKeyhole size={30} className="text-rose-400 animate-in zoom-in-75" />
          )}
        </div>

        <p className="mb-1 text-[11px] font-black uppercase tracking-[0.24em] text-orange-400">
          Jay Vachhraj Store
        </p>
        <h1 className="text-xl sm:text-2xl font-black text-white">
          {status === "verifying" && "Verifying Magic Token"}
          {status === "success" && (verifiedAdmin ? `Welcome, ${verifiedAdmin.name}` : "Access Granted")}
          {status === "expired" && "Link Expired"}
        </h1>

        <p className="mt-3 text-xs sm:text-sm text-slate-400 leading-relaxed">
          {status === "verifying" && "Checking cryptographically signed WhatsApp magic link..."}
          {status === "success" && (
            <>
              Secure session established for <span className="text-emerald-400 font-bold">{verifiedAdmin?.name}</span> ({verifiedAdmin?.displayPhone}). Redirecting to admin dashboard...
            </>
          )}
          {status === "expired" && (
            <>
              This magic link is invalid or has expired (&gt; 5 mins or already used).
              <br />
              <span className="font-semibold text-rose-300 mt-2 block">
                Redirecting to store in {countdown}s...
              </span>
            </>
          )}
        </p>

        {status === "expired" && (
          <button
            type="button"
            onClick={() => router.replace("/")}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-xs font-bold text-slate-200 border border-slate-700 transition"
          >
            Return to Store Immediately
          </button>
        )}
      </section>
    </main>
  );
}

export default function AdminVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="relative flex min-h-screen items-center justify-center bg-[#070b14] text-slate-200">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={28} className="animate-spin text-orange-400" />
            <p className="text-xs font-semibold text-slate-400">Loading verification session...</p>
          </div>
        </div>
      }
    >
      <AdminTokenVerifier />
    </Suspense>
  );
}
