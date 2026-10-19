"use client";

import { useState, useEffect, useRef, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { db } from "./firebase";
import { addDoc, collection, doc, getDocs, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { toPng } from "html-to-image";
import { Camera, Check, CheckCircle2, ExternalLink, FolderOpen, Heart, Home, LockKeyhole, MapPin, MessageCircle, Mic, Minus, Phone, Plus, Search, ShoppingBag, Sparkles, Store, Truck, X, Wheat, Droplets, Flame, Cookie, Lamp, Megaphone, Share2, SlidersHorizontal } from "lucide-react";
import { DEFAULT_CATEGORIES, DEFAULT_STORE_SETTINGS, normalizeStoreSettings, storeThemeCssVars, StoreCategory, StoreSettings } from "./store-config";

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
  const secretTapCountRef = useRef(0);
  const secretTapTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleSecretHeaderTap = () => {
    secretTapCountRef.current += 1;

    if (secretTapTimerRef.current) {
      clearTimeout(secretTapTimerRef.current);
    }

    if (secretTapCountRef.current >= 3) {
      secretTapCountRef.current = 0;
      router.push("/admin");
      return;
    }

    secretTapTimerRef.current = setTimeout(() => {
      secretTapCountRef.current = 0;
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (secretTapTimerRef.current) {
        clearTimeout(secretTapTimerRef.current);
      }
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
  const [deliverySlot, setDeliverySlot] = useState("Evening");
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [isPromoOpen, setPromoOpen] = useState(false);
  const [isInstallPromptVisible, setInstallPromptVisible] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [bouncedProductId, setBouncedProductId] = useState<string | null>(null);
  const [lastOrderAvailable, setLastOrderAvailable] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [isReceiptOpen, setReceiptOpen] = useState(false);
  const [isPreparingReceipt, setPreparingReceipt] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const receiptRef = useRef<HTMLDivElement>(null);
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
            let parsedUnits: string[] = ["1 નંગ"];
            if (Array.isArray(raw.units)) parsedUnits = raw.units;
            else if (typeof raw.unit === "string") parsedUnits = [raw.unit];

            return {
              id: d.id,
              nameGu: raw.nameGu || raw.name_gu || "કરિયાણું આઇટમ",
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
      showToast("જય વછરાજ એપ સફળતાપૂર્વક ઇન્સ્ટોલ થઈ ગઈ!");
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
    if (fulfillment === "delivery" && cartTotal < storeSettings.minimumDeliveryOrder) {
      alert(`Home delivery requires a minimum order of ₹${storeSettings.minimumDeliveryOrder}. Choose Store Pickup or add more items.`);
      return;
    }

    try {
      setPreparingReceipt(true);
      setConfetti(true);
      window.setTimeout(() => setConfetti(false), 1800);
      setReceiptOpen(true);
      setCartOpen(false);
    } catch (error) {
      console.error("Unable to render the order slip:", error);
      alert("Unable to prepare the receipt image. Please try again.");
    } finally {
      setPreparingReceipt(false);
    }
  };

  const shareOrder = async () => {
    const total = Object.values(cart).reduce((sum, item) => sum + item.quantity * item.price, 0);
    const details = Object.values(cart).map((item) => `• ${item.name} × ${item.quantity} — ₹${item.quantity * item.price}`).join("\n");
    const message = `New order for ${storeSettings.storeName}\nCustomer: ${custName.trim()} (${custPhone.replace(/\D/g, "")})\n${custAddress.trim() ? `Area: ${custAddress.trim()}\n` : ""}Fulfilment: ${fulfillment === "pickup" ? "Store Pickup" : `Home Delivery — ${deliverySlot}`}\n${details}\n${cartDiscount > 0 ? `Savings: ₹${cartDiscount.toFixed(2)}\n` : ""}Total: ₹${total.toFixed(2)}`;
    const whatsappNumber = storeSettings.whatsappNumber.replace(/\D/g, "");
    const orderRecord = {
      customerName: custName.trim(),
      customerPhone: custPhone.replace(/\D/g, ""),
      customerAddress: custAddress.trim(),
      items: Object.values(cart),
      total,
      discount: cartDiscount,
      fulfillment,
      deliverySlot: fulfillment === "delivery" ? deliverySlot : null,
      status: "new",
      createdAt: serverTimestamp(),
    };
    try {
      await addDoc(collection(db, "orders"), orderRecord);
      localStorage.setItem("jay-store-last-order", JSON.stringify(Object.values(cart)));
      setLastOrderAvailable(true);
      if (receiptRef.current) {
        const image = await toPng(receiptRef.current, { cacheBust: true, pixelRatio: 2, backgroundColor: "#111827" });
        const receiptBlob = await (await fetch(image)).blob();
        const receiptFile = new File([receiptBlob], "jay-vachhraj-order.png", { type: "image/png" });
        if (navigator.canShare?.({ files: [receiptFile] })) {
          await navigator.share({ files: [receiptFile], title: `Order - ${storeSettings.storeName}`, text: message });
          setReceiptOpen(false);
          return;
        }
        const download = document.createElement("a");
        download.href = image;
        download.download = "jay-vachhraj-order.png";
        download.click();
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (error instanceof Error && error.message.includes("Missing or insufficient permissions")) {
        alert("Your order could not be securely saved. Please contact the store or try again later.");
        return;
      }
      console.warn("Image sharing is not available; opening WhatsApp text share instead.", error);
    }
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    setReceiptOpen(false);
  };

  const totalCartCount = Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = Object.values(cart).reduce((sum, item) => sum + item.quantity * item.price, 0);
  const cartDiscount = Object.values(cart).reduce((sum, item) => {
    const originalPrice = products.find((product) => product.id === item.id)?.originalPrice ?? item.price;
    return sum + Math.max(0, originalPrice - item.price) * item.quantity;
  }, 0);
  const indiaTimeParts = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const currentMinutes = Number(indiaTimeParts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(indiaTimeParts.find((part) => part.type === "minute")?.value ?? 0);
  const [openingHour = "6", openingMinute = "0"] = storeSettings.openingTime.split(":");
  const [closingHour = "21", closingMinute = "0"] = storeSettings.closingTime.split(":");
  const openingMinutes = Number(openingHour) * 60 + Number(openingMinute);
  const closingMinutes = Number(closingHour) * 60 + Number(closingMinute);
  const storeIsOpen = openingMinutes <= closingMinutes
    ? currentMinutes >= openingMinutes && currentMinutes < closingMinutes
    : currentMinutes >= openingMinutes || currentMinutes < closingMinutes;

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
    <div className="bg-[#fbf9f5] text-slate-800 min-h-screen font-sans flex flex-col antialiased">
      {toastMsg && (
        <div className="fixed top-16 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs border border-orange-500">
          <Check className="text-emerald-400" size={16} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 1. Top Ticker Banner & Store Header: Unified Sticky Container to Prevent Any Overlaps */}
      <div className="sticky top-0 z-30 shadow-2xs">
        {/* Top Ticker Banner: Warm orange announcement bar with delivery truck icon */}
        {storeSettings.noticeEnabled && (
          <div className="bg-amber-100/70 border-b border-amber-200/70 py-1.5 px-3 text-xs font-semibold text-amber-950 backdrop-blur-xs">
            <div className="max-w-6xl mx-auto flex items-center justify-center gap-2 text-center">
              <Truck className="text-amber-700 shrink-0" size={14} aria-hidden="true" />
              <span className="truncate">
                {storeSettings.noticeText || "Fresh seasonal spices and pure groundnut oil now available!"}
              </span>
            </div>
          </div>
        )}

        {/* Store Header & Clean Search Bar */}
        <header className="border-b border-stone-200/80 bg-white/95 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div
                onClick={handleSecretHeaderTap}
                className="flex items-center gap-3 cursor-pointer select-none active:opacity-90 transition-opacity"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleSecretHeaderTap();
                  }
                }}
                aria-label="Store details"
              >
                {storeSettings.logoUrl && !logoFailed ? (
                  <img
                    src={storeSettings.logoUrl}
                    alt={storeSettings.storeName || "Store logo"}
                    onError={() => setLogoFailed(true)}
                    className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-2xl object-cover shadow-sm border border-orange-100"
                  />
                ) : (
                  <div className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-2xl flex items-center justify-center text-white shadow-xs overflow-hidden bg-gradient-to-tr from-orange-600 to-amber-500">
                    <StoreLogoIcon size={22} aria-hidden="true" />
                  </div>
                )}
                <div>
                  <h1 className="text-base sm:text-xl md:text-2xl font-black leading-tight tracking-tight text-slate-900">
                    {storeSettings.storeName || "Jay Vachhraj General Store"}
                  </h1>
                  <p className="text-xs text-orange-600 font-semibold mt-0.5">
                    Zanzmer • Fresh, quality groceries
                  </p>
                </div>
              </div>
              <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-bold ${
                storeIsOpen ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
              }`}>
                <span className={`h-2 w-2 rounded-full ${storeIsOpen ? "bg-emerald-500" : "bg-rose-500"}`} />
                {storeIsOpen ? "Open" : "Closed"} {storeSettings.openingTime || "06:00"} - {storeSettings.closingTime || "21:00"}
              </span>
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

      <main className="max-w-6xl mx-auto px-4 py-4 w-full flex-1 pb-28">
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
                  className={`rounded-2xl shadow-sm p-2 flex flex-col items-center justify-center shrink-0 min-w-20 sm:min-w-24 transition duration-150 active:scale-95 border ${
                    isSel
                      ? "bg-orange-500 text-white border-orange-500 ring-2 ring-orange-500/20"
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
              <div key={index} className="overflow-hidden rounded-2xl border border-orange-100 bg-white">
                <div className="skeleton-shimmer aspect-[4/3]" />
                <div className="space-y-3 p-3">
                  <div className="skeleton-shimmer h-4 w-3/4 rounded" />
                  <div className="skeleton-shimmer h-4 w-1/3 rounded" />
                  <div className="skeleton-shimmer h-9 w-full rounded-xl" />
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
                    className="bg-white border border-orange-100 rounded-2xl overflow-hidden flex flex-col justify-between hover:shadow-md hover:border-orange-200 transition-all duration-200 shadow-sm relative group"
                  >
                    <div className="relative w-full aspect-[4/3] bg-slate-50 overflow-hidden">
                      <img
                        src={item.photoUrl}
                        alt={item.nameGu}
                        loading="lazy"
                        className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
                          !isAvailable ? "grayscale opacity-50" : ""
                        }`}
                      />

                      {!isAvailable && (
                        <span className="absolute bottom-2 left-2 bg-rose-600 text-white text-[9px] font-black px-2 py-0.5 rounded-md shadow z-10">
                          Out of stock
                        </span>
                      )}

                      {/* Favorite Heart & WhatsApp Share Action Icons */}
                      <div className="absolute right-2 top-2 flex gap-1 z-10">
                        <button
                          onClick={() => toggleFavorite(item.id)}
                          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                          aria-pressed={isFavorite}
                          className={`rounded-full bg-white/95 backdrop-blur-xs p-1.5 shadow-xs border border-slate-200/80 hover:bg-white transition ${
                            isFavorite ? "text-rose-500" : "text-slate-400 hover:text-rose-500"
                          }`}
                        >
                          <Heart size={15} fill={isFavorite ? "currentColor" : "none"} />
                        </button>
                        <button
                          onClick={() => shareProduct(item)}
                          aria-label="Share product on WhatsApp"
                          className="rounded-full bg-white/95 backdrop-blur-xs p-1.5 shadow-xs border border-slate-200/80 hover:bg-white text-[#25D366] transition"
                        >
                          <Share2 size={15} />
                        </button>
                      </div>
                    </div>

                    <div className="p-3 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        {/* Single Item Title - No redundant category subtitle */}
                        <h3 className="font-bold text-slate-900 text-xs sm:text-sm line-clamp-2 leading-snug">
                          {item.nameEn?.trim() || item.nameGu}
                        </h3>

                        {/* Price display: Bold main price, crossed original price, ONE unit chip, Special Offer tag */}
                        <div className="mt-2 flex items-baseline flex-wrap gap-1.5">
                          <span className="font-extrabold text-orange-600 text-sm sm:text-base">
                            ₹{item.price}
                          </span>
                          {item.originalPrice > item.price && (
                            <del className="text-[11px] text-slate-400 font-normal line-through">
                              ₹{item.originalPrice}
                            </del>
                          )}
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium border border-slate-200/70">
                            {unitChip}
                          </span>
                          {(item.offer || item.originalPrice > item.price) && (
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                              Special Offer
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Smooth Counter State (- 1 +) or Solid Orange + Add to List Button */}
                      {inCartQty > 0 ? (
                        <div className="flex items-center justify-between w-full rounded-xl bg-orange-50 border border-orange-200 p-1">
                          <button
                            type="button"
                            onClick={() => updateQty(item.id, -1)}
                            aria-label="Decrease quantity"
                            className="w-8 h-8 rounded-lg bg-white text-orange-600 font-bold flex items-center justify-center hover:bg-orange-100 active:scale-95 transition shadow-2xs border border-orange-200"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="font-extrabold text-xs text-orange-950 px-2">
                            {inCartQty} in cart
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQty(item.id, 1)}
                            aria-label="Increase quantity"
                            className="w-8 h-8 rounded-lg bg-orange-500 text-white font-bold flex items-center justify-center hover:bg-orange-600 active:scale-95 transition shadow-2xs"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(item)}
                          disabled={!isAvailable}
                          className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs transition duration-150 active:scale-95 flex items-center justify-center gap-1 shadow-xs ${
                            bouncedProductId === item.id ? "cart-add-bounce" : ""
                          } ${
                            isAvailable
                              ? "bg-orange-500 hover:bg-orange-600 text-white active:bg-orange-700 shadow-sm"
                              : "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                          }`}
                        >
                          {isAvailable ? "+ Add to List" : "Out of stock"}
                        </button>
                      )}
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
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-white bg-gradient-to-tr from-orange-600 to-amber-500 shadow-sm">
                {storeSettings.logoMode === "image" && storeSettings.logoUrl ? (
                  <img src={storeSettings.logoUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
                ) : (
                  <StoreLogoIcon size={22} />
                )}
              </span>
              <h2 className="text-lg font-black text-slate-900">{storeSettings.storeName}</h2>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-500">
              Your neighborhood grocery store for carefully selected, fresh everyday essentials.
            </p>
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              Shop Time: {storeSettings.hours}
            </p>
          </section>

          <section>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Contact & Address</h3>
            <p className="mt-4 text-sm leading-6 text-slate-500">{storeSettings.address}</p>
            <a
              href={`tel:+${storeSettings.whatsappNumber.replace(/\D/g, "")}`}
              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 transition hover:text-orange-600"
            >
              <Phone size={16} className="text-orange-500" /> +{storeSettings.whatsappNumber}
            </a>
            <a
              href={`https://wa.me/${storeSettings.whatsappNumber.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[#25D366] transition hover:text-emerald-700"
            >
              <MessageCircle size={16} /> Chat on WhatsApp
            </a>
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
        <div className="border-t border-slate-200 px-4 py-4 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} {storeSettings.storeName}. All rights reserved. <span className="mx-2">·</span> <span aria-live="polite">{viewCount.toLocaleString()} visits</span>
        </div>
      </footer>

      {/* Order Receipt Preview Modal - Clean Light */}
      {isReceiptOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <section role="dialog" aria-modal="true" aria-labelledby="receipt-title" className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-4 bg-slate-50">
              <h2 id="receipt-title" className="font-black text-slate-900">Order receipt preview</h2>
              <button onClick={() => setReceiptOpen(false)} aria-label="Close receipt preview" className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"><X size={20} /></button>
            </header>
            <div className="max-h-[65vh] overflow-auto bg-slate-100 p-3 sm:p-5">
              <article ref={receiptRef} className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-sm sm:p-6">
                <header className="flex items-center gap-3 border-b border-dashed border-slate-300 pb-4">
                  {storeSettings.logoMode === "image" && storeSettings.logoUrl ? (
                    <img src={storeSettings.logoUrl} alt="Store logo" className="h-12 w-12 rounded-xl object-cover" />
                  ) : (
                    <span className="grid h-12 w-12 place-items-center rounded-xl text-white bg-gradient-to-tr from-orange-600 to-amber-500">
                      <StoreLogoIcon size={24} />
                    </span>
                  )}
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-black text-slate-900">{storeSettings.storeName}</h3>
                    <p className="text-xs text-slate-500">{storeSettings.address}</p>
                  </div>
                </header>
                <div className="flex items-center justify-between py-4">
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-widest text-orange-600">Order receipt</h4>
                    <p className="mt-1 text-[11px] text-slate-500">{new Date().toLocaleDateString("en-IN")}</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                    Confirmation preview
                  </span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-slate-50 p-3 text-xs border border-slate-200">
                  <dt className="text-slate-500">Customer</dt><dd className="text-right font-semibold text-slate-900">{custName.trim()}</dd>
                  <dt className="text-slate-500">Phone</dt><dd className="text-right font-semibold text-slate-900">{custPhone.replace(/\D/g, "")}</dd>
                  {custAddress.trim() && <><dt className="text-slate-500">Address</dt><dd className="text-right font-semibold text-slate-900">{custAddress.trim()}</dd></>}
                  <dt className="text-slate-500">Fulfilment</dt><dd className="text-right font-semibold text-slate-900">{fulfillment === "pickup" ? "Store pickup" : `Home delivery · ${deliverySlot}`}</dd>
                </dl>
                <div className="mt-4">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-slate-200 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <span>Item</span><span>Qty</span><span className="text-right">Amount</span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {Object.values(cart).map((item) => (
                      <li key={item.id} className="grid grid-cols-[1fr_auto_auto] items-start gap-2 py-2.5 text-xs">
                        <span className="font-semibold text-slate-900">{item.name}<span className="mt-0.5 block text-[10px] font-normal text-slate-500">₹{item.price.toFixed(2)} each</span></span>
                        <span className="text-slate-600">×{item.quantity}</span>
                        <span className="text-right font-bold text-slate-900">₹{(item.price * item.quantity).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-2 space-y-2 border-t border-slate-200 pt-3 text-xs">
                  {cartDiscount > 0 && <div className="flex justify-between text-emerald-600 font-semibold"><span>Offers & savings</span><span>−₹{cartDiscount.toFixed(2)}</span></div>}
                  <div className="flex justify-between text-base font-black text-slate-900"><span>Payable total</span><span>₹{cartTotal.toFixed(2)}</span></div>
                </div>
                {storeSettings.upiId && (
                  <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <img src={storeSettings.upiQrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(`upi://pay?pa=${storeSettings.upiId}&pn=${storeSettings.upiName}&am=${cartTotal.toFixed(2)}&cu=INR`)}`} alt="Store UPI QR code" className="h-20 w-20 rounded bg-white object-contain p-1 border border-slate-200" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900">Pay via UPI</p>
                      <p className="truncate text-[10px] text-slate-500">{storeSettings.upiId}</p>
                      <a href={`upi://pay?pa=${encodeURIComponent(storeSettings.upiId)}&pn=${encodeURIComponent(storeSettings.upiName)}&am=${cartTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent("Store order")}`} className="mt-2 inline-flex rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-[10px] font-bold text-white shadow-xs">Pay ₹{cartTotal.toFixed(2)}</a>
                    </div>
                  </div>
                )}
                <p className="mt-4 text-center text-[10px] text-slate-500">Thank you for shopping with us.</p>
              </article>
            </div>
            <div className="flex flex-col gap-2 p-4 sm:flex-row bg-slate-50 border-t border-slate-200">
              <button onClick={() => setReceiptOpen(false)} className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 transition">Back to order</button>
              <button onClick={shareOrder} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-black text-white bg-orange-500 hover:bg-orange-600 shadow-sm transition"><MessageCircle size={18} /> Share order</button>
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
              જય વછરાજ એપ ઇન્સ્ટોલ કરો
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
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setFulfillment("delivery")}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${fulfillment === "delivery" ? "border-orange-500 bg-orange-50 text-orange-700 shadow-xs" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"}`}
                >
                  Home Delivery
                </button>
                <button
                  onClick={() => setFulfillment("pickup")}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${fulfillment === "pickup" ? "border-orange-500 bg-orange-50 text-orange-700 shadow-xs" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"}`}
                >
                  Store Pickup
                </button>
              </div>
              {fulfillment === "delivery" && (
                <>
                  <select
                    value={deliverySlot}
                    onChange={(event) => setDeliverySlot(event.target.value)}
                    aria-label="Preferred delivery slot"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-orange-500"
                  >
                    <option>Morning</option>
                    <option>Afternoon</option>
                    <option>Evening</option>
                  </select>
                  {cartTotal < storeSettings.minimumDeliveryOrder && (
                    <p className="text-[11px] text-amber-700 font-medium">
                      Minimum home delivery order is ₹{storeSettings.minimumDeliveryOrder}. Choose pickup or add ₹{(storeSettings.minimumDeliveryOrder - cartTotal).toFixed(2)} more.
                    </p>
                  )}
                </>
              )}
              <input
                type="text"
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                placeholder="Your name *"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500"
              />
              <input
                type="tel"
                maxLength={10}
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
                placeholder="10-digit mobile number *"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500"
              />
              <input
                type="text"
                value={custAddress}
                onChange={(e) => setCustAddress(e.target.value)}
                placeholder="Village / area"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500"
              />

              <button
                onClick={handleSendWhatsAppOrder}
                disabled={isPreparingReceipt}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-lg disabled:cursor-wait disabled:opacity-70 transition"
              >
                {isPreparingReceipt ? "Preparing receipt…" : <><MessageCircle size={18} /> Order via WhatsApp</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}