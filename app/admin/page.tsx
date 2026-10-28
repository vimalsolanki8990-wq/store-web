"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { db, auth, googleProvider } from "../firebase";
import { isAdminEmail } from "../admin-config";
import { isValidAdminSession, clearAdminSession, getAdminSession, setGoogleAdminSession, getRemainingSessionSeconds, formatSessionRemaining, ADMIN_PHONE } from "../admin-session";
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, CircleCheck, CircleX, ClipboardList, Clock, Copy, CreditCard, Database, ExternalLink, FileDown, FileUp, FolderOpen, Image as ImageIcon, ImagePlus, Loader2, LockKeyhole, MapPin, Megaphone, Menu, MessageCircle, Package, Pencil, Plus, Printer, Save, Search, Settings, ShieldAlert, ShieldCheck, ShoppingBasket, ShoppingCart, Store, Tag, Trash2, X, AlertTriangle, LayoutDashboard, TrendingUp } from "lucide-react";
import AdminSidebar, { AdminTab } from "./components/AdminSidebar";
import CategoryExportModal from "./components/CategoryExportModal";
import { ImageCropModal } from "./image-crop-modal";
import { toPng } from "html-to-image";
import { DEFAULT_CATEGORIES, DEFAULT_STORE_SETTINGS, format12Hour, normalizeStoreSettings, parseTimeToMinutes, sanitizeWhatsAppNumber, StoreCategory, StoreSettings } from "../store-config";
import {
  exportProductsToCsvString,
  exportProductsToExcelBuffer,
  downloadExcelWorkbook,
  prepareImportProducts,
  prepareImportProductsFromWorkbook,
  normalizeCategoryToPrimary,
  PreparedImportProduct,
} from "../lib/csvProductUtils";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";

interface Product {
  id: string;
  name?: string;
  nameGu: string;
  nameEn?: string;
  category: string;
  categoryName?: string;
  category_name?: string;
  units: string[];
  price: number;
  inStock: boolean;
  photoUrl: string;
  brand: string;
  stockCount: number;
  originalPrice: number;
  offer: boolean;
  packing?: string;
  isSpecialOffer?: boolean;
}

interface Banner {
  id: string;
  title: string;
  tag: string;
  desc: string;
  imgUrl: string;
  active: boolean;
}

interface StoreOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  items: { id: string; name: string; quantity: number; price: number }[];
  total: number;
  fulfillment?: string;
  deliverySlot?: string | null;
  status?: string;
  createdAt?: { toDate?: () => Date };
}

type SettingsView = 'menu' | 'profile' | 'hours' | 'categories' | 'payments' | 'offers' | 'backup';

// Dynamic Image Specification Configuration (Single Source of Truth)
const IMAGE_SPECS = {
  banner: { ratioText: "1460 x 545", recommended: "1460 x 545", aspectRatio: 1460 / 545 },
  product: { ratioText: "1:1", recommended: "600x600", aspect: 1, outW: 600, outH: 600 },
  logo: { ratioText: "1:1", recommended: "400x400", aspect: 1, outW: 400, outH: 400 },
  upi: { ratioText: "1:1", recommended: "400x400", aspect: 1, outW: 400, outH: 400 },
  promo: { ratioText: "16:9", recommended: "800x450", aspect: 16 / 9, outW: 800, outH: 450 },
} as const;

type ImageSpecKey = keyof typeof IMAGE_SPECS;

const getCropTarget = (type: ImageSpecKey, titlePrefix: string) => {
  const spec = IMAGE_SPECS[type];
  const aspect = "aspectRatio" in spec ? (spec as { aspectRatio: number }).aspectRatio : (spec as { aspect: number }).aspect;
  const outW = "outW" in spec ? (spec as { outW: number }).outW : 1460;
  const outH = "outH" in spec ? (spec as { outH: number }).outH : 545;
  return {
    type,
    aspectRatio: aspect,
    outputWidth: outW,
    outputHeight: outH,
    title: `${titlePrefix} (${spec.ratioText})`,
  };
};

