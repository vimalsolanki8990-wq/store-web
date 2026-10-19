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

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  noticeEnabled: true,
  noticeText: "Fresh seasonal spices and pure groundnut oil are now available!",
  whatsappNumber: "919876543210",
  address: "Zanzmer, Dhoraji, Gujarat",
  hours: "7:00 AM - 10:00 PM",
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
  openingTime: "06:00",
  closingTime: "21:00",
  minimumDeliveryOrder: 200,
  upiId: "",
  upiName: "Jay Vachhraj General Store",
  upiQrUrl: "",
  promoEnabled: false,
  promoTitle: "",
  promoText: "",
  promoImageUrl: "",
  showInstallBanner: true,
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
  const isDark = settings.appearance === "dark";
  return {
    "--primary": settings.primaryColor || "#ea580c",
    "--secondary": settings.secondaryColor || "#c2410c",
    "--background": isDark ? (settings.backgroundColor || "#070b14") : "#fbf9f5",
    "--accent": settings.accentColor || "#f59e0b",
    "--store-primary": settings.primaryColor || "#ea580c",
    "--store-secondary": settings.secondaryColor || "#c2410c",
    "--store-background": isDark ? (settings.backgroundColor || "#070b14") : "#fbf9f5",
    "--store-accent": settings.accentColor || "#f59e0b",
    "--store-foreground": isDark ? "#f8fafc" : "#0f172a",
    "--store-surface": isDark ? "#111c32" : "#ffffff",
  };
}

export function normalizeStoreSettings(data: Record<string, unknown> = {}): StoreSettings {
  const preset = THEME_PRESETS[String(data.theme ?? DEFAULT_STORE_SETTINGS.theme)];
  const fallbackPalette = preset?.palette ?? CLEAN_LIGHT_PALETTE;
  const accentColor = parseHexColor(data.accentColor, fallbackPalette.accent);

  return {
    ...DEFAULT_STORE_SETTINGS,
    ...data,
    noticeEnabled: data.noticeEnabled !== false,
    noticeText: String(data.noticeText ?? DEFAULT_STORE_SETTINGS.noticeText),
    whatsappNumber: String(data.whatsappNumber ?? DEFAULT_STORE_SETTINGS.whatsappNumber),
    address: String(data.address ?? DEFAULT_STORE_SETTINGS.address),
    hours: String(data.hours ?? DEFAULT_STORE_SETTINGS.hours),
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
    theme: String(data.theme ?? DEFAULT_STORE_SETTINGS.theme),
    animationTheme: parseAnimationTheme(data.animationTheme),
    appearance: data.appearance === "dark" ? "dark" : "light",
    accentColor,
    primaryColor: parseHexColor(data.primaryColor, data.theme === "custom" ? accentColor : fallbackPalette.primary),
    secondaryColor: parseHexColor(data.secondaryColor, fallbackPalette.secondary),
    backgroundColor: parseHexColor(data.backgroundColor, fallbackPalette.background),
    cardStyle: parseCardStyle(data.cardStyle),
    openingTime: String(data.openingTime ?? DEFAULT_STORE_SETTINGS.openingTime),
    closingTime: String(data.closingTime ?? DEFAULT_STORE_SETTINGS.closingTime),
    minimumDeliveryOrder: Math.max(0, Number(data.minimumDeliveryOrder ?? DEFAULT_STORE_SETTINGS.minimumDeliveryOrder) || 0),
    upiId: String(data.upiId ?? ""),
    upiName: String(data.upiName ?? data.storeName ?? DEFAULT_STORE_SETTINGS.upiName),
    upiQrUrl: String(data.upiQrUrl ?? ""),
    promoEnabled: data.promoEnabled === true,
    promoTitle: String(data.promoTitle ?? ""),
    promoText: String(data.promoText ?? ""),
    promoImageUrl: String(data.promoImageUrl ?? ""),
    showInstallBanner: data.showInstallBanner !== false,
  };
}
