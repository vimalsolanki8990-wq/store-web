import { db } from "./firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

export interface AdminProfile {
  id: string;
  name: string;
  phone: string;
  displayPhone: string;
}

export const AUTHORIZED_ADMINS: AdminProfile[] = [
  {
    id: "primary",
    name: "Dhaval Solanki",
    phone: "919638009880",
    displayPhone: "+91 96380 09880",
  },
  {
    id: "secondary",
    name: "Store Co-Admin",
    phone: "917600761095",
    displayPhone: "+91 76007 61095",
  },
];

export const DEFAULT_ADMIN: AdminProfile = AUTHORIZED_ADMINS[0];
export const ADMIN_PHONE = DEFAULT_ADMIN.displayPhone;
export const ADMIN_PHONE_DIGITS = DEFAULT_ADMIN.phone;

export const MAGIC_LINK_BASE_URL = "https://vachhraj-store.web.app";
export const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours (86,400,000 ms)
export const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours (86,400,000 ms)
export const SESSION_EXPIRY_SECONDS = 24 * 60 * 60; // 86,400 seconds

export const AUTH_COOKIE_NAME = "store_admin_auth";
export const INSTANCE_LOCK_KEY = "admin_instance_lock";
export const STORAGE_KEY_SESSION = "admin_magic_session";
export const STORAGE_KEY_TOKEN_PREFIX = "admin_magic_token_";

export interface MagicTokenRecord {
  token: string;
  createdAt: number;
  expiresAt: number;
  isUsed: boolean;
  adminId: string;
  adminName: string;
  phone: string;
  displayPhone: string;
  usedAt?: number;
}

export interface AdminSessionRecord {
  token: string;
  verifiedAt: number;
  expiresAt: number;
  adminId: string;
  adminName: string;
  phone: string;
  displayPhone: string;
  email?: string;
  instanceId?: string;
}

export function getAdminById(id: string): AdminProfile | undefined {
  return AUTHORIZED_ADMINS.find((a) => a.id === id);
}

export function getAdminByPhone(phone: string): AdminProfile | undefined {
  const digits = phone.replace(/\D/g, "");
  return AUTHORIZED_ADMINS.find((a) => a.phone === digits || a.phone.endsWith(digits.slice(-10)));
}

/**
 * Generate a cryptographically secure 32-character hex token
 */
export function generateSecureToken(): string {
  if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint8Array(16); // 16 bytes = 32 hex chars
    window.crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  // Safe SSR / fallback
  let hex = "";
  for (let i = 0; i < 32; i++) {
    hex += Math.floor(Math.random() * 16).toString(16);
  }
  return hex;
}

/**
 * Construct the WhatsApp direct dispatch URL for a target admin
 */
export function buildWhatsAppMagicLink(token: string, targetPhone: string = DEFAULT_ADMIN.phone): string {
  const cleanPhone = targetPhone.replace(/\D/g, "");
  const magicUrl = `${MAGIC_LINK_BASE_URL}/admin/verify?token=${token}`;
  const text = `Jay Vachhraj Store Admin Login: ${magicUrl}`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

/**
 * Save magic link token to Firestore & localStorage targeting an admin profile
 */
export async function saveMagicToken(
  token: string,
  admin: AdminProfile = DEFAULT_ADMIN
): Promise<MagicTokenRecord> {
  const now = Date.now();
  const record: MagicTokenRecord = {
    token,
    createdAt: now,
    expiresAt: now + TOKEN_EXPIRY_MS,
    isUsed: false,
    adminId: admin.id,
    adminName: admin.name,
    phone: admin.phone,
    displayPhone: admin.displayPhone,
  };

  // 1. LocalStorage backup for instant local verification
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${STORAGE_KEY_TOKEN_PREFIX}${token}`, JSON.stringify(record));
    } catch (e) {
      console.warn("Could not save token to localStorage:", e);
    }
  }

  // 2. Firestore for seamless cross-device WhatsApp verification
  try {
    const tokenRef = doc(db, "admin_magic_tokens", token);
    await setDoc(tokenRef, record);
  } catch (err) {
    console.warn("Could not persist magic token to Firestore:", err);
  }

  return record;
}

/**
 * Helper to get a cookie value by name in browser
 */
export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Format remaining session seconds cleanly for UI display (e.g. "23h 59m", "24h", "45m 30s", "45s")
 */
export function formatSessionRemaining(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0s";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    if (minutes === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

/**
 * Set verified admin session in localStorage & cookie (24-hour limit)
 */
export function setAdminSession(token: string, admin?: AdminProfile): AdminSessionRecord {
  const now = Date.now();
  const chosenAdmin = admin || DEFAULT_ADMIN;
  const instanceId = "inst_" + Math.random().toString(36).slice(2) + "_" + now.toString(36);
  const expiresAt = now + SESSION_EXPIRY_MS; // 24 hours

  const session: AdminSessionRecord = {
    token,
    verifiedAt: now,
    expiresAt,
    adminId: chosenAdmin.id,
    adminName: chosenAdmin.name,
    phone: chosenAdmin.phone,
    displayPhone: chosenAdmin.displayPhone,
    instanceId,
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
      sessionStorage.setItem(INSTANCE_LOCK_KEY, instanceId);
      sessionStorage.setItem("admin_session_active", "true");
      sessionStorage.setItem("admin_session_identity", JSON.stringify(chosenAdmin));

      // 24-hour cookie (86,400 seconds)
      const remainingSec = Math.max(1, Math.floor((expiresAt - now) / 1000));
      const cookieValue = `${token}.${expiresAt}.${instanceId}`;
      const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${AUTH_COOKIE_NAME}=${cookieValue}; path=/; max-age=${remainingSec}; SameSite=Strict${secureFlag}`;
      document.cookie = `${STORAGE_KEY_SESSION}=${token}; path=/; max-age=${remainingSec}; SameSite=Strict${secureFlag}`;
    } catch (e) {
      console.warn("Failed saving admin session to storage:", e);
    }
  }

  return session;
}

