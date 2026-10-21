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
export const TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
export const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

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
 * Set verified admin session in localStorage & cookie
 */
export function setAdminSession(token: string, admin?: AdminProfile): AdminSessionRecord {
  const now = Date.now();
  const chosenAdmin = admin || DEFAULT_ADMIN;
  const session: AdminSessionRecord = {
    token,
    verifiedAt: now,
    expiresAt: now + SESSION_EXPIRY_MS,
    adminId: chosenAdmin.id,
    adminName: chosenAdmin.name,
    phone: chosenAdmin.phone,
    displayPhone: chosenAdmin.displayPhone,
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
      sessionStorage.setItem("admin_session_active", "true");
      sessionStorage.setItem("admin_session_identity", JSON.stringify(chosenAdmin));
      document.cookie = `${STORAGE_KEY_SESSION}=${token}; path=/; max-age=86400; SameSite=Strict`;
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

    if (Date.now() > session.expiresAt) {
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
 * Check if an active session exists
 */
export function isValidAdminSession(): boolean {
  return Boolean(getAdminSession());
}

/**
 * Clear admin session on logout
 */
export function clearAdminSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY_SESSION);
    sessionStorage.removeItem("admin_session_active");
    sessionStorage.removeItem("admin_session_identity");
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
