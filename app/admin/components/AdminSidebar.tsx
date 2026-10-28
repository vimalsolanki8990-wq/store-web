"use client";

import React from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Image as ImageIcon,
  Package,
  ShoppingCart,
  Settings,
  ExternalLink,
  LogOut,
  Clock,
  Store,
  X,
  AlertTriangle
} from "lucide-react";
import { StoreSettings, parseTimeToMinutes } from "../../store-config";
import { formatSessionRemaining } from "../../admin-session";

export type AdminTab = "dashboard" | "banners" | "products" | "orders" | "settings";

interface AdminSidebarProps {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  storeSettings: StoreSettings;
  productsCount: number;
  lowStockCount: number;
  bannersCount: number;
  ordersCount: number;
  sessionRemainingSeconds: number;
  onLogout: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  isStoreOpen?: boolean;
}

export default function AdminSidebar({
  activeTab,
  setActiveTab,
  storeSettings,
  productsCount,
  lowStockCount,
  bannersCount,
  ordersCount,
  sessionRemainingSeconds,
  onLogout,
  isMobileOpen = false,
  onCloseMobile,
  isStoreOpen: isStoreOpenProp,
}: AdminSidebarProps) {
  const menuItems: { id: AdminTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; badge?: number | string; badgeColor?: string }[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
    },
    {
      id: "banners",
      label: "Manage Banners",
      icon: ImageIcon,
      badge: bannersCount > 0 ? bannersCount : undefined,
      badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    },
    {
      id: "products",
      label: "All Products",
      icon: Package,
      badge: productsCount > 0 ? productsCount : undefined,
      badgeColor: "bg-slate-700/60 text-slate-300 border-slate-600/40",
    },
    {
      id: "orders",
      label: "Orders & CSV",
      icon: ShoppingCart,
      badge: ordersCount > 0 ? ordersCount : undefined,
      badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    },
    {
      id: "settings",
      label: "Store Settings",
      icon: Settings,
    },
  ];

  // Fallback State: Initialize the timer state string explicitly as "00h 59m" so it never flashes 24 hours on load
  const [timerDisplay, setTimerDisplay] = React.useState<string>("00h 59m");
  const [isTimerUrgent, setIsTimerUrgent] = React.useState<boolean>(false);
  const [isTimerWarning, setIsTimerWarning] = React.useState<boolean>(false);

  // Read remaining time from admin_magic_session and force-clear old 24-hour tokens
  React.useEffect(() => {
    const updateTimerFromMagicSession = () => {
      if (typeof window === "undefined") return;

      let remainingSec = 3599;

      // 1. Read from admin_magic_session (primary session record)
      try {
        const raw = localStorage.getItem("admin_magic_session");
        if (raw) {
          const sess = JSON.parse(raw);
          if (sess && sess.expiresAt) {
            const diffMs = sess.expiresAt - Date.now();
            // Old 24-hour token detected (> 1 hour remaining): force cap to 1 hour
            if (diffMs > 3600000) {
              sess.expiresAt = Date.now() + 3600000;
              localStorage.setItem("admin_magic_session", JSON.stringify(sess));
              localStorage.setItem("adminSessionExpiry", sess.expiresAt.toString());
              remainingSec = 3599;
            } else {
              remainingSec = Math.max(0, Math.floor(diffMs / 1000));
            }
          }
        }
      } catch {}

      // 2. Also clean any old admin_magic_token_ items in localStorage
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("admin_magic_token_")) {
            const tokenRaw = localStorage.getItem(key);
            if (tokenRaw) {
              const tokenRecord = JSON.parse(tokenRaw);
              if (tokenRecord && tokenRecord.expiresAt && tokenRecord.expiresAt - Date.now() > 3600000) {
                tokenRecord.expiresAt = Date.now() + 3600000;
                localStorage.setItem(key, JSON.stringify(tokenRecord));
              }
            }
          }
        }
      } catch {}

      // 3. Check adminSessionExpiry if present
      const savedExpiry = localStorage.getItem("adminSessionExpiry");
      if (savedExpiry) {
        const diffMs = parseInt(savedExpiry, 10) - Date.now();
        if (diffMs > 3600000) {
          localStorage.setItem("adminSessionExpiry", (Date.now() + 3600000).toString());
          remainingSec = 3599;
        } else {
          remainingSec = Math.min(remainingSec, Math.max(0, Math.floor(diffMs / 1000)));
        }
      }

      // Hard clamp to 1 hour (3599 seconds = 00h 59m)
      const clamped = Math.min(3599, Math.max(0, remainingSec));
      const hours = Math.floor(clamped / 3600);
      const minutes = Math.floor((clamped % 3600) / 60);
      setTimerDisplay(`${hours.toString().padStart(2, "0")}h ${minutes.toString().padStart(2, "0")}m`);
      setIsTimerUrgent(clamped <= 300);
      setIsTimerWarning(clamped <= 1800);
    };

    updateTimerFromMagicSession();
    const interval = setInterval(updateTimerFromMagicSession, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSelect = (tab: AdminTab) => {
    setActiveTab(tab);
    if (onCloseMobile) onCloseMobile();
  };

  // Determine open/closed status from time settings
  let isStoreOpen = isStoreOpenProp ?? true;
  if (isStoreOpenProp === undefined && storeSettings.openingTime && storeSettings.closingTime) {
    try {
      const indiaTimeParts = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
      const currentMinutes = Number(indiaTimeParts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(indiaTimeParts.find((part) => part.type === "minute")?.value ?? 0);
      const openingMinutes = parseTimeToMinutes(storeSettings.openingTime, 360);
      const closingMinutes = parseTimeToMinutes(storeSettings.closingTime, 1260);
      isStoreOpen = openingMinutes <= closingMinutes
        ? currentMinutes >= openingMinutes && currentMinutes < closingMinutes
        : currentMinutes >= openingMinutes || currentMinutes < closingMinutes;
    } catch {
      isStoreOpen = true;
    }
  }

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          role="presentation"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs lg:hidden animate-in fade-in duration-200"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col justify-between border-r border-slate-800 bg-[#0f172a] text-slate-200 transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Upper Portion: Header & Navigation */}
        <div className="flex flex-col flex-1 overflow-y-auto no-scrollbar">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-800/80 p-5">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-700/60 shadow-lg text-white"
                style={{
                  background:
                    storeSettings.logoMode === "image" && storeSettings.logoUrl
                      ? "transparent"
                      : storeSettings.accentColor || "#ea580c",
                }}
              >
                {storeSettings.logoMode === "image" && storeSettings.logoUrl ? (
                  <img
                    src={storeSettings.logoUrl}
                    alt={storeSettings.storeName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Store size={22} className="text-white drop-shadow-sm" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-sm font-bold text-white tracking-tight">
                  Jay Vachhraj General Store
                </h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-slate-400">Zanzmer</span>
                  <span className="text-slate-600">•</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                      isStoreOpen
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isStoreOpen ? "bg-emerald-400 animate-pulse" : "bg-rose-400"
                      }`}
                    />
                    {isStoreOpen ? "Open" : "Closed"}
                  </span>
                </div>
              </div>
            </div>

            {/* Close Button on Mobile */}
            <button
              type="button"
              onClick={onCloseMobile}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden transition"
              aria-label="Close Sidebar"
            >
              <X size={18} />
            </button>
          </div>

          {/* Navigation Menu */}
          <nav className="flex-1 px-3 py-5 space-y-1.5" aria-label="Admin Navigation">
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Management Menu
            </p>

            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`group relative flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-xs font-semibold transition-all duration-150 cursor-pointer ${
                    isActive
                      ? "bg-[#1e293b] text-blue-400 border-l-4 border-blue-500 font-bold shadow-sm"
                      : "text-slate-300 hover:bg-[#1e293b]/50 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      size={18}
                      className={`transition-colors ${
                        isActive ? "text-blue-400" : "text-slate-400 group-hover:text-slate-200"
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>

                  {item.badge !== undefined && (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-mono font-bold ${
                        item.badgeColor || "bg-slate-800 text-slate-300 border-slate-700"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Low Stock Quick Warning Pill */}
          {lowStockCount > 0 && (
            <div className="mx-3 my-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <AlertTriangle size={15} />
                <span>Low Stock Alert</span>
              </div>
              <p className="mt-1 text-[11px] text-amber-200/80">
                {lowStockCount} {lowStockCount === 1 ? "item needs" : "items need"} attention.
              </p>
              <button
                type="button"
                onClick={() => handleSelect("products")}
                className="mt-2 inline-flex items-center text-[10px] font-bold text-amber-400 hover:underline"
              >
                View in Products →
              </button>
            </div>
          )}
        </div>

        {/* Lower Portion: Store Link, Session Info, Logout */}
        <div className="border-t border-slate-800/80 bg-[#0a101d] p-4 space-y-3">
          {/* Session Timer */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#0f172a] px-3 py-2 text-[11px]">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Clock size={12} className={isTimerUrgent ? "text-rose-400 animate-spin" : "text-emerald-400"} />
              Session:
            </span>
            <span
              className={`font-mono font-bold ${
                isTimerUrgent
                  ? "text-rose-400 animate-pulse"
                  : isTimerWarning
                  ? "text-amber-400"
                  : "text-emerald-400"
              }`}
            >
              {timerDisplay}
            </span>
          </div>

          {/* View Live Storefront */}
          <Link
            href="/"
            target="_blank"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700/60 bg-[#152036] px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-[#1e2d4a] hover:text-white shadow-xs"
          >
            <ExternalLink size={14} className="text-orange-400" />
            <span>View Live Storefront</span>
          </Link>

          {/* Logout Button */}
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 transition hover:bg-rose-500/20 hover:text-rose-200"
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