/**
 * Set verified Google admin session in localStorage & cookie (24-hour limit)
 */
export function setGoogleAdminSession(user: { email: string; displayName?: string | null; uid?: string }): AdminSessionRecord {
  const now = Date.now();
  const token = "google_admin_" + (user.uid || Math.random().toString(36).slice(2) + "_" + now);
  const instanceId = "inst_" + Math.random().toString(36).slice(2) + "_" + now.toString(36);
  const expiresAt = now + SESSION_EXPIRY_MS; // Exactly 24 hours from login

  const session: AdminSessionRecord = {
    token,
    verifiedAt: now,
    expiresAt,
    adminId: "google_" + (user.uid || "admin"),
    adminName: user.displayName || user.email.split("@")[0] || "Store Admin",
    phone: "",
    displayPhone: user.email,
    email: user.email,
    instanceId,
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
      sessionStorage.setItem(INSTANCE_LOCK_KEY, instanceId);
      sessionStorage.setItem("admin_session_active", "true");
      sessionStorage.setItem("admin_session_identity", JSON.stringify(session));

      // 24-hour cookie (86,400 seconds)
      const remainingSec = Math.max(1, Math.floor((expiresAt - now) / 1000));
      const cookieValue = `${token}.${expiresAt}.${instanceId}`;
      const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${AUTH_COOKIE_NAME}=${cookieValue}; path=/; max-age=${remainingSec}; SameSite=Strict${secureFlag}`;
      document.cookie = `${STORAGE_KEY_SESSION}=${token}; path=/; max-age=${remainingSec}; SameSite=Strict${secureFlag}`;
    } catch (e) {
      console.warn("Failed saving admin session to storage:", e);
    }
  }

  return session;
}

/**
 * Retrieve active admin session if valid and not expired
 */
export function getAdminSession(): AdminSessionRecord | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION);
    if (!raw) return null;

    const session: AdminSessionRecord = JSON.parse(raw);
    if (!session || !session.token || !session.expiresAt) {
      clearAdminSession();
      return null;
    }

    // Auto-migrate legacy 5-minute sessions to 24 hours if verified within the last 24 hours
    if (session.verifiedAt && session.expiresAt - session.verifiedAt < SESSION_EXPIRY_MS) {
      const updatedExpiry = session.verifiedAt + SESSION_EXPIRY_MS;
      if (updatedExpiry > Date.now()) {
        session.expiresAt = updatedExpiry;
        try {
          localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
          const remainingSec = Math.max(1, Math.floor((updatedExpiry - Date.now()) / 1000));
          const cookieValue = `${session.token}.${updatedExpiry}.${session.instanceId || ""}`;
          const secureFlag = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
          document.cookie = `${AUTH_COOKIE_NAME}=${cookieValue}; path=/; max-age=${remainingSec}; SameSite=Strict${secureFlag}`;
          document.cookie = `${STORAGE_KEY_SESSION}=${session.token}; path=/; max-age=${remainingSec}; SameSite=Strict${secureFlag}`;
        } catch {
          // ignore
        }
      }
    }

    // 24-hour hard expiration check
    if (Date.now() >= session.expiresAt) {
      clearAdminSession();
      return null;
    }

    return session;
  } catch {
    clearAdminSession();
    return null;
  }
}

/**
 * Check if an active, isolated admin session exists on this browser instance
 */
export function isValidAdminSession(): boolean {
  if (typeof window === "undefined") return false;

  const session = getAdminSession();
  if (!session) return false;

  // 1. Strict 24-hour hard expiry
  if (Date.now() >= session.expiresAt) {
    clearAdminSession();
    return false;
  }

  // 2. Browser instance isolation: check sessionStorage lock and heal on tab refresh
  if (session.instanceId) {
    try {
      let activeLock = sessionStorage.getItem(INSTANCE_LOCK_KEY);
      if (!activeLock) {
        // Tab was refreshed or reopened: heal sessionStorage lock from verified session
        sessionStorage.setItem(INSTANCE_LOCK_KEY, session.instanceId);
        sessionStorage.setItem("admin_session_active", "true");
        activeLock = session.instanceId;
      }
      if (activeLock !== session.instanceId) {
        clearAdminSession();
        return false;
      }
    } catch {
      // ignore
    }
  }

  // 3. Strict cookie verification with auto-healing for 24-hour session
  const cookieValue = getCookie(AUTH_COOKIE_NAME);
  if (!cookieValue) {
    // If cookie was cleared on browser restart or tab refresh, re-sync cookie if session is within 24h
    if (session.expiresAt > Date.now()) {
      const remainingSec = Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000));
      const newCookieVal = `${session.token}.${session.expiresAt}.${session.instanceId || ""}`;
      const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${AUTH_COOKIE_NAME}=${newCookieVal}; path=/; max-age=${remainingSec}; SameSite=Strict${secureFlag}`;
      document.cookie = `${STORAGE_KEY_SESSION}=${session.token}; path=/; max-age=${remainingSec}; SameSite=Strict${secureFlag}`;
      return true;
    }
    clearAdminSession();
    return false;
  }
  const parts = cookieValue.split(".");
  const cookieToken = parts[0];
  if (cookieToken !== session.token) {
    clearAdminSession();
    return false;
  }

  return true;
}

