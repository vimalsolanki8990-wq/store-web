export interface StoreCategory {
  id: string;
  name: string;
  icon: string;
}

export interface SocialLink {
  id: string;
  label: string;
  url: string;
  icon: string;
}

export type CardStyle = "flat" | "glassy3d";
export type AnimationTheme = "subtle" | "vibrant" | "off";
export type AppearanceMode = "dark" | "light";

export interface ThemePalette {
  primary: string;
  secondary: string;
  background: string;
  accent: string;
}

export interface ThemePreset {
  label: string;
  appearance: AppearanceMode;
  cardStyle: CardStyle;
  palette: ThemePalette;
}

export interface StoreSettings {
  noticeEnabled: boolean;
  noticeText: string;
  whatsappNumber: string;
  address: string;
  hours: string;
  storeName: string;
  logoMode: "icon" | "image";
  logoUrl: string;
  logoIcon: string;
  categories: StoreCategory[];
  socialLinks: SocialLink[];
  mapLink: string;
  theme: string;
  animationTheme: AnimationTheme;
  appearance: AppearanceMode;
  accentColor: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  cardStyle: CardStyle;
  openingTime: string;
  closingTime: string;
  minimumDeliveryOrder: number;
  upiId: string;
  upiName: string;
  upiQrUrl: string;
  promoEnabled: boolean;
  promoTitle: string;
  promoText: string;
  promoImageUrl: string;
  showInstallBanner: boolean;
  heroTitle: string;
  heroSubtitle: string;
  heroBadge: string;
  heroSubBadge: string;
  heroBtn1Text: string;
  heroBtn2Text: string;
}

export const DEFAULT_CATEGORIES: StoreCategory[] = [
  { id: "કઠોળ-અનાજ", name: "Grains & Pulses", icon: "Wheat" },
  { id: "તેલ-ઘી", name: "Oil & Ghee", icon: "Droplets" },
  { id: "મસાલા", name: "Spices", icon: "Flame" },
  { id: "નાસ્તો-ફરસાણ", name: "Snacks", icon: "Cookie" },
  { id: "પર્સનલ કેર", name: "Personal Care", icon: "Sparkles" },
  { id: "પૂજાપો-અન્ય", name: "Pooja & Others", icon: "Lamp" },
];

const CLEAN_LIGHT_PALETTE: ThemePalette = {
  primary: "#ea580c",
  secondary: "#c2410c",
  background: "#fbf9f5",
  accent: "#f59e0b",
};

const ROYAL_AMBER_PALETTE: ThemePalette = {
  primary: "#f59e0b",
  secondary: "#b45309",
  background: "#070b14",
  accent: "#f59e0b",
};

