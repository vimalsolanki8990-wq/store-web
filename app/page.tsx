"use client";

import { useState, useEffect, useRef, useDeferredValue, useMemo, useCallback, memo } from "react";
import { useRouter } from "next/navigation";
import { db } from "./firebase";
import { addDoc, collection, doc, getDocs, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { Camera, Check, CheckCircle2, ChevronDown, Clock, Copy, ExternalLink, FileDown, FolderOpen, Heart, Home, Loader2, LockKeyhole, MapPin, MessageCircle, Mic, Minus, Phone, Plus, Search, ShieldAlert, ShieldCheck, ShoppingBag, Sparkles, Store, Tag, Truck, X, Wheat, Droplets, Flame, Cookie, Lamp, Megaphone, Share2, SlidersHorizontal, Milk, Apple, Carrot, Egg, Coffee, SprayCan, Baby, Croissant, Candy, Beef, CupSoda, Pill, Shirt, Box } from "lucide-react";
import { DEFAULT_CATEGORIES, DEFAULT_STORE_SETTINGS, normalizeStoreSettings, storeThemeCssVars, format12Hour, parseTimeToMinutes, StoreCategory, StoreSettings } from "./store-config";
import AdminStealthAuthModal from "./components/AdminStealthAuthModal";
import { matchesGroceryQuery } from "./lib/searchUtils";
import { normalizeCategoryToPrimary } from "./lib/csvProductUtils";

const normalize = (str?: string) => (str || "").trim().toLowerCase();

interface Product {
  id: string;
  name?: string;
  nameGu?: string;
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

const CATEGORY_ICONS: Record<string, typeof Wheat> = {
  Wheat,
  Droplets,
  Flame,
  Cookie,
  Lamp,
  Sparkles,
  Store,
  ExternalLink,
  MapPin,
  Milk,
  Apple,
  Carrot,
  Egg,
  Coffee,
  SprayCan,
  Baby,
  Croissant,
  Candy,
  Beef,
  CupSoda,
  Pill,
  Shirt,
  Box,
};

interface ProductCardProps {
  item: Product;
  isFavorite: boolean;
  inCartQty: number;
  isBounced: boolean;
  primaryColor?: string;
  onToggleFavorite: (id: string) => void;
  onShareProduct: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onUpdateQty: (id: string, delta: number) => void;
}

const ProductCard = memo(
  function ProductCard({
    item,
    isFavorite,
    inCartQty,
    isBounced,
    primaryColor,
    onToggleFavorite,
    onShareProduct,
    onAddToCart,
    onUpdateQty,
  }: ProductCardProps) {
    const isAvailable = item.inStock && item.stockCount > 0;
    const unitChip = item.units && item.units.length > 0 ? item.units[0] : "1 kg";

    return (
      <div className="bg-white border border-orange-100 rounded-2xl overflow-hidden flex flex-col hover:shadow-md hover:border-orange-200 transition-all duration-200 shadow-xs relative group">
        <div className="relative w-full aspect-square overflow-hidden rounded-t-2xl">
          <img
            src={item.photoUrl}
            alt={item.name || item.nameGu || item.nameEn || "Grocery Item"}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
              !isAvailable ? "grayscale opacity-50" : ""
            }`}
          />

          {/* Animated 'SPECIAL OFFER' Corner Badge - Absolutely flush to top-left corner with high-glow shimmer */}
          {isAvailable && (item.offer || item.originalPrice > item.price) && (
            <div className="absolute top-0 left-0 z-10 m-0 px-2 sm:px-2.5 py-0.5 text-[8.5px] sm:text-[9.5px] font-bold tracking-wider text-white bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 rounded-tl-2xl rounded-br-lg shadow-sm flex items-center gap-1 select-none pointer-events-none special-offer-badge overflow-hidden">
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
          <div className="absolute top-2 right-2 z-10 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => onToggleFavorite(item.id)}
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
              onClick={() => onShareProduct(item)}
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
              {item.name || item.nameGu || item.nameEn}
            </h3>

            {/* Centered Pricing Row: ₹120 / ₹150 / 500g */}
            <div className="mt-1 flex items-center justify-center flex-wrap gap-1.5">
              <span className="font-extrabold text-sm sm:text-base" style={{ color: primaryColor || '#ea580c' }}>
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
                  onClick={() => onUpdateQty(item.id, -1)}
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
                  onClick={() => onUpdateQty(item.id, 1)}
                  aria-label="Increase quantity"
                  style={{ backgroundColor: primaryColor || '#ea580c' }}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-white font-bold flex items-center justify-center hover:opacity-90 active:scale-95 transition shadow-2xs"
                >
                  <Plus size={13} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onAddToCart(item)}
                disabled={!isAvailable}
                style={isAvailable ? { backgroundColor: primaryColor || '#ea580c' } : undefined}
                className={`w-full py-2 sm:py-2.5 px-3 rounded-xl font-bold text-xs transition duration-150 active:scale-95 flex items-center justify-center gap-1 shadow-xs ${
                  isBounced ? "cart-add-bounce" : ""
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
  },
  (prev, next) => {
    return (
      prev.item === next.item &&
      prev.isFavorite === next.isFavorite &&
      prev.inCartQty === next.inCartQty &&
      prev.isBounced === next.isBounced &&
      prev.primaryColor === next.primaryColor
    );
  }
);

const SORT_OPTIONS: { label: string; value: string }[] = [
  { label: "Featured Order", value: "featured" },
  { label: "Price: Low to High", value: "low" },
  { label: "Price: High to Low", value: "high" },
];

export default function CustomerStorePage() {
  const router = useRouter();
  // Stealth Admin Gatekeeper (5s Hold -> Green Border -> 3-Tap Logo -> PIN 1997 -> Google Multi-Admin Auth)
  const [logoPrimedGreen, setLogoPrimedGreen] = useState(false);
  const [isStealthAuthOpen, setIsStealthAuthOpen] = useState(false);
  const logoHoldTimerRef = useRef<NodeJS.Timeout | null>(null);
  const logoInactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const logoTapCountRef = useRef(0);
  const isLogoHoldingRef = useRef(false);
  const touchActiveRef = useRef(false);

  const clearLogoHoldTimer = () => {
    if (logoHoldTimerRef.current) {
      clearTimeout(logoHoldTimerRef.current);
      logoHoldTimerRef.current = null;
    }
  };

  const clearLogoInactivityTimer = () => {
    if (logoInactivityTimerRef.current) {
      clearTimeout(logoInactivityTimerRef.current);
      logoInactivityTimerRef.current = null;
    }
  };

  const handleLogoHoldStart = () => {
    if (logoPrimedGreen) return;

    isLogoHoldingRef.current = true;
    clearLogoHoldTimer();
    clearLogoInactivityTimer();

    // 5-second continuous hold to trigger green border
    logoHoldTimerRef.current = setTimeout(() => {
      if (!isLogoHoldingRef.current) return;
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([150, 50, 150]);
        }
      } catch {}

      setLogoPrimedGreen(true);
      logoTapCountRef.current = 0;

      // Auto-reset back to idle if 3 taps don't happen within 6 seconds
      clearLogoInactivityTimer();
      logoInactivityTimerRef.current = setTimeout(() => {
        setLogoPrimedGreen(false);
        logoTapCountRef.current = 0;
      }, 6000);
    }, 5000);
  };

  const handleLogoHoldEnd = () => {
    if (isLogoHoldingRef.current) {
      isLogoHoldingRef.current = false;
      if (!logoPrimedGreen) {
        clearLogoHoldTimer();
      }
    }
  };

  const handleLogoClick = (e: React.MouseEvent) => {
    if (logoPrimedGreen) {
      e.preventDefault();
      e.stopPropagation();

      logoTapCountRef.current += 1;
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(40);
        }
      } catch {}

      clearLogoInactivityTimer();
      logoInactivityTimerRef.current = setTimeout(() => {
        setLogoPrimedGreen(false);
        logoTapCountRef.current = 0;
      }, 6000);

      // On 3rd tap -> open Stealth Admin Modal!
      if (logoTapCountRef.current >= 3) {
        clearLogoInactivityTimer();
        setLogoPrimedGreen(false);
        logoTapCountRef.current = 0;
        setIsStealthAuthOpen(true);
        try {
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate([80, 40, 160]);
          }
        } catch {}
      }
    }
  };

  useEffect(() => {
    return () => {
      clearLogoHoldTimer();
      clearLogoInactivityTimer();
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [brandFilter, setBrandFilter] = useState("all");
  const [saleOnly, setSaleOnly] = useState(false);
  const [sortPrice, setSortPrice] = useState("featured");
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setIsSortOpen(false);
      }
    };
    if (isSortOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isSortOpen]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setListening] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState("gu-IN");
  const [sliderIndex, setSliderIndex] = useState(0);

  // Dynamic Sticky Offset tracking for Categories Bar
  const headerStickyRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const updateHeaderHeight = () => {
      setIsDesktop(window.innerWidth >= 1024);
      if (headerStickyRef.current) {
        const rect = headerStickyRef.current.getBoundingClientRect();
        if (rect.height > 0) {
          setHeaderHeight(Math.round(rect.height));
        }
      }
    };

    updateHeaderHeight();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && headerStickyRef.current) {
      resizeObserver = new ResizeObserver(() => {
        updateHeaderHeight();
      });
      resizeObserver.observe(headerStickyRef.current);
    }

    window.addEventListener("resize", updateHeaderHeight);
    return () => {
      window.removeEventListener("resize", updateHeaderHeight);
      resizeObserver?.disconnect();
    };
  }, []);

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
    if (typeof document !== "undefined") {
      const activeLogo = storeSettings.logoUrl?.trim() || "/logo.png";
      const updateLink = (rel: string) => {
        let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
        if (!el) {
          el = document.createElement("link");
          el.rel = rel;
          document.head.appendChild(el);
        }
        el.href = activeLogo;
      };
      try {
        updateLink("icon");
        updateLink("shortcut icon");
        updateLink("apple-touch-icon");
      } catch {}
    }
  }, [storeSettings.logoUrl]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }, []);

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

            const itemName = raw.name || raw.nameGu || raw.name_gu || raw.nameEn || raw.name_en || "Grocery Item";
            return {
              id: d.id,
              name: itemName,
              nameGu: raw.nameGu || raw.name_gu || itemName,
              nameEn: raw.nameEn || raw.name_en || "",
              category: String(raw.category || raw.categoryName || raw.category_name || "Grains & Pulses").trim(),
              categoryName: String(raw.categoryName || raw.category_name || raw.category || "Grains & Pulses").trim(),
              category_name: String(raw.category_name || raw.categoryName || raw.category || "Grains & Pulses").trim(),
              units: parsedUnits,
              price: Number(raw.price) || 0,
              inStock: raw.inStock !== undefined ? raw.inStock : (raw.in_stock !== undefined ? raw.in_stock : true),
              photoUrl: raw.photoUrl || raw.photo_url || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60",
              brand: String(raw.brand ?? "Other"),
              stockCount: Math.max(0, Number(raw.stockCount ?? raw.stock ?? ((raw.inStock ?? raw.in_stock) === false ? 0 : 999999))),
              originalPrice: Number(raw.originalPrice ?? raw.compareAtPrice ?? raw.price) || 0,
              offer: raw.offer === true || raw.isSpecialOffer === true || Number(raw.originalPrice ?? raw.compareAtPrice ?? 0) > Number(raw.price ?? 0),
            } as Product;
          });
          setProducts(list);
          const sharedProductId = new URLSearchParams(window.location.search).get("item");
          if (sharedProductId) {
            const sharedProduct = list.find((product) => product.id === sharedProductId);
            if (sharedProduct) setSearchQuery(sharedProduct.name || sharedProduct.nameGu || sharedProduct.nameEn || "");
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

  const addToCart = useCallback((product: Product) => {
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
          name: product.name || product.nameGu || product.nameEn || "Grocery Item",
          price: product.price || 0,
          quantity: existing ? existing.quantity + 1 : 1,
          unit: product.units?.[0] || "1",
        },
      };
    });

    showToast(`${product.name || product.nameGu || product.nameEn || "Item"} added to your list.`);
    setBouncedProductId(product.id);
    window.setTimeout(() => setBouncedProductId((active) => active === product.id ? null : active), 500);
  }, [cart, showToast]);

  const handleClearSearch = () => {
    setSearchQuery("");
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const startVoiceSearch = () => {
    const Recognition = (window as Window & { SpeechRecognition?: new () => SpeechRecognitionInstance; webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).SpeechRecognition
      ?? (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechError("Voice search is not available in this browser.");
      return;
    }
    setSpeechError("");
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

  const toggleFavorite = useCallback((productId: string) => {
    setFavorites((current) => {
      const next = current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId];
      localStorage.setItem("jay-store-favorites", JSON.stringify(next));
      return next;
    });
  }, []);

  const shareProduct = useCallback((product: Product) => {
    const title = product.name || product.nameGu || product.nameEn || "Grocery Item";
    const message = `${title} — ₹${product.price}\n${window.location.origin}/?item=${encodeURIComponent(product.id)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }, []);

  const repeatLastOrder = () => {
    try {
      const previous = JSON.parse(localStorage.getItem("jay-store-last-order") || "[]") as CartItem[];
      if (!previous.length) return;
      const restorable = previous.flatMap((item) => {
        const product = products.find((entry) => entry.id === item.id);
        return product?.inStock && product.stockCount > 0 ? [[item.id, { ...item, name: product.name || product.nameGu || product.nameEn || item.name, price: product.price, quantity: Math.min(item.quantity, product.stockCount) }] as const] : [];
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

  const updateQty = useCallback((key: string, delta: number) => {
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
  }, [cart, products, showToast]);

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
      const html2canvas = (await import("html2canvas")).default;
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

  const generateReceiptTextMessage = (): string => {
    const storeTitle = storeSettings.storeName || "Jay Vachhraj General Store";
    const storeAddress = storeSettings.address || "Zanzmer";
    const dateTime =
      receiptTimestamp ||
      `${new Date().toLocaleDateString("en-IN")} · ${new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })}`;

    let message = `🧾 *${storeTitle.toUpperCase()}*\n📍 ${storeAddress}\n🕒 ${dateTime}\n`;
    message += `--------------------------------\n`;
    if (custName.trim()) message += `👤 *Customer:* ${custName.trim()}\n`;
    if (custPhone.trim()) message += `📱 *Mobile:* ${custPhone.replace(/\D/g, "")}\n`;
    if (custAddress.trim()) message += `🏠 *Address:* ${custAddress.trim()}\n`;
    message += `--------------------------------\n`;
    message += `*ORDER ITEMS:*\n`;

    Object.values(cart).forEach((item, index) => {
      const product = products.find((p) => p.id === item.id);
      const itemDisplayName = product ? (product.name || product.nameGu || product.nameEn || item.name) : item.name;
      const unitLabel = product?.units?.[0] || item.unit || "";
      const unitText = unitLabel ? ` (${unitLabel})` : "";
      message += `${index + 1}. ${itemDisplayName}${unitText}\n   ${item.quantity} × ₹${item.price.toFixed(2)} = *₹${(item.price * item.quantity).toFixed(2)}*\n`;
    });

    message += `--------------------------------\n`;
    if (cartDiscount > 0) {
      message += `🎁 *Discount:* -₹${cartDiscount.toFixed(2)}\n`;
    }
    message += `💰 *TOTAL AMOUNT: ₹${cartTotal.toFixed(2)}*\n`;
    message += `📦 *Total Items:* ${totalCartCount} items\n`;
    message += `--------------------------------\n`;
    message += `_Thank you for shopping with us!_`;

    return message;
  };

  const handleShareReceipt = () => {
    try {
      const receiptMessage = generateReceiptTextMessage();
      const whatsappUrl = `https://wa.me/919638009880?text=${encodeURIComponent(receiptMessage)}`;
      const win = window.open(whatsappUrl, "_blank");
      if (!win) {
        window.location.href = whatsappUrl;
      }
    } catch (error) {
      console.error("Share failed:", error);
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

  const activeSearchQuery = searchQuery.trim() === "" ? "" : deferredSearchQuery;
  const brands = [...new Set(products.map((product) => product.brand).filter((brand) => brand && brand !== "Other"))];
  const selectedCategory = activeCategory;
  const setSelectedCategory = setActiveCategory;

  // Temporary development debug logging before the filter
  console.log('Selected:', selectedCategory, 'Sample Item Category:', products[0]?.category);

  const filteredProducts = useMemo(() => {
    const isAllCategory =
      !selectedCategory ||
      normalize(selectedCategory) === "all" ||
      normalize(selectedCategory) === "all items";

    const allStoreCategories = storeSettings.categories.length
      ? storeSettings.categories
      : DEFAULT_CATEGORIES;

    return products
      .filter((p) => {
        const norm = (str?: string) => (str || "").trim().toLowerCase();
        const normActive = norm(selectedCategory || activeCategory);
        const prodCat = norm(p.category || p.categoryName || p.category_name);

        let matchesCat = 
          normActive === "all" || 
          normActive === "all items" || 
          !normActive ||
          prodCat === normActive ||
          prodCat.replace(/\s+/g, "-") === normActive ||
          normActive.replace(/\s+/g, "-") === prodCat;

        // Cross-check against store settings categories (id <-> name)
        if (!matchesCat) {
          const matchedCategoryObj = allStoreCategories.find(
            (cat) =>
              norm(cat.id) === normActive ||
              norm(cat.name) === normActive
          );
          if (matchedCategoryObj) {
            matchesCat =
              norm(matchedCategoryObj.name) === prodCat ||
              norm(matchedCategoryObj.id) === prodCat ||
              norm(matchedCategoryObj.name).replace(/\s+/g, "-") === prodCat ||
              norm(matchedCategoryObj.id).replace(/\s+/g, "-") === prodCat;
          }
        }

        // Fallback to Primary Store Category aliases and translations
        if (!matchesCat) {
          try {
            const primaryItem = normalizeCategoryToPrimary(p.category, storeSettings.categories);
            const primarySelected = normalizeCategoryToPrimary(selectedCategory || activeCategory, storeSettings.categories);
            if (primaryItem.id && primarySelected.id && primaryItem.id === primarySelected.id) {
              matchesCat = true;
            }
          } catch {}
        }

        const matchesBrand = brandFilter === "all" || p.brand === brandFilter;
        const matchesSale = !saleOnly || p.offer || p.originalPrice > p.price;
        const matchesFavorite = !favoritesOnly || favorites.includes(p.id);
        const categoryName = storeSettings.categories.find((category) => category.id === p.category)?.name;
        const matchesSearch = matchesGroceryQuery(p, activeSearchQuery, categoryName);
        return matchesCat && matchesBrand && matchesSale && matchesFavorite && matchesSearch;
      })
      .sort((first, second) =>
        sortPrice === "low"
          ? first.price - second.price
          : sortPrice === "high"
          ? second.price - first.price
          : 0
      );
  }, [
    products,
    selectedCategory,
    brandFilter,
    saleOnly,
    favoritesOnly,
    favorites,
    storeSettings.categories,
    activeSearchQuery,
    sortPrice,
  ]);

  const activeBanners = banners.filter((b) => b.active);
  const allCategories: StoreCategory[] = [{ id: "all", name: "All Items", icon: "Sparkles" }, ...(storeSettings.categories.length ? storeSettings.categories : DEFAULT_CATEGORIES)];
  const StoreLogoIcon = CATEGORY_ICONS[storeSettings.logoIcon] ?? Store;
  const activeSliderIndex = activeBanners.length ? sliderIndex % activeBanners.length : 0;

  return (
    <div
      className="text-slate-800 min-h-screen font-sans flex flex-col antialiased transition-colors duration-200 pb-12 sm:pb-16"
      style={{ backgroundColor: storeSettings.backgroundColor || "#fbf9f5" }}
    >
      {toastMsg && (
        <div className="fixed top-16 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs border border-orange-500">
          <Check className="text-emerald-400" size={16} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Store Header: Unified Sticky Container */}
      <div ref={headerStickyRef} className="sticky top-0 z-40 shadow-2xs">
        {Boolean(storeSettings.noticeEnabled && storeSettings.noticeText?.trim()) && (
          <aside
            aria-label="Store announcement"
            className="notice-bar-container relative w-full overflow-hidden bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white py-1.5 sm:py-2 px-3 border-b border-orange-700/30 shadow-xs cursor-default select-none"
          >
            <div className="flex items-center overflow-hidden w-full whitespace-nowrap">
              <div className="animate-notice-marquee font-medium text-xs sm:text-[13px] tracking-wide inline-flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-white shrink-0">
                  <Megaphone size={12} aria-hidden="true" />
                </span>
                <span>{storeSettings.noticeText}</span>
              </div>
            </div>
          </aside>
        )}
        <header className="border-b border-stone-200/80 bg-white/95 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-2.5 sm:gap-3">
              <div
                className="flex items-center flex-1 min-w-0 select-none"
                aria-label="Store details"
              >
                {/* 1. Logo (Start): 48px x 48px circular clipped, 1px border #E2E8F0, 10px margin-end */}
                <div
                  className={`mr-2.5 shrink-0 relative cursor-pointer select-none rounded-full transition-all duration-300 ${
                    logoPrimedGreen
                      ? "ring-4 ring-emerald-500 ring-offset-2 ring-offset-white border-2 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.85)] animate-pulse scale-105"
                      : "hover:opacity-95"
                  }`}
                  onTouchStart={() => {
                    touchActiveRef.current = true;
                    handleLogoHoldStart();
                  }}
                  onTouchEnd={() => {
                    handleLogoHoldEnd();
                    setTimeout(() => {
                      touchActiveRef.current = false;
                    }, 400);
                  }}
                  onTouchCancel={() => {
                    handleLogoHoldEnd();
                    touchActiveRef.current = false;
                  }}
                  onMouseDown={(e) => {
                    if (touchActiveRef.current) return;
                    if (e.button !== 0) return;
                    handleLogoHoldStart();
                  }}
                  onMouseUp={() => {
                    if (touchActiveRef.current) return;
                    handleLogoHoldEnd();
                  }}
                  onMouseLeave={() => {
                    if (touchActiveRef.current) return;
                    handleLogoHoldEnd();
                  }}
                  onClick={handleLogoClick}
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
                  aria-label={logoPrimedGreen ? "Tap 3 times to enter stealth gateway" : storeSettings.storeName || "Store logo"}
                >
                  {storeSettings.logoUrl && !logoFailed ? (
                    <img
                      src={storeSettings.logoUrl}
                      alt={storeSettings.storeName || "Store logo"}
                      onError={() => setLogoFailed(true)}
                      decoding="async"
                      className="w-12 h-12 rounded-full object-cover shadow-xs border border-[#E2E8F0] pointer-events-none"
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-xs overflow-hidden border border-[#E2E8F0] pointer-events-none"
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
              <div className="shrink-0 flex items-center gap-3">
                <div className="flex flex-col items-end justify-center">
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

                {/* Desktop Header Cart Action */}
                <button
                  type="button"
                  onClick={() => setCartOpen(true)}
                  aria-label="Open Cart"
                  className="hidden lg:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-xs shadow-xs transition"
                >
                  <div className="relative flex items-center">
                    <ShoppingBag size={15} />
                    {totalCartCount > 0 && (
                      <span className="absolute -top-1.5 -right-2 bg-slate-900 text-white font-extrabold text-[9px] min-w-3.5 h-3.5 px-0.5 rounded-full flex items-center justify-center">
                        {totalCartCount}
                      </span>
                    )}
                  </div>
                  <span>Cart{totalCartCount > 0 ? ` (₹${cartTotal.toFixed(0)})` : ""}</span>
                </button>
              </div>
            </div>

            {/* Clean Pill Search Bar */}
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                searchInputRef.current?.blur();
              }}
              className="mt-3 relative flex items-center w-full"
            >
              {speechSupported ? (
                <button
                  type="button"
                  onClick={startVoiceSearch}
                  aria-label="Search by voice"
                  aria-pressed={isListening}
                  className={`absolute left-3.5 z-10 p-1 rounded-full transition-colors ${
                    isListening ? "text-rose-500 animate-pulse bg-rose-50" : "text-slate-400 hover:text-orange-600"
                  }`}
                  title="Voice Search"
                >
                  <Mic size={18} />
                </button>
              ) : (
                <div className="absolute left-3.5 text-slate-400 pointer-events-none">
                  <Mic size={18} />
                </div>
              )}
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    searchInputRef.current?.blur();
                  } else if (e.key === "Escape") {
                    setSearchQuery("");
                  }
                }}
                placeholder="Search products in Gujarati, Hindi or English..."
                className="w-full rounded-full border border-stone-200 bg-[#fbf9f5]/80 py-2.5 sm:py-3 pl-11 pr-20 text-xs sm:text-sm text-slate-900 placeholder-slate-400 shadow-2xs focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-all"
              />

              {/* Action Buttons on the right: Clear (✕) + Search Lens */}
              <div className="absolute right-3 flex items-center gap-1.5 z-10">
                {/* 1. Clear Cross Button (Visible only when text is entered) */}
                {searchQuery.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      searchInputRef.current?.focus();
                    }}
                    className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all focus:outline-none"
                    title="Clear Search"
                    aria-label="Clear Search"
                  >
                    <X size={16} strokeWidth={2.5} />
                  </button>
                )}

                {/* 2. Interactive Search Icon */}
                <button
                  type="button"
                  onClick={() => {
                    if (searchQuery.trim().length > 0) {
                      searchInputRef.current?.blur();
                    } else {
                      searchInputRef.current?.focus();
                    }
                  }}
                  className="p-1 text-slate-400 hover:text-orange-600 transition-colors focus:outline-none"
                  title="Search"
                  aria-label="Search"
                >
                  <Search size={18} strokeWidth={2} />
                </button>
              </div>
            </form>
            {speechError && <p role="status" className="mt-1 text-[11px] text-rose-600 text-center">{speechError}</p>}

            {/* Quick Filters Pill Bar */}
            <div className={`mt-2.5 flex items-center gap-2 no-scrollbar text-xs ${isSortOpen ? "overflow-visible" : "overflow-x-auto"}`}>
              <button
                type="button"
                onClick={() => setSaleOnly((v) => !v)}
                aria-pressed={saleOnly}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold border transition shrink-0 ${
                  saleOnly
                    ? "border-orange-500 bg-orange-500 text-white shadow-xs"
                    : "border-amber-300 bg-amber-50/90 text-amber-900 hover:bg-amber-100 shadow-2xs"
                }`}
              >
                <Tag size={13} className={saleOnly ? "text-white" : "text-orange-600"} /> Special Offers {saleOnly && <Check size={12} />}
              </button>
              <button
                type="button"
                onClick={() => setFavoritesOnly((v) => !v)}
                aria-pressed={favoritesOnly}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-bold border transition shrink-0 ${
                  favoritesOnly
                    ? "border-rose-500 bg-rose-500 text-white shadow-xs"
                    : "border-rose-200 bg-rose-50/70 text-rose-800 hover:bg-rose-100/80 shadow-2xs"
                }`}
              >
                <Heart size={13} fill={favoritesOnly ? "currentColor" : "none"} className={favoritesOnly ? "text-white" : "text-rose-500"} /> Favorites
              </button>
              {brands.length > 0 && (
                <div className="relative inline-flex items-center shrink-0">
                  <SlidersHorizontal size={13} className="absolute left-2.5 pointer-events-none text-slate-500" />
                  <select
                    aria-label="Filter by brand"
                    value={brandFilter}
                    onChange={(e) => setBrandFilter(e.target.value)}
                    className="rounded-full border border-stone-200 bg-[#fbf9f5] pl-7 pr-3 py-1.5 text-[11px] text-slate-700 focus:outline-none focus:border-orange-500 shrink-0 cursor-pointer shadow-2xs hover:bg-stone-100 transition"
                  >
                    <option value="all">All Brands</option>
                    {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}
              <div ref={sortDropdownRef} className="relative inline-flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => setIsSortOpen((prev) => !prev)}
                  aria-haspopup="listbox"
                  aria-expanded={isSortOpen}
                  aria-label="Sort products"
                  className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-[#fbf9f5] text-slate-600 px-3 py-1 text-[11px] font-bold hover:bg-stone-100 transition cursor-pointer shrink-0 shadow-2xs focus:outline-none focus:border-orange-500"
                >
                  <span>{SORT_OPTIONS.find((opt) => opt.value === sortPrice)?.label || "Featured Order"}</span>
                  <ChevronDown
                    size={14}
                    className={`text-slate-500 transition-transform duration-200 ${isSortOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isSortOpen && (
                  <div
                    role="listbox"
                    aria-label="Sort options"
                    className="absolute top-full left-0 mt-1 w-40 bg-white border border-stone-200 rounded-xl shadow-lg z-50 overflow-hidden py-1"
                  >
                    {SORT_OPTIONS.map((option) => {
                      const isSelected = sortPrice === option.value;
                      return (
                        <div
                          key={option.value}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            setSortPrice(option.value);
                            setIsSortOpen(false);
                          }}
                          className={`flex items-center justify-between px-4 py-2 text-[11px] cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-orange-50 font-bold text-orange-600"
                              : "text-slate-700 hover:bg-stone-100"
                          }`}
                        >
                          <span>{option.label}</span>
                          {isSelected && <Check size={13} className="text-orange-600 shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
      </div>

      <main className="max-w-6xl mx-auto px-4 pt-0 pb-4 md:py-4 w-full flex-1 pb-20 sm:pb-24 lg:grid lg:grid-cols-[250px_1fr] lg:gap-6 items-start lg:items-start">
        {/* Active Promotional Banners Hero Slider */}
        {activeBanners.length > 0 && (
          <div
            className="w-full my-2.5 px-3 md:my-6 md:px-0 flex justify-center items-center lg:col-span-2"
          >
            <div
              className="relative w-full max-w-full mx-auto overflow-hidden rounded-2xl flex items-center justify-center shadow-xs border border-stone-200/80 bg-white"
              style={{ aspectRatio: "1460 / 545" }}
            >
              {activeBanners.map((b, idx) => (
                <div
                  key={b.id}
                  className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                    idx === activeSliderIndex ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
                  }`}
                  style={{ borderRadius: "1rem", overflow: "hidden" }}
                >
                  <img
                    src={b.imgUrl}
                    alt={b.title || "Promotional Banner"}
                    decoding="async"
                    className="w-full h-full object-fill block"
                    style={{ aspectRatio: "1460 / 545" }}
                  />
                  {(b.title?.trim() || b.desc?.trim() || b.tag?.trim()) && (
                    <div className="absolute inset-0 p-3 sm:p-6 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none">
                      {b.tag?.trim() && (
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-orange-500 text-white font-bold text-[10px] w-fit mb-1 shadow-xs">
                          {b.tag}
                        </span>
                      )}
                      {b.title?.trim() && (
                        <h2 className="text-white font-black text-xs sm:text-base md:text-lg leading-tight drop-shadow-md">
                          {b.title}
                        </h2>
                      )}
                      {b.desc?.trim() && (
                        <p className="text-amber-200 text-[11px] sm:text-sm font-semibold mt-0.5 truncate">
                          {b.desc}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}

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
          </div>
        )}

        {bannersLoading && (
          <div
            role="status"
            aria-label="Loading promotions"
            className="w-full my-2.5 px-3 md:my-6 md:px-0 flex justify-center items-center lg:col-span-2"
          >
            <div
              className="skeleton-shimmer w-full max-w-full mx-auto overflow-hidden rounded-2xl relative block border border-stone-200"
              style={{ aspectRatio: "1460 / 545" }}
            />
          </div>
        )}

        {/* Sticky Category Bar Wrapper: Docks below header controls on scroll */}
        <div
          id="categories-section"
          style={headerHeight && !isDesktop ? { top: `${headerHeight}px` } : undefined}
          className="sticky top-[105px] sm:top-[115px] z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm py-2.5 transition-all mt-0 md:mt-6 mb-6 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:transition-none lg:flex lg:flex-col lg:overflow-y-auto lg:max-h-[calc(100vh-230px)] lg:sticky lg:top-[210px] lg:!top-[210px] lg:z-30 lg:h-fit lg:self-start lg:[&::-webkit-scrollbar]:hidden no-scrollbar lg:-mx-0 lg:px-0 lg:py-0 lg:bg-transparent lg:border-none lg:shadow-none lg:mt-0 lg:mb-0"
        >
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <FolderOpen size={15} className="text-orange-500" /> CATEGORIES
            </span>
            <span className="text-xs text-slate-500 font-semibold">
              ({filteredProducts.length} {filteredProducts.length === 1 ? "item" : "items"})
            </span>
          </div>
          <div className="flex items-start gap-3 sm:gap-4 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar scroll-smooth lg:flex-col lg:overflow-x-visible lg:gap-2 lg:pb-0 lg:pt-0 lg:w-full">
            {allCategories.map((cat) => {
              const isSel =
                normalize(selectedCategory) === normalize(cat.id) ||
                normalize(selectedCategory) === normalize(cat.name) ||
                (cat.id === "all" &&
                  (normalize(selectedCategory) === "all" ||
                    normalize(selectedCategory) === "all items" ||
                    !selectedCategory));
              const CategoryIcon = CATEGORY_ICONS[cat.icon] ?? Sparkles;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(cat.id === "all" ? "all" : (cat.name || cat.id));
                    setFavoritesOnly(false);
                  }}
                  style={isSel ? { backgroundColor: storeSettings.primaryColor || '#ea580c', borderColor: storeSettings.primaryColor || '#ea580c' } : undefined}
                  className={`rounded-2xl shadow-sm p-2 flex flex-col items-center justify-center shrink-0 min-w-20 sm:min-w-24 transition duration-150 active:scale-95 border lg:w-full lg:justify-start lg:flex-row lg:gap-3 lg:p-3 lg:min-w-0 ${
                    isSel
                      ? "text-white ring-2 ring-black/10"
                      : "bg-slate-50 border border-slate-200 text-slate-700 hover:border-orange-200 hover:bg-orange-50/40"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center mb-1.5 transition shrink-0 lg:mb-0 ${
                      isSel ? "bg-white/20 text-white" : "bg-white text-orange-600 border border-slate-100 shadow-2xs"
                    }`}
                  >
                    <CategoryIcon size={20} aria-hidden="true" />
                  </div>
                  <span className="text-[11px] font-bold text-center whitespace-nowrap truncate max-w-[72px] lg:text-xs lg:font-bold lg:text-left lg:max-w-none lg:truncate lg:flex-1">
                    {cat.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop Right Column: Hero Banner, Repeat Order, and Products */}
        <div className="min-w-0 flex-1 flex flex-col">
          {/* Hero Banner: rounded-3xl bg-gradient-to-r from-amber-50 to-orange-100 border border-orange-200 p-6 shadow-sm */}
          <section className="mt-4 sm:mt-6 mb-6 rounded-3xl bg-gradient-to-r from-amber-50 to-orange-100 border border-orange-200 p-6 shadow-sm relative overflow-hidden flex flex-col justify-center">
            <div className="relative z-10 max-w-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500 text-white text-[11px] font-black uppercase tracking-wider shadow-xs">
                  <Sparkles size={12} /> {storeSettings.heroBadge}
                </span>
                <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                  {storeSettings.heroSubBadge}
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-snug">
                {storeSettings.heroTitle}
              </h2>
              <p className="text-sm sm:text-base text-slate-700 mt-1.5 line-clamp-2 leading-relaxed">
                {storeSettings.heroSubtitle}
              </p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveCategory("Oil & Ghee");
                    setFavoritesOnly(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-xs font-bold shadow-xs transition"
                >
                  {storeSettings.heroBtn1Text}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveCategory("Spices");
                    setFavoritesOnly(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-amber-50 border border-orange-200 text-amber-950 text-xs font-bold shadow-2xs transition"
                >
                  {storeSettings.heroBtn2Text}
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

          {/* Product Grid: grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 */}
          {loading ? (
            <div role="status" aria-label="Loading products" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-4 pb-12 lg:pb-24">
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
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-4 pb-12 lg:pb-24">
                {filteredProducts.map((item) => (
                  <ProductCard
                    key={item.id}
                    item={item}
                    isFavorite={favorites.includes(item.id)}
                    inCartQty={cart[item.id]?.quantity ?? 0}
                    isBounced={bouncedProductId === item.id}
                    primaryColor={storeSettings.primaryColor}
                    onToggleFavorite={toggleFavorite}
                    onShareProduct={shareProduct}
                    onAddToCart={addToCart}
                    onUpdateQty={updateQty}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 flex flex-col items-center justify-center gap-3">
                <p>No matching products. Try another search or filter.</p>
                {searchQuery.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold hover:bg-orange-100 transition shadow-2xs"
                  >
                    <X size={14} /> Clear Search
                  </button>
                )}
              </div>
            )
          )}
        </div>
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
                  <img src={storeSettings.logoUrl} alt="" decoding="async" className="h-full w-full rounded-2xl object-cover" />
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
          <span>
            &copy; {new Date().getFullYear()} {storeSettings.storeName || "Jay Vachhraj General Store"}. All rights reserved. •{" "}
            <span aria-live="polite" className="inline">
              {(viewCount || 0).toLocaleString()} visits
            </span>
          </span>
        </div>
      </footer>

      {/* Stealth Admin Authentication Gatekeeper Modal */}
      <AdminStealthAuthModal
        isOpen={isStealthAuthOpen}
        onClose={() => setIsStealthAuthOpen(false)}
      />

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
                      const itemDisplayName = product ? (product.name || product.nameGu || product.nameEn || item.name) : item.name;
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
            {storeSettings.promoImageUrl && <img src={storeSettings.promoImageUrl} alt="" decoding="async" className="aspect-[16/9] w-full object-cover" />}
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
        <div className="fixed bottom-6 left-4 right-4 max-w-md mx-auto z-30">
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
          className={`fixed ${totalCartCount > 0 ? "bottom-24" : "bottom-6"} left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-md glass-dock rounded-2xl px-4 py-2.5 shadow-xl border border-orange-200/90 flex items-center justify-between gap-3 transition-all duration-300 animate-in fade-in slide-in-from-bottom`}
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

      {/* Floating WhatsApp Action Button */}
      <a
        href={`https://wa.me/${storeSettings.whatsappNumber.replace(/\D/g, "")}`}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat on WhatsApp"
        className="fixed bottom-28 right-4 z-[9999] bg-[#25D366] text-white p-3.5 rounded-full shadow-2xl flex items-center justify-center cursor-pointer hover:bg-[#20ba59] transition-transform hover:scale-110"
      >
        <MessageCircle size={24} />
      </a>
    </div>
  );
}