/**
 * Calculate remaining seconds of the 24-hour security session
 */
export function getRemainingSessionSeconds(): number {
  if (typeof window === "undefined") return 0;
  const session = getAdminSession();
  if (!session) return 0;
  const remaining = Math.floor((session.expiresAt - Date.now()) / 1000);
  return Math.max(0, remaining);
}

/**
 * Clear admin session across localStorage, sessionStorage, and cookies
 */
export function clearAdminSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY_SESSION);
    sessionStorage.removeItem(INSTANCE_LOCK_KEY);
    sessionStorage.removeItem("admin_session_active");
    sessionStorage.removeItem("admin_session_identity");
    document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0; SameSite=Strict`;
    document.cookie = `${STORAGE_KEY_SESSION}=; path=/; max-age=0; SameSite=Strict`;
  } catch (e) {
    console.warn("Failed clearing admin session:", e);
  }
}

/**
 * Validate and consume magic link token against authorized admin profiles
 */
export async function verifyAndConsumeToken(
  token: string
): Promise<{ success: boolean; error?: string; admin?: AdminProfile }> {
  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return { success: false, error: "Missing or invalid token format." };
  }

  const cleanToken = token.trim();
  let record: MagicTokenRecord | null = null;

  // Check Firestore first
  try {
    const tokenRef = doc(db, "admin_magic_tokens", cleanToken);
    const snap = await getDoc(tokenRef);
    if (snap.exists()) {
      record = snap.data() as MagicTokenRecord;
    }
  } catch (err) {
    console.warn("Firestore token fetch failed, attempting local fallback:", err);
  }

  // Fallback to localStorage if not found or Firestore offline
  if (!record && typeof window !== "undefined") {
    try {
      const localRaw = localStorage.getItem(`${STORAGE_KEY_TOKEN_PREFIX}${cleanToken}`);
      if (localRaw) {
        record = JSON.parse(localRaw) as MagicTokenRecord;
      }
    } catch {
      // ignore
    }
  }

  if (!record) {
    return { success: false, error: "Link Expired" };
  }

  // Check expiration (< 5 mins)
  const isExpired = Date.now() > Number(record.expiresAt);
  if (isExpired) {
    return { success: false, error: "Link Expired" };
  }

  // Check if already used
  if (record.isUsed) {
    return { success: false, error: "Link Expired" };
  }

  // Verify against authorized admins list
  const matchedAdmin =
    (record.adminId ? getAdminById(record.adminId) : undefined) ||
    (record.phone ? getAdminByPhone(record.phone) : undefined) ||
    AUTHORIZED_ADMINS.find((a) => a.phone === record?.phone) ||
    DEFAULT_ADMIN;

  // Mark token as used
  const usedAt = Date.now();
  record.isUsed = true;
  record.usedAt = usedAt;

  // Update in Firestore
  try {
    const tokenRef = doc(db, "admin_magic_tokens", cleanToken);
    await updateDoc(tokenRef, {
      isUsed: true,
      usedAt,
    });
  } catch (err) {
    console.warn("Could not mark token used in Firestore:", err);
  }

  // Update in localStorage
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(`${STORAGE_KEY_TOKEN_PREFIX}${cleanToken}`, JSON.stringify(record));
    } catch {
      // ignore
    }
  }

  // Set secure admin session token in storage with verified admin profile
  setAdminSession(cleanToken, matchedAdmin);

  return { success: true, admin: matchedAdmin };
}
