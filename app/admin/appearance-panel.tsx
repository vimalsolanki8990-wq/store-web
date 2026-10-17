"use client";

import type { Dispatch, SetStateAction } from "react";
import type { LucideIcon } from "lucide-react";
import { Megaphone, Package, Palette, Store, Wallet } from "lucide-react";
import {
  applyThemePreset,
  isHexColor,
  storeThemeCssVars,
  THEME_PRESETS,
  type AnimationTheme,
  type AppearanceMode,
  type CardStyle,
  type StoreSettings,
} from "../store-config";

export interface AppearancePreviewProduct {
  name: string;
  price: number;
  originalPrice: number;
  photoUrl: string;
}

interface AppearancePanelProps {
  settings: StoreSettings;
  onChange: Dispatch<SetStateAction<StoreSettings>>;
  previewProduct: AppearancePreviewProduct | null;
}

const MODULES: { id: string; label: string; icon: LucideIcon; gradient: string }[] = [
  { id: "settings-module-store", label: "Store", icon: Store, gradient: "linear-gradient(145deg, #fb923c, #c2410c)" },
  { id: "settings-module-theme", label: "Theme", icon: Palette, gradient: "linear-gradient(145deg, #818cf8, #4f46e5)" },
  { id: "settings-module-announcement", label: "Announcement", icon: Megaphone, gradient: "linear-gradient(145deg, #fbbf24, #d97706)" },
  { id: "settings-module-payments", label: "Payments", icon: Wallet, gradient: "linear-gradient(145deg, #34d399, #047857)" },
  { id: "settings-module-inventory", label: "Inventory", icon: Package, gradient: "linear-gradient(145deg, #38bdf8, #0369a1)" },
];