export function format12Hour(timeStr: string): string {
  if (!timeStr) return "6:00 AM";
  const trimmed = timeStr.trim();
  if (/am|pm/i.test(trimmed)) {
    return trimmed;
  }
  const parts = trimmed.split(":");
  const h = parseInt(parts[0], 10);
  if (isNaN(h)) return trimmed;
  const m = parts[1] ? parseInt(parts[1], 10) : 0;
  const minutePart = isNaN(m) ? "00" : m < 10 ? `0${m}` : `${m}`;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${minutePart} ${period}`;
}

export function parseTimeToMinutes(timeStr: string, defaultMinutes: number): number {
  if (!timeStr) return defaultMinutes;
  const trimmed = timeStr.trim();
  const match12 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = match12[2] ? parseInt(match12[2], 10) : 0;
    const period = match12[3].toLowerCase();
    if (period === "pm" && hours < 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return parseInt(match24[1], 10) * 60 + parseInt(match24[2], 10);
  }
  return defaultMinutes;
}

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  noticeEnabled: false,
  noticeText: "",
  whatsappNumber: "919638009880",
  address: "Zanzmer, Dhoraji, Gujarat",
  hours: "6:00 AM - 9:00 PM",
  storeName: "Jay Vachhraj General Store",
  logoMode: "icon",
  logoUrl: "",
  logoIcon: "Store",
  categories: DEFAULT_CATEGORIES,
  socialLinks: [],
  mapLink: "https://maps.google.com/?q=Zanzmer,Dhoraji,Gujarat",
  theme: "cleanLight",
  animationTheme: "subtle",
  appearance: "light",
  accentColor: CLEAN_LIGHT_PALETTE.accent,
  primaryColor: CLEAN_LIGHT_PALETTE.primary,
  secondaryColor: CLEAN_LIGHT_PALETTE.secondary,
  backgroundColor: CLEAN_LIGHT_PALETTE.background,
  cardStyle: "flat",
  openingTime: "6:00 AM",
  closingTime: "9:00 PM",
  minimumDeliveryOrder: 200,
  upiId: "",
  upiName: "Jay Vachhraj General Store",
  upiQrUrl: "",
  promoEnabled: false,
  promoTitle: "",
  promoText: "",
  promoImageUrl: "",
  showInstallBanner: true,
  heroTitle: "ઘરે બેઠા ઓર્ડર કરો, ફ્રી ડિલિવરી મેળવો",
  heroSubtitle: "Zanzmer અને આસપાસના વિસ્તારોમાં તાજા કરિયાણાની ઝડપી ડિલિવરી. અત્યારે જ ઓર્ડર કરો!",
  heroBadge: "10% OFFER",
  heroSubBadge: "DEAL OF THE DAY",
  heroBtn1Text: "Shop Pure Oil",
  heroBtn2Text: "View Seasonal Spices",
};

export const THEME_PRESETS: Record<string, ThemePreset> = {
  cleanLight: {
    label: "Clean Light",
    appearance: "light",
    cardStyle: "flat",
    palette: CLEAN_LIGHT_PALETTE,
  },
  emeraldGrocery3d: {
    label: "3D Emerald Grocery",
    appearance: "dark",
    cardStyle: "glassy3d",
    palette: { primary: "#10b981", secondary: "#0f766e", background: "#04140f", accent: "#34d399" },
  },
  cyberIndigo: {
    label: "Cyber Indigo",
    appearance: "dark",
    cardStyle: "glassy3d",
    palette: { primary: "#6366f1", secondary: "#7c3aed", background: "#07061a", accent: "#22d3ee" },
  },
  warmClayRetail: {
    label: "Warm Clay Retail",
    appearance: "light",
    cardStyle: "glassy3d",
    palette: { primary: "#c2410c", secondary: "#b45309", background: "#f4ece4", accent: "#ea580c" },
  },
  minimalSlate: {
    label: "Minimal Slate",
    appearance: "light",
    cardStyle: "flat",
    palette: { primary: "#334155", secondary: "#64748b", background: "#f8fafc", accent: "#0f172a" },
  },
  luxuryDark: {
    label: "Luxury Dark Slate",
    appearance: "dark",
    cardStyle: "glassy3d",
    palette: { primary: "#94a3b8", secondary: "#475569", background: "#0b1120", accent: "#cbd5e1" },
  },
  emeraldMarket: {
    label: "Emerald Market",
    appearance: "dark",
    cardStyle: "glassy3d",
    palette: { primary: "#10b981", secondary: "#047857", background: "#06251b", accent: "#34d399" },
  },
  royalAmber: {
    label: "Royal Amber",
    appearance: "dark",
    cardStyle: "glassy3d",
    palette: ROYAL_AMBER_PALETTE,
  },
  deepMidnight: {
    label: "Deep Midnight",
    appearance: "dark",
    cardStyle: "glassy3d",
    palette: { primary: "#6366f1", secondary: "#312e81", background: "#070b14", accent: "#818cf8" },
  },
  diwali: {
    label: "Diwali",
    appearance: "dark",
    cardStyle: "glassy3d",
    palette: { primary: "#f59e0b", secondary: "#b91c1c", background: "#1a0b05", accent: "#fbbf24" },
  },
  navratri: {
    label: "Navratri",
    appearance: "dark",
    cardStyle: "glassy3d",
    palette: { primary: "#d946ef", secondary: "#7c3aed", background: "#14061c", accent: "#f0abfc" },
  },
  holi: {
    label: "Holi",
    appearance: "light",
    cardStyle: "glassy3d",
    palette: { primary: "#ec4899", secondary: "#22c55e", background: "#fff7ed", accent: "#f97316" },
  },
  eid: {
    label: "Eid",
    appearance: "dark",
    cardStyle: "glassy3d",
    palette: { primary: "#14b8a6", secondary: "#0f766e", background: "#041411", accent: "#5eead4" },
  },
  custom: {
    label: "Custom palette",
    appearance: "dark",
    cardStyle: "glassy3d",
    palette: ROYAL_AMBER_PALETTE,
  },
};

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function parseHexColor(value: unknown, fallback: string): string {
  const text = String(value ?? "");
  return isHexColor(text) ? text.toLowerCase() : fallback;
}

function parseCardStyle(value: unknown): CardStyle {
  return value === "flat" ? "flat" : "glassy3d";
}

function parseAnimationTheme(value: unknown): AnimationTheme {
  return value === "subtle" || value === "off" || value === "vibrant" ? value : DEFAULT_STORE_SETTINGS.animationTheme;
}

export function applyThemePreset(current: StoreSettings, presetKey: string): StoreSettings {
  if (presetKey === "custom") {
    return { ...current, theme: "custom" };
  }
  const preset = THEME_PRESETS[presetKey];
  if (!preset) return current;
  return {
    ...current,
    theme: presetKey,
    appearance: preset.appearance,
    cardStyle: preset.cardStyle,
    primaryColor: preset.palette.primary,
    secondaryColor: preset.palette.secondary,
    backgroundColor: preset.palette.background,
    accentColor: preset.palette.accent,
  };
}

export function storeThemeCssVars(settings: StoreSettings): Record<string, string> {
  const primary = settings.primaryColor || "#ea580c";
  const secondary = settings.secondaryColor || "#c2410c";
  const bg = settings.backgroundColor || "#fbf9f5";
  const accent = settings.accentColor || "#f59e0b";
  return {
    "--primary": primary,
    "--secondary": secondary,
    "--background": bg,
    "--accent": accent,
    "--store-primary": primary,
    "--store-secondary": secondary,
    "--store-background": bg,
    "--store-accent": accent,
    "--store-foreground": "#0f172a",
    "--store-surface": "#ffffff",
  };
}

export function sanitizeWhatsAppNumber(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return DEFAULT_STORE_SETTINGS.whatsappNumber;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.startsWith("91")) return digits.slice(0, 12);
  return `91${digits.slice(0, 10)}`;
}

export function normalizeStoreSettings(data: Record<string, unknown> = {}): StoreSettings {
  const rawNoticeText = String(data.noticeText ?? "");
  const isTestNotice = /test mode/i.test(rawNoticeText);
  const openingTime = String(data.openingTime ?? DEFAULT_STORE_SETTINGS.openingTime);
  const closingTime = String(data.closingTime ?? DEFAULT_STORE_SETTINGS.closingTime);
  const derivedHours = `${format12Hour(openingTime)} - ${format12Hour(closingTime)}`;

  return {
    ...DEFAULT_STORE_SETTINGS,
    ...data,
    noticeEnabled: data.noticeEnabled === true && !isTestNotice,
    noticeText: isTestNotice ? "" : rawNoticeText,
    whatsappNumber: sanitizeWhatsAppNumber(data.whatsappNumber),
    address: String(data.address ?? DEFAULT_STORE_SETTINGS.address),
    hours: String(data.hours ?? derivedHours),
    storeName: String(data.storeName ?? DEFAULT_STORE_SETTINGS.storeName),
    logoMode: data.logoMode === "image" ? "image" : "icon",
    logoUrl: String(data.logoUrl ?? ""),
    logoIcon: String(data.logoIcon ?? "Store"),
    categories: Array.isArray(data.categories)
      ? data.categories.filter((item): item is StoreCategory => Boolean(item && typeof item === "object" && "id" in item && "name" in item))
      : DEFAULT_CATEGORIES,
    socialLinks: Array.isArray(data.socialLinks)
      ? data.socialLinks.filter((item): item is SocialLink => Boolean(item && typeof item === "object" && "url" in item))
      : [],
    mapLink: String(data.mapLink ?? DEFAULT_STORE_SETTINGS.mapLink),
    theme: "cleanLight",
    animationTheme: parseAnimationTheme(data.animationTheme),
    appearance: "light",
    accentColor: parseHexColor(data.accentColor, CLEAN_LIGHT_PALETTE.accent),
    primaryColor: parseHexColor(data.primaryColor, CLEAN_LIGHT_PALETTE.primary),
    secondaryColor: parseHexColor(data.secondaryColor, CLEAN_LIGHT_PALETTE.secondary),
    backgroundColor: parseHexColor(data.backgroundColor, CLEAN_LIGHT_PALETTE.background),
    cardStyle: "flat",
    openingTime,
    closingTime,
    minimumDeliveryOrder: Math.max(0, Number(data.minimumDeliveryOrder ?? DEFAULT_STORE_SETTINGS.minimumDeliveryOrder) || 0),
    upiId: String(data.upiId ?? ""),
    upiName: String(data.upiName ?? data.storeName ?? DEFAULT_STORE_SETTINGS.upiName),
    upiQrUrl: String(data.upiQrUrl ?? ""),
    promoEnabled: data.promoEnabled === true,
    promoTitle: String(data.promoTitle ?? ""),
    promoText: String(data.promoText ?? ""),
    promoImageUrl: String(data.promoImageUrl ?? ""),
    showInstallBanner: data.showInstallBanner !== false,
    heroTitle: String(data.heroTitle ?? DEFAULT_STORE_SETTINGS.heroTitle),
    heroSubtitle: String(data.heroSubtitle ?? DEFAULT_STORE_SETTINGS.heroSubtitle),
    heroBadge: String(data.heroBadge ?? DEFAULT_STORE_SETTINGS.heroBadge),
    heroSubBadge: String(data.heroSubBadge ?? DEFAULT_STORE_SETTINGS.heroSubBadge),
    heroBtn1Text: String(data.heroBtn1Text ?? DEFAULT_STORE_SETTINGS.heroBtn1Text),
    heroBtn2Text: String(data.heroBtn2Text ?? DEFAULT_STORE_SETTINGS.heroBtn2Text),
  };
}
