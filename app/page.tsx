"use client";

import { useState, useEffect, useRef, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { db } from "./firebase";
import { addDoc, collection, doc, getDocs, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import html2canvas from "html2canvas";
import { Camera, Check, CheckCircle2, Clock, Copy, ExternalLink, FileDown, FolderOpen, Heart, Home, Loader2, LockKeyhole, MapPin, MessageCircle, Mic, Minus, Phone, Plus, Search, ShieldAlert, ShieldCheck, ShoppingBag, Sparkles, Store, Truck, X, Wheat, Droplets, Flame, Cookie, Lamp, Megaphone, Share2, SlidersHorizontal } from "lucide-react";
import { DEFAULT_CATEGORIES, DEFAULT_STORE_SETTINGS, normalizeStoreSettings, storeThemeCssVars, format12Hour, parseTimeToMinutes, StoreCategory, StoreSettings } from "./store-config";
import { generateSecureToken, saveMagicToken, AUTHORIZED_ADMINS, AdminProfile, ADMIN_PHONE } from "./admin-session";

interface Product {
  id: string;
  nameGu: string;
  nameEn?: string;
  category: string;
  units: string[];
  price: number;
  inStock: boolean;
  photoUrl: string;
  brand: string;
  stockCount: number;
  originalPrice: number;
  offer: boolean;
}

interface Banner {
  id: string;
  title: string;
  tag: string;
  desc: string;
  imgUrl: string;
  active: boolean;
}

interface CartItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  unit?: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface SpeechRecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const CATEGORY_ICONS: Record<string, typeof Wheat> = { Wheat, Droplets, Flame, Cookie, Lamp, Sparkles, Store, ExternalLink, MapPin };

export default function CustomerStorePage() {
  const router = useRouter();
  type SecretHoldState = "idle" | "hold_step1_green" | "hold_step2_red" | "magic_modal_open";

  const [secretHoldState, setSecretHoldState] = useState<SecretHoldState>("idle");
  const secretHoldStateRef = useRef<SecretHoldState>("idle");
  secretHoldStateRef.current = secretHoldState;

  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);
  const touchActiveRef = useRef(false);
  const holdStartTimeRef = useRef(0);

  // Magic link generator states
  const [selectedAdminId, setSelectedAdminId] = useState<string>(AUTHORIZED_ADMINS[0].id);
  const selectedAdmin = AUTHORIZED_ADMINS.find((a) => a.id === selectedAdminId) || AUTHORIZED_ADMINS[0];
  const [targetAdminProfile, setTargetAdminProfile] = useState<AdminProfile>(AUTHORIZED_ADMINS[0]);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [expiresCountdown, setExpiresCountdown] = useState<string>("05:00");

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const clearInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  };

  const armInactivityTimer = () => {
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      setSecretHoldState("idle");
    }, 15000);
  };

  // Dual-stage timed hold gesture handlers
  const handleHoldStart = () => {
    const currentState = secretHoldStateRef.current;
    if (currentState === "magic_modal_open") return;

    // In red state, single tap opens modal (handled in onClick / pointerUp)
    if (currentState === "hold_step2_red") {
      holdStartTimeRef.current = Date.now();
      return;
    }

    isHoldingRef.current = true;
    holdStartTimeRef.current = Date.now();
    clearHoldTimer();
    clearInactivityTimer();

    if (currentState === "idle") {
      // Timer 1 (5000ms continuous hold)
      holdTimerRef.current = setTimeout(() => {
        if (!isHoldingRef.current) return;
        try {
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate(200);
          }
        } catch {}
        setSecretHoldState("hold_step1_green");
        armInactivityTimer();

        // If user maintains continuous hold, start Timer 2 seamlessly
        holdTimerRef.current = setTimeout(() => {
          if (!isHoldingRef.current) return;
          try {
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate(300);
            }
          } catch {}
          setSecretHoldState("hold_step2_red");
          armInactivityTimer();
        }, 5000);
      }, 5000);
    } else if (currentState === "hold_step1_green") {
      // Timer 2 (5000ms continuous hold while in hold_step1_green)
      holdTimerRef.current = setTimeout(() => {
        if (!isHoldingRef.current) return;
        try {
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate(300);
          }
        } catch {}
        setSecretHoldState("hold_step2_red");
        armInactivityTimer();
      }, 5000);
    }
  };

  const handleHoldEnd = () => {
    const currentState = secretHoldStateRef.current;
    if (!isHoldingRef.current) return;
    isHoldingRef.current = false;

    if (currentState === "idle") {
      // Released before 5000ms: cancel timer and reset to idle
      clearHoldTimer();
      setSecretHoldState("idle");
    } else if (currentState === "hold_step1_green") {
      // If released while attempting step 2 hold before 5000ms:
      if (holdTimerRef.current) {
        clearHoldTimer();
        setSecretHoldState("idle");
      } else {
        armInactivityTimer();
      }
    } else if (currentState === "hold_step2_red") {
      armInactivityTimer();
    }
  };

  const handleSecretIconClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (secretHoldStateRef.current === "hold_step2_red") {
      clearInactivityTimer();
      clearHoldTimer();
      setSecretHoldState("magic_modal_open");
    }
  };

  const onTouchStartSecret = (e: React.TouchEvent) => {
    touchActiveRef.current = true;
    handleHoldStart();
  };

  const onTouchEndSecret = () => {
    handleHoldEnd();
    if (secretHoldStateRef.current === "hold_step2_red") {
      const duration = Date.now() - holdStartTimeRef.current;
      if (duration < 800) {
        clearInactivityTimer();
        clearHoldTimer();
        setSecretHoldState("magic_modal_open");
      }
    }
    setTimeout(() => {
      touchActiveRef.current = false;
    }, 400);
  };

  const onTouchCancelSecret = () => {
    handleHoldEnd();
    touchActiveRef.current = false;
  };

  const onMouseDownSecret = (e: React.MouseEvent) => {
    if (touchActiveRef.current) return;
    if (e.button !== 0) return;
    handleHoldStart();
  };

  const onMouseUpSecret = () => {
    if (touchActiveRef.current) return;
    handleHoldEnd();
  };

  const onMouseLeaveSecret = () => {
    if (touchActiveRef.current) return;
    handleHoldEnd();
  };

  const handleCloseSecretModal = () => {
    setSecretHoldState("idle");
    setGeneratedToken(null);
    setTokenExpiresAt(null);
    setLinkCopied(false);
    setSelectedAdminId(AUTHORIZED_ADMINS[0].id);
    setTargetAdminProfile(AUTHORIZED_ADMINS[0]);
    clearHoldTimer();
    clearInactivityTimer();
  };

  // WhatsApp Magic Link generation targeting selected admin
  const handleGenerateAdminMagicLink = async () => {
    try {
      setIsGeneratingToken(true);
      const token = generateSecureToken();
      const record = await saveMagicToken(token, selectedAdmin);
      
      setGeneratedToken(token);
      setTokenExpiresAt(record.expiresAt);
      setTargetAdminProfile(selectedAdmin);
      setLinkCopied(false);

      const magicUrl = `https://vachhraj-store.web.app/admin/verify?token=${token}`;
      const whatsappUrl = `https://wa.me/${selectedAdmin.phone}?text=${encodeURIComponent(
        `Jay Vachhraj Store Admin Login: ${magicUrl}`
      )}`;

      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Failed to generate magic token:", err);
    } finally {
      setIsGeneratingToken(false);
    }
  };

  // Countdown for token expiration inside modal
  useEffect(() => {
    if (!tokenExpiresAt || secretHoldState !== "magic_modal_open") return;

    const updateCountdown = () => {
      const diff = Math.max(0, Math.floor((tokenExpiresAt - Date.now()) / 1000));
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setExpiresCountdown(
        `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      );
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [tokenExpiresAt, secretHoldState]);

  // Esc key modal dismissal
  useEffect(() => {
    if (secretHoldState !== "magic_modal_open") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCloseSecretModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [secretHoldState]);

  useEffect(() => {
    return () => {
      clearHoldTimer();
      clearInactivityTimer();
    };
  }, []);

  const [products, setProducts] = useState<Product[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [bannersLoading, setBannersLoading] = useState(true);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [brandFilter, setBrandFilter] = useState("all");
  const [saleOnly, setSaleOnly] = useState(false);
  const [sortPrice, setSortPrice] = useState("featured");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setListening] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState("gu-IN");
  const [sliderIndex, setSliderIndex] = useState(0);

  // Cart
  const [cart, setCart] = useState<{ [key: string]: CartItem }>({});
  const [isCartOpen, setCartOpen] = useState(false);

  // Customer Form
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custAddress, setCustAddress] = useState("");
  const [isPromoOpen, setPromoOpen] = useState(false);
  const [isInstallPromptVisible, setInstallPromptVisible] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [bouncedProductId, setBouncedProductId] = useState<string | null>(null);
  const [lastOrderAvailable, setLastOrderAvailable] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [isReceiptOpen, setReceiptOpen] = useState(false);
  const [isPreparingReceipt, setPreparingReceipt] = useState(false);
  const [isSharingReceipt, setIsSharingReceipt] = useState(false);
  const [receiptTimestamp, setReceiptTimestamp] = useState("");
  const [viewCount, setViewCount] = useState(0);
  const receiptRef = useRef<HTMLDivElement>(null);
  const cachedReceiptBlobRef = useRef<Blob | null>(null);
  const cachedReceiptFileRef = useRef<File | null>(null);
  const cachedReceiptDataUrlRef = useRef<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [storeSettings.logoUrl]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  useEffect(() => {
    const loadStore = async () => {
      try {
        setLoading(true);
        const prodSnap = await getDocs(collection(db, "products"));
        if (!prodSnap.empty) {
          const list = prodSnap.docs.map((d) => {
            const raw = d.data();
            let parsedUnits: string[] = ["1 pc"];
            if (Array.isArray(raw.units)) parsedUnits = raw.units;
            else if (typeof raw.unit === "string") parsedUnits = [raw.unit];

            return {
              id: d.id,
              nameGu: raw.nameGu || raw.name_gu || "Grocery Item",
              nameEn: raw.nameEn || raw.name_en || "",
              category: raw.category || "કઠોળ-અનાજ",
              units: parsedUnits,
              price: Number(raw.price) || 0,
              inStock: raw.inStock !== undefined ? raw.inStock : (raw.in_stock !== undefined ? raw.in_stock : true),
              photoUrl: raw.photoUrl || raw.photo_url || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60",
              brand: String(raw.brand ?? "Other"),
              stockCount: Math.max(0, Number(raw.stockCount ?? raw.stock ?? ((raw.inStock ?? raw.in_stock) === false ? 0 : 999999))),
              originalPrice: Number(raw.originalPrice ?? raw.compareAtPrice ?? raw.price) || 0,
              offer: raw.offer === true || Number(raw.originalPrice ?? raw.compareAtPrice ?? 0) > Number(raw.price ?? 0),
            } as Product;
          });
          setProducts(list);
          const sharedProductId = new URLSearchParams(window.location.search).get("item");
          if (sharedProductId) {
            const sharedProduct = list.find((product) => product.id === sharedProductId);
            if (sharedProduct) setSearchQuery(sharedProduct.nameEn?.trim() || sharedProduct.nameGu);
          }
        }

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadStore();
  }, []);

  useEffect(() => {
    return onSnapshot(
      collection(db, "banners"),
      (snapshot) => {
        const liveBanners: Banner[] = snapshot.docs.map((bannerDoc) => {
          const data = bannerDoc.data();
          return {
            id: bannerDoc.id,
            title: String(data.title ?? ""),
            tag: String(data.tag ?? ""),
            desc: String(data.desc ?? ""),
            imgUrl: String(data.imgUrl ?? data.imageUrl ?? ""),
            active: data.active !== false,
          };
        });
        setBanners(liveBanners);
        setBannersLoading(false);
      },
      (error) => {
        console.error("Failed to listen for slider updates:", error);
        setBanners([]);
        setBannersLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setFavorites(JSON.parse(localStorage.getItem("jay-store-favorites") || "[]"));
        setLastOrderAvailable(Boolean(localStorage.getItem("jay-store-last-order")));
      } catch {
        setFavorites([]);
      }
      const SpeechRecognition = (window as Window & { SpeechRecognition?: new () => SpeechRecognitionInstance; webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).SpeechRecognition
        ?? (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).webkitSpeechRecognition;
      setSpeechSupported(Boolean(SpeechRecognition));
    }, 0);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallPromptVisible(true);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const vars = storeThemeCssVars(storeSettings);
    Object.entries(vars).forEach(([name, value]) => root.style.setProperty(name, value));
    root.classList.toggle("dark", storeSettings.appearance === "dark");
    return () => {
      root.classList.remove("dark");
    };
  }, [storeSettings]);

  useEffect(() => {
    if (!storeSettings.promoEnabled) return;
    const key = "jay-store-promo-dismissed";
    if (sessionStorage.getItem(key)) return;
    const timer = window.setTimeout(() => setPromoOpen(true), 900);
    return () => window.clearTimeout(timer);
  }, [storeSettings.promoEnabled]);

  useEffect(() => {
    const unsub1 = onSnapshot(
      doc(db, "storeSettings", "main"),
      (snapshot) => {
        if (snapshot.exists()) {
          setStoreSettings(normalizeStoreSettings(snapshot.data() ?? {}));
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
          setStoreSettings(normalizeStoreSettings(snapshot.data() ?? {}));
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
  }, []);

  useEffect(() => {
    const visitKey = "jay-vachhraj-visit-counted";
    const metricsRef = doc(db, "siteMetrics", "views");
    const unsubscribe = onSnapshot(
      metricsRef,
      (snapshot) => setViewCount(Number(snapshot.data()?.count ?? 0)),
      (error) => console.error("Unable to read visitor metrics:", error),
    );
    if (!sessionStorage.getItem(visitKey)) {
      sessionStorage.setItem(visitKey, "true");
      runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(metricsRef);
        const count = Number(snapshot.data()?.count ?? 0) + 1;
        transaction.set(metricsRef, { count, updatedAt: serverTimestamp() }, { merge: true });
        return count;
      }).catch((error) => {
        sessionStorage.removeItem(visitKey);
        console.error("Unable to record the visit:", error);
      });
    }
    return unsubscribe;
  }, []);

  // Slider Rotate
  useEffect(() => {
    const active = banners.filter((b) => b.active);
    if (active.length <= 1) return;
    const timer = setInterval(() => {
      setSliderIndex((prev) => (prev + 1) % active.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [banners]);

  const addToCart = (product: Product) => {
    if (!product.inStock || product.stockCount <= 0) return;
    const key = product.id;
    if ((cart[key]?.quantity ?? 0) >= product.stockCount) {
      showToast("Only the available stock can be ordered.");
      return;
    }

    setCart((prev) => {
      const existing = prev[key];
      return {
        ...prev,
        [key]: {
          id: product.id,
          name: product.nameEn?.trim() || product.nameGu,
          price: product.price || 0,
          quantity: existing ? existing.quantity + 1 : 1,
          unit: product.units?.[0] || "1",
        },
      };
    });

    showToast(`${product.nameEn?.trim() || product.nameGu} added to your list.`);
    setBouncedProductId(product.id);
    window.setTimeout(() => setBouncedProductId((active) => active === product.id ? null : active), 500);
  };

  const startVoiceSearch = () => {
    const Recognition = (window as Window & { SpeechRecognition?: new () => SpeechRecognitionInstance; webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).SpeechRecognition
      ?? (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechError("Voice search is not available in this browser.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = speechLanguage;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      setSearchQuery(event.results[0]?.[0]?.transcript ?? "");
      setSpeechError("");
    };
    recognition.onerror = () => setSpeechError("Could not hear that. Try Gujarati, Hindi, or English.");
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const toggleFavorite = (productId: string) => {
    setFavorites((current) => {
      const next = current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId];
      localStorage.setItem("jay-store-favorites", JSON.stringify(next));
      return next;
    });
  };

  const shareProduct = (product: Product) => {
    const title = product.nameEn?.trim() || product.nameGu;
    const message = `${title} — ₹${product.price}\n${window.location.origin}/?item=${encodeURIComponent(product.id)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  const repeatLastOrder = () => {
    try {
      const previous = JSON.parse(localStorage.getItem("jay-store-last-order") || "[]") as CartItem[];
      if (!previous.length) return;
      const restorable = previous.flatMap((item) => {
        const product = products.find((entry) => entry.id === item.id);
        return product?.inStock && product.stockCount > 0 ? [[item.id, { ...item, name: product.nameEn?.trim() || product.nameGu, price: product.price, quantity: Math.min(item.quantity, product.stockCount) }] as const] : [];
      });
      if (!restorable.length) {
        showToast("Your previous items are no longer available.");
        return;
      }
      setCart(Object.fromEntries(restorable));
      setCartOpen(true);
      showToast("Your last order is ready to review.");
    } catch (error) {
      console.error("Unable to restore the previous order:", error);
      showToast("Could not load your previous order.");
    }
  };

  const installApp = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstallPrompt(null);
        setInstallPromptVisible(false);
      }
    } catch (err) {
      console.warn("PWA install error:", err);
    }
  };

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("PWA worker registration failed:", error));
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setInstallPromptVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setInstallPromptVisible(false);
      showToast("App installed successfully!");
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const updateQty = (key: string, delta: number) => {
    if (delta > 0) {
      const existing = cart[key];
      const product = products.find((entry) => entry.id === key);
      if (existing && product && existing.quantity >= product.stockCount) {
        showToast("Only the available stock can be ordered.");
        return;
      }
    }
    setCart((prev) => {
      const existing = prev[key];
      if (!existing) return prev;
      const newQty = existing.quantity + delta;
      if (newQty <= 0) {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      }
      return {
        ...prev,
        [key]: { ...existing, quantity: newQty },
      };
    });
  };

  const totalCartCount = Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = Object.values(cart).reduce((sum, item) => sum + item.quantity * item.price, 0);
  const cartDiscount = Object.values(cart).reduce((sum, item) => {
    const originalPrice = products.find((product) => product.id === item.id)?.originalPrice ?? item.price;
    return sum + Math.max(0, originalPrice - item.price) * item.quantity;
  }, 0);

  const handleSendWhatsAppOrder = async () => {
    const keys = Object.keys(cart);
    if (keys.length === 0) {
      alert("Please add at least one item to your order.");
      return;
    }
    if (!custName.trim()) {
      alert("Please enter your name.");
      return;
    }
    const cleanPhone = custPhone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      alert("Please enter a valid 10-digit mobile number.");
      return;
    }

    try {
      cachedReceiptBlobRef.current = null;
      setPreparingReceipt(true);
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-IN");
      const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
      setReceiptTimestamp(`${dateStr} · ${timeStr}`);
      setConfetti(true);
      window.setTimeout(() => setConfetti(false), 1800);
      setReceiptOpen(true);
      setCartOpen(false);

      // Record order in background so store database is kept in sync
      try {
        const total = Object.values(cart).reduce((sum, item) => sum + item.quantity * item.price, 0);
        const orderRecord = {
          customerName: custName.trim() || "Customer",
          customerPhone: cleanPhone || "-",
          customerAddress: custAddress.trim() || "Zanzmer",
          items: Object.values(cart),
          total,
          discount: cartDiscount,
          status: "new",
          createdAt: serverTimestamp(),
        };
        addDoc(collection(db, "orders"), orderRecord).catch((err) => {
          console.warn("Order recording notice:", err);
        });
        localStorage.setItem("jay-store-last-order", JSON.stringify(Object.values(cart)));
        setLastOrderAvailable(true);
      } catch (orderErr) {
        console.warn("Background order save notice:", orderErr);
      }
    } catch (error) {
      console.error("Unable to render the order slip:", error);
      alert("Unable to prepare the receipt image. Please try again.");
    } finally {
      setPreparingReceipt(false);
    }
  };

  const generateNativeReceiptCanvas = (): HTMLCanvasElement | null => {
    const items = Object.values(cart);
    if (items.length === 0) return null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const width = 600;
    const baseHeight = 420;
    const itemHeight = 48;
    const totalHeight = baseHeight + items.length * itemHeight;

    canvas.width = width;
    canvas.height = totalHeight;

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, totalHeight);

    // Store Header
    ctx.fillStyle = "#111827";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(storeSettings.storeName || "JAY VACHHRAJ GENERAL STORE", width / 2, 50);

    ctx.font = "16px sans-serif";
    ctx.fillStyle = "#4b5563";
    ctx.fillText(storeSettings.address || "ZANZMER", width / 2, 78);
    ctx.fillText("Contact: +91 9638009880", width / 2, 102);

    const dateStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    ctx.font = "14px monospace";
    ctx.fillText(`Date: ${dateStr}`, width / 2, 128);

    // Customer Details Box
    ctx.textAlign = "left";
    ctx.fillStyle = "#374151";
    ctx.font = "15px sans-serif";
    ctx.fillText(`Customer: ${custName || "Customer"}`, 40, 165);
    ctx.fillText(`Mobile: ${custPhone || "-"}`, 40, 188);

    // Divider Line
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 205);
    ctx.lineTo(width - 40, 205);
    ctx.stroke();

    // Table Headers
    ctx.font = "bold 15px sans-serif";
    ctx.fillStyle = "#1f2937";
    ctx.fillText("ITEM", 40, 230);
    ctx.textAlign = "right";
    ctx.fillText("AMOUNT (₹)", width - 40, 230);

    // Items List
    let y = 265;
    ctx.font = "15px sans-serif";
    items.forEach((item: any, idx: number) => {
      ctx.textAlign = "left";
      ctx.fillStyle = "#111827";
      const name = `${idx + 1}. ${item.name} (${item.unit || "1"})`;
      ctx.fillText(name.length > 32 ? name.substring(0, 30) + "..." : name, 40, y);

      ctx.textAlign = "right";
      ctx.fillStyle = "#111827";
      ctx.fillText(`₹${(item.price * item.quantity).toFixed(2)}`, width - 40, y);

      ctx.textAlign = "left";
      ctx.font = "13px sans-serif";
      ctx.fillStyle = "#6b7280";
      ctx.fillText(`   ${item.quantity} × ₹${item.price}`, 40, y + 18);

      ctx.font = "15px sans-serif";
      y += itemHeight;
    });

    // Total Divider
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(40, y + 10);
    ctx.lineTo(width - 40, y + 10);
    ctx.stroke();

    // Total Amount
    y += 40;
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#111827";
    ctx.fillText("Total Amount:", 40, y);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ea580c";
    ctx.fillText(`₹${cartTotal.toFixed(2)}`, width - 40, y);

    // Footer Thank You
    y += 50;
    ctx.textAlign = "center";
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#374151";
    ctx.fillText("Thank you for shopping with us!", width / 2, y);

    return canvas;
  };

  const generateNativeReceiptBlob = async (): Promise<Blob | null> => {
    const canvas = generateNativeReceiptCanvas();
    if (!canvas) return null;
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  };

  const capturePreviewReceiptBlob = async (): Promise<Blob | null> => {
    if (!receiptRef.current) return null;
    const element = receiptRef.current;

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
        onclone: (clonedDoc) => {
          // Ensure full height is unclipped and fully rendered
          const card = (clonedDoc.querySelector('[data-receipt-card="true"]') as HTMLElement) || clonedDoc.body;
          if (card && card !== clonedDoc.body) {
            card.style.maxHeight = 'none';
            card.style.height = 'auto';
            card.style.overflow = 'visible';
            card.style.paddingBottom = '24px';
          }
        }
      });

      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    } catch (err) {
      console.error("DOM capture failed, falling back to clean canvas:", err);
      // Safe fallback if element capture fails
      return await generateNativeReceiptBlob();
    }
  };

  const generateReceiptImageBlob = async (): Promise<Blob | null> => {
    if (cachedReceiptBlobRef.current) {
      return cachedReceiptBlobRef.current;
    }
    const blob = await capturePreviewReceiptBlob();
    if (blob) {
      cachedReceiptBlobRef.current = blob;
    }
    return blob;
  };

  const handleDownloadReceipt = async () => {
    try {
      const blob = await generateReceiptImageBlob();
      if (!blob) return;

      const fileName = `JVGS_Bill_${Date.now()}.png`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 200);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const handleShareReceipt = async () => {
    try {
      setIsSharingReceipt(true);
      const blob = await generateReceiptImageBlob();
      if (!blob) {
        // silently fail if blob generation fails
        return;
      }

      const fileName = `JVGS_Bill_${Date.now()}.png`;
      const imageFile = new File([blob], fileName, { type: "image/png" });

      // Direct native file share (mobile / PWA)
      if (navigator.canShare && navigator.canShare({ files: [imageFile] })) {
        try {
          await navigator.share({
            files: [imageFile],
            title: "Jay Vachhraj General Store - Bill",
          });
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return; // user closed share sheet
        }
      } else {
        // Fallback: download the image
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          if (document.body.contains(a)) document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 200);
      }
    } catch (error) {
      console.error("Share failed:", error);
    } finally {
      setIsSharingReceipt(false);
    }
  };

  const downloadReceipt = handleDownloadReceipt;
  const shareReceiptAsImage = handleShareReceipt;
  const shareOrder = handleShareReceipt;
  const indiaTimeParts = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const currentMinutes = Number(indiaTimeParts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(indiaTimeParts.find((part) => part.type === "minute")?.value ?? 0);
  const openingMinutes = parseTimeToMinutes(storeSettings.openingTime, 360);
  const closingMinutes = parseTimeToMinutes(storeSettings.closingTime, 1260);
  const storeIsOpen = openingMinutes <= closingMinutes
    ? currentMinutes >= openingMinutes && currentMinutes < closingMinutes
    : currentMinutes >= openingMinutes || currentMinutes < closingMinutes;
  const openTime12 = format12Hour(storeSettings.openingTime || "6:00 AM");
  const closeTime12 = format12Hour(storeSettings.closingTime || "9:00 PM");
  const shopTimingText = `Open ${openTime12} - ${closeTime12}`;

  const q = deferredSearchQuery.toLowerCase().trim();
  const brands = [...new Set(products.map((product) => product.brand).filter((brand) => brand && brand !== "Other"))];
  const filteredProducts = products.filter((p) => {
    const matchesCat = activeCategory === "all" || p.category === activeCategory;
    const matchesBrand = brandFilter === "all" || p.brand === brandFilter;
    const matchesSale = !saleOnly || p.offer || p.originalPrice > p.price;
    const matchesFavorite = !favoritesOnly || favorites.includes(p.id);
    const matchesSearch =
      !q ||
      p.nameGu.toLowerCase().includes(q) ||
      (p.nameEn && p.nameEn.toLowerCase().includes(q)) ||
      (storeSettings.categories.find((category) => category.id === p.category)?.name.toLowerCase().includes(q) ?? false) ||
      p.category.toLowerCase().includes(q);
    return matchesCat && matchesBrand && matchesSale && matchesFavorite && matchesSearch;
  }).sort((first, second) => sortPrice === "low" ? first.price - second.price : sortPrice === "high" ? second.price - first.price : 0);

  const activeBanners = banners.filter((b) => b.active);
  const allCategories: StoreCategory[] = [{ id: "all", name: "All Items", icon: "Sparkles" }, ...(storeSettings.categories.length ? storeSettings.categories : DEFAULT_CATEGORIES)];
  const StoreLogoIcon = CATEGORY_ICONS[storeSettings.logoIcon] ?? Store;
  const activeSliderIndex = activeBanners.length ? sliderIndex % activeBanners.length : 0;

  return (
    <div
      className="text-slate-800 min-h-screen font-sans flex flex-col antialiased transition-colors duration-200 pb-28 sm:pb-20"
      style={{ backgroundColor: storeSettings.backgroundColor || "#fbf9f5" }}
    >
      {toastMsg && (
        <div className="fixed top-16 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs border border-orange-500">
          <Check className="text-emerald-400" size={16} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Store Header: Unified Sticky Container */}
      <div className="sticky top-0 z-30 shadow-2xs">
        <header className="border-b border-stone-200/80 bg-white/95 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-2.5 sm:gap-3">
              <div
                className="flex items-center flex-1 min-w-0 select-none"
                aria-label="Store details"
              >
                {/* 1. Logo (Start): 48px x 48px circular clipped, 1px border #E2E8F0, 10px margin-end */}
                <div className="mr-2.5 shrink-0">
                  {storeSettings.logoUrl && !logoFailed ? (
                    <img
                      src={storeSettings.logoUrl}
                      alt={storeSettings.storeName || "Store logo"}
                      onError={() => setLogoFailed(true)}
                      className="w-12 h-12 rounded-full object-cover shadow-xs border border-[#E2E8F0]"
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-xs overflow-hidden border border-[#E2E8F0]"
                      style={{ background: `linear-gradient(135deg, ${storeSettings.primaryColor || '#ea580c'}, ${storeSettings.secondaryColor || '#f59e0b'})` }}
                    >
                      <StoreLogoIcon size={22} aria-hidden="true" />
                    </div>
                  )}
                </div>

                {/* 2. Store Info (Center / Flexible Weight / flex-1 min-w-0) */}
                <div className="flex-1 min-w-0">
                  <h1 className="text-[15px] sm:text-base font-bold text-[#1E293B] truncate leading-tight tracking-tight">
                    {storeSettings.storeName || "Jay Vachhraj General Store"}
                  </h1>
                  <p className="text-[11.5px] sm:text-xs font-medium text-[#E65100] truncate mt-0.5 leading-tight">
                    Zanzmer • Fresh, quality groceries
                  </p>
                </div>
              </div>

              {/* 3. Status & Timings (End / Right Aligned Compact Vertical Column) */}
              <div className="shrink-0 flex flex-col items-end justify-center">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  storeIsOpen
                    ? "bg-[#E8F5E9] text-emerald-800 border border-emerald-200"
                    : "bg-[#FFEBEE] text-rose-800 border border-rose-200"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${storeIsOpen ? "bg-emerald-500" : "bg-rose-500"}`} />
                  {storeIsOpen ? "Open" : "Closed"}
                </span>
                <span className="text-[9.5px] text-[#64748B] font-medium tracking-tight mt-0.5 text-right whitespace-nowrap">
                  {openTime12} - {closeTime12}
                </span>
              </div>
            </div>

            {/* Clean Pill Search Bar */}
            <div className="mt-3 relative flex items-center">
              {speechSupported ? (
                <button
                  type="button"
                  onClick={startVoiceSearch}
                  aria-label="Search by voice"
                  aria-pressed={isListening}
                  className={`absolute left-3.5 z-10 p-1 rounded-full transition ${
                    isListening ? "text-rose-500 animate-pulse bg-rose-50" : "text-slate-400 hover:text-orange-600"
                  }`}
                >
                  <Mic size={18} />
                </button>
              ) : (
                <div className="absolute left-3.5 text-slate-400 pointer-events-none">
                  <Mic size={18} />
                </div>
              )}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products in Gujarati, Hindi or English..."
                className="w-full rounded-full border border-stone-200 bg-[#fbf9f5]/80 py-2.5 sm:py-3 pl-11 pr-11 text-xs sm:text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition"
              />
              <div className="absolute right-3.5 pointer-events-none text-slate-400">
                <Search size={18} />
              </div>
            </div>
            {speechError && <p role="status" className="mt-1 text-[11px] text-rose-600 text-center">{speechError}</p>}

            {/* Quick Filters Pill Bar */}
            <div className="mt-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar text-xs">
              <button
                type="button"
                onClick={() => setSaleOnly((v) => !v)}
                aria-pressed={saleOnly}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold border transition shrink-0 ${
                  saleOnly ? "border-orange-500 bg-orange-50 text-orange-700 shadow-2xs" : "border-stone-200 bg-[#fbf9f5] text-slate-600 hover:bg-stone-100"
                }`}
              >
                Special Offers {saleOnly && <Check size={12} />}
              </button>
              <button
                type="button"
                onClick={() => setFavoritesOnly((v) => !v)}
                aria-pressed={favoritesOnly}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold border transition shrink-0 ${
                  favoritesOnly ? "border-rose-500 bg-rose-50 text-rose-700 shadow-2xs" : "border-stone-200 bg-[#fbf9f5] text-slate-600 hover:bg-stone-100"
                }`}
              >
                <Heart size={12} fill={favoritesOnly ? "currentColor" : "none"} /> Favorites
              </button>
              {brands.length > 0 && (
                <select
                  aria-label="Filter by brand"
                  value={brandFilter}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  className="rounded-full border border-stone-200 bg-[#fbf9f5] px-3 py-1 text-[11px] text-slate-700 focus:outline-none focus:border-orange-500 shrink-0"
                >
                  <option value="all">All Brands</option>
                  {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
              <select
                aria-label="Sort by price"
                value={sortPrice}
                onChange={(e) => setSortPrice(e.target.value)}
                className="rounded-full border border-stone-200 bg-[#fbf9f5] px-3 py-1 text-[11px] text-slate-700 focus:outline-none focus:border-orange-500 shrink-0"
              >
                <option value="featured">Featured Order</option>
                <option value="low">Price: Low to High</option>
                <option value="high">Price: High to Low</option>
              </select>
            </div>
          </div>
        </header>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-4 w-full flex-1 pb-12 sm:pb-16">
        {/* Active Promotional Banners Hero Slider: Constrained to max-h-52 mobile / max-h-72 desktop */}
        {activeBanners.length > 0 && (
          <div className="mt-4 sm:mt-6 mb-6 relative rounded-3xl overflow-hidden shadow-xs border border-stone-200/80 bg-white">
            <div className="relative w-full h-44 sm:h-64 max-h-52 sm:max-h-72 overflow-hidden rounded-3xl">
              {activeBanners.map((b, idx) => (
                <div
                  key={b.id}
                  className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                    idx === activeSliderIndex ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
                  }`}
                >
                  <img
                    src={b.imgUrl}
                    alt={b.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 p-4 sm:p-6 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/20 to-transparent">
                    <span className="inline-block px-2.5 py-0.5 rounded-full bg-orange-500 text-white font-bold text-[10px] w-fit mb-1 shadow-xs">
                      {b.tag}
                    </span>
                    <h2 className="text-white font-black text-sm sm:text-base md:text-lg leading-tight drop-shadow-md">
                      {b.title}
                    </h2>
                    <p className="text-amber-200 text-xs sm:text-sm font-semibold mt-0.5 truncate">
                      {b.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {activeBanners.length > 1 && (
              <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20">
                {activeBanners.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSliderIndex(idx)}
                    aria-label={`Go to slide ${idx + 1}`}
                    className={`h-1.5 rounded-full transition-all ${
                      idx === activeSliderIndex ? "w-5 bg-orange-500" : "w-1.5 bg-white/70"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {bannersLoading && (
          <div role="status" aria-label="Loading promotions" className="mt-4 sm:mt-6 mb-6 overflow-hidden rounded-3xl border border-stone-200 bg-white">
            <div className="skeleton-shimmer h-44 sm:h-64 max-h-52 sm:max-h-72" />
          </div>
        )}

        {/* Category buttons: rounded-2xl bg-white shadow-sm border border-orange-100 p-2 flex flex-col items-center */}
        <div id="categories-section" className="mt-4 sm:mt-6 mb-6">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <FolderOpen size={15} className="text-orange-500" /> Categories
            </span>
            <span className="text-xs text-slate-500 font-semibold">
              {filteredProducts.length} items
            </span>
          </div>
          <div className="flex items-start gap-3 sm:gap-4 overflow-x-auto pb-2 pt-1 no-scrollbar scroll-smooth">
            {allCategories.map((cat) => {
              const isSel = activeCategory === cat.id;
              const CategoryIcon = CATEGORY_ICONS[cat.icon] ?? Sparkles;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setFavoritesOnly(false);
                  }}
                  style={isSel ? { backgroundColor: storeSettings.primaryColor || '#ea580c', borderColor: storeSettings.primaryColor || '#ea580c' } : undefined}
                  className={`rounded-2xl shadow-sm p-2 flex flex-col items-center justify-center shrink-0 min-w-20 sm:min-w-24 transition duration-150 active:scale-95 border ${
                    isSel
                      ? "text-white ring-2 ring-black/10"
                      : "bg-white border-orange-100 text-slate-700 hover:border-orange-200 hover:bg-orange-50/40"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center mb-1.5 transition ${
                      isSel ? "bg-white/20 text-white" : "bg-orange-50 text-orange-600"
                    }`}
                  >
                    <CategoryIcon size={20} aria-hidden="true" />
                  </div>
                  <span className="text-[11px] font-bold text-center whitespace-nowrap truncate max-w-[72px]">
                    {cat.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Hero Banner: rounded-3xl bg-gradient-to-r from-amber-50 to-orange-100 border border-orange-200 p-6 shadow-sm */}
        <section className="mt-4 sm:mt-6 mb-6 rounded-3xl bg-gradient-to-r from-amber-50 to-orange-100 border border-orange-200 p-6 shadow-sm relative overflow-hidden flex flex-col justify-center">
          <div className="relative z-10 max-w-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500 text-white text-[11px] font-black uppercase tracking-wider shadow-xs">
                <Sparkles size={12} /> 10% Offer
              </span>
              <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                Deal of the Day
              </span>
            </div>
            <h2 className="text-lg sm:text-2xl font-black text-slate-900 leading-snug">
              100% Pure Groundnut Oil & Seasonal Spices
            </h2>
            <p className="text-xs sm:text-sm text-slate-700 mt-1.5 line-clamp-2 leading-relaxed">
              Freshly pressed pure groundnut oil and seasonal spices direct from Zanzmer farmers at wholesale quality rates.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setActiveCategory("તેલ-ઘી");
                  setFavoritesOnly(false);
                }}
                className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-xs font-bold shadow-xs transition"
              >
                Shop Pure Oil
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveCategory("મસાલા");
                  setFavoritesOnly(false);
                }}
                className="px-4 py-2 rounded-xl bg-white hover:bg-amber-50 border border-orange-200 text-amber-950 text-xs font-bold shadow-2xs transition"
              >
                View Seasonal Spices
              </button>
            </div>
          </div>
          <div className="absolute -right-6 -bottom-6 w-40 h-40 sm:w-56 sm:h-56 bg-gradient-to-tr from-amber-300/40 to-orange-400/20 rounded-full blur-2xl pointer-events-none" />
        </section>

        {lastOrderAvailable && (
          <div className="mb-5 flex justify-end">
            <button
              onClick={repeatLastOrder}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800 shadow-xs hover:bg-emerald-100 transition"
            >
              Repeat last order
            </button>
          </div>
        )}



        {/* Product Grid: grid grid-cols-2 md:grid-cols-4 gap-4 p-4 */}
        {loading ? (
          <div role="status" aria-label="Loading products" className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="overflow-hidden rounded-2xl border border-orange-100 bg-white flex flex-col">
                <div className="skeleton-shimmer aspect-square" />
                <div className="p-2.5 sm:p-3 space-y-2 flex flex-col items-center w-full">
                  <div className="skeleton-shimmer h-4 w-3/4 rounded" />
                  <div className="skeleton-shimmer h-3.5 w-1/2 rounded" />
                  <div className="skeleton-shimmer h-8 w-full rounded-xl mt-0.5" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          filteredProducts.length ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
              {filteredProducts.map((item) => {
                const isAvailable = item.inStock && item.stockCount > 0;
                const isFavorite = favorites.includes(item.id);
                const inCartQty = cart[item.id]?.quantity ?? 0;
                const unitChip = item.units && item.units.length > 0 ? item.units[0] : "1 kg";

                return (
                  <div
                    key={item.id}
                    className="bg-white border border-orange-100 rounded-2xl overflow-hidden flex flex-col hover:shadow-md hover:border-orange-200 transition-all duration-200 shadow-xs relative group"
                  >
                    <div className="relative w-full aspect-square overflow-hidden rounded-t-2xl">
                      <img
                        src={item.photoUrl}
                        alt={item.nameGu}
                        loading="lazy"
                        className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
                          !isAvailable ? "grayscale opacity-50" : ""
                        }`}
                      />

                      {/* Animated 'SPECIAL OFFER' Corner Badge - Absolutely flush to top-left corner with high-glow shimmer */}
                      {isAvailable && (item.offer || item.originalPrice > item.price) && (
                        <div className="absolute top-0 left-0 z-20 m-0 px-2 sm:px-2.5 py-0.5 text-[8.5px] sm:text-[9.5px] font-bold tracking-wider text-white bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 rounded-tl-2xl rounded-br-lg shadow-sm flex items-center gap-1 select-none pointer-events-none special-offer-badge overflow-hidden">
                          <span className="special-offer-shimmer" />
                          <span className="sparkle-icon text-amber-200 text-[8px] leading-none shrink-0 relative z-10">✦</span>
                          <span className="uppercase whitespace-nowrap relative z-10">SPECIAL OFFER</span>
                          <span className="sparkle-icon-delayed text-amber-200 text-[8px] leading-none shrink-0 relative z-10">✦</span>
                        </div>
                      )}

                      {!isAvailable && (
                        <span className="absolute bottom-2 left-2 bg-rose-600 text-white text-[9px] font-black px-2 py-0.5 rounded-md shadow z-10 select-none">
                          Out of stock
                        </span>
                      )}

                      {/* Favorite Heart & WhatsApp Share Action Icons - Vertical layout to avoid overlap with badge */}
                      <div className="absolute top-2 right-2 z-20 flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleFavorite(item.id)}
                          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                          aria-pressed={isFavorite}
                          className={`w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-full bg-white/95 backdrop-blur-xs flex items-center justify-center shadow-xs border border-slate-200/80 hover:bg-white transition active:scale-90 ${
                            isFavorite ? "text-rose-500" : "text-slate-400 hover:text-rose-500"
                          }`}
                        >
                          <Heart size={13} fill={isFavorite ? "currentColor" : "none"} />
                        </button>
                        <button
                          type="button"
                          onClick={() => shareProduct(item)}
                          aria-label="Share product on WhatsApp"
                          className="w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-full bg-white/95 backdrop-blur-xs flex items-center justify-center shadow-xs border border-slate-200/80 hover:bg-white text-[#25D366] transition active:scale-90"
                        >
                          <Share2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Compact Card Content - Centered & Reduced Vertical Gap */}
                    <div className="p-2.5 sm:p-3 flex-1 flex flex-col items-center text-center justify-between gap-1.5 sm:gap-2">
                      <div className="w-full">
                        {/* Centered Product Title */}
                        <h3 className="font-bold text-slate-900 text-xs sm:text-sm line-clamp-2 leading-snug">
                          {item.nameEn?.trim() || item.nameGu}
                        </h3>

                        {/* Centered Pricing Row: ₹120 / ₹150 / 500g */}
                        <div className="mt-1 flex items-center justify-center flex-wrap gap-1.5">
                          <span className="font-extrabold text-sm sm:text-base" style={{ color: storeSettings.primaryColor || '#ea580c' }}>
                            ₹{item.price}
                          </span>
                          {item.originalPrice > item.price && (
                            <del className="text-[11px] sm:text-xs text-slate-400 font-normal line-through">
                              ₹{item.originalPrice}
                            </del>
                          )}
                          <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium border border-slate-200/70">
                            {unitChip}
                          </span>
                        </div>
                      </div>

                      {/* Smooth Counter State (- 1 +) or Solid Brand + Add to List Button */}
                      <div className="w-full pt-0.5">
                        {inCartQty > 0 ? (
                          <div className="flex items-center justify-between w-full rounded-xl bg-orange-50 border border-orange-200 p-0.5 sm:p-1">
                            <button
                              type="button"
                              onClick={() => updateQty(item.id, -1)}
                              aria-label="Decrease quantity"
                              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white text-orange-600 font-bold flex items-center justify-center hover:bg-orange-100 active:scale-95 transition shadow-2xs border border-orange-200"
                            >
                              <Minus size={13} />
                            </button>
                            <span className="font-extrabold text-[11px] sm:text-xs text-orange-950 px-1 sm:px-2">
                              {inCartQty} in cart
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQty(item.id, 1)}
                              aria-label="Increase quantity"
                              style={{ backgroundColor: storeSettings.primaryColor || '#ea580c' }}
                              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-white font-bold flex items-center justify-center hover:opacity-90 active:scale-95 transition shadow-2xs"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addToCart(item)}
                            disabled={!isAvailable}
                            style={isAvailable ? { backgroundColor: storeSettings.primaryColor || '#ea580c' } : undefined}
                            className={`w-full py-2 sm:py-2.5 px-3 rounded-xl font-bold text-xs transition duration-150 active:scale-95 flex items-center justify-center gap-1 shadow-xs ${
                              bouncedProductId === item.id ? "cart-add-bounce" : ""
                            } ${
                              isAvailable
                                ? "hover:opacity-95 text-white active:scale-95 shadow-sm"
                                : "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                            }`}
                          >
                            {isAvailable ? "+ Add to List" : "Out of stock"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              No matching products. Try another search or filter.
            </div>
          )
        )}
      </main>

      {/* Footer - Clean Light */}
      <footer className="bg-white border-t border-slate-200 text-slate-600">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <section>
            <div className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-sm"
                style={{ background: `linear-gradient(135deg, ${storeSettings.primaryColor || '#ea580c'}, ${storeSettings.secondaryColor || '#f59e0b'})` }}
              >
                {storeSettings.logoMode === "image" && storeSettings.logoUrl ? (
                  <img src={storeSettings.logoUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
                ) : (
                  <StoreLogoIcon size={22} />
                )}
              </span>
              <h2 className="text-lg font-black text-slate-900">{storeSettings.storeName || "Jay Vachhraj General Store"}</h2>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-500">
              Your neighborhood grocery store for carefully selected, fresh everyday essentials.
            </p>
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              Shop Time: Open {openTime12} - {closeTime12}
            </p>
          </section>

          <section>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Contact & Address</h3>
            <p className="mt-4 text-sm leading-6 text-slate-500">{storeSettings.address}</p>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <a
                href={`tel:${storeSettings.whatsappNumber ? storeSettings.whatsappNumber.replace(/\D/g, "") : "9638009880"}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 font-semibold text-xs border border-orange-200 hover:bg-orange-100 transition"
              >
                📞 +91 96380 09880
              </a>
              <a
                href={`https://api.whatsapp.com/send?phone=${storeSettings.whatsappNumber ? storeSettings.whatsappNumber.replace(/\D/g, "") : "919638009880"}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 font-semibold text-xs border border-green-200 hover:bg-green-100 transition"
              >
                💬 Chat on WhatsApp
              </a>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Our Quality Promise</h3>
            <ul className="mt-4 space-y-3 text-sm text-slate-500">
              <li className="flex gap-2"><CheckCircle2 size={16} className="shrink-0 text-emerald-500" />100% Pure & Cleaned Goods</li>
              <li className="flex gap-2"><CheckCircle2 size={16} className="shrink-0 text-emerald-500" />Fair Pricing</li>
              <li className="flex gap-2"><CheckCircle2 size={16} className="shrink-0 text-emerald-500" />Quick Village Pickup</li>
              <li className="flex gap-2"><CheckCircle2 size={16} className="shrink-0 text-emerald-500" />Digital Payments Accepted</li>
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Quick Actions</h3>
            <div className="mt-4 grid gap-3">
              <a
                href={`tel:+${storeSettings.whatsappNumber.replace(/\D/g, "")}`}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-700 transition hover:bg-sky-100"
              >
                <Phone size={18} /> Direct Call
              </a>
              <a
                href={storeSettings.mapLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-[#EA4335] transition hover:bg-red-100"
              >
                <MapPin size={18} /> Google Maps
              </a>
              {storeSettings.socialLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-orange-500 hover:text-orange-600"
                >
                  {/instagram/i.test(link.label) ? <Camera size={17} className="text-fuchsia-500" /> : <ExternalLink size={17} />}
                  {link.label}
                </a>
              ))}
            </div>
          </section>
        </div>
        <div className="border-t border-slate-200 px-4 py-4 text-center text-xs sm:text-sm text-slate-500 font-medium select-none">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl transition-all duration-300 select-none ${
              secretHoldState === "idle"
                ? "text-slate-500 hover:text-slate-700 cursor-default"
                : secretHoldState === "hold_step1_green"
                ? "bg-emerald-500/15 text-emerald-600 ring-2 ring-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.7)] font-black animate-pulse"
                : secretHoldState === "hold_step2_red"
                ? "bg-rose-500/20 text-rose-600 ring-2 ring-rose-500 shadow-[0_0_22px_rgba(244,63,94,0.85)] font-black animate-bounce cursor-pointer active:scale-95"
                : "text-slate-500"
            }`}
            onTouchStart={onTouchStartSecret}
            onTouchEnd={onTouchEndSecret}
            onTouchCancel={onTouchCancelSecret}
            onMouseDown={onMouseDownSecret}
            onMouseUp={onMouseUpSecret}
            onMouseLeave={onMouseLeaveSecret}
            onClick={handleSecretIconClick}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            style={{
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              WebkitTouchCallout: "none",
            }}
            role="button"
            tabIndex={0}
            aria-label="Store copyright key"
          >
            <span className="font-extrabold text-sm leading-none">©</span>
            <span>{new Date().getFullYear()} {storeSettings.storeName || "Jay Vachhraj General Store"}</span>
            {secretHoldState === "hold_step1_green" && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md bg-emerald-500 text-white shadow-xs">
                ● STEP 1 READY
              </span>
            )}
            {secretHoldState === "hold_step2_red" && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md bg-rose-600 text-white shadow-xs animate-pulse">
                ● TAP TO UNLOCK
              </span>
            )}
          </span>
          {" "}. All rights reserved. • <span aria-live="polite">{(viewCount || 0).toLocaleString()} visits</span>
        </div>
      </footer>

      {/* Secret Admin Verification Modal */}
      {secretHoldState === "magic_modal_open" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-verify-modal-title"
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseSecretModal();
            }
          }}
        >
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-700 bg-gradient-to-b from-[#111c32] to-[#0c1322] p-6 text-slate-100 shadow-2xl shadow-black/80 sm:p-7 animate-in zoom-in-95">
            {/* Close Button */}
            <button
              type="button"
              onClick={handleCloseSecretModal}
              aria-label="Close modal"
              className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            >
              <X size={18} />
            </button>

            {/* Shield Icon Header */}
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-500/10 text-orange-400 shadow-lg shadow-orange-950/20">
              <ShieldCheck size={28} />
            </div>

            <p className="text-center text-[10px] font-black uppercase tracking-[0.24em] text-orange-400">
              Secret Gatekeeper
            </p>
            <h2 id="admin-verify-modal-title" className="text-center text-xl sm:text-2xl font-black text-white mt-1">
              Admin Verification
            </h2>
            <p className="mt-2 text-center text-xs leading-5 text-slate-400">
              Dual-stage timed hold verified. Generate a one-click WhatsApp magic link to authenticate the admin session.
            </p>

            {/* Admin Profile Selector Chips */}
            {!generatedToken ? (
              <div className="mt-5 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                      Select Authorizing Admin
                    </span>
                    <span className="text-[10px] text-orange-400 font-bold">
                      WhatsApp 1-Click
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {AUTHORIZED_ADMINS.map((admin) => {
                      const isSelected = admin.id === selectedAdminId;
                      return (
                        <button
                          key={admin.id}
                          type="button"
                          onClick={() => setSelectedAdminId(admin.id)}
                          className={`relative flex flex-col p-3 rounded-2xl border text-left transition-all duration-200 active:scale-[0.98] ${
                            isSelected
                              ? "border-emerald-500 bg-emerald-950/40 ring-2 ring-emerald-500/80 shadow-lg shadow-emerald-950/40"
                              : "border-slate-700/80 bg-slate-900/60 hover:bg-slate-800/80 hover:border-slate-600"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 w-full">
                            <span className={`text-xs font-black truncate ${isSelected ? "text-white" : "text-slate-300"}`}>
                              {admin.name}
                            </span>
                            <span
                              className={`shrink-0 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border ${
                                admin.id === "primary"
                                  ? isSelected
                                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                    : "bg-slate-800 text-slate-400 border-slate-700"
                                  : isSelected
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                  : "bg-slate-800 text-slate-400 border-slate-700"
                              }`}
                            >
                              {admin.id === "primary" ? "Primary" : "Co-Admin"}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-xs">
                            <MessageCircle size={13} className={isSelected ? "text-emerald-400" : "text-slate-500"} />
                            <span className={`font-mono text-[11px] font-semibold ${isSelected ? "text-emerald-300" : "text-slate-400"}`}>
                              {admin.displayPhone}
                            </span>
                          </div>
                          {isSelected && (
                            <div className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs">
                              <Check size={10} strokeWidth={3} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  <button
                    type="button"
                    onClick={handleGenerateAdminMagicLink}
                    disabled={isGeneratingToken}
                    className="flex min-h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 px-4 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-950/40 transition active:scale-[0.99] disabled:opacity-75 disabled:cursor-wait"
                  >
                    {isGeneratingToken ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        <span>Generating Secure Token...</span>
                      </>
                    ) : (
                      <>
                        <MessageCircle size={18} />
                        <span>Generate Secure Admin Link ({selectedAdmin.name})</span>
                      </>
                    )}
                  </button>
                  <p className="text-center text-[11px] text-slate-500">
                    Dispatches a 5-minute single-use link directly to {selectedAdmin.displayPhone}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-3 animate-in fade-in">
                {/* Dispatched Admin Details */}
                <div className="rounded-2xl border border-slate-700/80 bg-slate-900/80 p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      <MessageCircle size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        Dispatched to {targetAdminProfile.name}
                      </div>
                      <div className="text-xs sm:text-sm font-black text-emerald-300 truncate">
                        {targetAdminProfile.displayPhone}
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    Authorized
                  </span>
                </div>

                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-3.5 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-300">
                    <CheckCircle2 size={15} />
                    <span>WhatsApp Dispatched</span>
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-300">
                    <Clock size={14} className="text-orange-400" />
                    <span>Expires in:</span>
                    <span className="font-mono font-black text-orange-400">{expiresCountdown}</span>
                  </div>
                  <div className="mt-2 font-mono text-[11px] text-slate-400 bg-slate-900/80 rounded-lg py-1 px-2 border border-slate-800 break-all select-all">
                    {generatedToken.slice(0, 10)}...{generatedToken.slice(-10)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={`https://wa.me/${targetAdminProfile.phone}?text=${encodeURIComponent(
                      `Jay Vachhraj Store Admin Login: https://vachhraj-store.web.app/admin/verify?token=${generatedToken}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-xs font-bold text-white shadow-sm transition active:scale-95"
                  >
                    <MessageCircle size={15} />
                    <span>Re-open WhatsApp</span>
                  </a>

                  <button
                    type="button"
                    onClick={async () => {
                      const url = `https://vachhraj-store.web.app/admin/verify?token=${generatedToken}`;
                      try {
                        await navigator.clipboard.writeText(url);
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2500);
                      } catch {
                        // ignore
                      }
                    }}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-bold text-slate-200 shadow-sm transition active:scale-95"
                  >
                    {linkCopied ? (
                      <>
                        <Check size={15} className="text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={15} />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    router.push(`/admin/verify?token=${generatedToken}`);
                  }}
                  className="w-full flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 px-3 py-2 text-xs font-bold transition active:scale-95"
                >
                  <ExternalLink size={14} />
                  <span>Verify on this device now</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Realistic Thermal Receipt Modal */}
      {isReceiptOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <section role="dialog" aria-modal="true" aria-labelledby="receipt-title" className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 bg-slate-50">
              <h2 id="receipt-title" className="font-black text-sm text-slate-900">
                Bill Receipt Preview
              </h2>
              <button onClick={() => setReceiptOpen(false)} aria-label="Close receipt preview" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 transition">
                <X size={18} />
              </button>
            </header>

            <div className="max-h-[75vh] overflow-y-auto px-2 py-1">
              {/* Realistic Thermal Paper Slip */}
              <article
                ref={receiptRef}
                data-receipt-card="true"
                className="w-full max-w-sm mx-auto bg-white p-5 pb-8 rounded-2xl shadow-sm flex flex-col h-auto overflow-visible text-slate-900 font-mono text-xs leading-normal select-none"
                style={{
                  backgroundColor: "#ffffff",
                  color: "#0f172a",
                }}
              >
                {/* Header */}
                <div className="text-center space-y-1">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight">
                    {storeSettings.storeName || "Jay Vachhraj General Store"}
                  </h3>
                  <p className="text-xs font-semibold text-slate-700">
                    {storeSettings.address || "Zanzmer"}
                  </p>
                  <p className="text-[11px] font-medium text-slate-600">
                    Contact: +{storeSettings.whatsappNumber ? storeSettings.whatsappNumber.replace(/\D/g, "") : "919638009880"}
                  </p>
                  <p className="text-[10px] text-slate-500 pt-0.5">
                    Date & Time: {receiptTimestamp || `${new Date().toLocaleDateString("en-IN")} · ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}`}
                  </p>
                </div>

                {/* Customer Info (if available) */}
                {(custName.trim() || custPhone.trim()) && (
                  <>
                    <div className="border-b border-dashed border-slate-300 my-2.5" />
                    <div className="text-[11px] space-y-0.5">
                      {custName.trim() && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Customer:</span>
                          <span className="font-bold text-slate-800">{custName.trim()}</span>
                        </div>
                      )}
                      {custPhone.trim() && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Mobile:</span>
                          <span className="font-bold text-slate-800">{custPhone.replace(/\D/g, "")}</span>
                        </div>
                      )}
                      {custAddress.trim() && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Address / Village:</span>
                          <span className="font-semibold text-slate-800 truncate max-w-[180px]">{custAddress.trim()}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Divider Line */}
                <div className="border-b border-dashed border-slate-400 my-2.5" />

                {/* Items Table */}
                <div className="w-full">
                  <div className="grid grid-cols-[1.5rem_1fr_auto] gap-2 pb-1.5 font-bold border-b border-dashed border-slate-400 text-[11px] uppercase text-slate-800">
                    <span>No.</span>
                    <span>Item</span>
                    <span className="text-right">Amount (₹)</span>
                  </div>

                  <div className="divide-y divide-dashed divide-slate-200 py-1">
                    {Object.values(cart).map((item, index) => {
                      const product = products.find((p) => p.id === item.id);
                      const nameGu = product?.nameGu || item.name;
                      const nameEn = product?.nameEn && product.nameEn !== nameGu ? product.nameEn : "";
                      const itemDisplayName = nameEn ? `${nameGu} (${nameEn})` : nameGu;
                      const unitLabel = product?.units?.[0] || "";

                      return (
                        <div key={item.id} className="grid grid-cols-[1.5rem_1fr_auto] gap-2 py-1.5 text-xs items-start">
                          <span className="text-slate-500 font-semibold">{index + 1}.</span>
                          <div className="min-w-0 pr-1">
                            <span className="font-bold text-slate-900 block leading-tight">{itemDisplayName}</span>
                            <span className="text-[10px] text-slate-500 block mt-0.5">
                              {item.quantity} {unitLabel ? `${unitLabel} ` : ""}× ₹{item.price.toFixed(2)}
                            </span>
                          </div>
                          <span className="text-right font-bold text-slate-900 whitespace-nowrap">
                            ₹{(item.price * item.quantity).toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Summary Section */}
                <div className="border-b-2 border-dashed border-slate-800 my-2" />

                {cartDiscount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-semibold text-[11px] py-0.5">
                    <span>Discount:</span>
                    <span>−₹{cartDiscount.toFixed(2)}</span>
                  </div>
                )}

                {/* Total Amount in Bold */}
                <div className="flex justify-between items-center text-sm sm:text-base font-black text-slate-950 py-1.5 border-t border-b border-slate-900 my-1">
                  <span>Total Amount:</span>
                  <span className="text-base sm:text-lg">₹{cartTotal.toFixed(2)}</span>
                </div>

                <div className="text-[10px] text-slate-500 text-right mt-1">
                  Total Items: {totalCartCount} items
                </div>

                {/* Divider Line */}
                <div className="border-b border-dashed border-slate-400 my-3" />

                {/* Footer: Barcode placeholder & Simple thank you text */}
                <div className="flex flex-col items-center justify-center my-2 pb-2 text-center">
                  <svg className="w-44 h-9 max-w-full" viewBox="0 0 200 40" xmlns="http://www.w3.org/2000/svg">
                    <rect x="0" y="0" width="200" height="40" fill="#ffffff" />
                    <rect x="10" y="0" width="2" height="34" fill="#0f172a" />
                    <rect x="14" y="0" width="1" height="34" fill="#0f172a" />
                    <rect x="17" y="0" width="3" height="34" fill="#0f172a" />
                    <rect x="22" y="0" width="1" height="34" fill="#0f172a" />
                    <rect x="25" y="0" width="2" height="34" fill="#0f172a" />
                    <rect x="29" y="0" width="4" height="34" fill="#0f172a" />
                    <rect x="35" y="0" width="1" height="34" fill="#0f172a" />
                    <rect x="38" y="0" width="2" height="34" fill="#0f172a" />
                    <rect x="42" y="0" width="3" height="34" fill="#0f172a" />
                    <rect x="47" y="0" width="2" height="34" fill="#0f172a" />
                    <rect x="51" y="0" width="1" height="34" fill="#0f172a" />
                    <rect x="54" y="0" width="4" height="34" fill="#0f172a" />
                    <rect x="60" y="0" width="2" height="34" fill="#0f172a" />
                    <rect x="64" y="0" width="1" height="34" fill="#0f172a" />
                    <rect x="67" y="0" width="3" height="34" fill="#0f172a" />
                    <rect x="72" y="0" width="2" height="34" fill="#0f172a" />
                    <rect x="76" y="0" width="1" height="34" fill="#0f172a" />
                    <rect x="79" y="0" width="4" height="34" fill="#0f172a" />
                    <rect x="85" y="0" width="2" height="34" fill="#0f172a" />
                    <rect x="89" y="0" width="3" height="34" fill="#0f172a" />
                    <rect x="94" y="0" width="1" height="34" fill="#0f172a" />
                    <rect x="97" y="0" width="2" height="34" fill="#0f172a" />
                    <rect x="101" y="0" width="4" height="34" fill="#0f172a" />
                    <rect x="107" y="0" width="1" height="34" fill="#0f172a" />
                    <rect x="110" y="0" width="3" height="34" fill="#0f172a" />
                    <rect x="115" y="0" width="2" height="34" fill="#0f172a" />
                    <rect x="119" y="0" width="1" height="34" fill="#0f172a" />
                    <rect x="122" y="0" width="4" height="34" fill="#0f172a" />
                    <rect x="128" y="0" width="2" height="34" fill="#0f172a" />
                    <rect x="132" y="0" width="3" height="34" fill="#0f172a" />
                    <rect x="137" y="0" width="1" height="34" fill="#0f172a" />
                    <rect x="140" y="0" width="2" height="34" fill="#0f172a" />
                    <rect x="144" y="0" width="4" height="34" fill="#0f172a" />
                    <rect x="150" y="0" width="1" height="34" fill="#0f172a" />
                    <rect x="153" y="0" width="3" height="34" fill="#0f172a" />
                    <rect x="158" y="0" width="2" height="34" fill="#0f172a" />
                    <rect x="162" y="0" width="1" height="34" fill="#0f172a" />
                    <rect x="165" y="0" width="4" height="34" fill="#0f172a" />
                    <rect x="171" y="0" width="2" height="34" fill="#0f172a" />
                    <rect x="175" y="0" width="3" height="34" fill="#0f172a" />
                    <rect x="180" y="0" width="1" height="34" fill="#0f172a" />
                    <rect x="183" y="0" width="2" height="34" fill="#0f172a" />
                    <rect x="187" y="0" width="2" height="34" fill="#0f172a" />
                  </svg>
                  <span className="font-mono text-[9px] tracking-widest text-slate-500 uppercase mt-0.5">
                    *JVGS-BILL*
                  </span>

                  <p className="text-center text-xs font-semibold text-gray-700 mt-3">
                    Thank you for shopping with us!
                  </p>
                </div>
              </article>
            </div>

            {/* Action Buttons (outside receipt card) */}
            <div className="flex flex-col sm:flex-row gap-2.5 p-4 bg-slate-50 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setReceiptOpen(false)}
                className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-100 transition active:scale-95"
              >
                Back to Cart
              </button>
              <button
                type="button"
                onClick={handleDownloadReceipt}
                className="min-h-11 flex-1 rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-900 px-4 py-2 text-xs sm:text-sm font-bold transition active:scale-95 flex items-center justify-center gap-1.5 shadow-xs"
              >
                <FileDown size={16} /> Download Bill
              </button>
              <button
                type="button"
                onClick={handleShareReceipt}
                disabled={isSharingReceipt}
                className="min-h-11 flex-1 rounded-xl px-4 py-2 text-xs sm:text-sm font-black text-white bg-orange-500 hover:bg-orange-600 shadow-sm transition active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-75 disabled:cursor-wait"
              >
                <Share2 size={16} /> {isSharingReceipt ? "Sharing..." : "Share Receipt"}
              </button>
            </div>
          </section>
        </div>
      )}

      {isPromoOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <section role="dialog" aria-modal="true" aria-labelledby="promo-title" className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-amber-300 bg-white shadow-2xl">
            {storeSettings.promoImageUrl && <img src={storeSettings.promoImageUrl} alt="" className="h-48 w-full object-cover" />}
            <button onClick={() => { setPromoOpen(false); sessionStorage.setItem("jay-store-promo-dismissed", "true"); }} aria-label="Close offer" className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"><X size={18} /></button>
            <div className="p-6">
              <p className="mb-2 text-xs font-black uppercase tracking-widest text-orange-600">Special offer</p>
              <h2 id="promo-title" className="text-2xl font-black text-slate-900">{storeSettings.promoTitle || "Seasonal offer"}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{storeSettings.promoText}</p>
              <button onClick={() => { setPromoOpen(false); sessionStorage.setItem("jay-store-promo-dismissed", "true"); }} className="mt-5 rounded-xl bg-orange-500 hover:bg-orange-600 px-5 py-3 text-sm font-black text-white shadow-sm transition">Explore store</button>
            </div>
          </section>
        </div>
      )}

      {confetti && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
          {Array.from({ length: 42 }, (_, index) => (
            <span key={index} className="confetti-piece" style={{ left: `${(index * 37) % 100}%`, backgroundColor: ["#f59e0b", "#10b981", "#f43f5e", "#38bdf8"][index % 4], animationDelay: `${(index % 9) * 0.08}s` }} />
          ))}
        </div>
      )}

      {/* Floating Bottom Cart Capsule when items in cart */}
      {totalCartCount > 0 && (
        <div className="fixed bottom-20 left-4 right-4 max-w-md mx-auto z-30">
          <div className="bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white rounded-2xl p-2.5 shadow-xl flex items-center justify-between border border-amber-300/40">
            <div className="flex items-center gap-2.5 pl-1">
              <div className="cart-heartbeat w-9 h-9 rounded-xl bg-black/20 flex items-center justify-center text-lg font-bold text-amber-200">
                <ShoppingBag size={18} />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-amber-100">Order Summary</div>
                <div className="text-xs font-black flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 bg-white text-slate-900 rounded-full text-[10px] font-black shadow-xs">
                    {totalCartCount}
                  </span>
                  <span>items · ₹{cartTotal.toFixed(0)}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setCartOpen(true)}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-md transition"
            >
              <span>Review & Order</span><ExternalLink size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Floating Glassmorphic PWA Install Capsule */}
      {isInstallPromptVisible && storeSettings.showInstallBanner !== false && installPrompt && (
        <aside
          role="region"
          aria-label="PWA App Install"
          className={`fixed ${totalCartCount > 0 ? "bottom-36" : "bottom-20"} left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-md glass-dock rounded-2xl px-4 py-2.5 shadow-xl border border-orange-200/90 flex items-center justify-between gap-3 transition-all duration-300 animate-in fade-in slide-in-from-bottom`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl shrink-0" aria-hidden="true">📲</span>
            <span className="text-xs sm:text-sm font-black text-slate-900 truncate">
              Install Store App
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={installApp}
              className="px-3.5 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold text-xs shadow-sm transition active:scale-95"
            >
              Install App
            </button>
            <button
              type="button"
              onClick={() => setInstallPromptVisible(false)}
              aria-label="Close install prompt"
              className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition"
            >
              <X size={15} />
            </button>
          </div>
        </aside>
      )}
      <nav
        aria-label="Bottom Navigation Dock"
        className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-md glass-dock rounded-2xl px-3 py-2 shadow-lg border border-orange-100/70"
      >
        <div className="flex items-center justify-around">
          <button
            type="button"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
              setActiveCategory("all");
              setFavoritesOnly(false);
            }}
            className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition ${
              activeCategory === "all" && !favoritesOnly ? "text-orange-600 font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Home size={19} />
            <span className="text-[10px]">Home</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const el = document.getElementById("categories-section");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
            className="flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl text-slate-600 hover:text-slate-900 transition"
          >
            <FolderOpen size={19} />
            <span className="text-[10px]">Categories</span>
          </button>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl text-slate-600 hover:text-slate-900 transition"
          >
            <div className="relative">
              <ShoppingBag size={19} className={totalCartCount > 0 ? "text-orange-600" : ""} />
              {totalCartCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-orange-600 text-white font-extrabold text-[10px] min-w-4 h-4 px-1 rounded-full flex items-center justify-center shadow-xs">
                  {totalCartCount}
                </span>
              )}
            </div>
            <span className={`text-[10px] ${totalCartCount > 0 ? "font-bold text-orange-600" : ""}`}>Cart</span>
          </button>

          <button
            type="button"
            onClick={() => setFavoritesOnly((prev) => !prev)}
            className={`relative flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition ${
              favoritesOnly ? "text-rose-600 font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <div className="relative">
              <Heart size={19} fill={favoritesOnly ? "currentColor" : "none"} />
              {favorites.length > 0 && !favoritesOnly && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500" />
              )}
            </div>
            <span className="text-[10px]">Favorites</span>
          </button>


        </div>
      </nav>

      {/* Cart Modal - Clean Light */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="cart-drawer bg-white border border-slate-200 w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-black text-sm text-slate-900">Order Summary</h3>
              <button
                onClick={() => setCartOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-200/80 text-slate-600 hover:text-slate-900 hover:bg-slate-300 flex items-center justify-center transition"
              >
                <X size={17} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1 divide-y divide-slate-100">
              {Object.keys(cart).map((k) => {
                const item = cart[k];
                return (
                  <div key={k} className="py-2.5 flex items-center justify-between gap-2">
                    <div className="flex-1 pr-2">
                      <h5 className="text-xs font-bold text-slate-900">{item.name}</h5>
                      <span className="text-[10px] text-slate-500">₹{item.price.toFixed(2)} each · ₹{(item.quantity * item.price).toFixed(2)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-0.5">
                        <button
                          onClick={() => updateQty(k, -1)}
                          className="w-6 h-6 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center justify-center font-bold transition"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="w-7 text-center font-black text-xs text-slate-900">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQty(k, 1)}
                          className="w-6 h-6 rounded-lg bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center font-bold transition"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="space-y-2 border-t border-slate-200 pt-3 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>₹{Object.values(cart).reduce((sum, item) => sum + item.quantity * (products.find((product) => product.id === item.id)?.originalPrice ?? item.price), 0).toFixed(2)}</span>
                </div>
                {cartDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span>Offers & savings</span>
                    <span>−₹{cartDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-slate-900 text-sm">
                  <span>Payable total</span>
                  <span className="text-orange-600 font-extrabold">₹{cartTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
              <input
                type="text"
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                placeholder="Your name *"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 shadow-xs"
              />
              <input
                type="tel"
                maxLength={10}
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
                placeholder="10-digit mobile number *"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 shadow-xs"
              />
              <input
                type="text"
                value={custAddress}
                onChange={(e) => setCustAddress(e.target.value)}
                placeholder="Village / area"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 shadow-xs"
              />

              <button
                type="button"
                onClick={handleSendWhatsAppOrder}
                disabled={isPreparingReceipt}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 active:scale-[0.99] text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/10 disabled:cursor-wait disabled:opacity-70 transition"
              >
                {isPreparingReceipt ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Preparing receipt…
                  </span>
                ) : (
                  <>
                    <MessageCircle size={18} /> Order via WhatsApp
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Polished Circular Spinner with Backdrop Blur Overlay */}
      {(isPreparingReceipt || isSharingReceipt) && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/45 backdrop-blur-xs text-white">
          <div className="bg-white/95 text-slate-900 rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-3 border border-orange-100 max-w-xs text-center animate-in fade-in zoom-in-95">
            <div className="relative w-12 h-12 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full border-4 border-orange-100 border-t-orange-500 animate-spin" />
            </div>
            <p className="font-bold text-sm text-slate-900">
              {isPreparingReceipt ? "Preparing order & bill receipt…" : "Sharing receipt…"}
            </p>
            <p className="text-xs text-slate-500">
              {isPreparingReceipt ? "Preparing your clean bill slip..." : "Sharing your receipt image..."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}