export default function VisualAdminProtectedPage() {
  const router = useRouter();
  const [sessionVerified, setSessionVerified] = useState<boolean | null>(() => {
    if (typeof window !== "undefined") {
      return isValidAdminSession();
    }
    return null;
  });

  // Direct URL Lockout: immediately verify active session on mount
  useEffect(() => {
    const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    if (isLocal) {
      if (sessionStorage.getItem("local_admin_auth") === "true") {
        setSessionVerified(true);
        return;
      }
      setSessionVerified(false);
      return;
    }

    const verified = isValidAdminSession();
    if (!verified) {
      setSessionVerified(false);
      clearAdminSession();
      window.location.replace("/");
      return;
    }
    // Fail-safe check for old 24h session
    const saved = localStorage.getItem('adminSessionExpiry');
    if (saved) {
      const timeLeft = parseInt(saved, 10) - Date.now();
      if (timeLeft > 3600000) {
        localStorage.setItem('adminSessionExpiry', (Date.now() + 3600000).toString());
        window.location.reload();
        return;
      }
    }
    setSessionVerified(true);
  }, [router]);

  // 2. Strict 1-Hour Hard Session Expiry Real-Time Monitor
  const [sessionRemainingSeconds, setSessionRemainingSeconds] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const savedExpiry = localStorage.getItem('adminSessionExpiry');
      if (savedExpiry) {
        const timeLeft = parseInt(savedExpiry, 10) - Date.now();
        // If time left is more than 1 hour (3600000 ms), it's the old 24h session
        if (timeLeft > 3600000) {
          localStorage.removeItem('adminSessionExpiry');
          // Force re-login or set new expiry
          localStorage.setItem('adminSessionExpiry', (Date.now() + 3600000).toString());
        }
      }
    }
    return getRemainingSessionSeconds();
  });

  useEffect(() => {
    if (!sessionVerified) return;

    if (typeof window !== "undefined") {
      const savedExpiry = localStorage.getItem('adminSessionExpiry');
      if (savedExpiry) {
        const timeLeft = parseInt(savedExpiry, 10) - Date.now();
        if (timeLeft > 3600000) {
          localStorage.removeItem('adminSessionExpiry');
          localStorage.setItem('adminSessionExpiry', (Date.now() + 3600000).toString());
        }
      }
    }

    setSessionRemainingSeconds(getRemainingSessionSeconds());

    const interval = setInterval(() => {
      const remaining = getRemainingSessionSeconds();
      setSessionRemainingSeconds(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        clearAdminSession();
        try {
          alert("Session expired for security. Please re-authenticate via the store stealth gatekeeper.");
        } catch {}
        window.location.replace("/");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionVerified]);

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    if (typeof window !== "undefined" && isValidAdminSession()) {
      const session = getAdminSession();
      if (session) {
        return {
          email: session.email || (session.displayPhone ? `${session.adminName || "Admin"} (${session.displayPhone})` : session.adminName || "Admin"),
          displayName: session.adminName || session.email || "Store Admin",
          uid: session.adminId || ("admin-" + session.token.slice(0, 8)),
        } as unknown as User;
      }
    }
    return null;
  });
  const [authChecking, setAuthChecking] = useState(() => {
    if (typeof window !== "undefined" && isValidAdminSession()) {
      return false;
    }
    return true;
  });
  const [authError, setAuthError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [settingsForm, setSettingsForm] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sliderIndex, setSliderIndex] = useState(0);

  // Enterprise Sidebar Tabs
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Modals
  const [isProductModalOpen, setProductModalOpen] = useState(false);
  const [isBannerModalOpen, setBannerModalOpen] = useState(false);
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsView, setSettingsView] = useState<SettingsView>('menu');
  const [stockFilterOnly, setStockFilterOnly] = useState(false);
  const [quickEditing, setQuickEditing] = useState<{ productId: string; price: string; units: string } | null>(null);
  const [isSavingQuickEdit, setIsSavingQuickEdit] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Product Form (Unified Single Name)
  const [formItemName, setFormItemName] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isDeletingOrders, setIsDeletingOrders] = useState(false);
  const [formCategory, setFormCategory] = useState("કઠોળ-અનાજ");
  const [formUnits, setFormUnits] = useState("500g, 1kg, 2kg, 5kg");
  const [formPrice, setFormPrice] = useState("0");
  const [formPhotoUrl, setFormPhotoUrl] = useState("");
  const [formInStock, setFormInStock] = useState(true);
  const [formBrand, setFormBrand] = useState("");
  const [formStockCount, setFormStockCount] = useState("1");
  const [formOriginalPrice, setFormOriginalPrice] = useState("0");
  const [formOffer, setFormOffer] = useState(false);

  // Banner Form
  const [newBanTitle, setNewBanTitle] = useState("");
  const [newBanTag, setNewBanTag] = useState("Special Offer");
  const [newBanDesc, setNewBanDesc] = useState("");
  const [newBanImg, setNewBanImg] = useState("");
  const [newBanActive, setNewBanActive] = useState(true);
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);
  const [isSavingBanner, setIsSavingBanner] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryIcon, setCategoryIcon] = useState("Wheat");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [socialLabel, setSocialLabel] = useState("");
  const [socialUrl, setSocialUrl] = useState("");
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isOrdersModalOpen, setOrdersModalOpen] = useState(false);
  const [csvError, setCsvError] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [isExportModalOpen, setExportModalOpen] = useState(false);

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Per-Order Adjustments (Discount & Notice) for Final Bill HD Share
  const [orderAdjustments, setOrderAdjustments] = useState<
    Record<string, { discount: string; noticeText: string; showNotice: boolean }>
  >({});
  const [billCaptureData, setBillCaptureData] = useState<{
    order: StoreOrder;
    discount: number;
    finalTotal: number;
    noticeText: string;
    showNotice: boolean;
  } | null>(null);
  const [isGeneratingBillId, setIsGeneratingBillId] = useState<string | null>(null);
  const hiddenReceiptRef = useRef<HTMLDivElement>(null);

  const getOrderAdjustment = (orderId: string) => {
    return (
      orderAdjustments[orderId] || {
        discount: "",
        noticeText: "Thank you for shopping with us! Visit again.",
        showNotice: false,
      }
    );
  };

  const updateOrderAdjustment = (
    orderId: string,
    updates: Partial<{ discount: string; noticeText: string; showNotice: boolean }>
  ) => {
    setOrderAdjustments((prev) => ({
      ...prev,
      [orderId]: {
        ...getOrderAdjustment(orderId),
        ...updates,
      },
    }));
  };

  // Image Cropper & Adjuster State
  interface CropTarget {
    type: ImageSpecKey | "upiQr";
    aspectRatio: number;
    outputWidth: number;
    outputHeight: number;
    title: string;
  }
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string>("");
  const [cropTarget, setCropTarget] = useState<CropTarget | null>(null);

  const openCropperForFile = (file: File, target: CropTarget) => {
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file (JPG, PNG, WebP).");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setCropImageSrc(result);
        setCropTarget(target);
        setCropModalOpen(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const openCropperForUrl = (url: string, target: CropTarget) => {
    if (!url) return;
    setCropImageSrc(url);
    setCropTarget(target);
    setCropModalOpen(true);
  };

  const handleCropConfirm = (croppedDataUrl: string) => {
    if (!cropTarget) return;
    if (cropTarget.type === "product") {
      setFormPhotoUrl(croppedDataUrl);
      showToast("Product photo adjusted! Save to apply.");
    } else if (cropTarget.type === "banner") {
      setNewBanImg(croppedDataUrl);
      showToast("Banner photo adjusted! Save to apply.");
    } else if (cropTarget.type === "logo") {
      setSettingsForm((current) => ({ ...current, logoMode: "image", logoUrl: croppedDataUrl }));
      showToast("Store logo adjusted! Save settings to apply.");
    } else if (cropTarget.type === "promo") {
      setSettingsForm((current) => ({ ...current, promoImageUrl: croppedDataUrl }));
      showToast("Offer banner adjusted! Save settings to apply.");
    } else if (cropTarget.type === "upi" || cropTarget.type === "upiQr") {
      setSettingsForm((current) => ({ ...current, upiQrUrl: croppedDataUrl }));
      showToast("UPI QR adjusted! Save settings to apply.");
    }
    setCropModalOpen(false);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // 1. Check Authentication on Load
  useEffect(() => {
    if (!sessionVerified) return;

    loadData();

    const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    if (isLocal && sessionStorage.getItem("local_admin_auth") === "true") {
      const session = getAdminSession();
      if (session) {
        setCurrentUser({
          email: session.email || "local@admin.dev",
          displayName: session.adminName || "Local Admin",
          uid: session.adminId || "local-admin",
        } as unknown as User);
      }
      setAuthChecking(false);
      return;
    }

    const session = getAdminSession();
    if (session) {
      setCurrentUser((prev) => {
        if (prev && isAdminEmail(prev.email)) return prev;
        return {
          email: session.email || (session.displayPhone ? `${session.adminName || "Admin"} (${session.displayPhone})` : session.adminName || "Admin"),
          displayName: session.adminName || session.email || "Store Admin",
          uid: session.adminId || ("admin-" + session.token.slice(0, 8)),
        } as unknown as User;
      });
      setAuthChecking(false);
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        if (isAdminEmail(user.email)) {
          setCurrentUser(user);
          setAuthError(null);
        } else {
          setAuthError("This Google account is not authorized to access the admin panel.");
          signOut(auth);
        }
      }
      setAuthChecking(false);
    });

    return () => unsubscribe();
  }, [sessionVerified]);

  // 2. Google Login Trigger
  const handleGoogleLogin = async () => {
    try {
      setAuthError(null);
      const res = await signInWithPopup(auth, googleProvider);
      if (!isAdminEmail(res.user.email)) {
        setAuthError("This Google account is not authorized to access the admin panel.");
        await signOut(auth);
      } else {
        if (res.user.email) {
          const expiryTime = Date.now() + 1 * 60 * 60 * 1000; // 1 hour
          localStorage.setItem('adminSessionExpiry', expiryTime.toString());
          setGoogleAdminSession({ email: res.user.email, displayName: res.user.displayName, uid: res.user.uid });
        }
        setCurrentUser(res.user);
      }
    } catch (error: unknown) {
      console.error(error);
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : null;
      setAuthError(code ?? (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleLogout = async () => {
    const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    clearAdminSession();
    try {
      sessionStorage.removeItem("local_admin_auth");
    } catch {}
    await signOut(auth);
    setCurrentUser(null);
    if (isLocal) {
      window.location.replace("/admin");
    } else {
      window.location.replace("/");
    }
  };

  // 3. Load Firebase Data
  async function loadData() {
    try {
      setLoading(true);
      const prodSnap = await getDocs(collection(db, "products"));
      if (!prodSnap.empty) {
        const list = prodSnap.docs.map((d) => {
          const raw = d.data();
          let parsedUnits: string[] = ["1 pc"];
          if (Array.isArray(raw.units)) parsedUnits = raw.units;
          else if (typeof raw.unit === "string") parsedUnits = [raw.unit];

          const itemName = raw.name || raw.nameGu || raw.name_gu || raw.nameEn || raw.name_en || "Grocery Item";
          return {
            id: d.id,
            name: itemName,
            nameGu: raw.nameGu || raw.name_gu || itemName,
            nameEn: raw.nameEn || raw.name_en || "",
            category: raw.category || "કઠોળ-અનાજ",
            units: parsedUnits,
            price: Number(raw.price) || 0,
            inStock: raw.inStock !== undefined ? raw.inStock : (raw.in_stock !== undefined ? raw.in_stock : true),
            photoUrl: raw.photoUrl || raw.photo_url || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60",
            brand: String(raw.brand ?? "Other"),
            stockCount: Math.max(0, Number(raw.stockCount ?? raw.stock ?? ((raw.inStock ?? raw.in_stock) === false ? 0 : 1))),
            originalPrice: Number(raw.originalPrice ?? raw.compareAtPrice ?? raw.price) || 0,
            offer: raw.offer === true || raw.isSpecialOffer === true || Number(raw.originalPrice ?? raw.compareAtPrice ?? 0) > Number(raw.price ?? 0),
            isSpecialOffer: raw.isSpecialOffer === true || raw.offer === true || Number(raw.originalPrice ?? raw.compareAtPrice ?? 0) > Number(raw.price ?? 0),
            packing: Array.isArray(raw.units) ? raw.units.join(", ") : (typeof raw.packing === "string" ? raw.packing : parsedUnits.join(", ")),
          } as Product;
        });
        setProducts(list);
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!currentUser) return;

    return onSnapshot(
      collection(db, "banners"),
      (snapshot) => {
        setBanners(
          snapshot.docs.map((bannerDoc) => {
            const data = bannerDoc.data();
            return {
              id: bannerDoc.id,
              title: String(data.title ?? ""),
              tag: String(data.tag ?? ""),
              desc: String(data.desc ?? ""),
              imgUrl: String(data.imgUrl ?? data.imageUrl ?? ""),
              active: data.active !== false,
            };
          }),
        );
      },
      (error) => {
        console.error("Failed to listen for slider updates:", error);
        showToast("Failed to load slider banners.");
      },
    );
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    return onSnapshot(collection(db, "orders"), (snapshot) => {
      setOrders(snapshot.docs.map((orderDoc) => ({ id: orderDoc.id, ...orderDoc.data() } as StoreOrder)).sort((first, second) => (second.createdAt?.toDate?.().getTime() ?? 0) - (first.createdAt?.toDate?.().getTime() ?? 0)));
    }, (error) => {
      console.error("Unable to load order archive:", error);
      showToast("Unable to load order archive.");
    });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    const unsub1 = onSnapshot(
      doc(db, "storeSettings", "main"),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() ?? {};
          const nextSettings = normalizeStoreSettings(data);
          setStoreSettings(nextSettings);
          setSettingsForm(nextSettings);
        }
      },
      (error) => {
        console.warn("storeSettings listener notice:", error);
      },
    );

    const unsub2 = onSnapshot(
      doc(db, "store_settings", "main"),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() ?? {};
          const nextSettings = normalizeStoreSettings(data);
          setStoreSettings(nextSettings);
          setSettingsForm(nextSettings);
        }
      },
      (error) => {
        console.warn("store_settings listener notice:", error);
      },
    );

    return () => {
      unsub1();
      unsub2();
    };
  }, [currentUser]);

  // Slider Rotate
  useEffect(() => {
    const active = banners.filter((b) => b.active);
    if (active.length <= 1) return;
    const timer = setInterval(() => {
      setSliderIndex((prev) => (prev + 1) % active.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [banners]);

  const openModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormItemName(product.name || product.nameGu || product.nameEn || "");
      setFormCategory(product.category);
      setFormUnits(product.units.join(", "));
      setFormPrice(product.price.toString());
      setFormPhotoUrl(product.photoUrl);
      setFormInStock(product.inStock);
      setFormBrand(product.brand);
      setFormStockCount(String(product.stockCount));
      setFormOriginalPrice(String(product.originalPrice));
      setFormOffer(product.offer);
    } else {
      setEditingProduct(null);
      setFormItemName("");
      setFormCategory(settingsForm.categories[0]?.id ?? DEFAULT_CATEGORIES[0].id);
      setFormUnits("500g, 1kg, 2kg, 5kg");
      setFormPrice("0");
      setFormPhotoUrl("");
      setFormInStock(true);
      setFormBrand("");
      setFormStockCount("1");
      setFormOriginalPrice("0");
      setFormOffer(false);
    }
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingProduct) return;
    const nameVal = formItemName.trim();
    if (!nameVal) {
      showToast("Item name is required!");
      return;
    }
    setIsSavingProduct(true);
    const unitsArr = formUnits.split(",").map((u) => u.trim()).filter(Boolean);
    const targetId = editingProduct ? editingProduct.id : "p_" + Date.now();
    const finalPhoto = formPhotoUrl.trim() || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60";
    const priceNum = parseFloat(formPrice) || 0;

    const payload = {
      id: targetId,
      name: nameVal,
      nameGu: nameVal,
      name_gu: nameVal,
      nameEn: nameVal,
      name_en: nameVal,
      category: formCategory,
      units: unitsArr.length > 0 ? unitsArr : ["1 pc"],
      price: priceNum,
      inStock: formInStock,
      in_stock: formInStock,
      brand: formBrand.trim() || "Other",
      stockCount: formInStock ? Math.max(1, Number(formStockCount) || 1) : 0,
      originalPrice: Number(formOriginalPrice) > 0 ? Number(formOriginalPrice) : priceNum,
      offer: formOffer,
      photoUrl: finalPhoto,
      photo_url: finalPhoto,
    };

    try {
      await setDoc(doc(db, "products", targetId), payload, { merge: true });
      showToast(`'${nameVal}' saved successfully!`);
      setProductModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      showToast("Failed to save item!");
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete '${name}'?`)) return;
    try {
      await deleteDoc(doc(db, "products", id));
      setProducts((prev) => prev.filter((p) => p.id !== id));
      showToast("Item deleted!");
    } catch (err) {
      console.error(err);
      showToast("Failed to delete item!");
    }
  };

  const handleToggleStock = async (p: Product) => {
    const newStatus = !p.inStock;
    try {
      await setDoc(
        doc(db, "products", p.id),
        { inStock: newStatus, in_stock: newStatus, stockCount: newStatus ? Math.max(1, p.stockCount) : 0 },
        { merge: true }
      );
      setProducts((prev) =>
        prev.map((item) => (item.id === p.id ? { ...item, inStock: newStatus, stockCount: newStatus ? Math.max(1, p.stockCount) : 0 } : item))
      );
      showToast(newStatus ? "Marked as In Stock!" : "Marked as Out of Stock!");
    } catch (err) {
      console.error(err);
      showToast("Error updating stock status!");
    }
  };

  const startQuickEdit = (p: Product) => {
    setQuickEditing({
      productId: p.id,
      price: String(p.price),
      units: p.units?.join(", ") || "",
    });
  };

  const handleSaveQuickEdit = async (p: Product) => {
    if (!quickEditing || quickEditing.productId !== p.id) return;
    const newPrice = parseFloat(quickEditing.price);
    if (isNaN(newPrice) || newPrice < 0) {
      showToast("Please enter a valid price!");
      return;
    }
    const unitsArr = quickEditing.units
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);
    const finalUnits = unitsArr.length > 0 ? unitsArr : p.units?.length ? p.units : ["1 pc"];

    setIsSavingQuickEdit(true);
    try {
      await setDoc(
        doc(db, "products", p.id),
        {
          price: newPrice,
          units: finalUnits,
        },
        { merge: true }
      );
      setProducts((prev) =>
        prev.map((item) =>
          item.id === p.id
            ? { ...item, price: newPrice, units: finalUnits }
            : item
        )
      );
      setQuickEditing(null);
      showToast("Price and packing updated!");
    } catch (err) {
      console.error(err);
      showToast("Error updating price!");
    } finally {
      setIsSavingQuickEdit(false);
    }
  };

  // Order Archive Multi-select & Bulk Deletion
  const handleToggleSelectOrder = (id: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllOrders = () => {
    if (selectedOrderIds.length === orders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(orders.map((o) => o.id));
    }
  };

  const handleDeleteSelectedOrders = async () => {
    if (selectedOrderIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedOrderIds.length} selected orders?`)) return;

    setIsDeletingOrders(true);
    try {
      const toDelete = [...selectedOrderIds];
      await Promise.all(toDelete.map((id) => deleteDoc(doc(db, "orders", id))));
      setOrders((prev) => prev.filter((o) => !toDelete.includes(o.id)));
      setSelectedOrderIds([]);
      showToast(`${toDelete.length} orders deleted successfully.`);
    } catch (error) {
      console.error("Error deleting selected orders:", error);
      showToast("Failed to delete selected orders.");
    } finally {
      setIsDeletingOrders(false);
    }
  };

  const handleClearAllOrders = async () => {
    if (orders.length === 0) return;
    if (!confirm(`Are you sure you want to CLEAR ALL ${orders.length} archived orders? This cannot be undone.`)) return;

    setIsDeletingOrders(true);
    try {
      const allIds = orders.map((o) => o.id);
      await Promise.all(allIds.map((id) => deleteDoc(doc(db, "orders", id))));
      setOrders([]);
      setSelectedOrderIds([]);
      showToast("All archived orders cleared.");
    } catch (error) {
      console.error("Error clearing all orders:", error);
      showToast("Failed to clear orders.");
    } finally {
      setIsDeletingOrders(false);
    }
  };

  const handleShareProductWhatsApp = (p: Product) => {
    const storeUrl = typeof window !== "undefined" ? window.location.origin : "https://vachhraj-store.web.app";
    const packingText = p.units && p.units.length > 0 ? ` (${p.units.join(", ")})` : "";
    const displayName = p.name || p.nameGu || p.nameEn || "Item";
    const text = `🛒 *${displayName}*\n` +
      `💰 Price: ₹${p.price}${packingText}\n` +
      `📦 Stock: ${p.inStock ? "In Stock ✅" : "Out of Stock ❌"}\n\n` +
      `🏪 *${storeSettings.storeName}*\n` +
      `Click here to order:\n${storeUrl}`;
    
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank");
  };

  const handleProductImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 12 * 1024 * 1024) {
      showToast("Choose an image file smaller than 12 MB.");
      return;
    }
    try {
      const objectUrl = URL.createObjectURL(file);
      const image = new window.Image();
      image.src = objectUrl;
      await image.decode();
      const maxDimension = 1000;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image compression is unavailable in this browser.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      const webp = canvas.toDataURL("image/webp", 0.78);
      if (webp.length > 850_000) throw new Error("Compressed image is still too large. Please choose a smaller photo.");
      setFormPhotoUrl(webp);
      showToast("Compressed WebP image ready. Save the product to upload it.");
    } catch (error) {
      console.error("Product image upload failed:", error);
      showToast(error instanceof Error ? error.message : "Unable to process the selected image.");
    }
  };

  const resetBannerForm = () => {
    setEditingBannerId(null);
    setNewBanTitle("");
    setNewBanTag("Special Offer");
    setNewBanDesc("");
    setNewBanImg("");
    setNewBanActive(true);
  };

  const handleSaveBanner = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSavingBanner) return;
    if (!newBanTitle.trim()) {
      showToast("Banner title is required!");
      return;
    }

    const wasEditing = editingBannerId !== null;
    const bannerId = editingBannerId ?? `b_${Date.now()}`;
    const banner: Banner = {
      id: bannerId,
      title: newBanTitle.trim(),
      tag: newBanTag.trim() || "Offer",
      desc: newBanDesc.trim(),
      imgUrl: newBanImg.trim() || "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=1000&auto=format&fit=crop&q=80",
      active: newBanActive,
    };

    try {
      setIsSavingBanner(true);
      await setDoc(doc(db, "banners", bannerId), banner);
      setBanners((current) => [banner, ...current.filter((item) => item.id !== bannerId)]);
      resetBannerForm();
      showToast(wasEditing ? "Banner updated!" : "New banner added!");
    } catch (err) {
      console.error(err);
      showToast("Failed to save banner!");
    } finally {
      setIsSavingBanner(false);
    }
  };

  const handleEditBanner = (banner: Banner) => {
    setEditingBannerId(banner.id);
    setNewBanTitle(banner.title);
    setNewBanTag(banner.tag);
    setNewBanDesc(banner.desc);
    setNewBanImg(banner.imgUrl);
    setNewBanActive(banner.active);
  };

  const handleToggleBanner = async (banner: Banner) => {
    try {
      await setDoc(doc(db, "banners", banner.id), { active: !banner.active }, { merge: true });
      showToast(!banner.active ? "Banner activated!" : "Banner hidden!");
    } catch (err) {
      console.error(err);
      showToast("Failed to update banner status!");
    }
  };

  const handleDeleteBanner = async (banner: Banner) => {
    if (!confirm(`Are you sure you want to delete banner '${banner.title}'?`)) return;
    try {
      await deleteDoc(doc(db, "banners", banner.id));
      if (editingBannerId === banner.id) resetBannerForm();
      showToast("Banner deleted!");
    } catch (err) {
      console.error(err);
      showToast("Failed to delete banner!");
    }
  };

  const handleSaveSettings = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSavingSettings) return;
    setIsSavingSettings(true);
    try {
      const removedIds = new Set(storeSettings.categories.map((category) => category.id).filter((id) => !settingsForm.categories.some((category) => category.id === id)));
      const fallbackId = settingsForm.categories[0]?.id;
      const affectedProducts = products.filter((product) => removedIds.has(product.category));
      if (affectedProducts.length && !fallbackId) throw new Error("At least one category must remain.");
      for (let start = 0; start < affectedProducts.length; start += 450) {
        const batch = writeBatch(db);
        affectedProducts.slice(start, start + 450).forEach((product) => batch.update(doc(db, "products", product.id), { category: fallbackId }));
        await batch.commit();
      }
      const derivedHours = `${format12Hour(settingsForm.openingTime)} - ${format12Hour(settingsForm.closingTime)}`;
      const sanitizedPhone = sanitizeWhatsAppNumber(settingsForm.whatsappNumber);
      const persistedSettings = normalizeStoreSettings({
        ...settingsForm,
        hours: derivedHours,
        whatsappNumber: sanitizedPhone,
      });
      await Promise.all([
        setDoc(doc(db, "storeSettings", "main"), persistedSettings),
        setDoc(doc(db, "store_settings", "main"), persistedSettings),
      ]);
      if (affectedProducts.length) setProducts((current) => current.map((product) => removedIds.has(product.category) ? { ...product, category: fallbackId! } : product));
      setSettingsForm(persistedSettings);
      setStoreSettings(persistedSettings);
      showToast("Store settings saved.");
    } catch (err) {
      console.error(err);
      showToast("Unable to save store settings.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const saveCategoryDraft = () => {
    const name = categoryName.trim();
    if (!name) return;
    setSettingsForm((current) => {
      const categories = current.categories.length ? [...current.categories] : [...DEFAULT_CATEGORIES];
      if (editingCategoryId) {
        return { ...current, categories: categories.map((category) => category.id === editingCategoryId ? { ...category, name, icon: categoryIcon } : category) };
      }
      const id = `category_${Date.now()}`;
      return { ...current, categories: [...categories, { id, name, icon: categoryIcon }] };
    });
    setCategoryName("");
    setCategoryIcon("Wheat");
    setEditingCategoryId(null);
  };

  const moveCategory = (categoryId: string, direction: -1 | 1) => {
    setSettingsForm((current) => {
      const categories = current.categories.length ? [...current.categories] : [...DEFAULT_CATEGORIES];
      const index = categories.findIndex((category) => category.id === categoryId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= categories.length) return current;
      [categories[index], categories[nextIndex]] = [categories[nextIndex], categories[index]];
      return { ...current, categories };
    });
  };

  const deleteCategory = async (category: StoreCategory) => {
    if (!confirm(`Remove “${category.name}”? Products in this category will move to the first remaining category.`)) return;
    const remaining = (settingsForm.categories.length ? settingsForm.categories : DEFAULT_CATEGORIES).filter((item) => item.id !== category.id);
    if (!remaining.length) {
      showToast("At least one category must remain.");
      return;
    }
    setSettingsForm((current) => ({ ...current, categories: remaining }));
    if (editingCategoryId === category.id) {
      setEditingCategoryId(null);
      setCategoryName("");
    }
    showToast("Category removed. Save store settings to publish the change.");
  };

  const addSocialLink = () => {
    if (!socialLabel.trim() || !socialUrl.trim()) return;
    setSettingsForm((current) => ({ ...current, socialLinks: [...current.socialLinks, { id: `social_${Date.now()}`, label: socialLabel.trim(), url: socialUrl.trim(), icon: "ExternalLink" }] }));
    setSocialLabel("");
    setSocialUrl("");
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
      showToast("Choose an image smaller than 8 MB.");
      return;
    }
    setIsUploadingLogo(true);
    try {
      const imageUrl = URL.createObjectURL(file);
      const image = new Image();
      image.src = imageUrl;
      await image.decode();
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 600 / Math.max(image.width, image.height));
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(imageUrl);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      setSettingsForm((current) => ({ ...current, logoMode: "image", logoUrl: dataUrl }));
      showToast("Logo uploaded. Save store settings to publish it.");
    } catch (error) {
      console.error(error);
      showToast("Unable to read that image.");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      const [productsSnapshot, bannersSnapshot, settingsSnapshot] = await Promise.all([
        getDocs(collection(db, "products")),
        getDocs(collection(db, "banners")),
        getDocs(collection(db, "storeSettings")),
      ]);
      const backup = {
        exportedAt: new Date().toISOString(),
        products: productsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        banners: bannersSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
        settings: settingsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
      };
      const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
      const download = document.createElement("a");
      download.href = blobUrl;
      download.download = `store-backup-${new Date().toISOString().slice(0, 10)}.json`;
      download.click();
      URL.revokeObjectURL(blobUrl);
      showToast("Backup exported.");
    } catch (err) {
      console.error(err);
      showToast("Unable to export backup.");
    }
  };

  const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object") throw new Error("Invalid backup format");
      const backup = parsed as Record<string, unknown>;
      if (
        !Array.isArray(backup.products) ||
        !Array.isArray(backup.banners) ||
        !Array.isArray(backup.settings)
      ) {
        throw new Error("Backup must include products, banners, and settings arrays");
      }
      const productsBackup = backup.products;
      const bannersBackup = backup.banners;
      const settingsBackup = backup.settings;
      const docsToRestore = [
        ...productsBackup.map((item) => ({ collectionName: "products", item })),
        ...bannersBackup.map((item) => ({ collectionName: "banners", item })),
        ...settingsBackup.map((item) => ({ collectionName: "storeSettings", item })),
      ];

      for (let start = 0; start < docsToRestore.length; start += 400) {
        const batch = writeBatch(db);
        docsToRestore.slice(start, start + 400).forEach(({ collectionName, item }) => {
          if (!item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string") {
            throw new Error("Backup contains a record without a valid id");
          }
          const { id, ...data } = item as { id: string } & Record<string, unknown>;
          batch.set(doc(db, collectionName, id), data);
        });
        await batch.commit();
      }
      showToast("Backup restored. Data is syncing now.");
    } catch (err) {
      console.error(err);
      showToast("Restore failed. Check the selected JSON backup.");
    }
  };

  const handleExportExcel = (selectedCategories: string[]) => {
    try {
      if (products.length === 0) {
        showToast("No products found to export.");
        return;
      }
      const buffer = exportProductsToExcelBuffer(
        products,
        selectedCategories,
        storeSettings.categories
      );
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadExcelWorkbook(buffer, `store-catalog-${dateStr}.xlsx`);
      showToast(`Exported ${selectedCategories.length} categories to multi-sheet Excel (.xlsx).`);
    } catch (err) {
      console.error("Excel export failed:", err);
      showToast("Failed to export Excel file.");
    }
  };

  const handleExportCsv = (selectedCategories: string[]) => {
    try {
      if (products.length === 0) {
        showToast("No products found to export.");
        return;
      }
      const csvString = exportProductsToCsvString(
        products,
        selectedCategories,
        storeSettings.categories
      );
      const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      link.download = `store-rates-${dateStr}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`Exported ${selectedCategories.length} categories to CSV.`);
    } catch (err) {
      console.error("CSV export failed:", err);
      showToast("Failed to export CSV.");
    }
  };

  const downloadCsv = () => {
    setExportModalOpen(true);
  };

  const importCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setCsvError("");
    if (!file) return;

    try {
      const fileName = file.name.toLowerCase();
      const isExcel =
        fileName.endsWith(".xlsx") ||
        fileName.endsWith(".xls") ||
        file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.type === "application/vnd.ms-excel";

      // 1. ROBUST CSV & EXCEL PARSING (PapaParse / XLSX)
      const importResult = isExcel
        ? prepareImportProductsFromWorkbook(
            XLSX.read(await file.arrayBuffer(), { type: "array" }),
            products
          )
        : prepareImportProducts(await file.text(), products);

      const { validProducts, errors, updatedCount, insertedCount } = importResult;

      // 2. SPECIFIC ROW-LEVEL ERROR TOASTS
      if (errors.length > 0) {
        errors.slice(0, 5).forEach((err) => {
          showToast(`Row ${err.rowNumber}: ${err.message}`);
        });
        if (errors.length > 5) {
          showToast(`${errors.length - 5} additional row(s) had validation errors.`);
        }
      }

      if (validProducts.length === 0) {
        const errorMsg =
          errors.length > 0
            ? `Row ${errors[0].rowNumber}: ${errors[0].message}`
            : "No valid product rows found to import.";
        setCsvError(errorMsg);
        showToast(errorMsg);
        return;
      }

      // 3. FIRESTORE ATOMIC BATCH WRITE (safe chunks of 400 with merge: true)
      for (let start = 0; start < validProducts.length; start += 400) {
        const batch = writeBatch(db);
        const batchChunk = validProducts.slice(start, start + 400);
        batchChunk.forEach((item) => {
          batch.set(doc(db, "products", item.id), item.payload, { merge: true });
        });
        await batch.commit();
      }

      // 4. IMMEDIATE CACHE REVALIDATION & STATE REFRESH
      setProducts((prev) => {
        const map = new Map(prev.map((p) => [p.id, p]));
        validProducts.forEach((item) => {
          const existing = map.get(item.id);
          map.set(item.id, {
            ...(existing || {}),
            ...item.payload,
            id: item.id,
            units: (item.payload.units as string[]) || ["1 pc"],
            price: Number(item.payload.price) || 0,
            originalPrice:
              Number(item.payload.originalPrice) || Number(item.payload.price) || 0,
            stockCount: Number(item.payload.stockCount) || 0,
            quantity: Number(item.payload.quantity) || 0,
            inStock: Boolean(item.payload.inStock),
            offer: Boolean(item.payload.offer),
            isSpecialOffer: Boolean(item.payload.isSpecialOffer),
            photoUrl: (existing?.photoUrl ||
              item.payload.photoUrl ||
              "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60") as string,
            category: String(item.payload.category || "Grains & Pulses"),
            brand: String(item.payload.brand || "Other"),
            name: String(item.payload.name || "Item"),
          } as Product);
        });
        return Array.from(map.values());
      });

      await loadData();

      // 5. PROPER IMPORT FEEDBACK
      showToast(
        `Successfully imported ${validProducts.length} products. Updated ${updatedCount} products.`
      );
    } catch (error) {
      console.error("Import error:", error);
      const message = error instanceof Error ? error.message : "Catalog import failed.";
      setCsvError(message);
      showToast(message);
    }
  };

  const printThermalReceipt = (order: StoreOrder) => {
    const adj = getOrderAdjustment(order.id);
    const discountVal = Math.max(0, Number(adj.discount) || 0);
    const finalTotal = Math.max(0, Number(order.total) - discountVal);
    const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
    const printWindow = window.open("", "_blank", "width=360,height=640");
    if (!printWindow) {
      showToast("Allow pop-ups to print the receipt.");
      return;
    }
    const lines = order.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.quantity} × ₹${item.price}</td><td>₹${(item.quantity * item.price).toFixed(2)}</td></tr>`).join("");
    const discountRow = discountVal > 0 ? `<tr><td colspan="2">DISCOUNT</td><td style="text-align:right">-₹${discountVal.toFixed(2)}</td></tr>` : "";
    const noticeBlock = adj.showNotice && adj.noticeText.trim() ? `<div style="margin-top:8px;border:1px dashed #333;padding:4px;font-size:10px;text-align:center"><strong>NOTICE:</strong> ${escapeHtml(adj.noticeText)}</div>` : "";
    printWindow.document.write(`<!doctype html><html><head><title>Thermal receipt</title><style>@page{size:80mm auto;margin:4mm}body{font:12px monospace;width:72mm;margin:0;color:#111}h1,p{text-align:center;margin:4px 0}hr{border:0;border-top:1px dashed #333}table{width:100%;border-collapse:collapse;font-size:11px}td{padding:4px 0;vertical-align:top}td:last-child{text-align:right}.total{font-weight:bold;text-align:right;margin-top:10px}</style></head><body><h1>${escapeHtml(storeSettings.storeName)}</h1><p>${escapeHtml(storeSettings.address)}</p><hr><p>ORDER ${escapeHtml(order.id.slice(-8).toUpperCase())}</p><p>${escapeHtml(order.customerName)} · ${escapeHtml(order.customerPhone)}</p><hr><table>${lines}${discountRow}</table><hr><div class="total">TOTAL ₹${finalTotal.toFixed(2)}</div>${noticeBlock}<p>${new Date(order.createdAt?.toDate?.() ?? Date.now()).toLocaleString("en-IN")}</p><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`);
    printWindow.document.close();
  };

  const copyOrderTemplate = async (order: StoreOrder, template: "packed" | "ready") => {
    const message = template === "packed" ? `Your order is packed and will be delivered in 15 mins. Order: ${order.id.slice(-8)}` : `Your order is ready. Please pick it up from the store. Order: ${order.id.slice(-8)}`;
    try {
      await navigator.clipboard.writeText(message);
      showToast("WhatsApp status message copied.");
    } catch {
      window.open(`https://wa.me/${order.customerPhone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    }
  };

  const handleWhatsAppClick = async (order: StoreOrder) => {
    alert("1. Button clicked. Finding element...");
    const adj = getOrderAdjustment(order.id);
    const discountVal = Math.max(0, Number(adj.discount) || 0);
    const finalTotal = Math.max(0, Number(order.total) - discountVal);

    setBillCaptureData({
      order,
      discount: discountVal,
      finalTotal,
      noticeText: adj.noticeText,
      showNotice: adj.showNotice,
    });

    // Wait for React to render the receipt DOM with this order's data
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      const element = document.getElementById('hidden-receipt-node');
      
      if (!element) {
        alert("ERROR: Hidden receipt element NOT FOUND in DOM!");
        return;
      }

      alert("2. Element found. Generating image...");

      // Use html-to-image
      const dataUrl = await toPng(element, {
        quality: 1,
        pixelRatio: 2, // Keep it lower for faster testing
        backgroundColor: '#ffffff'
      });

      alert("3. Image generated successfully!");

      // Convert to File
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], 'Bill.png', { type: 'image/png' });

      // Share
      if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
        alert("4. Opening Share Menu...");
        await navigator.share({
          files: [file],
          title: 'Final Bill',
          text: 'Here is your bill.'
        });
      } else {
        alert("4. Share not supported. Downloading...");
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = 'Bill.png';
        link.click();
      }
    } catch (error: any) {
      alert("CRITICAL ERROR: " + (error?.message || String(error))); // This will pop up on screen!
      console.error(error);
    }
  };

  const handleShareCustomerBill = handleWhatsAppClick;

  // Direct URL Lockout: immediately block direct unauthenticated access to /admin
  if (sessionVerified !== true || !currentUser) {
    if (typeof window !== "undefined") {
      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      if (!isLocal) {
        clearAdminSession();
        window.location.replace("/");
      }
    }
    return <div className="fixed inset-0 z-[9999] bg-[#070b14]" />;
  }

  // If checking auth status
  if (authChecking) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b14] px-4 text-slate-200">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(249,115,22,0.12),_transparent_55%)]" />
        <div className="relative flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-[#263653] bg-[#0f172a]/90 p-8 text-center shadow-2xl shadow-black/30">
          <span className="h-10 w-10 animate-spin rounded-full border-2 border-orange-400/30 border-t-orange-400" />
          <p className="text-sm font-semibold">Verifying security...</p>
        </div>
      </div>
    );
  }

  // Filter & Low Stock Counter
  const lowStockProducts = products.filter((p) => !p.inStock || p.stockCount <= 0);
  const lowStockCount = lowStockProducts.length;

  const q = searchQuery.toLowerCase().trim();
  const filteredProducts = products.filter((p) => {
    const matchesStock = !stockFilterOnly || !p.inStock || p.stockCount <= 0;
    const norm = (str?: string) => (str || "").trim().toLowerCase();
    const normalizeCategory = (cat?: string): string => {
      if (!cat) return "";
      return cat
        .toLowerCase()
        .trim()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]/g, "");
    };
    const normActive = norm(activeCategory);
    const prodCat = norm(p.category || p.categoryName || p.category_name);
    const normKey = normalizeCategory(activeCategory);
    const prodKey = normalizeCategory(p.category || p.categoryName || p.category_name);

    let matchesCat = 
      normActive === "all" || 
      normActive === "all items" || 
      !normActive ||
      prodCat === normActive ||
      prodCat.replace(/\s+/g, "-") === normActive ||
      normActive.replace(/\s+/g, "-") === prodCat ||
      prodKey === normKey ||
      prodKey.replace(/and/g, "") === normKey.replace(/and/g, "");

    if (!matchesCat) {
      const allAdminCats = settingsForm.categories.length ? settingsForm.categories : DEFAULT_CATEGORIES;
      const matchedCat = allAdminCats.find(
        (c) => norm(c.id) === normActive || norm(c.name) === normActive
      );
      if (matchedCat) {
        matchesCat =
          norm(matchedCat.name) === prodCat ||
          norm(matchedCat.id) === prodCat ||
          norm(matchedCat.name).replace(/\s+/g, "-") === prodCat ||
          norm(matchedCat.id).replace(/\s+/g, "-") === prodCat;
      }
    }
    if (!matchesCat) {
      try {
        const primaryItem = normalizeCategoryToPrimary(p.category, settingsForm.categories);
        const primaryActive = normalizeCategoryToPrimary(activeCategory, settingsForm.categories);
        if (primaryItem.id && primaryActive.id && primaryItem.id === primaryActive.id) {
          matchesCat = true;
        }
      } catch {}
    }
    const matchesSearch =
      !q ||
      ((p.name || p.nameGu || p.nameEn || "").toLowerCase().includes(q)) ||
      p.nameGu.toLowerCase().includes(q) ||
      (p.nameEn && p.nameEn.toLowerCase().includes(q)) ||
      p.category.toLowerCase().includes(q) ||
      (settingsForm.categories.find((category) => category.id === p.category)?.name.toLowerCase().includes(q) ?? false);
    return matchesStock && matchesCat && matchesSearch;
  });

  const activeBanners = banners.filter((b) => b.active);
  const adminCategories = settingsForm.categories.length ? settingsForm.categories : DEFAULT_CATEGORIES;
  const activeSliderIndex = activeBanners.length ? sliderIndex % activeBanners.length : 0;
  const AdminLogoIcon = storeSettings.logoIcon === "ExternalLink" ? ExternalLink : storeSettings.logoIcon === "MapPin" ? MapPin : Store;

  return (
    <div className="min-h-screen min-w-0 bg-[#070b14] font-sans text-slate-100 antialiased">
      {/* Toast Notification */}
      {toastMsg && (
        <div role="status" className="fixed inset-x-4 top-4 z-[90] mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-orange-500/60 bg-[#0f172a] px-4 py-3 text-xs text-white shadow-2xl sm:inset-x-auto sm:right-6 sm:top-6 animate-in fade-in slide-in-from-top-3">
          <Check className="text-emerald-400" size={16} />
          <span className="font-semibold">{toastMsg}</span>
        </div>
      )}

      {/* Enterprise Left Sidebar */}
      <AdminSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        storeSettings={storeSettings}
        productsCount={products.length}
        lowStockCount={lowStockCount}
        bannersCount={banners.length}
        ordersCount={orders.length}
        sessionRemainingSeconds={sessionRemainingSeconds}
        onLogout={handleLogout}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content Area (Right of Sidebar) */}
      <div className="min-h-screen bg-[#0b1120] text-slate-200 lg:ml-64 flex flex-col font-sans antialiased">
        {/* Top Bar Header */}
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-800 bg-[#0f172a] px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:text-white lg:hidden transition"
              aria-label="Open Navigation Sidebar"
            >
              <Menu size={20} />
            </button>

            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                {activeTab === "dashboard" && "Dashboard Overview"}
                {activeTab === "banners" && "Manage Banners"}
                {activeTab === "products" && "All Products"}
                {activeTab === "orders" && "Orders & CSV"}
                {activeTab === "settings" && "Store Settings"}
              </h2>
              <p className="text-xs text-slate-400 hidden sm:block">
                {activeTab === "dashboard" && "Live store metrics, active promotions & quick operations"}
                {activeTab === "banners" && "Hero slider promotions & banner specifications (1460 x 545)"}
                {activeTab === "products" && `Catalog management (${products.length} products total)`}
                {activeTab === "orders" && `Customer orders (${orders.length}) & catalog CSV import/export`}
                {activeTab === "settings" && "Store branding, business hours, payment gateways & backups"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Active Admin Badge */}
            <div className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-slate-700/60 bg-[#152036] px-3.5 py-1.5 text-xs font-semibold text-slate-200 shadow-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="truncate">Active Admin: vimalsolanki8990@gmail.com</span>
            </div>

            {/* Tab-Specific Quick Action Button */}
            {activeTab === "products" && (
              <button
                type="button"
                onClick={() => openModal()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-orange-950/30 hover:brightness-110 transition active:scale-95"
              >
                <Plus size={15} />
                <span>New Item</span>
              </button>
            )}

            {activeTab === "banners" && (
              <button
                type="button"
                onClick={() => {
                  resetBannerForm();
                  setBannerModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-orange-950/30 hover:brightness-110 transition active:scale-95"
              >
                <Plus size={15} />
                <span>Add Banner</span>
              </button>
            )}

            {activeTab === "orders" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/20 transition"
                  title="Export products to Multi-Sheet Excel (.xlsx) or CSV"
                >
                  <FileDown size={14} />
                  <span className="hidden sm:inline">Export Excel/CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => csvInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/20 transition"
                  title="Import products from Excel (.xlsx) or CSV"
                >
                  <FileUp size={14} />
                  <span className="hidden sm:inline">Import (Excel/CSV)</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* ========================================================= */}
        {/* TAB 1: DASHBOARD OVERVIEW                                  */}
        {/* ========================================================= */}
        {activeTab === "dashboard" && (
          <main className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto w-full">
            {/* Welcome Banner Card */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-slate-800 bg-[#0f172a] p-5 shadow-lg">
              <div className="space-y-1">
                <h3 className="text-lg font-black text-white sm:text-xl">
                  Jay Vachhraj General Store Console
                </h3>
                <p className="text-xs text-slate-400">
                  Zanzmer • Manage inventory, orders, hero promotional banners, and store configuration.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Store Hours</p>
                  <p className="text-xs font-bold text-amber-300">
                    {format12Hour(storeSettings.openingTime || "6:00 AM")} – {format12Hour(storeSettings.closingTime || "9:00 PM")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSettingsForm(storeSettings);
                    setSettingsView("hours");
                    setSettingsModalOpen(true);
                  }}
                  className="min-h-10 rounded-xl px-3.5 py-2 text-xs font-bold transition border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                >
                  Edit Hours
                </button>
              </div>
            </div>

            {/* Metric Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {/* 1. Products Metric */}
              <div
                onClick={() => setActiveTab("products")}
                className="group flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#111c32] p-5 shadow-md hover:border-blue-500/40 hover:bg-[#15233e] transition cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Products</span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 group-hover:scale-105 transition">
                    <Package size={20} />
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-2xl sm:text-3xl font-black text-white">{products.length}</p>
                  <p className="text-xs text-slate-400 mt-1 flex items-center justify-between">
                    <span>{adminCategories.length} categories</span>
                    <span className="text-blue-400 font-bold group-hover:underline">Manage Products →</span>
                  </p>
                </div>
              </div>

              {/* 2. Low Stock Alerts */}
              <div
                onClick={() => {
                  setStockFilterOnly(true);
                  setActiveTab("products");
                }}
                className={`group flex flex-col justify-between rounded-2xl border p-5 shadow-md transition cursor-pointer ${
                  lowStockCount > 0
                    ? "border-amber-500/30 bg-[#181822] hover:border-amber-500/50 hover:bg-[#1f1e2c]"
                    : "border-slate-800 bg-[#111c32] hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Low / Out of Stock</span>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl border group-hover:scale-105 transition ${
                    lowStockCount > 0
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  }`}>
                    <AlertTriangle size={20} />
                  </div>
                </div>
                <div className="mt-3">
                  <p className={`text-2xl sm:text-3xl font-black ${lowStockCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                    {lowStockCount}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 flex items-center justify-between">
                    <span>{lowStockCount > 0 ? "Items need restock" : "All items in stock"}</span>
                    {lowStockCount > 0 && <span className="text-amber-400 font-bold group-hover:underline">Review →</span>}
                  </p>
                </div>
              </div>

              {/* 3. Active Banners */}
              <div
                onClick={() => setActiveTab("banners")}
                className="group flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#111c32] p-5 shadow-md hover:border-orange-500/40 hover:bg-[#15233e] transition cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Banners</span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 group-hover:scale-105 transition">
                    <ImageIcon size={20} />
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-2xl sm:text-3xl font-black text-white">{activeBanners.length}</p>
                  <p className="text-xs text-slate-400 mt-1 flex items-center justify-between">
                    <span>{banners.length} total banners</span>
                    <span className="text-orange-400 font-bold group-hover:underline">Edit Banners →</span>
                  </p>
                </div>
              </div>

              {/* 4. Customer Orders */}
              <div
                onClick={() => setActiveTab("orders")}
                className="group flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#111c32] p-5 shadow-md hover:border-emerald-500/40 hover:bg-[#15233e] transition cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Orders</span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105 transition">
                    <ShoppingCart size={20} />
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-2xl sm:text-3xl font-black text-white">{orders.length}</p>
                  <p className="text-xs text-slate-400 mt-1 flex items-center justify-between">
                    <span>₹{orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0).toFixed(0)} total</span>
                    <span className="text-emerald-400 font-bold group-hover:underline">Orders Archive →</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Live Banner Slider & Recent Orders Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Promotional Slider Live Preview */}
              <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <ImageIcon size={16} className="text-orange-400" />
                      <span>Live Banner Slider Preview (1460 x 545)</span>
                    </h4>
                    <p className="text-[11px] text-slate-400">Current live promotional hero banners shown to customers</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("banners")}
                    className="text-xs font-bold text-blue-400 hover:underline"
                  >
                    Manage Banners →
                  </button>
                </div>

                {activeBanners.length > 0 ? (
                  <div className="relative w-full max-w-[1460px] rounded-xl overflow-hidden border border-slate-800 bg-slate-950 aspect-[1460/545]">
                    {activeBanners.map((b, idx) => (
                      <div
                        key={b.id}
                        className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                          idx === activeSliderIndex ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
                        }`}
                      >
                        <img src={b.imgUrl} alt={b.title} className="w-full h-full object-cover object-center" />
                        <div className="absolute inset-0 p-4 sm:p-5 flex flex-col justify-end bg-gradient-to-t from-black/75 via-black/20 to-transparent">
                          <span className="inline-block px-2.5 py-0.5 rounded-full bg-orange-500 text-white font-bold text-[10px] w-fit mb-1 shadow-xs">
                            {b.tag}
                          </span>
                          <h5 className="text-white font-black text-sm sm:text-base leading-tight drop-shadow-md">
                            {b.title}
                          </h5>
                          <p className="text-amber-200 text-xs font-semibold mt-0.5 truncate">
                            {b.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                    {activeBanners.length > 1 && (
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20">
                        {activeBanners.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setSliderIndex(idx)}
                            className={`h-1.5 rounded-full transition-all ${
                              idx === activeSliderIndex ? "w-5 bg-orange-500" : "w-1.5 bg-white/60"
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
                    No active promotional banners. Click &ldquo;Manage Banners&rdquo; to add one.
                  </div>
                )}
              </div>

              {/* Recent Orders Overview */}
              <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <ShoppingCart size={16} className="text-emerald-400" />
                      <span>Recent Orders</span>
                    </h4>
                    <p className="text-[11px] text-slate-400">Latest customer WhatsApp orders submitted</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("orders")}
                    className="text-xs font-bold text-emerald-400 hover:underline"
                  >
                    All Orders ({orders.length}) →
                  </button>
                </div>

                {orders.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
                    No orders recorded yet.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {orders.slice(0, 4).map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-[#111c32] p-3 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-white truncate">{order.customerName}</p>
                          <p className="text-[11px] text-slate-400">{order.customerPhone} • {order.items.length} items</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-bold text-amber-300">₹{Number(order.total).toFixed(0)}</span>
                          <button
                            type="button"
                            onClick={() => printThermalReceipt(order)}
                            className="p-1.5 rounded-lg bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 border border-sky-500/20"
                            title="Print Receipt"
                          >
                            <Printer size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </main>
        )}

        {/* ========================================================= */}
        {/* TAB 2: MANAGE BANNERS                                      */}
        {/* ========================================================= */}
        {activeTab === "banners" && (
          <main className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto w-full">
            {/* Banner Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-slate-800 bg-[#0f172a] p-5 shadow-lg">
              <div>
                <h3 className="text-lg font-black text-white sm:text-xl flex items-center gap-2">
                  <ImageIcon className="text-orange-400" size={20} />
                  <span>Homepage Promotional Banners</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Upload and configure hero slider promotions with exact 1460 x 545 widescreen resolution.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  resetBannerForm();
                  const formEl = document.getElementById("banner-form-card");
                  if (formEl) formEl.scrollIntoView({ behavior: "smooth" });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:brightness-110 transition active:scale-95 shrink-0"
              >
                <Plus size={15} />
                <span>Add New Banner</span>
              </button>
            </div>

            {/* Live Slider Preview */}
            {activeBanners.length > 0 && (
              <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Live Storefront Slider Preview ({activeBanners.length} Active)
                </h4>
                <div className="relative w-full max-w-[1460px] rounded-2xl overflow-hidden border border-[#1f2e4d] bg-slate-900 aspect-[1460/545]">
                  {activeBanners.map((b, idx) => (
                    <div
                      key={b.id}
                      className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                        idx === activeSliderIndex ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
                      }`}
                    >
                      <img src={b.imgUrl} alt={b.title} className="w-full h-full object-cover object-center" />
                      <div className="absolute inset-0 p-4 sm:p-6 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/20 to-transparent">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-orange-500 text-white font-bold text-[10px] w-fit mb-1 shadow">
                          {b.tag}
                        </span>
                        <h2 className="text-white font-black text-sm sm:text-lg leading-tight drop-shadow-md">
                          {b.title}
                        </h2>
                        <p className="text-amber-200 text-xs sm:text-sm font-semibold mt-0.5 truncate">
                          {b.desc}
                        </p>
                      </div>
                    </div>
                  ))}

                  {activeBanners.length > 1 && (
                    <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20">
                      {activeBanners.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSliderIndex(idx)}
                          className={`h-1.5 rounded-full transition-all ${
                            idx === activeSliderIndex ? "w-5 bg-orange-500" : "w-1.5 bg-white/60"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Form & Current Banners Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Banner Upload / Edit Form */}
              <div id="banner-form-card" className="lg:col-span-6 space-y-4">
                <form
                  onSubmit={handleSaveBanner}
                  aria-busy={isSavingBanner}
                  className="space-y-3.5 rounded-2xl border border-slate-800 bg-[#0f172a] p-5 shadow-lg"
                >
                  <div className="border-b border-slate-800/80 pb-3">
                    <h4 className="font-bold text-amber-300 flex items-center gap-2">
                      <Pencil size={15} />
                      <span>{editingBannerId ? "Edit Banner Details" : "Create New Banner"}</span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Enter promotional title, description, and upload 1460 x 545 hero banner image.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Banner Title *</label>
                    <input
                      type="text"
                      required
                      value={newBanTitle}
                      onChange={(e) => setNewBanTitle(e.target.value)}
                      placeholder="e.g. Pure Groundnut Oil Offer"
                      className="w-full rounded-xl border border-slate-700 bg-[#152036] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Badge Tag</label>
                    <input
                      type="text"
                      value={newBanTag}
                      onChange={(e) => setNewBanTag(e.target.value)}
                      placeholder="e.g. Special Offer / Festival Discount"
                      className="w-full rounded-xl border border-slate-700 bg-[#152036] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Short Description</label>
                    <input
                      type="text"
                      value={newBanDesc}
                      onChange={(e) => setNewBanDesc(e.target.value)}
                      placeholder="e.g. Special discounts on 15kg tins"
                      className="w-full rounded-xl border border-slate-700 bg-[#152036] px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                    />
                  </div>

                  {/* Banner Image Upload & Adjust */}
                  <div className="space-y-2.5 rounded-2xl border border-slate-800 bg-[#111c32] p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">
                        Banner Image ({IMAGE_SPECS.banner.ratioText}) - Recommended: {IMAGE_SPECS.banner.recommended}
                      </span>
                      {newBanImg && (
                        <button
                          type="button"
                          onClick={() => setNewBanImg("")}
                          className="text-xs font-bold text-rose-400 hover:text-rose-300"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 px-3.5 py-2 text-xs font-bold text-amber-200 transition active:scale-95 shadow-sm">
                        <ImagePlus size={15} />
                        {newBanImg ? "Change Banner Photo" : "Upload Banner Image"}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) {
                              openCropperForFile(file, getCropTarget("banner", "Adjust Banner Photo"));
                            }
                          }}
                          className="sr-only"
                        />
                      </label>

                      {newBanImg && (
                        <button
                          type="button"
                          onClick={() =>
                            openCropperForUrl(newBanImg, getCropTarget("banner", "Adjust Banner Photo"))
                          }
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#34445f] bg-[#152036] hover:bg-[#1f2d4a] px-3.5 py-2 text-xs font-bold text-slate-200 transition"
                        >
                          <Pencil size={13} className="text-orange-400" />
                          Adjust & Crop
                        </button>
                      )}
                    </div>

                    {newBanImg && (
                      <div className="relative w-full max-w-[1460px] aspect-[1460/545] rounded-xl overflow-hidden border border-[#34445f] bg-black/40 mt-1">
                        <img src={newBanImg} alt="Banner preview" className="w-full h-full object-cover object-center" />
                        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-mono text-orange-300">
                          {IMAGE_SPECS.banner.ratioText} Preview
                        </span>
                      </div>
                    )}

                    <input
                      type="url"
                      value={newBanImg.startsWith("data:") ? "" : newBanImg}
                      onChange={(e) => setNewBanImg(e.target.value)}
                      placeholder="Or enter web image URL (Optional)"
                      className="w-full rounded-xl border border-[#34445f] bg-[#152036] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none"
                    />
                  </div>

                  <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-700 bg-[#152036] px-3.5 py-2 text-xs font-semibold text-slate-200 cursor-pointer">
                    <span>Display on Homepage Slider</span>
                    <input
                      type="checkbox"
                      checked={newBanActive}
                      onChange={(event) => setNewBanActive(event.target.checked)}
                      className="h-5 w-5 accent-orange-500 cursor-pointer"
                    />
                  </label>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={isSavingBanner}
                      className="min-h-11 flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-orange-950/30 transition hover:brightness-110 disabled:opacity-60"
                    >
                      {isSavingBanner
                        ? "Saving..."
                        : editingBannerId
                          ? "Save Banner Changes"
                          : "+ Save Banner"}
                    </button>
                    {editingBannerId && (
                      <button
                        type="button"
                        onClick={resetBannerForm}
                        className="min-h-11 rounded-xl border border-slate-700 bg-[#152036] px-4 py-2 text-xs font-bold text-slate-300 hover:bg-[#1b2a44] transition"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* Current Banners List */}
              <div className="lg:col-span-6 space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                    <h4 className="font-bold text-white flex items-center gap-2">
                      <ImageIcon size={16} className="text-orange-400" />
                      <span>Current Banners ({banners.length})</span>
                    </h4>
                    <span className="text-xs text-slate-400 font-mono">
                      {activeBanners.length} active
                    </span>
                  </div>

                  {banners.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
                      No banners created yet. Use the form on the left to add your first banner.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                      {banners.map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-[#152036] p-3 transition hover:border-slate-700"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                            <img
                              src={b.imgUrl}
                              alt=""
                              className="h-12 w-20 shrink-0 rounded-lg border border-[#34445f] object-cover"
                            />
                            <div className="truncate">
                              <h5 className="font-bold text-white text-xs truncate">{b.title}</h5>
                              <span className="text-[10px] text-amber-400">{b.tag}</span>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleBanner(b)}
                              className={`min-h-8 rounded-lg border px-2 text-[10px] font-bold transition ${
                                b.active
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                                  : "border-slate-600/30 bg-slate-700/20 text-slate-300 hover:bg-slate-700/40"
                              }`}
                            >
                              {b.active ? "Active" : "Hidden"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEditBanner(b)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                              title="Edit banner"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBanner(b)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                              title="Delete banner"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        )}

        {/* ========================================================= */}
        {/* TAB 3: ALL PRODUCTS (INVENTORY MANAGEMENT)                */}
        {/* ========================================================= */}
        {activeTab === "products" && (
          <main className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto w-full flex-1">
            {/* Store Management Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">Inventory Catalog</p>
                <h3 className="text-xl font-black text-white sm:text-2xl">Store Inventory Management</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-slate-800 bg-[#111c32] px-3.5 py-1.5 text-xs font-semibold text-slate-300">
                  Total {products.length} items
                </span>
                <button
                  type="button"
                  onClick={() => openModal()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow-md hover:brightness-110 transition active:scale-95"
                >
                  <Plus size={15} />
                  <span>New Item</span>
                </button>
              </div>
            </div>

            {/* Sticky Search Bar alongside Category Filter */}
            <section
              aria-label="Search and category filter"
              className="sticky top-[65px] sm:top-[68px] z-30 mb-6 rounded-2xl border border-slate-800 bg-[#0c1322] p-3 sm:p-4 shadow-2xl"
            >
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between mb-3">
                {/* Search Input */}
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-orange-400" size={16} aria-hidden="true" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search products... (name, category, brand)"
                    className="w-full rounded-xl border border-slate-700 bg-[#111c32] py-2.5 pl-10 pr-9 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/25"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-white"
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Quick status count and active filter pill */}
                <div className="flex items-center justify-between sm:justify-end gap-2 text-xs">
                  <span className="text-[11px] font-semibold text-slate-400">
                    {filteredProducts.length} items available
                  </span>
                  {stockFilterOnly ? (
                    <button
                      type="button"
                      onClick={() => setStockFilterOnly(false)}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-500/20 px-2 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/30"
                    >
                      ✕ Out of stock only
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStockFilterOnly(true)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-300 hover:bg-slate-700"
                    >
                      Show out of stock
                    </button>
                  )}
                </div>
              </div>

              {/* Category Pills - Static without transitions/hover/animations */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {[{ id: "all", name: "All Items", icon: "All" }, ...adminCategories].map((cat) => {
                  const normActive = (activeCategory || "").trim().toLowerCase();
                  const isSel =
                    normActive === (cat.id || "").trim().toLowerCase() ||
                    normActive === (cat.name || "").trim().toLowerCase() ||
                    (cat.id === "all" && (!normActive || normActive === "all" || normActive === "all items"));
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveCategory(cat.id === "all" ? "all" : (cat.name || cat.id))}
                      className={`px-3 py-1.5 rounded-xl whitespace-nowrap font-bold flex items-center gap-1.5 select-none ${
                        isSel
                          ? "bg-gradient-to-r from-orange-600 to-amber-500 text-white"
                          : "border border-[#263653] bg-[#152036] text-slate-300"
                      }`}
                    >
                      <FolderOpen size={14} aria-hidden="true" />
                      <span>{cat.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Product Grid */}
            {loading ? (
              <div role="status" aria-label="Loading products" className="relative z-10 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 pt-1">
                {Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="overflow-hidden rounded-2xl border border-slate-800 bg-[#111c32] p-3 space-y-3">
                    <div className="skeleton-shimmer-dark aspect-[4/3] rounded-xl w-full" />
                    <div className="space-y-2">
                      <div className="skeleton-shimmer-dark h-4 w-3/4 rounded" />
                      <div className="skeleton-shimmer-dark h-3 w-1/2 rounded" />
                      <div className="skeleton-shimmer-dark h-9 w-full rounded-xl mt-2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredProducts.length > 0 ? (
              <div className="relative z-10 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 pt-1">
                {filteredProducts.map((item) => (
                  <div
                    key={item.id}
                    className="group relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-[#152036] to-[#101a2d] shadow-lg shadow-black/10 transition duration-200 hover:-translate-y-0.5 hover:border-orange-400/70 hover:shadow-orange-950/20"
                  >
                    <div className="relative w-full aspect-[4/3] bg-[#070b14] overflow-hidden">
                      <img
                        src={item.photoUrl}
                        alt={item.name || item.nameGu || item.nameEn}
                        className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
                          !item.inStock ? "grayscale opacity-50" : ""
                        }`}
                      />

                      {/* Category Pill */}
                      <span className="absolute bottom-2 left-2 bg-black/75 backdrop-blur-md text-amber-300 border border-white/10 text-[9px] font-bold px-2 py-0.5 rounded-md">
                        {item.category}
                      </span>

                      {/* Merchant Action Buttons */}
                      <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                        <button
                          type="button"
                          onClick={() => openModal(item)}
                          aria-label={`Edit ${item.name || item.nameGu || item.nameEn}`}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 bg-amber-400 text-sm font-bold text-slate-950 shadow-lg transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(item.id, item.name || item.nameGu || item.nameEn || "item")}
                          aria-label={`Delete ${item.name || item.nameGu || item.nameEn}`}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-rose-600 text-sm font-bold text-white shadow-lg transition hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                      <div>
                        <h4 className="line-clamp-1 text-sm font-bold text-white sm:text-base">
                          {item.name || item.nameGu || item.nameEn}
                        </h4>
                        {item.nameEn && item.nameEn !== (item.name || item.nameGu) && (
                          <p className="line-clamp-1 text-xs text-slate-400">
                            {item.nameEn}
                          </p>
                        )}
                      </div>

                      {/* Inline Quick Price & Weight Edit */}
                      {quickEditing?.productId === item.id ? (
                        <div className="rounded-xl border border-amber-400/40 bg-[#0c1322] p-2.5 space-y-2 shadow-inner">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-amber-400">₹</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={quickEditing.price}
                              onChange={(e) => setQuickEditing((prev) => prev ? { ...prev, price: e.target.value } : null)}
                              placeholder="Price"
                              className="w-20 rounded-lg border border-[#34445f] bg-[#152036] px-2 py-1 text-xs font-bold text-white focus:border-orange-400 focus:outline-none"
                              autoFocus
                            />
                            <div className="ml-auto flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleSaveQuickEdit(item)}
                                disabled={isSavingQuickEdit}
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow transition hover:bg-emerald-500 disabled:opacity-50"
                                title="Save"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setQuickEditing(null)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-700 text-slate-300 transition hover:bg-slate-600"
                                title="Cancel"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                          <div>
                            <input
                              type="text"
                              value={quickEditing.units}
                              onChange={(e) => setQuickEditing((prev) => prev ? { ...prev, units: e.target.value } : null)}
                              placeholder="Packing (e.g. 500g, 1kg)"
                              className="w-full rounded-lg border border-[#34445f] bg-[#152036] px-2 py-1 text-[11px] text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none"
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                            <span>Packing:</span>
                            <button
                              type="button"
                              onClick={() => startQuickEdit(item)}
                              className="group/price flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold text-amber-400 hover:bg-amber-400/10 transition"
                              title="Click to quickly edit price & packing"
                            >
                              <span>₹{item.price}</span>
                              <Pencil size={11} className="text-slate-400 opacity-60 group-hover/price:text-amber-400 group-hover/price:opacity-100 transition" />
                            </button>
                          </div>

                          <div
                            onClick={() => startQuickEdit(item)}
                            className="flex flex-wrap gap-1 cursor-pointer group/units"
                            title="Click to quickly edit price & packing"
                          >
                            {item.units?.map((u, i) => (
                              <span
                                key={i}
                                className="rounded-lg border border-slate-700/60 bg-[#0c1322] px-2 py-1 text-[11px] text-slate-300 group-hover/units:border-amber-400/40 transition"
                              >
                                {u}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Single In Stock Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleStock(item)}
                        className={`mt-1 min-h-10 w-full rounded-xl border px-3 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 ${
                          item.inStock
                            ? "border-emerald-500/40 bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600/25"
                            : "border-rose-500/40 bg-rose-600/15 text-rose-300 hover:bg-rose-600/25"
                        }`}
                      >
                        {item.inStock ? (
                          <>
                            <CircleCheck className="mr-1 inline" size={15} />
                            In Stock
                          </>
                        ) : (
                          <>
                            <CircleX className="mr-1 inline" size={15} />
                            Out of Stock
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-[#0c1322]/70 px-5 py-12 text-center">
                <ShoppingBasket className="mx-auto text-slate-500" size={32} aria-hidden="true" />
                <h3 className="mt-3 text-base font-bold text-white">No products found</h3>
                <p className="mt-1 text-sm text-slate-400">Try adjusting your search or category filter.</p>
              </div>
            )}
          </main>
        )}

        {/* ========================================================= */}
        {/* TAB 4: ORDERS & CSV MANAGEMENT                             */}
        {/* ========================================================= */}
        {activeTab === "orders" && (
          <main className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto w-full flex-1">
            {/* Orders Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-slate-800 bg-[#0f172a] p-5 shadow-lg">
              <div>
                <h3 className="text-lg font-black text-white sm:text-xl flex items-center gap-2">
                  <ShoppingCart className="text-emerald-400" size={20} />
                  <span>Customer Orders & Data Tools</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Customer WhatsApp orders ({orders.length} archived) • Print receipts & export catalog
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExportModalOpen(true)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3.5 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/20 transition"
                  title="Export products to Multi-Sheet Excel (.xlsx) or CSV"
                >
                  <FileDown size={15} /> Export (Excel/CSV)
                </button>
                <button
                  type="button"
                  onClick={() => csvInputRef.current?.click()}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/20 transition"
                  title="Import products from Excel (.xlsx) or CSV"
                >
                  <FileUp size={15} /> Import (Excel/CSV)
                </button>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,application/vnd.ms-excel"
                  onChange={importCsv}
                  className="sr-only"
                  aria-label="Import products from Excel or CSV"
                />
                {csvError && <span role="alert" className="self-center text-xs text-rose-300">{csvError}</span>}
              </div>
            </div>

            {/* Order Selection & Bulk Actions Toolbar */}
            {orders.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-[#101a2d] px-4 py-3 sm:px-6">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300 hover:text-white select-none">
                  <input
                    type="checkbox"
                    checked={orders.length > 0 && selectedOrderIds.length === orders.length}
                    onChange={handleSelectAllOrders}
                    className="h-4 w-4 rounded accent-orange-500 cursor-pointer"
                  />
                  <span>Select All ({selectedOrderIds.length}/{orders.length})</span>
                </label>
                <div className="flex items-center gap-2">
                  {selectedOrderIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDeleteSelectedOrders}
                      disabled={isDeletingOrders}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-bold text-rose-300 transition hover:bg-rose-500/25 disabled:opacity-50"
                    >
                      <Trash2 size={13} /> Delete Selected ({selectedOrderIds.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleClearAllOrders}
                    disabled={isDeletingOrders}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:border-rose-400/40 hover:bg-rose-950/40 hover:text-rose-200 disabled:opacity-50"
                  >
                    <Trash2 size={13} /> Clear All Orders
                  </button>
                </div>
              </div>
            )}

            {/* Orders List */}
            <div className="space-y-3">
              {orders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center text-sm text-slate-400">
                  <ShoppingCart className="mx-auto text-slate-600 mb-2" size={32} />
                  <h4 className="font-bold text-white">No archived orders yet</h4>
                  <p className="text-xs text-slate-500 mt-1">Customer-submitted WhatsApp checkout orders will appear here.</p>
                </div>
              ) : (
                orders.map((order) => {
                  const isSelected = selectedOrderIds.includes(order.id);
                  const adj = getOrderAdjustment(order.id);
                  const discountVal = Math.max(0, Number(adj.discount) || 0);
                  const finalTotal = Math.max(0, Number(order.total) - discountVal);
                  return (
                    <article
                      key={order.id}
                      className={`rounded-2xl border p-4 transition-colors ${
                        isSelected ? "border-orange-500/50 bg-[#16233d]" : "border-slate-800 bg-[#0f172a]"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectOrder(order.id)}
                            className="h-4 w-4 rounded accent-orange-500 cursor-pointer"
                          />
                          <div>
                            <h4 className="font-bold text-white">
                              {order.customerName} · {order.customerPhone}
                            </h4>
                            <p className="mt-1 text-xs text-slate-400">
                              {order.fulfillment === "pickup" ? "Store pickup" : `Home delivery · ${order.deliverySlot ?? "standard"}`} · {order.createdAt?.toDate?.().toLocaleString("en-IN") ?? "Recent order"}
                            </p>
                          </div>
                        </label>
                        <div className="text-right">
                          <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            {discountVal > 0 ? "Final Total" : "Total"}
                          </span>
                          <strong className="text-amber-300 text-sm sm:text-base font-mono">
                            ₹{finalTotal.toFixed(2)}
                          </strong>
                          {discountVal > 0 && (
                            <span className="block text-[10px] text-slate-400 line-through font-mono">
                              ₹{Number(order.total).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>

                      <ul className="my-3 space-y-1 border-y border-slate-800 py-2.5 text-xs text-slate-300">
                        {order.items.map((item, index) => (
                          <li key={`${order.id}-${item.id}-${index}`} className="flex justify-between gap-2">
                            <span>{item.name} × {item.quantity}</span>
                            <span className="font-mono">₹{(item.price * item.quantity).toFixed(2)}</span>
                          </li>
                        ))}
                      </ul>

                      {/* Order Adjustments: Discount & Notice */}
                      <div className="my-3 rounded-xl border border-slate-800 bg-[#0c1322] p-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                          {/* Discount Input */}
                          <div>
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                              Discount (₹)
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={order.total}
                              placeholder="0"
                              value={adj.discount}
                              onChange={(e) => updateOrderAdjustment(order.id, { discount: e.target.value })}
                              className="w-full rounded-lg border border-slate-700 bg-[#16233d] px-3 py-1.5 text-xs font-mono text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none"
                            />
                          </div>

                          {/* Final Total Calculation Display */}
                          <div className="flex flex-col sm:items-end justify-center">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                              Final Total
                            </span>
                            <div className="flex items-baseline gap-2 mt-0.5">
                              {discountVal > 0 && (
                                <span className="text-xs text-slate-400 line-through font-mono">
                                  ₹{Number(order.total).toFixed(2)}
                                </span>
                              )}
                              <span className="text-base font-extrabold font-mono text-emerald-400">
                                ₹{finalTotal.toFixed(2)}
                              </span>
                              {discountVal > 0 && (
                                <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                                  -₹{discountVal.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Notice Text & Show Notice Toggle */}
                        <div className="space-y-2 pt-2 border-t border-slate-800">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                              Notice Text
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-300 select-none hover:text-white">
                              <input
                                type="checkbox"
                                checked={adj.showNotice}
                                onChange={(e) => updateOrderAdjustment(order.id, { showNotice: e.target.checked })}
                                className="h-3.5 w-3.5 rounded accent-orange-500 cursor-pointer"
                              />
                              <span>Show Notice</span>
                            </label>
                          </div>
                          <input
                            type="text"
                            placeholder="e.g. Free delivery applied. Visit again!"
                            value={adj.noticeText}
                            onChange={(e) => updateOrderAdjustment(order.id, { noticeText: e.target.value })}
                            className={`w-full rounded-lg border px-3 py-1.5 text-xs text-white placeholder-slate-500 transition focus:outline-none ${
                              adj.showNotice
                                ? "border-amber-500/50 bg-[#16233d] focus:border-amber-400"
                                : "border-slate-700 bg-[#16233d]/70 text-slate-400 focus:border-slate-500"
                            }`}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => printThermalReceipt(order)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/20"
                        >
                          <Printer size={14} /> Print bill
                        </button>
                        <button
                          type="button"
                          onClick={() => copyOrderTemplate(order, "packed")}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20"
                        >
                          <Copy size={14} /> Packed · 15 min
                        </button>
                        <button
                          type="button"
                          onClick={() => copyOrderTemplate(order, "ready")}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/20"
                        >
                          <MessageCircle size={14} /> Pickup ready
                        </button>
                        <button
                          type="button"
                          onClick={() => handleWhatsAppClick(order)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-bold text-white hover:bg-[#20ba59] transition"
                        >
                          <MessageCircle size={14} /> WhatsApp customer
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </main>
        )}

        {/* ========================================================= */}
        {/* TAB 5: STORE SETTINGS                                      */}
        {/* ========================================================= */}
        {activeTab === "settings" && (
          <main className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto w-full flex-1">
            {/* 6 Settings Modules Grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* 1. Store Profile & Branding */}
              <button
                type="button"
                onClick={() => {
                  setSettingsForm(storeSettings);
                  setSettingsView('profile');
                  setSettingsModalOpen(true);
                }}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-[#0f172a] p-5 text-left shadow-md transition-all hover:border-orange-500/40 hover:bg-[#15233e] cursor-pointer"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-500/25 bg-orange-500/10 text-orange-400 shadow-sm transition-transform group-hover:scale-105">
                    <Store size={22} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-white group-hover:text-orange-300 transition-colors">Store Profile & Branding</h4>
                    <p className="mt-0.5 truncate text-xs text-slate-400">Store name, custom logo, theme & address</p>
                  </div>
                </div>
                <ChevronRight size={19} className="shrink-0 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-orange-400" />
              </button>

              {/* 2. Operating Hours & WhatsApp */}
              <button
                type="button"
                onClick={() => {
                  setSettingsForm(storeSettings);
                  setSettingsView('hours');
                  setSettingsModalOpen(true);
                }}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-[#0f172a] p-5 text-left shadow-md transition-all hover:border-amber-500/40 hover:bg-[#15233e] cursor-pointer"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10 text-amber-400 shadow-sm transition-transform group-hover:scale-105">
                    <Clock size={22} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-white group-hover:text-amber-300 transition-colors">Operating Hours & WhatsApp</h4>
                    <p className="mt-0.5 truncate text-xs text-slate-400">Opening/closing timings, WhatsApp number & message templates</p>
                  </div>
                </div>
                <ChevronRight size={19} className="shrink-0 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-amber-400" />
              </button>

              {/* 3. Categories Management */}
              <button
                type="button"
                onClick={() => {
                  setSettingsForm(storeSettings);
                  setSettingsView('categories');
                  setSettingsModalOpen(true);
                }}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-[#0f172a] p-5 text-left shadow-md transition-all hover:border-orange-500/40 hover:bg-[#15233e] cursor-pointer"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-500/25 bg-orange-500/10 text-orange-400 shadow-sm transition-transform group-hover:scale-105">
                    <FolderOpen size={22} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-white group-hover:text-orange-300 transition-colors">Categories Management</h4>
                    <p className="mt-0.5 truncate text-xs text-slate-400">Reorder with arrows, edit names, manage catalog categories</p>
                  </div>
                </div>
                <ChevronRight size={19} className="shrink-0 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-orange-400" />
              </button>

              {/* 4. Payments & Checkout */}
              <button
                type="button"
                onClick={() => {
                  setSettingsForm(storeSettings);
                  setSettingsView('payments');
                  setSettingsModalOpen(true);
                }}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-[#0f172a] p-5 text-left shadow-md transition-all hover:border-emerald-500/40 hover:bg-[#15233e] cursor-pointer"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 shadow-sm transition-transform group-hover:scale-105">
                    <CreditCard size={22} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-white group-hover:text-emerald-300 transition-colors">Payments & Checkout</h4>
                    <p className="mt-0.5 truncate text-xs text-slate-400">UPI ID, QR code photo with cropper, payment instructions</p>
                  </div>
                </div>
                <ChevronRight size={19} className="shrink-0 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-emerald-400" />
              </button>

              {/* 5. Offers & Announcements */}
              <button
                type="button"
                onClick={() => {
                  setSettingsForm(storeSettings);
                  setSettingsView('offers');
                  setSettingsModalOpen(true);
                }}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-[#0f172a] p-5 text-left shadow-md transition-all hover:border-sky-500/40 hover:bg-[#15233e] cursor-pointer"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-500/25 bg-sky-500/10 text-sky-400 shadow-sm transition-transform group-hover:scale-105">
                    <Megaphone size={22} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-white group-hover:text-sky-300 transition-colors">Offers & Announcements</h4>
                    <p className="mt-0.5 truncate text-xs text-slate-400">Festival banner photo, popup toggle, announcement text</p>
                  </div>
                </div>
                <ChevronRight size={19} className="shrink-0 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-sky-400" />
              </button>

              {/* 6. Data & Backups */}
              <button
                type="button"
                onClick={() => {
                  setSettingsForm(storeSettings);
                  setSettingsView('backup');
                  setSettingsModalOpen(true);
                }}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-[#0f172a] p-5 text-left shadow-md transition-all hover:border-slate-600 hover:bg-[#15233e] cursor-pointer"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-600 bg-slate-800/80 text-slate-300 shadow-sm transition-transform group-hover:scale-105">
                    <Database size={22} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-white group-hover:text-slate-200 transition-colors">Data & Backups</h4>
                    <p className="mt-0.5 truncate text-xs text-slate-400">One-click JSON export, restore catalog, safety backup</p>
                  </div>
                </div>
                <ChevronRight size={19} className="shrink-0 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-slate-300" />
              </button>
            </div>
          </main>
        )}
      </div>

      {/* Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <div role="dialog" aria-modal="true" aria-labelledby="product-modal-title" className="my-auto flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-[#34445f] bg-[#0f172a] shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-[#263653] bg-[#152036] px-4 py-4 sm:px-6">
              <div>
                <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-orange-300">Product Details</p>
                <h3 id="product-modal-title" className="text-base font-black text-white sm:text-lg">
                {editingProduct ? "Edit Item Details" : "Add New Item"}
                </h3>
              </div>
              <button
                onClick={() => setProductModalOpen(false)}
                aria-label="Close modal"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#34445f] bg-[#0c1322] text-slate-400 transition hover:border-slate-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="flex-1 space-y-4 overflow-y-auto p-4 text-sm sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Item Name *</label>
                <input
                  type="text"
                  required
                  value={formItemName}
                  onChange={(e) => setFormItemName(e.target.value)}
                  placeholder="e.g., Moong Fada / Toor Dal"
                  className="w-full rounded-xl border border-[#34445f] bg-[#0a111f] px-3 py-3 text-sm text-white placeholder:text-slate-600 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Category *</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full rounded-xl border border-[#34445f] bg-[#0a111f] px-3 py-3 text-sm text-white focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                >
                  {adminCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">
                  Weight / Packing (comma separated) *
                </label>
                <input
                  type="text"
                  value={formUnits}
                  onChange={(e) => setFormUnits(e.target.value)}
                  placeholder="500g, 1kg, 2kg, 5kg"
                  className="w-full rounded-xl border border-[#34445f] bg-[#0a111f] px-3 py-3 text-sm text-white placeholder:text-slate-600 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">Price (₹)</label>
                <input
                  type="number"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-[#34445f] bg-[#0a111f] px-3 py-3 text-sm text-white placeholder:text-slate-600 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                />
              </div>

              <div><label className="mb-1.5 block text-xs font-bold text-slate-300">Brand</label><input value={formBrand} onChange={(event) => setFormBrand(event.target.value)} placeholder="Brand name" className="w-full rounded-xl border border-[#34445f] bg-[#0a111f] px-3 py-3 text-sm text-white" /></div>
              <div><label className="mb-1.5 block text-xs font-bold text-slate-300">Available quantity</label><input type="number" min="0" value={formStockCount} onChange={(event) => setFormStockCount(event.target.value)} className="w-full rounded-xl border border-[#34445f] bg-[#0a111f] px-3 py-3 text-sm text-white" /></div>
              <div><label className="mb-1.5 block text-xs font-bold text-slate-300">Original price (sale compare)</label><input type="number" min="0" value={formOriginalPrice} onChange={(event) => setFormOriginalPrice(event.target.value)} className="w-full rounded-xl border border-[#34445f] bg-[#0a111f] px-3 py-3 text-sm text-white" /></div>
              <label className="flex min-h-11 items-center justify-between rounded-xl border border-[#34445f] bg-[#0a111f] px-3 py-2 text-xs font-bold text-slate-300">Mark as special offer<input type="checkbox" checked={formOffer} onChange={(event) => setFormOffer(event.target.checked)} className="h-5 w-5 accent-amber-500" /></label>

              <div className="space-y-2.5 sm:col-span-2 rounded-2xl border border-[#263653] bg-[#0c1322] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="block text-xs font-bold text-slate-200">
                    Product Photo ({IMAGE_SPECS.product.ratioText}) - Recommended: {IMAGE_SPECS.product.recommended}
                  </span>
                  {formPhotoUrl && (
                    <button
                      type="button"
                      onClick={() => setFormPhotoUrl("")}
                      className="text-xs font-bold text-rose-400 hover:text-rose-300 transition"
                    >
                      Remove photo
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 px-3.5 py-2 text-xs font-bold text-amber-200 transition active:scale-95 shadow-sm">
                    <ImagePlus size={16} />
                    {formPhotoUrl ? "Change Photo" : "Upload Image"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) {
                          openCropperForFile(file, getCropTarget("product", "Adjust Product Photo"));
                        }
                      }}
                      className="sr-only"
                    />
                  </label>

                  {formPhotoUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        openCropperForUrl(formPhotoUrl, getCropTarget("product", "Adjust Product Photo"))
                      }
                      className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#34445f] bg-[#152036] hover:bg-[#1f2d4a] px-3.5 py-2 text-xs font-bold text-slate-200 transition"
                    >
                      <Pencil size={13} className="text-orange-400" />
                      Adjust & Crop
                    </button>
                  )}
                </div>

                {formPhotoUrl && (
                  <div className="flex items-center gap-3.5 pt-1">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 border-orange-500/50 shadow-md">
                      <img src={formPhotoUrl} alt="Product image preview" className="h-full w-full object-cover" />
                      <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[8px] font-bold text-orange-300">1:1</span>
                    </div>
                    <div className="text-xs space-y-0.5">
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <Check size={14} /> Photo is ready
                      </span>
                      <p className="text-[11px] text-slate-400">Click &ldquo;Save&rdquo; below to apply changes.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-[#34445f] bg-[#0a111f] p-3 sm:col-span-2">
                <span className="text-xs font-bold text-slate-300">In Stock?</span>
                <input
                  type="checkbox"
                  checked={formInStock}
                  onChange={(e) => setFormInStock(e.target.checked)}
                  className="h-5 w-5 cursor-pointer accent-orange-500"
                />
              </div>
              </div>

              <div className="sticky bottom-0 -mx-4 -mb-4 mt-2 flex gap-3 border-t border-[#263653] bg-[#111c32]/95 p-4 backdrop-blur sm:-mx-6 sm:-mb-6 sm:p-6">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="min-h-11 flex-1 rounded-xl border border-[#34445f] bg-[#0c1322] px-4 py-2.5 text-sm font-bold text-slate-300 transition hover:bg-[#17243b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-11 flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-orange-950/30 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slider Modal */}
      {isBannerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <div role="dialog" aria-modal="true" aria-labelledby="banner-modal-title" className="my-auto flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[#34445f] bg-[#0f172a] shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-[#263653] bg-[#152036] px-4 py-4 sm:px-6">
              <div>
                <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-orange-300">Homepage Appearance</p>
                <h3 id="banner-modal-title" className="inline-flex items-center gap-2 text-base font-black text-white sm:text-lg"><ImageIcon size={18} /> Slider / Banner Manager</h3>
              </div>
              <button
                type="button"
                onClick={() => setBannerModalOpen(false)}
                aria-label="Close modal"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#34445f] bg-[#0c1322] text-slate-400 transition hover:border-slate-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-4 text-sm sm:p-6">
              <form
                onSubmit={handleSaveBanner}
                aria-busy={isSavingBanner}
                className="space-y-3 rounded-2xl border border-[#263653] bg-[#0c1322] p-4 sm:p-5"
              >
                <div>
                  <h4 className="font-bold text-amber-300">
                    {editingBannerId ? "Edit Banner" : "Add New Banner"}
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">Add title, details, and photo to display in the banner slider.</p>
                </div>
                <input
                  type="text"
                  required
                  value={newBanTitle}
                  onChange={(e) => setNewBanTitle(e.target.value)}
                  placeholder="Banner Title (e.g. Pure Groundnut Oil Offer)"
                  className="w-full rounded-xl border border-[#34445f] bg-[#152036] px-3 py-3 text-sm text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                />
                <input
                  type="text"
                  value={newBanTag}
                  onChange={(e) => setNewBanTag(e.target.value)}
                  placeholder="Badge Tag (e.g. Special Offer)"
                  className="w-full rounded-xl border border-[#34445f] bg-[#152036] px-3 py-3 text-sm text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                />
                <input
                  type="text"
                  value={newBanDesc}
                  onChange={(e) => setNewBanDesc(e.target.value)}
                  placeholder="Short detail (e.g. Special discounts on 15kg tins)"
                  className="w-full rounded-xl border border-[#34445f] bg-[#152036] px-3 py-3 text-sm text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                />
                {/* Banner Image Upload & Adjust */}
                <div className="space-y-2 rounded-2xl border border-[#263653] bg-[#111c32] p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">
                      Banner Image ({IMAGE_SPECS.banner.ratioText}) - Recommended: {IMAGE_SPECS.banner.recommended}
                    </span>
                    {newBanImg && (
                      <button
                        type="button"
                        onClick={() => setNewBanImg("")}
                        className="text-xs font-bold text-rose-400 hover:text-rose-300"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 px-3.5 py-2 text-xs font-bold text-amber-200 transition active:scale-95 shadow-sm">
                      <ImagePlus size={15} />
                      {newBanImg ? "Change Banner Photo" : "Upload Banner Image"}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) {
                            openCropperForFile(file, getCropTarget("banner", "Adjust Banner Photo"));
                          }
                        }}
                        className="sr-only"
                      />
                    </label>

                    {newBanImg && (
                      <button
                        type="button"
                        onClick={() =>
                          openCropperForUrl(newBanImg, getCropTarget("banner", "Adjust Banner Photo"))
                        }
                        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#34445f] bg-[#152036] hover:bg-[#1f2d4a] px-3.5 py-2 text-xs font-bold text-slate-200 transition"
                      >
                        <Pencil size={13} className="text-orange-400" />
                        Adjust & Crop
                      </button>
                    )}
                  </div>

                  {newBanImg && (
                    <div className="relative w-full max-w-[1460px] aspect-[1460/545] rounded-xl overflow-hidden border border-[#34445f] bg-black/40 mt-1">
                      <img src={newBanImg} alt="Banner preview" className="w-full h-full object-cover object-center" />
                      <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-mono text-orange-300">
                        {IMAGE_SPECS.banner.ratioText} Preview
                      </span>
                    </div>
                  )}

                  <input
                    type="url"
                    value={newBanImg.startsWith("data:") ? "" : newBanImg}
                    onChange={(e) => setNewBanImg(e.target.value)}
                    placeholder="Or enter web image URL (Optional)"
                    className="w-full rounded-xl border border-[#34445f] bg-[#152036] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none"
                  />
                </div>
                <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[#34445f] bg-[#152036] px-3 py-2 text-xs font-semibold text-slate-200">
                  <span>Display on Homepage Slider</span>
                  <input
                    type="checkbox"
                    checked={newBanActive}
                    onChange={(event) => setNewBanActive(event.target.checked)}
                    className="h-5 w-5 accent-orange-500"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isSavingBanner}
                  className="min-h-11 w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-orange-950/30 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 disabled:cursor-wait disabled:opacity-60"
                >
                  {isSavingBanner
                    ? "Saving..."
                    : editingBannerId
                      ? "Save Banner Changes"
                      : "+ Save Banner"}
                </button>
                {editingBannerId && (
                  <button
                    type="button"
                    onClick={resetBannerForm}
                    className="min-h-10 w-full rounded-xl border border-[#34445f] bg-[#152036] px-4 py-2 text-xs font-bold text-slate-300 transition hover:bg-[#1b2a44]"
                  >
                    Cancel
                  </button>
                )}
              </form>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-200">Current Banners ({banners.length})</h4>
                {banners.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[#263653] bg-[#152036] p-3 transition hover:border-[#3c506f]"
                  >
                    <div className="flex items-center gap-2 flex-1 overflow-hidden">
                      <img
                        src={b.imgUrl}
                        alt=""
                        className="h-12 w-16 shrink-0 rounded-lg border border-[#34445f] object-cover"
                      />
                      <div className="truncate">
                        <h5 className="font-bold text-white truncate">{b.title}</h5>
                        <span className="text-[10px] text-amber-400">{b.tag}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => handleToggleBanner(b)}
                        aria-label={b.active ? `Hide ${b.title}` : `Activate ${b.title}`}
                        aria-pressed={b.active}
                        className={`min-h-9 rounded-lg border px-2 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 ${
                          b.active
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                            : "border-slate-500/30 bg-slate-500/10 text-slate-300 hover:bg-slate-500/20"
                        }`}
                      >
                        {b.active ? "Active" : "Hidden"}
                      </button>
                      <button
                        onClick={() => handleEditBanner(b)}
                        aria-label={`Edit ${b.title}`}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 p-1 font-bold text-amber-300 transition hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleDeleteBanner(b)}
                        aria-label={`Delete ${b.title}`}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/10 p-1 font-bold text-rose-300 transition hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {isOrdersModalOpen && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <section role="dialog" aria-modal="true" aria-labelledby="orders-title" className="my-auto flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-[#34445f] bg-[#0f172a] shadow-2xl">
            <header className="flex items-center justify-between border-b border-[#263653] bg-[#152036] px-4 py-4 sm:px-6">
              <div>
                <h2 id="orders-title" className="inline-flex items-center gap-2 text-lg font-black text-white">
                  <ClipboardList size={20} /> Order Archive
                </h2>
                <p className="text-xs text-slate-400">Customer-submitted WhatsApp orders ({orders.length})</p>
              </div>
              <button onClick={() => setOrdersModalOpen(false)} aria-label="Close order archive" className="rounded-lg p-2 text-slate-300 hover:text-white">
                <X size={19} />
              </button>
            </header>

            {/* 2. Order Archive Bulk & All Delete Toolbar */}
            {orders.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#263653] bg-[#101a2d] px-4 py-3 sm:px-6">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300 hover:text-white select-none">
                  <input
                    type="checkbox"
                    checked={orders.length > 0 && selectedOrderIds.length === orders.length}
                    onChange={handleSelectAllOrders}
                    className="h-4 w-4 rounded accent-orange-500 cursor-pointer"
                  />
                  <span>Select All ({selectedOrderIds.length}/{orders.length})</span>
                </label>
                <div className="flex items-center gap-2">
                  {selectedOrderIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDeleteSelectedOrders}
                      disabled={isDeletingOrders}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-bold text-rose-300 transition hover:bg-rose-500/25 disabled:opacity-50"
                    >
                      <Trash2 size={13} /> Delete Selected ({selectedOrderIds.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleClearAllOrders}
                    disabled={isDeletingOrders}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:border-rose-400/40 hover:bg-rose-950/40 hover:text-rose-200 disabled:opacity-50"
                  >
                    <Trash2 size={13} /> Clear All Orders
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
              {orders.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
                  No archived orders yet.
                </p>
              ) : (
                orders.map((order) => {
                  const isSelected = selectedOrderIds.includes(order.id);
                  const adj = getOrderAdjustment(order.id);
                  const discountVal = Math.max(0, Number(adj.discount) || 0);
                  const finalTotal = Math.max(0, Number(order.total) - discountVal);
                  return (
                    <article
                      key={order.id}
                      className={`rounded-2xl border p-4 transition-colors ${
                        isSelected
                          ? "border-orange-500/50 bg-[#16233d]"
                          : "border-[#263653] bg-[#111c32]"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectOrder(order.id)}
                            className="h-4 w-4 rounded accent-orange-500 cursor-pointer"
                          />
                          <div>
                            <h3 className="font-bold text-white">
                              {order.customerName} · {order.customerPhone}
                            </h3>
                            <p className="mt-1 text-xs text-slate-400">
                              {order.fulfillment === "pickup" ? "Store pickup" : `Home delivery · ${order.deliverySlot ?? "standard"}`} · {order.createdAt?.toDate?.().toLocaleString("en-IN") ?? "Recent order"}
                            </p>
                          </div>
                        </label>
                        <div className="text-right">
                          <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            {discountVal > 0 ? "Final Total" : "Total"}
                          </span>
                          <strong className="text-amber-300 font-mono">₹{finalTotal.toFixed(2)}</strong>
                          {discountVal > 0 && (
                            <span className="block text-[10px] text-slate-400 line-through font-mono">
                              ₹{Number(order.total).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                      <ul className="my-3 space-y-1 border-y border-slate-700 py-2 text-xs text-slate-300">
                        {order.items.map((item, index) => (
                          <li key={`${order.id}-${item.id}-${index}`} className="flex justify-between gap-2">
                            <span>{item.name} × {item.quantity}</span>
                            <span className="font-mono">₹{(item.price * item.quantity).toFixed(2)}</span>
                          </li>
                        ))}
                      </ul>

                      {/* Order Adjustments: Discount & Notice */}
                      <div className="my-3 rounded-xl border border-slate-700/80 bg-[#0c1322] p-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                          {/* Discount Input */}
                          <div>
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                              Discount (₹)
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={order.total}
                              placeholder="0"
                              value={adj.discount}
                              onChange={(e) => updateOrderAdjustment(order.id, { discount: e.target.value })}
                              className="w-full rounded-lg border border-slate-700 bg-[#16233d] px-3 py-1.5 text-xs font-mono text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none"
                            />
                          </div>

                          {/* Final Total Calculation Display */}
                          <div className="flex flex-col sm:items-end justify-center">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                              Final Total
                            </span>
                            <div className="flex items-baseline gap-2 mt-0.5">
                              {discountVal > 0 && (
                                <span className="text-xs text-slate-400 line-through font-mono">
                                  ₹{Number(order.total).toFixed(2)}
                                </span>
                              )}
                              <span className="text-base font-extrabold font-mono text-emerald-400">
                                ₹{finalTotal.toFixed(2)}
                              </span>
                              {discountVal > 0 && (
                                <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                                  -₹{discountVal.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Notice Text & Show Notice Toggle */}
                        <div className="space-y-2 pt-2 border-t border-slate-800">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                              Notice Text
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-300 select-none hover:text-white">
                              <input
                                type="checkbox"
                                checked={adj.showNotice}
                                onChange={(e) => updateOrderAdjustment(order.id, { showNotice: e.target.checked })}
                                className="h-3.5 w-3.5 rounded accent-orange-500 cursor-pointer"
                              />
                              <span>Show Notice</span>
                            </label>
                          </div>
                          <input
                            type="text"
                            placeholder="e.g. Free delivery applied. Visit again!"
                            value={adj.noticeText}
                            onChange={(e) => updateOrderAdjustment(order.id, { noticeText: e.target.value })}
                            className={`w-full rounded-lg border px-3 py-1.5 text-xs text-white placeholder-slate-500 transition focus:outline-none ${
                              adj.showNotice
                                ? "border-amber-500/50 bg-[#16233d] focus:border-amber-400"
                                : "border-slate-700 bg-[#16233d]/70 text-slate-400 focus:border-slate-500"
                            }`}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => printThermalReceipt(order)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/20"
                        >
                          <Printer size={15} /> Print bill
                        </button>
                        <button
                          type="button"
                          onClick={() => copyOrderTemplate(order, "packed")}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20"
                        >
                          <Copy size={15} /> Packed · 15 min
                        </button>
                        <button
                          type="button"
                          onClick={() => copyOrderTemplate(order, "ready")}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/20"
                        >
                          <MessageCircle size={15} /> Pickup ready
                        </button>
                        <button
                          type="button"
                          onClick={() => handleWhatsAppClick(order)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-bold text-white hover:bg-[#20ba59] transition"
                        >
                          <MessageCircle size={14} /> WhatsApp customer
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}

      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modal-title"
            className="glass-panel my-auto flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/20 bg-[#0f172a]/90 shadow-2xl shadow-black/50"
          >
            <header className="flex items-center justify-between border-b border-[#263653] bg-[#152036] px-4 py-4 sm:px-6">
              {settingsView === 'menu' ? (
                <div>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-orange-300">Store configuration</p>
                  <h2 id="settings-modal-title" className="text-lg font-black text-white">Store Settings</h2>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSettingsView('menu')}
                    className="group flex h-9 items-center gap-1.5 rounded-xl border border-[#34445f] bg-[#0c1322] px-3 text-xs font-bold text-slate-300 transition-all hover:border-orange-500/40 hover:bg-[#1a253c] hover:text-white"
                  >
                    <ChevronLeft size={16} className="text-orange-400 transition-transform group-hover:-translate-x-0.5" />
                    Back to Settings
                  </button>
                  <h2 id="settings-modal-title" className="text-base font-black text-white sm:text-lg">
                    {settingsView === 'profile' && "Store Profile & Branding"}
                    {settingsView === 'hours' && "Operating Hours & WhatsApp"}
                    {settingsView === 'categories' && "Categories Management"}
                    {settingsView === 'payments' && "Payments & Checkout"}
                    {settingsView === 'offers' && "Offers & Announcements"}
                    {settingsView === 'backup' && "Data & Backups"}
                  </h2>
                </div>
              )}
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                aria-label="Close store settings"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#34445f] bg-[#0c1322] text-slate-400 transition-all duration-200 hover:text-white"
              >
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
              {/* MASTER SETTINGS SCREEN */}
              {settingsView === 'menu' && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* 1. Store Profile & Branding */}
                    <button
                      type="button"
                      onClick={() => setSettingsView('profile')}
                      className="group flex items-center justify-between gap-4 rounded-2xl border border-[#263653] bg-[#111c32] p-4 text-left shadow-md transition-all duration-200 hover:border-orange-500/40 hover:bg-[#15233e] hover:shadow-lg active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-500/25 bg-orange-500/10 text-orange-400 shadow-sm transition-transform group-hover:scale-105">
                          <Store size={22} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-black text-white group-hover:text-orange-300 transition-colors">Store Profile & Branding</h3>
                          <p className="mt-0.5 truncate text-xs text-slate-400">Name, custom logo, PWA banner & social links</p>
                        </div>
                      </div>
                      <ChevronRight size={19} className="shrink-0 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-orange-400" />
                    </button>

                    {/* 2. Operating Hours & WhatsApp */}
                    <button
                      type="button"
                      onClick={() => setSettingsView('hours')}
                      className="group flex items-center justify-between gap-4 rounded-2xl border border-[#263653] bg-[#111c32] p-4 text-left shadow-md transition-all duration-200 hover:border-amber-500/40 hover:bg-[#15233e] hover:shadow-lg active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10 text-amber-400 shadow-sm transition-transform group-hover:scale-105">
                          <Clock size={22} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-black text-white group-hover:text-amber-300 transition-colors">Operating Hours & WhatsApp</h3>
                          <p className="mt-0.5 truncate text-xs text-slate-400">Fixed +91 mobile, address, 12h timings & min order</p>
                        </div>
                      </div>
                      <ChevronRight size={19} className="shrink-0 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-amber-400" />
                    </button>

                    {/* 3. Categories Management */}
                    <button
                      type="button"
                      onClick={() => setSettingsView('categories')}
                      className="group flex items-center justify-between gap-4 rounded-2xl border border-[#263653] bg-[#111c32] p-4 text-left shadow-md transition-all duration-200 hover:border-emerald-500/40 hover:bg-[#15233e] hover:shadow-lg active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 shadow-sm transition-transform group-hover:scale-105">
                          <Tag size={22} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-black text-white group-hover:text-emerald-300 transition-colors">Categories Management</h3>
                          <p className="mt-0.5 truncate text-xs text-slate-400">Shop categories, icons, reordering & deletion</p>
                        </div>
                      </div>
                      <ChevronRight size={19} className="shrink-0 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-emerald-400" />
                    </button>

                    {/* 4. Payments & Checkout */}
                    <button
                      type="button"
                      onClick={() => setSettingsView('payments')}
                      className="group flex items-center justify-between gap-4 rounded-2xl border border-[#263653] bg-[#111c32] p-4 text-left shadow-md transition-all duration-200 hover:border-sky-500/40 hover:bg-[#15233e] hover:shadow-lg active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-500/25 bg-sky-500/10 text-sky-400 shadow-sm transition-transform group-hover:scale-105">
                          <CreditCard size={22} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-black text-white group-hover:text-sky-300 transition-colors">Payments & Checkout</h3>
                          <p className="mt-0.5 truncate text-xs text-slate-400">UPI ID, Payee name & custom payment QR preview</p>
                        </div>
                      </div>
                      <ChevronRight size={19} className="shrink-0 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-sky-400" />
                    </button>

                    {/* 5. Offers & Announcements */}
                    <button
                      type="button"
                      onClick={() => setSettingsView('offers')}
                      className="group flex items-center justify-between gap-4 rounded-2xl border border-[#263653] bg-[#111c32] p-4 text-left shadow-md transition-all duration-200 hover:border-pink-500/40 hover:bg-[#15233e] hover:shadow-lg active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-pink-500/25 bg-pink-500/10 text-pink-400 shadow-sm transition-transform group-hover:scale-105">
                          <Megaphone size={22} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-black text-white group-hover:text-pink-300 transition-colors">Offers & Announcements</h3>
                          <p className="mt-0.5 truncate text-xs text-slate-400">Top sticky notice alert & first-visit popup banner</p>
                        </div>
                      </div>
                      <ChevronRight size={19} className="shrink-0 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-pink-400" />
                    </button>

                    {/* 6. Data & Backups */}
                    <button
                      type="button"
                      onClick={() => setSettingsView('backup')}
                      className="group flex items-center justify-between gap-4 rounded-2xl border border-[#263653] bg-[#111c32] p-4 text-left shadow-md transition-all duration-200 hover:border-purple-500/40 hover:bg-[#15233e] hover:shadow-lg active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-purple-500/25 bg-purple-500/10 text-purple-400 shadow-sm transition-transform group-hover:scale-105">
                          <Database size={22} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-black text-white group-hover:text-purple-300 transition-colors">Data & Backups</h3>
                          <p className="mt-0.5 truncate text-xs text-slate-400">Export or restore full JSON store database backups</p>
                        </div>
                      </div>
                      <ChevronRight size={19} className="shrink-0 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-purple-400" />
                    </button>
                  </div>
                </div>
              )}

              {/* 1. STORE PROFILE SUBVIEW */}
              {settingsView === 'profile' && (
                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <section className="glass-panel space-y-4 p-4 sm:p-5">
                    <div>
                      <h3 className="text-sm font-black text-white">Store Identity & Logo</h3>
                      <p className="text-xs text-slate-400">Manage your store title, custom branding logo, and PWA installation banner</p>
                    </div>

                    <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
                      Store name
                      <input
                        type="text"
                        value={settingsForm.storeName}
                        onChange={(event) => setSettingsForm((current) => ({ ...current, storeName: event.target.value }))}
                        className="w-full rounded-xl border border-[#34445f] bg-[#152036] px-3 py-3 text-sm text-white focus:border-orange-400 focus:outline-none"
                      />
                    </label>

                    {/* Logo Management */}
                    <div className="rounded-2xl border border-[#34445f] bg-[#111c32] p-4 space-y-3">
                      <span className="text-xs font-bold text-slate-200 block">
                        Store Logo ({IMAGE_SPECS.logo.ratioText}) - Recommended: {IMAGE_SPECS.logo.recommended}
                      </span>
                      <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="relative group shrink-0 flex flex-col items-center">
                          <div className="w-16 h-16 rounded-full border-2 border-orange-400 shadow-md bg-stone-900 flex items-center justify-center overflow-hidden">
                            {settingsForm.logoUrl ? (
                              <img
                                src={settingsForm.logoUrl}
                                alt="Store logo preview"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Store className="text-orange-400" size={28} />
                            )}
                          </div>
                          <span className="mt-1 block text-center text-[10px] font-semibold text-slate-400">Preview</span>
                        </div>

                        <div className="flex-1 w-full space-y-2">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                              Logo image URL
                            </label>
                            <input
                              type="url"
                              value={settingsForm.logoUrl.startsWith("data:") ? "" : settingsForm.logoUrl}
                              onChange={(event) => {
                                const url = event.target.value;
                                setSettingsForm((current) => ({
                                  ...current,
                                  logoUrl: url,
                                  logoMode: url ? "image" : current.logoMode,
                                }));
                              }}
                              placeholder="https://example.com/logo.png"
                              className="w-full rounded-xl border border-[#34445f] bg-[#152036] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none"
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#34445f] bg-[#152036] hover:bg-[#1f2d4a] px-3 py-2 text-xs font-bold text-slate-200 transition">
                              <ImagePlus size={15} className="text-orange-400" />
                              {settingsForm.logoUrl ? "Change logo image" : "Upload logo image"}
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = "";
                                  if (file) {
                                    openCropperForFile(file, getCropTarget("logo", "Adjust Store Logo"));
                                  }
                                }}
                                className="sr-only"
                              />
                            </label>

                            {settingsForm.logoUrl && (
                              <button
                                type="button"
                                onClick={() =>
                                  openCropperForUrl(settingsForm.logoUrl, getCropTarget("logo", "Adjust Store Logo"))
                                }
                                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-[#34445f] bg-[#152036] hover:bg-[#1f2d4a] px-3 py-2 text-xs font-bold text-slate-200 transition"
                              >
                                <Pencil size={13} className="text-orange-400" />
                                Adjust & Crop
                              </button>
                            )}

                            {settingsForm.logoUrl && (
                              <button
                                type="button"
                                onClick={() => setSettingsForm((current) => ({ ...current, logoUrl: "", logoMode: "icon" }))}
                                className="inline-flex min-h-9 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20 transition"
                              >
                                Reset to default icon
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* PWA Home Screen Install Banner Toggle */}
                    <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-[#34445f] bg-[#111c32]">
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>📲</span>
                          <span>Show Install Banner on Home Screen (Yes/No)</span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Display the floating PWA install prompt to visitors.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setSettingsForm((current) => ({
                            ...current,
                            showInstallBanner: !current.showInstallBanner,
                          }))
                        }
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition shrink-0 shadow-sm ${
                          settingsForm.showInstallBanner
                            ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                            : "bg-slate-700 hover:bg-slate-600 text-slate-300"
                        }`}
                      >
                        {settingsForm.showInstallBanner ? "Yes" : "No"}
                      </button>
                    </div>
                  </section>

                  {/* Social Media and Location */}
                  <section className="glass-panel space-y-3 p-3 sm:p-4">
                    <div>
                      <h4 className="text-sm font-bold text-white">Social Media & Location</h4>
                      <p className="mt-1 text-xs text-slate-400">Manage public links and map coordinates displayed in the storefront footer.</p>
                    </div>
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
                      Google Maps URL
                      <input
                        type="url"
                        value={settingsForm.mapLink}
                        onChange={(event) => setSettingsForm((current) => ({ ...current, mapLink: event.target.value }))}
                        className="w-full rounded-lg border border-[#34445f] bg-[#0c1322] px-3 py-2 text-sm text-white"
                      />
                    </label>
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <input
                        value={socialLabel}
                        onChange={(event) => setSocialLabel(event.target.value)}
                        placeholder="Instagram, Facebook, YouTube…"
                        className="min-w-0 rounded-lg border border-[#34445f] bg-[#0c1322] px-3 py-2 text-sm text-white"
                      />
                      <input
                        type="url"
                        value={socialUrl}
                        onChange={(event) => setSocialUrl(event.target.value)}
                        placeholder="https://…"
                        className="min-w-0 rounded-lg border border-[#34445f] bg-[#0c1322] px-3 py-2 text-sm text-white"
                      />
                      <button
                        type="button"
                        onClick={addSocialLink}
                        className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-sky-500"
                      >
                        <Plus size={15} />
                        Add
                      </button>
                    </div>
                    <div className="space-y-2">
                      {settingsForm.socialLinks.map((link) => (
                        <div key={link.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                          <input
                            aria-label="Social link label"
                            value={link.label}
                            onChange={(event) =>
                              setSettingsForm((current) => ({
                                ...current,
                                socialLinks: current.socialLinks.map((item) => (item.id === link.id ? { ...item, label: event.target.value } : item)),
                              }))
                            }
                            className="min-w-0 rounded-lg border border-[#34445f] bg-[#0c1322] px-3 py-2 text-sm text-white"
                          />
                          <input
                            aria-label="Social link URL"
                            type="url"
                            value={link.url}
                            onChange={(event) =>
                              setSettingsForm((current) => ({
                                ...current,
                                socialLinks: current.socialLinks.map((item) => (item.id === link.id ? { ...item, url: event.target.value } : item)),
                              }))
                            }
                            className="min-w-0 rounded-lg border border-[#34445f] bg-[#0c1322] px-3 py-2 text-sm text-white"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setSettingsForm((current) => ({
                                ...current,
                                socialLinks: current.socialLinks.filter((item) => item.id !== link.id),
                              }))
                            }
                            aria-label={`Remove ${link.label}`}
                            className="rounded-lg p-2 text-rose-300 hover:bg-rose-500/10"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Dedicated Save button */}
                  <button
                    type="submit"
                    disabled={isSavingSettings}
                    className="interactive-lift min-h-11 w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-sm font-black text-white transition-all duration-200 hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isSavingSettings ? "Saving settings..." : "Save Store Settings"}
                  </button>
                </form>
              )}

              {/* 2. OPERATING HOURS & WHATSAPP SUBVIEW */}
              {settingsView === 'hours' && (
                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <section className="glass-panel space-y-4 p-4 sm:p-5">
                    <div>
                      <h3 className="text-sm font-black text-white">Contact & Operating Schedule</h3>
                      <p className="text-xs text-slate-400">Configure WhatsApp customer ordering number, physical store address, and opening hours</p>
                    </div>

                    {/* WhatsApp order mobile number (+91 fixed, 10-digit input) */}
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
                      WhatsApp order mobile number (with country code)
                      <div className="flex items-center space-x-2">
                        <span className="inline-flex h-11 items-center justify-center rounded-xl border border-[#34445f] bg-[#152036] px-3.5 text-sm font-bold text-orange-400">
                          +91
                        </span>
                        <input
                          type="tel"
                          value={settingsForm.whatsappNumber}
                          onChange={(event) => {
                            const val = event.target.value.replace(/\D/g, "");
                            setSettingsForm((current) => ({ ...current, whatsappNumber: val.slice(0, 10) }));
                          }}
                          placeholder="10-digit mobile number"
                          maxLength={10}
                          pattern="[0-9]{10}"
                          className="flex-1 rounded-xl border border-[#34445f] bg-[#152036] px-3 py-3 text-sm text-white focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                        />
                      </div>
                    </label>

                    {/* Store Address */}
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
                      Store address
                      <input
                        type="text"
                        value={settingsForm.address}
                        onChange={(event) => setSettingsForm((current) => ({ ...current, address: event.target.value }))}
                        placeholder="Shop address, street, landmark, city"
                        className="w-full rounded-xl border border-[#34445f] bg-[#152036] px-3 py-3 text-sm text-white focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                      />
                    </label>

                    {/* Store timings display text */}
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
                      Store timings display label
                      <input
                        type="text"
                        value={settingsForm.hours}
                        onChange={(event) => setSettingsForm((current) => ({ ...current, hours: event.target.value }))}
                        placeholder="7:00 AM - 10:00 PM"
                        className="w-full rounded-xl border border-[#34445f] bg-[#152036] px-3 py-3 text-sm text-white focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                      />
                    </label>

                    {/* Daily Schedule & Min Delivery */}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="space-y-1 text-xs text-slate-300">
                        Opens (12-hour)
                        <input
                          type="text"
                          placeholder="6:00 AM"
                          value={settingsForm.openingTime}
                          onChange={(event) => setSettingsForm((current) => ({ ...current, openingTime: event.target.value }))}
                          className="w-full rounded-lg border border-[#34445f] bg-[#0c1322] p-2.5 text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-slate-300">
                        Closes (12-hour)
                        <input
                          type="text"
                          placeholder="9:00 PM"
                          value={settingsForm.closingTime}
                          onChange={(event) => setSettingsForm((current) => ({ ...current, closingTime: event.target.value }))}
                          className="w-full rounded-lg border border-[#34445f] bg-[#0c1322] p-2.5 text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-slate-300">
                        Minimum delivery ₹
                        <input
                          type="number"
                          min="0"
                          value={settingsForm.minimumDeliveryOrder}
                          onChange={(event) => setSettingsForm((current) => ({ ...current, minimumDeliveryOrder: Number(event.target.value) }))}
                          className="w-full rounded-lg border border-[#34445f] bg-[#0c1322] p-2.5 text-white focus:border-orange-400 focus:outline-none"
                        />
                      </label>
                    </div>
                  </section>

                  {/* Dedicated Save button */}
                  <button
                    type="submit"
                    disabled={isSavingSettings}
                    className="interactive-lift min-h-11 w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-sm font-black text-white transition-all duration-200 hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isSavingSettings ? "Saving settings..." : "Save Store Settings"}
                  </button>
                </form>
              )}

              {/* 3. CATEGORIES MANAGEMENT SUBVIEW */}
              {settingsView === 'categories' && (
                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <section className="glass-panel space-y-3 p-4 sm:p-5">
                    <div>
                      <h4 className="text-sm font-bold text-white">Shop Categories</h4>
                      <p className="mt-1 text-xs text-slate-400">
                        Edit labels/icons, change display order, or remove categories. Product assignments are moved when saved.
                      </p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[1fr_13rem_auto]">
                      <input
                        value={categoryName}
                        onChange={(event) => setCategoryName(event.target.value)}
                        placeholder="Category name (e.g. Grains)"
                        className="min-w-0 rounded-lg border border-[#34445f] bg-[#0c1322] px-3 py-2 text-sm text-white focus:border-orange-400 focus:outline-none"
                      />
                      <select
                        value={categoryIcon}
                        onChange={(event) => setCategoryIcon(event.target.value)}
                        className="rounded-lg border border-[#34445f] bg-[#0c1322] px-3 py-2 text-sm text-white focus:border-orange-400 focus:outline-none"
                      >
                        <option value="Wheat">🌾 Wheat (Grains)</option>
                        <option value="Droplets">💧 Droplets (Oil/Liquid)</option>
                        <option value="Flame">🔥 Flame (Spices)</option>
                        <option value="Cookie">🍪 Cookie (Snacks)</option>
                        <option value="Sparkles">✨ Sparkles (Personal Care)</option>
                        <option value="Lamp">🪔 Lamp (Pooja)</option>
                        <option value="Milk">🥛 Milk (Dairy)</option>
                        <option value="Apple">🍎 Apple (Fruits)</option>
                        <option value="Carrot">🥕 Carrot (Vegetables)</option>
                        <option value="Egg">🥚 Egg (Poultry/Eggs)</option>
                        <option value="Coffee">☕ Coffee (Beverages)</option>
                        <option value="SprayCan">🧴 Spray (Cleaning/Hygiene)</option>
                        <option value="Baby">👶 Baby (Baby Care)</option>
                        <option value="Croissant">🥐 Croissant (Bakery)</option>
                        <option value="Candy">🍬 Candy (Sweets)</option>
                        <option value="Beef">🥩 Beef/Meat (Meat)</option>
                        <option value="CupSoda">🥤 CupSoda (Cold Drinks)</option>
                        <option value="Pill">💊 Pill (Health/Medicine)</option>
                        <option value="Shirt">👕 Shirt (Clothing)</option>
                        <option value="Box">📦 Box (Other/Misc)</option>
                      </select>
                      <button
                        type="button"
                        onClick={saveCategoryDraft}
                        className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-orange-600"
                      >
                        <Plus size={15} />
                        {editingCategoryId ? "Update" : "Add"}
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(settingsForm.categories.length ? settingsForm.categories : DEFAULT_CATEGORIES).map((category, index, categories) => (
                        <div key={category.id} className="flex items-center gap-2 rounded-lg border border-[#34445f] bg-[#0c1322] p-2.5">
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                            {category.name}
                            <span className="ml-2 text-[10px] text-slate-500">{category.icon}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => moveCategory(category.id, -1)}
                            disabled={index === 0}
                            aria-label={`Move ${category.name} up`}
                            className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 disabled:opacity-30"
                          >
                            <ArrowUp size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveCategory(category.id, 1)}
                            disabled={index === categories.length - 1}
                            aria-label={`Move ${category.name} down`}
                            className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 disabled:opacity-30"
                          >
                            <ArrowDown size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCategoryId(category.id);
                              setCategoryName(category.name);
                              setCategoryIcon(category.icon);
                            }}
                            aria-label={`Edit ${category.name}`}
                            className="rounded-md p-1.5 text-amber-300 hover:bg-amber-500/10"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteCategory(category)}
                            aria-label={`Delete ${category.name}`}
                            className="rounded-md p-1.5 text-rose-300 hover:bg-rose-500/10"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Dedicated Save button */}
                  <button
                    type="submit"
                    disabled={isSavingSettings}
                    className="interactive-lift min-h-11 w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-sm font-black text-white transition-all duration-200 hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isSavingSettings ? "Saving settings..." : "Save Store Settings"}
                  </button>
                </form>
              )}

              {/* 4. PAYMENTS & CHECKOUT SUBVIEW */}
              {settingsView === 'payments' && (
                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <section className="glass-panel space-y-4 p-4 sm:p-5">
                    <div>
                      <h4 className="text-sm font-bold text-white">UPI & Payment Settings</h4>
                      <p className="mt-1 text-xs text-slate-400">Configure your store UPI ID, recipient name, and custom QR code for customer payments.</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5 text-xs font-semibold text-slate-300">
                        UPI ID
                        <input
                          value={settingsForm.upiId}
                          onChange={(event) => setSettingsForm((current) => ({ ...current, upiId: event.target.value }))}
                          placeholder="store@upi"
                          className="w-full rounded-xl border border-[#34445f] bg-[#0c1322] p-2.5 text-sm text-white focus:border-orange-400 focus:outline-none"
                        />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold text-slate-300">
                        UPI payee name
                        <input
                          value={settingsForm.upiName}
                          onChange={(event) => setSettingsForm((current) => ({ ...current, upiName: event.target.value }))}
                          placeholder="Store Owner / Business Name"
                          className="w-full rounded-xl border border-[#34445f] bg-[#0c1322] p-2.5 text-sm text-white focus:border-orange-400 focus:outline-none"
                        />
                      </label>
                    </div>

                    <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
                      Minimum delivery ₹
                      <input
                        type="number"
                        min="0"
                        value={settingsForm.minimumDeliveryOrder}
                        onChange={(event) => setSettingsForm((current) => ({ ...current, minimumDeliveryOrder: Number(event.target.value) }))}
                        className="w-full rounded-xl border border-[#34445f] bg-[#0c1322] p-2.5 text-sm text-white focus:border-orange-400 focus:outline-none"
                      />
                    </label>

                    {/* UPI QR Code Management with Preview & File Upload */}
                    <div className="rounded-2xl border border-[#34445f] bg-[#111c32] p-4 space-y-3">
                      <span className="text-xs font-bold text-slate-200 block">
                        UPI QR ({IMAGE_SPECS.upi.ratioText}) - Recommended: {IMAGE_SPECS.upi.recommended}
                      </span>
                      <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="w-24 h-24 rounded-xl border-2 border-dashed border-[#34445f] bg-black/40 flex items-center justify-center overflow-hidden shrink-0">
                          {settingsForm.upiQrUrl ? (
                            <img src={settingsForm.upiQrUrl} alt="UPI QR Preview" className="w-full h-full object-contain" />
                          ) : (
                            <CreditCard size={28} className="text-slate-500" />
                          )}
                        </div>
                        <div className="flex-1 w-full space-y-2">
                          <input
                            type="url"
                            value={settingsForm.upiQrUrl.startsWith("data:") ? "" : settingsForm.upiQrUrl}
                            onChange={(event) => setSettingsForm((current) => ({ ...current, upiQrUrl: event.target.value }))}
                            placeholder="Leave blank to generate a dynamic QR from UPI ID"
                            className="w-full rounded-xl border border-[#34445f] bg-[#152036] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#34445f] bg-[#152036] hover:bg-[#1f2d4a] px-3 py-2 text-xs font-bold text-slate-200 transition">
                              <ImagePlus size={15} className="text-orange-400" />
                              {settingsForm.upiQrUrl ? "Change QR Image" : "Upload QR Image"}
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = "";
                                  if (file) {
                                    openCropperForFile(file, getCropTarget("upi", "Adjust UPI QR"));
                                  }
                                }}
                                className="sr-only"
                              />
                            </label>
                            {settingsForm.upiQrUrl && (
                              <button
                                type="button"
                                onClick={() =>
                                  openCropperForUrl(settingsForm.upiQrUrl, getCropTarget("upi", "Adjust UPI QR"))
                                }
                                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-[#34445f] bg-[#152036] hover:bg-[#1f2d4a] px-3 py-2 text-xs font-bold text-slate-200 transition"
                              >
                                <Pencil size={13} className="text-orange-400" />
                                Adjust & Crop
                              </button>
                            )}
                            {settingsForm.upiQrUrl && (
                              <button
                                type="button"
                                onClick={() => setSettingsForm((current) => ({ ...current, upiQrUrl: "" }))}
                                className="inline-flex min-h-9 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20 transition"
                              >
                                Remove Custom QR
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Dedicated Save button */}
                  <button
                    type="submit"
                    disabled={isSavingSettings}
                    className="interactive-lift min-h-11 w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-sm font-black text-white transition-all duration-200 hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isSavingSettings ? "Saving settings..." : "Save Store Settings"}
                  </button>
                </form>
              )}

              {/* 5. OFFERS & ANNOUNCEMENTS SUBVIEW */}
              {settingsView === 'offers' && (
                <form onSubmit={handleSaveSettings} className="space-y-4">
                  {/* Hero Banner Text */}
                  <section className="glass-panel space-y-3 p-4 sm:p-5">
                    <div>
                      <h4 className="text-sm font-bold text-white">Hero Banner Text</h4>
                      <p className="mt-1 text-xs text-slate-400">Main headline and subtitle shown on the storefront hero banner.</p>
                    </div>

                    <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
                      Hero Title
                      <input
                        type="text"
                        value={settingsForm.heroTitle || ""}
                        onChange={(event) => setSettingsForm((current) => ({ ...current, heroTitle: event.target.value }))}
                        placeholder="ઘરે બેઠા ઓર્ડર કરો, ફ્રી ડિલિવરી મેળવો"
                        className="w-full rounded-xl border border-[#34445f] bg-[#0c1322] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                      />
                    </label>

                    <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
                      Hero Subtitle
                      <textarea
                        rows={2}
                        value={settingsForm.heroSubtitle || ""}
                        onChange={(event) => setSettingsForm((current) => ({ ...current, heroSubtitle: event.target.value }))}
                        placeholder="Zanzmer અને આસપાસના વિસ્તારોમાં તાજા કરિયાણાની ઝડપી ડિલિવરી. અત્યારે જ ઓર્ડર કરો!"
                        className="w-full resize-y rounded-xl border border-[#34445f] bg-[#0c1322] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                      />
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
                        Top Badge Text (e.g., 10% OFFER)
                        <input
                          type="text"
                          value={settingsForm.heroBadge || ""}
                          onChange={(event) => setSettingsForm((current) => ({ ...current, heroBadge: event.target.value }))}
                          placeholder="10% OFFER"
                          className="w-full rounded-xl border border-[#34445f] bg-[#0c1322] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                        />
                      </label>

                      <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
                        Sub-Badge Text (e.g., DEAL OF THE DAY)
                        <input
                          type="text"
                          value={settingsForm.heroSubBadge || ""}
                          onChange={(event) => setSettingsForm((current) => ({ ...current, heroSubBadge: event.target.value }))}
                          placeholder="DEAL OF THE DAY"
                          className="w-full rounded-xl border border-[#34445f] bg-[#0c1322] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
                        Button 1 Text
                        <input
                          type="text"
                          value={settingsForm.heroBtn1Text || ""}
                          onChange={(event) => setSettingsForm((current) => ({ ...current, heroBtn1Text: event.target.value }))}
                          placeholder="Shop Pure Oil"
                          className="w-full rounded-xl border border-[#34445f] bg-[#0c1322] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                        />
                      </label>

                      <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
                        Button 2 Text
                        <input
                          type="text"
                          value={settingsForm.heroBtn2Text || ""}
                          onChange={(event) => setSettingsForm((current) => ({ ...current, heroBtn2Text: event.target.value }))}
                          placeholder="View Seasonal Spices"
                          className="w-full rounded-xl border border-[#34445f] bg-[#0c1322] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                        />
                      </label>
                    </div>
                  </section>

                  {/* Sticky Notice Bar */}
                  <section className="glass-panel space-y-3 p-4 sm:p-5">
                    <div>
                      <h4 className="text-sm font-bold text-white">Top Notice Banner</h4>
                      <p className="mt-1 text-xs text-slate-400">Display an announcement marquee at the very top of your store page.</p>
                    </div>
                    <label className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-white/20 bg-slate-950/30 px-3 py-2 text-sm font-semibold text-slate-200">
                      <span>Show sticky notice bar</span>
                      <input
                        type="checkbox"
                        checked={settingsForm.noticeEnabled}
                        onChange={(event) => setSettingsForm((current) => ({ ...current, noticeEnabled: event.target.checked }))}
                        className="h-5 w-5 accent-orange-500"
                      />
                    </label>
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
                      Notice text
                      <textarea
                        rows={3}
                        value={settingsForm.noticeText}
                        onChange={(event) => setSettingsForm((current) => ({ ...current, noticeText: event.target.value }))}
                        className="w-full resize-y rounded-xl border border-[#34445f] bg-[#152036] px-3 py-3 text-sm text-white focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                      />
                    </label>
                  </section>

                  {/* First-Visit Promo Popup */}
                  <section className="glass-panel space-y-3 p-4 sm:p-5">
                    <div>
                      <h4 className="text-sm font-bold text-white">First-Visit Promo Offer Popup</h4>
                      <p className="mt-1 text-xs text-slate-400">Show a promotional modal offer to customers on their first visit.</p>
                    </div>

                    <label className="flex items-center justify-between gap-3 text-sm font-bold text-white">
                      Enable first-visit offer popup
                      <input
                        type="checkbox"
                        checked={settingsForm.promoEnabled}
                        onChange={(event) => setSettingsForm((current) => ({ ...current, promoEnabled: event.target.checked }))}
                        className="h-5 w-5 accent-amber-500"
                      />
                    </label>

                    <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
                      Offer headline
                      <input
                        value={settingsForm.promoTitle}
                        onChange={(event) => setSettingsForm((current) => ({ ...current, promoTitle: event.target.value }))}
                        placeholder="Special Festival Offer"
                        className="w-full rounded-lg border border-[#34445f] bg-[#0c1322] p-2.5 text-sm text-white focus:border-orange-400 focus:outline-none"
                      />
                    </label>

                    <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
                      Offer details
                      <textarea
                        rows={2}
                        value={settingsForm.promoText}
                        onChange={(event) => setSettingsForm((current) => ({ ...current, promoText: event.target.value }))}
                        placeholder="Get 10% off on all winter spices and cold-pressed oils..."
                        className="w-full rounded-lg border border-[#34445f] bg-[#0c1322] p-2.5 text-sm text-white focus:border-orange-400 focus:outline-none"
                      />
                    </label>

                    {/* Promo Image with preview & crop */}
                    <div className="rounded-2xl border border-[#34445f] bg-[#111c32] p-4 space-y-3">
                      <span className="text-xs font-bold text-slate-200 block">
                        Offer Banner ({IMAGE_SPECS.promo.ratioText}) - Recommended: {IMAGE_SPECS.promo.recommended}
                      </span>
                      <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div className="w-28 h-16 rounded-xl border-2 border-dashed border-[#34445f] bg-black/40 flex items-center justify-center overflow-hidden shrink-0">
                          {settingsForm.promoImageUrl ? (
                            <img src={settingsForm.promoImageUrl} alt="Promo Banner Preview" className="w-full h-full object-cover" />
                          ) : (
                            <Megaphone size={24} className="text-slate-500" />
                          )}
                        </div>
                        <div className="flex-1 w-full space-y-2">
                          <input
                            type="url"
                            value={settingsForm.promoImageUrl.startsWith("data:") ? "" : settingsForm.promoImageUrl}
                            onChange={(event) => setSettingsForm((current) => ({ ...current, promoImageUrl: event.target.value }))}
                            placeholder="Offer image URL (optional)"
                            className="w-full rounded-xl border border-[#34445f] bg-[#152036] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#34445f] bg-[#152036] hover:bg-[#1f2d4a] px-3 py-2 text-xs font-bold text-slate-200 transition">
                              <ImagePlus size={15} className="text-orange-400" />
                              {settingsForm.promoImageUrl ? "Change Promo Image" : "Upload Promo Image"}
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = "";
                                  if (file) {
                                    openCropperForFile(file, getCropTarget("promo", "Adjust Offer Banner"));
                                  }
                                }}
                                className="sr-only"
                              />
                            </label>
                            {settingsForm.promoImageUrl && (
                              <button
                                type="button"
                                onClick={() =>
                                  openCropperForUrl(settingsForm.promoImageUrl, getCropTarget("promo", "Adjust Offer Banner"))
                                }
                                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-[#34445f] bg-[#152036] hover:bg-[#1f2d4a] px-3 py-2 text-xs font-bold text-slate-200 transition"
                              >
                                <Pencil size={13} className="text-orange-400" />
                                Adjust & Crop
                              </button>
                            )}
                            {settingsForm.promoImageUrl && (
                              <button
                                type="button"
                                onClick={() => setSettingsForm((current) => ({ ...current, promoImageUrl: "" }))}
                                className="inline-flex min-h-9 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20 transition"
                              >
                                Remove Promo Image
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Dedicated Save button */}
                  <button
                    type="submit"
                    disabled={isSavingSettings}
                    className="interactive-lift min-h-11 w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-sm font-black text-white transition-all duration-200 hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isSavingSettings ? "Saving settings..." : "Save Store Settings"}
                  </button>
                </form>
              )}

              {/* 6. DATA & BACKUPS SUBVIEW */}
              {settingsView === 'backup' && (
                <div className="space-y-4">
                  <section className="glass-panel space-y-4 p-4 sm:p-5">
                    <div>
                      <h3 className="font-bold text-white">Store Data & Backups</h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Export your complete store catalog (products, banners, categories, and settings) to a JSON file, or restore from a previous backup file.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={handleExportBackup}
                        className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm font-bold text-sky-200 transition-all duration-200 hover:bg-sky-500/20 active:scale-[0.99]"
                      >
                        <FileDown size={18} className="text-sky-400" />
                        Export JSON Backup
                      </button>

                      <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-center text-sm font-bold text-emerald-200 transition-all duration-200 hover:bg-emerald-500/20 active:scale-[0.99]">
                        <FileUp size={18} className="text-emerald-400" />
                        Restore from JSON
                        <input type="file" accept="application/json,.json" onChange={handleRestoreBackup} className="sr-only" />
                      </label>
                    </div>

                    <div className="rounded-xl border border-[#263653] bg-[#0c1322] p-3 text-xs text-slate-400">
                      <strong className="text-slate-300">Safety Tip:</strong> Always export a fresh JSON backup before restoring or making large catalog updates.
                    </div>
                  </section>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Image Crop & Position Adjust Modal */}
      {cropModalOpen && cropTarget && (
        <ImageCropModal
          isOpen={cropModalOpen}
          onClose={() => setCropModalOpen(false)}
          imageSrc={cropImageSrc}
          aspectRatio={cropTarget.type === "banner" ? 1460 / 545 : cropTarget.aspectRatio}
          title={cropTarget.title}
          outputWidth={cropTarget.outputWidth}
          outputHeight={cropTarget.outputHeight}
          onConfirm={handleCropConfirm}
        />
      )}

      {/* Category-Wise Multi-Sheet Excel & CSV Export Modal */}
      <CategoryExportModal
        isOpen={isExportModalOpen}
        onClose={() => setExportModalOpen(false)}
        products={products}
        storeCategories={storeSettings.categories}
        onExportExcel={handleExportExcel}
        onExportCsv={handleExportCsv}
      />

      {/* Polished Backdrop Blur Spinner Overlay */}
      {(isSavingProduct || isSavingBanner || isSavingSettings || isUploadingLogo) && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-sm text-white">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-orange-500/20 bg-[#0f172a] p-6 shadow-2xl">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-orange-500/20 border-t-orange-500" />
            <p className="text-xs font-bold text-slate-200">
              {isSavingProduct ? "Saving product…" : isSavingBanner ? "Saving banner…" : isSavingSettings ? "Saving settings…" : "Processing image…"}
            </p>
          </div>
        </div>
      )}
      {/* Hidden Receipt Element for html-to-image */}
      <div
        id="hidden-receipt-node"
        ref={hiddenReceiptRef}
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          backgroundColor: "#ffffff",
          width: "400px",
          color: "#0f172a",
          padding: "24px",
          boxSizing: "border-box",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          zIndex: -9999,
        }}
        aria-hidden="true"
      >
        {(() => {
          const currentOrder = billCaptureData?.order || (orders.length > 0 ? orders[0] : null);
          const currentDiscount = billCaptureData?.discount ?? 0;
          const currentFinalTotal = billCaptureData?.finalTotal ?? (currentOrder ? Number(currentOrder.total) : 0);
          const currentNoticeText = billCaptureData?.noticeText ?? "";
          const currentShowNotice = billCaptureData?.showNotice ?? false;

          return (
            <div>
              {/* Store Header */}
              <div style={{ textAlign: "center", marginBottom: "16px" }}>
                <h2
                  style={{
                    fontSize: "20px",
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "-0.5px",
                    margin: 0,
                    color: "#0f172a",
                  }}
                >
                  {storeSettings.storeName || "Jay Vachhraj General Store"}
                </h2>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    fontWeight: 600,
                    margin: "4px 0 0 0",
                  }}
                >
                  Daily Essentials & Grocery
                </p>
                <p
                  style={{
                    fontSize: "11px",
                    color: "#475569",
                    margin: "4px 0 0 0",
                    lineHeight: 1.3,
                  }}
                >
                  {storeSettings.address}
                </p>
                <p
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#1e293b",
                    margin: "2px 0 0 0",
                  }}
                >
                  WhatsApp / Mo: +91 {sanitizeWhatsAppNumber(storeSettings.whatsappNumber).slice(-10)}
                </p>
              </div>

              {/* Top Divider */}
              <div
                style={{
                  borderTop: "2px dashed #cbd5e1",
                  margin: "12px 0",
                }}
              />

              {/* Invoice Badge & Meta */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#334155",
                  marginBottom: "8px",
                }}
              >
                <span style={{ letterSpacing: "0.5px" }}>TAX INVOICE / RECEIPT</span>
                <span style={{ fontFamily: "monospace", color: "#0f172a" }}>
                  #{currentOrder ? currentOrder.id.slice(-8).toUpperCase() : "RECEIPT"}
                </span>
              </div>

              {/* Customer Details Box */}
              <div
                style={{
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  fontSize: "11px",
                  lineHeight: 1.5,
                  marginBottom: "14px",
                  color: "#334155",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b" }}>Date:</span>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>
                    {new Date(currentOrder?.createdAt?.toDate?.() ?? Date.now()).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b" }}>Customer:</span>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>
                    {currentOrder?.customerName || "Customer"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b" }}>Phone:</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#0f172a" }}>
                    {currentOrder?.customerPhone || "—"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b" }}>Fulfillment:</span>
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>
                    {currentOrder?.fulfillment === "pickup"
                      ? "Store Pickup"
                      : `Home Delivery (${currentOrder?.deliverySlot ?? "Standard"})`}
                  </span>
                </div>
                {currentOrder?.customerAddress && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      borderTop: "1px solid #e2e8f0",
                      marginTop: "4px",
                      paddingTop: "4px",
                    }}
                  >
                    <span style={{ color: "#64748b" }}>Address:</span>
                    <span
                      style={{
                        fontWeight: 500,
                        color: "#0f172a",
                        textAlign: "right",
                        maxWidth: "200px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {currentOrder.customerAddress}
                    </span>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "11px",
                  marginBottom: "14px",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "2px solid #0f172a",
                      color: "#475569",
                      textTransform: "uppercase",
                      fontSize: "10px",
                      letterSpacing: "0.5px",
                    }}
                  >
                    <th style={{ textAlign: "left", padding: "6px 4px 6px 0", fontWeight: 700 }}>Item</th>
                    <th style={{ textAlign: "center", padding: "6px 4px", fontWeight: 700 }}>Qty</th>
                    <th style={{ textAlign: "right", padding: "6px 4px", fontWeight: 700 }}>Rate</th>
                    <th style={{ textAlign: "right", padding: "6px 0 6px 4px", fontWeight: 700 }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(currentOrder?.items ?? []).map((item, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        color: "#1e293b",
                      }}
                    >
                      <td style={{ textAlign: "left", padding: "7px 4px 7px 0", fontWeight: 600 }}>
                        {item.name}
                      </td>
                      <td style={{ textAlign: "center", padding: "7px 4px", fontFamily: "monospace" }}>
                        {item.quantity}
                      </td>
                      <td style={{ textAlign: "right", padding: "7px 4px", fontFamily: "monospace", color: "#64748b" }}>
                        ₹{Number(item.price).toFixed(2)}
                      </td>
                      <td style={{ textAlign: "right", padding: "7px 0 7px 4px", fontFamily: "monospace", fontWeight: 700 }}>
                        ₹{(item.quantity * item.price).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals Divider */}
              <div
                style={{
                  borderTop: "2px dashed #cbd5e1",
                  margin: "12px 0 8px 0",
                }}
              />

              {/* Financial Calculation */}
              <div style={{ fontSize: "12px", lineHeight: 1.6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                  <span>Original Total:</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
                    ₹{Number(currentOrder?.total ?? 0).toFixed(2)}
                  </span>
                </div>

                {currentDiscount > 0 && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      color: "#15803d",
                      backgroundColor: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: "6px",
                      padding: "3px 8px",
                      margin: "4px 0",
                      fontWeight: 700,
                    }}
                  >
                    <span>Discount Applied:</span>
                    <span style={{ fontFamily: "monospace" }}>
                      -₹{currentDiscount.toFixed(2)}
                    </span>
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderTop: "2px solid #0f172a",
                    marginTop: "8px",
                    paddingTop: "8px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "-0.3px",
                      color: "#0f172a",
                    }}
                  >
                    Final Total Payable:
                  </span>
                  <span
                    style={{
                      fontSize: "18px",
                      fontWeight: 900,
                      fontFamily: "monospace",
                      color: "#15803d",
                    }}
                  >
                    ₹{currentFinalTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Notice Box (if toggled ON) */}
              {currentShowNotice && currentNoticeText.trim() && (
                <div
                  style={{
                    marginTop: "16px",
                    backgroundColor: "#fefce8",
                    border: "1.5px solid #fde047",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    textAlign: "center",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      fontSize: "10px",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      color: "#a16207",
                      marginBottom: "3px",
                    }}
                  >
                    ★ Notice ★
                  </span>
                  <p
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#713f12",
                      margin: 0,
                      lineHeight: 1.4,
                    }}
                  >
                    {currentNoticeText}
                  </p>
                </div>
              )}

              {/* Footer */}
              <div
                style={{
                  marginTop: "18px",
                  paddingTop: "12px",
                  borderTop: "1px dashed #cbd5e1",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#0f172a",
                    margin: 0,
                  }}
                >
                  Thank you for shopping with us! Visit again!
                </p>
                <p
                  style={{
                    fontSize: "10px",
                    color: "#94a3b8",
                    margin: "3px 0 0 0",
                  }}
                >
                  System Generated Receipt
                </p>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}