function ClayIcon({ icon: Icon, gradient }: { icon: LucideIcon; gradient: string }) {
  return (
    <span className="icon-3d" style={{ background: gradient }}>
      <Icon size={18} strokeWidth={2.1} />
    </span>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <label className="glass-panel interactive-lift block space-y-2 p-3 text-xs font-semibold text-slate-200">
      {label}
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={isHexColor(value) ? value : "#000000"}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border border-white/20 bg-transparent p-1"
          aria-label={`${label} swatch`}
        />
        <input
          type="text"
          value={value}
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value.trim();
            if (isHexColor(next) || next === "" || /^#[0-9a-fA-F]{0,6}$/.test(next)) {
              onChange(next.startsWith("#") ? next : `#${next}`);
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-white/20 bg-slate-950/40 px-3 py-2 font-mono text-sm text-white outline-none focus:ring-2 focus:ring-white/30"
          aria-label={`${label} hex`}
        />
      </span>
    </label>
  );
}

export function AppearancePanel({ settings, onChange, previewProduct }: AppearancePanelProps) {
  const updateColor = (key: "primaryColor" | "secondaryColor" | "backgroundColor" | "accentColor", value: string) => {
    if (!isHexColor(value) && value.length !== 7) {
      onChange((current) => ({ ...current, [key]: value, theme: "custom" }));
      return;
    }
    if (!isHexColor(value)) return;
    onChange((current) => ({ ...current, [key]: value.toLowerCase(), theme: "custom" }));
  };

  const previewName = previewProduct?.name || settings.storeName;
  const previewPrice = previewProduct?.price ?? settings.minimumDeliveryOrder;
  const previewOriginal = previewProduct?.originalPrice ?? previewPrice;

  return (
    <section id="settings-module-theme" className="glass-panel scroll-mt-4 space-y-4 p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <ClayIcon icon={Palette} gradient="linear-gradient(145deg, #818cf8, #4f46e5)" />
        <div>
          <h4 className="text-sm font-black text-white">Theme & Appearance</h4>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Live CSS variables for primary, secondary, background, and accent. Changes persist with Store Settings.
          </p>
        </div>
      </header>

      <nav aria-label="Admin modules" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {MODULES.map((module) => (
          <button
            key={module.id}
            type="button"
            onClick={() => document.getElementById(module.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="interactive-lift glass-panel flex min-h-16 flex-col items-center justify-center gap-2 px-2 py-3 text-center"
          >
            <ClayIcon icon={module.icon} gradient={module.gradient} />
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-200">{module.label}</span>
          </button>
        ))}
      </nav>

      <div>
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Preset aesthetics</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Object.entries(THEME_PRESETS).map(([key, preset]) => {
            const selected = settings.theme === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onChange((current) => applyThemePreset(current, key))}
                className={`interactive-lift glass-panel flex items-center gap-3 px-3 py-3 text-left ${selected ? "ring-2 ring-white/70" : ""}`}
                aria-pressed={selected}
              >
                <span className="flex h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/20 shadow-lg" aria-hidden="true">
                  <span className="h-full w-1/2" style={{ background: preset.palette.primary }} />
                  <span className="flex h-full w-1/2 flex-col">
                    <span className="h-1/2" style={{ background: preset.palette.accent }} />
                    <span className="h-1/2" style={{ background: preset.palette.secondary }} />
                  </span>
                </span>
                <span>
                  <span className="block text-xs font-black text-white">{preset.label}</span>
                  <span className="block text-[10px] text-slate-400">
                    {preset.appearance === "light" ? "Light" : "Dark"} · {preset.cardStyle === "flat" ? "Flat Minimal" : "3D Glassy"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <ColorField label="Primary" value={settings.primaryColor} onChange={(value) => updateColor("primaryColor", value)} />
        <ColorField label="Secondary" value={settings.secondaryColor} onChange={(value) => updateColor("secondaryColor", value)} />
        <ColorField label="Background" value={settings.backgroundColor} onChange={(value) => updateColor("backgroundColor", value)} />
        <ColorField label="Accent" value={settings.accentColor} onChange={(value) => updateColor("accentColor", value)} />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="glass-panel block space-y-1.5 p-3 text-xs font-semibold text-slate-300">
          Appearance
          <select
            value={settings.appearance}
            onChange={(event) => onChange((current) => ({ ...current, appearance: event.target.value as AppearanceMode, theme: "custom" }))}
            className="w-full rounded-lg border border-white/20 bg-slate-950/40 px-3 py-2 text-sm text-white"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label className="glass-panel block space-y-1.5 p-3 text-xs font-semibold text-slate-300">
          Animation intensity
          <select
            value={settings.animationTheme}
            onChange={(event) => onChange((current) => ({ ...current, animationTheme: event.target.value as AnimationTheme }))}
            className="w-full rounded-lg border border-white/20 bg-slate-950/40 px-3 py-2 text-sm text-white"
          >
            <option value="subtle">Subtle Luxury</option>
            <option value="vibrant">Vibrant Spring</option>
            <option value="off">Minimal / Off</option>
          </select>
        </label>
        <fieldset className="glass-panel space-y-2 p-3">
          <legend className="text-xs font-semibold text-slate-300">3D card style</legend>
          <div className="grid grid-cols-2 gap-2">
            {([
              ["flat", "Flat Minimal"],
              ["glassy3d", "3D Elevated / Glassy"],
            ] as const satisfies ReadonlyArray<readonly [CardStyle, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onChange((current) => ({ ...current, cardStyle: value }))}
                aria-pressed={settings.cardStyle === value}
                className={`min-h-10 rounded-xl border px-2 py-2 text-[11px] font-bold transition duration-200 ${
                  settings.cardStyle === value
                    ? "border-white/40 bg-white/15 text-white"
                    : "border-white/15 bg-slate-950/30 text-slate-300 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <article
        className={`overflow-hidden rounded-2xl ${settings.cardStyle === "glassy3d" ? "store-card-3d" : "store-card-flat"}`}
        style={storeThemeCssVars(settings)}
        data-card-style={settings.cardStyle}
      >
        <div
          className="px-3 py-2 text-[11px] font-bold text-white"
          style={{ background: `linear-gradient(90deg, ${settings.primaryColor}, ${settings.secondaryColor})` }}
        >
          <span className="inline-flex items-center gap-1.5">
            <Megaphone size={13} />
            {settings.noticeEnabled ? settings.noticeText : "Notice bar is hidden"}
          </span>
        </div>
        <div className="grid gap-3 p-3 sm:grid-cols-[7.5rem_1fr]">
          <div
            className="aspect-[4/3] overflow-hidden rounded-xl border border-white/20 sm:aspect-auto sm:min-h-28"
            style={{ background: `linear-gradient(145deg, ${settings.secondaryColor}, ${settings.primaryColor})` }}
          >
            {previewProduct?.photoUrl ? (
              <img src={previewProduct.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: settings.accentColor }}>
                  Live preview
                </p>
                <h5 className="line-clamp-1 text-sm font-black" style={{ color: "var(--store-foreground)" }}>
                  {previewName}
                </h5>
              </div>
              <span
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-black text-white shadow-lg"
                style={{ background: settings.accentColor }}
              >
                ₹{previewPrice}
                {previewOriginal > previewPrice ? (
                  <del className="ml-1 text-[10px] font-semibold text-white/70">₹{previewOriginal}</del>
                ) : null}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <ClayIcon icon={Store} gradient={`linear-gradient(145deg, ${settings.primaryColor}, ${settings.secondaryColor})`} />
              <ClayIcon icon={Package} gradient={`linear-gradient(145deg, ${settings.accentColor}, ${settings.primaryColor})`} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className="min-h-9 rounded-xl text-[10px] font-black text-white shadow-md" style={{ background: settings.primaryColor }}>
                Default
              </button>
              <button
                type="button"
                className="interactive-lift min-h-9 rounded-xl text-[10px] font-black text-white shadow-md"
                style={{ background: settings.secondaryColor }}
              >
                Hover
              </button>
              <button type="button" disabled className="min-h-9 rounded-xl border border-white/15 text-[10px] font-bold text-slate-400 opacity-60">
                Disabled
              </button>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
