"use client";

import { useState, useEffect, useRef, useDeferredValue } from "react";
import { db } from "./firebase";
import { addDoc, collection, doc, getDocs, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { toPng } from "html-to-image";
import { Camera, Check, CheckCircle2, ExternalLink, FolderOpen, Heart, MapPin, MessageCircle, Mic, Minus, Phone, Plus, Search, ShoppingBag, Sparkles, Store, X, Wheat, Droplets, Flame, Cookie, Lamp, Megaphone, Share2, SlidersHorizontal } from "lucide-react";
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
      root.classList.add("dark");
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
    return onSnapshot(
      doc(db, "storeSettings", "main"),
      (snapshot) => {
        const data = snapshot.data() ?? {};
        setStoreSettings(normalizeStoreSettings(data));
      },
      (error) => {
        console.error("Failed to listen for store settings:", error);
        setStoreSettings(DEFAULT_STORE_SETTINGS);
      },
    );
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
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setInstallPromptVisible(false);
  };

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("PWA worker registration failed:", error));
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
    <div data-motion={storeSettings.animationTheme} data-theme={storeSettings.theme} data-card-style={storeSettings.cardStyle} className={`storefront storefront-neumorphic theme-${storeSettings.theme} motion-${storeSettings.animationTheme} ${storeSettings.appearance === "light" ? "storefront-light" : ""} min-h-screen font-sans flex flex-col antialiased`} style={storeThemeCssVars(storeSettings) as React.CSSProperties}>
      {toastMsg && (
        <div className="fixed top-16 right-4 z-50 bg-[#0f172a] text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs border border-orange-500">
          <Check className="text-emerald-400" size={16} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Notice */}
      {storeSettings.noticeEnabled && (
      <div className="sticky top-0 z-40 py-2 px-3 text-xs font-semibold text-white shadow-md" style={{ background: `linear-gradient(90deg, ${storeSettings.primaryColor}, ${storeSettings.secondaryColor})` }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Megaphone className="notice-megaphone text-amber-100" size={17} aria-hidden="true" />
            <span className="truncate font-medium">
              {storeSettings.noticeText}
            </span>
          </div>
        </div>
      </div>
      )}
      {/* Header */}
      <header className={`glass-surface sticky ${storeSettings.noticeEnabled ? "top-8" : "top-0"} z-30 border-b border-white/20`}>
        <div className="max-w-6xl mx-auto px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-white shadow-lg overflow-hidden" style={{ background: storeSettings.logoMode === "icon" ? storeSettings.accentColor : "transparent" }}>
                {storeSettings.logoMode === "image" && storeSettings.logoUrl ? <img src={storeSettings.logoUrl} alt="Store logo" className="h-full w-full object-cover" /> : <StoreLogoIcon size={27} aria-hidden="true" />}
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-black leading-tight tracking-tight text-[color:var(--store-foreground)]">
                  {storeSettings.storeName}
                </h1>
                <p className="text-xs text-amber-400 font-bold">
                  Zanzmer • Fresh, quality groceries
                </p>
              </div>
            </div>
            <span className={`hidden shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold sm:inline-flex ${storeIsOpen ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
              <span className={`status-dot h-2 w-2 rounded-full ${storeIsOpen ? "bg-emerald-400" : "bg-rose-400"}`} />{storeIsOpen ? "Open" : "Closed"}
            </span>
          </div>

          <div className="mt-2.5 relative flex items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products in Gujarati, Hindi or English…"
              className="neumorphic-input w-full rounded-xl border border-[#1f2e4d] bg-[#0c1322] py-2.5 pl-9 pr-24 text-xs text-white placeholder-slate-400 focus:outline-none"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} aria-hidden="true" />
            <div className="absolute right-1.5 flex items-center gap-1">
              {speechSupported && <button type="button" onClick={startVoiceSearch} aria-label="Search by voice" aria-pressed={isListening} className={`rounded-lg p-1.5 ${isListening ? "bg-rose-500 text-white animate-pulse" : "text-slate-300 hover:bg-white/10"}`}><Mic size={16} /></button>}
              <button type="button" onClick={() => setShowFilters((visible) => !visible)} aria-expanded={showFilters} aria-label="Show product filters" className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10"><SlidersHorizontal size={16} /></button>
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 sm:hidden"><span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${storeIsOpen ? "text-emerald-300" : "text-rose-300"}`}><span className={`status-dot h-1.5 w-1.5 rounded-full ${storeIsOpen ? "bg-emerald-400" : "bg-rose-400"}`} />{storeIsOpen ? "Open" : "Closed"}</span><span className="text-[10px] text-slate-500">{storeSettings.openingTime}–{storeSettings.closingTime}</span></div>
          {speechError && <p role="status" className="mt-1 text-[10px] text-rose-300">{speechError}</p>}
          {showFilters && <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {speechSupported && <select aria-label="Voice search language" value={speechLanguage} onChange={(event) => setSpeechLanguage(event.target.value)} className="rounded-lg border border-[#1f2e4d] bg-[#0c1322] px-2 py-2 text-xs text-white"><option value="gu-IN">ગુજરાતી</option><option value="hi-IN">हिन्दी</option><option value="en-IN">English</option></select>}
            <select aria-label="Filter by brand" value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)} className="rounded-lg border border-[#1f2e4d] bg-[#0c1322] px-2 py-2 text-xs text-white"><option value="all">All brands</option>{brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}</select>
            <select aria-label="Sort by price" value={sortPrice} onChange={(event) => setSortPrice(event.target.value)} className="rounded-lg border border-[#1f2e4d] bg-[#0c1322] px-2 py-2 text-xs text-white"><option value="featured">Featured order</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select>
            <button type="button" onClick={() => setSaleOnly((value) => !value)} aria-pressed={saleOnly} className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-bold ${saleOnly ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-[#1f2e4d] bg-[#0c1322] text-slate-300"}`}>Offers / sale {saleOnly && <Check size={13} />}</button>
            <button type="button" onClick={() => setFavoritesOnly((value) => !value)} aria-pressed={favoritesOnly} className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-bold ${favoritesOnly ? "border-rose-400 bg-rose-400/15 text-rose-200" : "border-[#1f2e4d] bg-[#0c1322] text-slate-300"}`}><Heart size={14} /> Favorites</button>
          </div>}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 w-full flex-1">
        {/* Slider */}
        {activeBanners.length > 0 && (
          <div className="store-card mb-5 relative rounded-2xl overflow-hidden">
            <div className="relative w-full aspect-[16/9] sm:aspect-[21/8] min-h-56 sm:min-h-72 max-h-[34rem] overflow-hidden">
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
                  <div className="absolute inset-0 p-5 sm:p-10 flex flex-col justify-end bg-gradient-to-t from-black/55 via-black/10 to-transparent">
                    <span className="inline-block px-2.5 py-0.5 rounded-full bg-orange-500 text-white font-bold text-[10px] w-fit mb-1 shadow">
                      {b.tag}
                    </span>
                    <h2 className="text-white font-black text-sm sm:text-lg leading-tight drop-shadow-md">
                      {b.title}
                    </h2>
                    <p className="text-amber-200 text-xs sm:text-sm font-semibold mt-0.5">
                      {b.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20">
              {activeBanners.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setSliderIndex(idx)}
                  className={`h-2 rounded-full transition-all ${
                    idx === activeSliderIndex ? "w-5 bg-orange-500" : "w-2 bg-white/50"
                  }`}
                />
              ))}
            </div>
          </div>
        )}
        {bannersLoading && <div role="status" aria-label="Loading promotions" className="mb-5 overflow-hidden rounded-2xl border border-slate-800"><div className="skeleton-shimmer h-56 sm:h-72" /></div>}

        {/* Categories */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <FolderOpen size={14} /> Shop by category
            </span>
            <span className="text-[11px] text-slate-400">
              {filteredProducts.length} items
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none text-xs">
            {allCategories.map((cat) => {
              const isSel = activeCategory === cat.id;
              const CategoryIcon = CATEGORY_ICONS[cat.icon] ?? Sparkles;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`interactive-lift flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold whitespace-nowrap select-none transition-colors duration-200 ease-out active:scale-[0.95] ${
                    isSel
                      ? "border-transparent text-white shadow-md"
                      : "bg-slate-800 text-slate-300 border-slate-700 hover:text-white hover:shadow-sm"
                  }`}
                  style={{
                    transform: "translateZ(0)",
                    transition: "transform 0.12s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s ease-out, background-color 0.2s ease-out, color 0.2s ease-out, box-shadow 0.2s ease-out",
                    ...(isSel ? { backgroundColor: storeSettings.primaryColor, borderColor: storeSettings.primaryColor } : {}),
                  }}
                >
                  <CategoryIcon size={14} aria-hidden="true" />
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {lastOrderAvailable && <div className="mb-5 flex justify-end"><button onClick={repeatLastOrder} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-200">Repeat last order</button></div>}

        {isInstallPromptVisible && <aside className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3"><div><span className="block text-sm font-bold text-emerald-100">Install Jay Vachhraj Store App</span><span className="mt-0.5 block text-xs text-emerald-200/80">Fast, lightweight shopping app on your device</span></div><div className="flex items-center gap-2"><button onClick={installApp} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950">Install App</button><button onClick={() => setInstallPromptVisible(false)} aria-label="Dismiss app install prompt" className="rounded-lg p-2 text-emerald-100"><X size={16} /></button></div></aside>}

        {/* Product Cards */}
        {loading ? (
          <div role="status" aria-label="Loading products" className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 sm:gap-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-800/70"><div className="skeleton-shimmer aspect-[4/3]" /><div className="space-y-3 p-3"><div className="skeleton-shimmer h-4 w-3/4 rounded" /><div className="skeleton-shimmer h-4 w-1/3 rounded" /><div className="skeleton-shimmer h-9 w-full rounded-xl" /></div></div>)}</div>
        ) : (
          filteredProducts.length ? <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {filteredProducts.map((item) => {
              const isAvailable = item.inStock && item.stockCount > 0;
              const isFavorite = favorites.includes(item.id);
              return (
                <div
                  key={item.id}
                    className="store-card neumorphic-card interactive-lift rounded-2xl overflow-hidden flex flex-col justify-between relative group"
                >
                  <div className="relative w-full aspect-[4/3] bg-[#070b14] overflow-hidden">
                    <img
                      src={item.photoUrl}
                      alt={item.nameGu}
                      className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
                        !item.inStock ? "grayscale opacity-50" : ""
                      }`}
                    />
                      {!isAvailable && (
                      <span className="absolute bottom-2 left-2 bg-rose-600 text-white text-[9px] font-black px-2 py-0.5 rounded-md shadow">
                        Out of stock
                      </span>
                    )}
                      {(item.offer || item.originalPrice > item.price) && (
                        <span className="special-offer-badge" aria-label="Special offer">
                          <span>SPECIAL OFFER</span>
                        </span>
                      )}
                      <div className="absolute right-2 top-2 flex gap-1"><button onClick={() => toggleFavorite(item.id)} aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"} aria-pressed={isFavorite} className={`rounded-full bg-slate-950/80 p-2 ${isFavorite ? "text-rose-400" : "text-white"}`}><Heart size={16} fill={isFavorite ? "currentColor" : "none"} /></button><button onClick={() => shareProduct(item)} aria-label="Share product on WhatsApp" className="rounded-full bg-[#25D366] p-2 text-white"><Share2 size={15} /></button></div>
                  </div>

                  <div className="p-3 flex-1 flex flex-col justify-between gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-bold text-[color:var(--store-foreground)] text-xs sm:text-sm line-clamp-2">
                        {item.nameEn?.trim() || item.nameGu}
                      </h4>
                      <span className="font-jakarta shrink-0 font-bold text-xs sm:text-sm" style={{ color: storeSettings.accentColor }}>₹{item.price}{item.originalPrice > item.price && <del className="ml-1 text-[10px] text-slate-500">₹{item.originalPrice}</del>}</span>
                    </div>

                    <button
                      onClick={() => addToCart(item)}
                      disabled={!isAvailable}
                      className={`neumorphic-button interactive-lift w-full py-2 px-3 rounded-xl font-bold text-xs transition active:scale-95 ${bouncedProductId === item.id ? "cart-add-bounce" : ""} ${
                        isAvailable
                          ? "text-white shadow-md"
                          : "bg-[#0c1322] text-slate-500 cursor-not-allowed border border-[#1f2e4d]"
                      }`}
                      style={isAvailable ? { backgroundColor: storeSettings.primaryColor } : undefined}
                    >
                      {isAvailable ? "+ Add to List" : "Out of stock"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div> : <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-400">No matching products. Try another search or filter.</div>
        )}
      </main>

      <footer className="glass-surface border-t border-white/20 text-slate-300">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <section>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: storeSettings.accentColor }}>
                {storeSettings.logoMode === "image" && storeSettings.logoUrl ? <img src={storeSettings.logoUrl} alt="" className="h-full w-full rounded-2xl object-cover" /> : <StoreLogoIcon size={22} />}
              </span>
              <h2 className="text-lg font-black text-white">{storeSettings.storeName}</h2>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">Your neighborhood grocery store for carefully selected, fresh everyday essentials.</p>
            <p className="mt-4 rounded-xl border border-[#263653] bg-[#111c32] px-3 py-2 text-xs font-semibold text-amber-200">Shop Time: {storeSettings.hours}</p>
          </section>

          <section>
            <h3 className="text-sm font-black uppercase tracking-wider text-white">Contact & Address</h3>
            <p className="mt-4 text-sm leading-6 text-slate-400">{storeSettings.address}</p>
            <a href={`tel:+${storeSettings.whatsappNumber.replace(/\D/g, "")}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-200 transition-all duration-200 hover:text-orange-300"><Phone size={16} /> +{storeSettings.whatsappNumber}</a>
            <a href={`https://wa.me/${storeSettings.whatsappNumber.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[#25D366] transition-all duration-200 hover:text-emerald-200"><MessageCircle size={16} /> Chat on WhatsApp</a>
          </section>

          <section>
            <h3 className="text-sm font-black uppercase tracking-wider text-white">Our Quality Promise</h3>
            <ul className="mt-4 space-y-3 text-sm text-slate-400">
              <li className="flex gap-2"><CheckCircle2 size={16} className="shrink-0 text-emerald-400" />100% Pure & Cleaned Goods</li>
              <li className="flex gap-2"><CheckCircle2 size={16} className="shrink-0 text-emerald-400" />Fair Pricing</li>
              <li className="flex gap-2"><CheckCircle2 size={16} className="shrink-0 text-emerald-400" />Quick Village Pickup</li>
              <li className="flex gap-2"><CheckCircle2 size={16} className="shrink-0 text-emerald-400" />Digital Payments Accepted</li>
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-black uppercase tracking-wider text-white">Quick Actions</h3>
            <div className="mt-4 grid gap-3">
              <a href={`tel:+${storeSettings.whatsappNumber.replace(/\D/g, "")}`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm font-bold text-sky-300 transition-all duration-200 hover:bg-sky-500/20"><Phone size={18} /> Direct Call</a>
              <a href={storeSettings.mapLink} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-[#EA4335] transition-all duration-200 hover:bg-red-500/20"><MapPin size={18} /> Google Maps</a>
              {storeSettings.socialLinks.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#263653] bg-[#111c32] px-4 py-3 text-sm font-bold text-slate-200 transition hover:border-orange-400">{/instagram/i.test(link.label) ? <Camera size={17} className="text-fuchsia-400" /> : <ExternalLink size={17} />}{link.label}</a>)}
            </div>
          </section>
        </div>
        <div className="border-t border-[#263653] px-4 py-4 text-center text-xs text-slate-500">© {new Date().getFullYear()} {storeSettings.storeName}. All rights reserved. <span className="mx-2">·</span> <span aria-live="polite">{viewCount.toLocaleString()} visits</span></div>
      </footer>

      {isReceiptOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="receipt-title" className="w-full max-w-xl overflow-hidden rounded-3xl border border-[#34445f] bg-[#0f172a] shadow-2xl">
            <header className="flex items-center justify-between border-b border-[#263653] px-4 py-4"><h2 id="receipt-title" className="font-black text-white">Order receipt preview</h2><button onClick={() => setReceiptOpen(false)} aria-label="Close receipt preview" className="rounded-lg p-2 text-slate-300 hover:bg-white/10"><X size={20} /></button></header>
            <div className="max-h-[65vh] overflow-auto bg-slate-950 p-3 sm:p-5">
              <article ref={receiptRef} className="mx-auto w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-100 shadow-xl sm:p-6">
                <header className="flex items-center gap-3 border-b border-dashed border-slate-600 pb-4">
                  {storeSettings.logoMode === "image" && storeSettings.logoUrl ? <img src={storeSettings.logoUrl} alt="Store logo" className="h-12 w-12 rounded-xl object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-xl text-white" style={{ backgroundColor: storeSettings.accentColor }}><StoreLogoIcon size={25} /></span>}
                  <div className="min-w-0"><h3 className="truncate text-base font-black text-white">{storeSettings.storeName}</h3><p className="text-xs text-slate-400">{storeSettings.address}</p></div>
                </header>
                <div className="flex items-center justify-between py-4"><div><h4 className="text-sm font-black uppercase tracking-widest text-amber-300">Order receipt</h4><p className="mt-1 text-[11px] text-slate-400">{new Date().toLocaleDateString("en-IN")}</p></div><span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold text-emerald-300">Confirmation preview</span></div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-slate-800/70 p-3 text-xs"><dt className="text-slate-400">Customer</dt><dd className="text-right font-semibold text-white">{custName.trim()}</dd><dt className="text-slate-400">Phone</dt><dd className="text-right font-semibold text-white">{custPhone.replace(/\D/g, "")}</dd>{custAddress.trim() && <><dt className="text-slate-400">Address</dt><dd className="text-right font-semibold text-white">{custAddress.trim()}</dd></>}<dt className="text-slate-400">Fulfilment</dt><dd className="text-right font-semibold text-white">{fulfillment === "pickup" ? "Store pickup" : `Home delivery · ${deliverySlot}`}</dd></dl>
                <div className="mt-4"><div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-slate-700 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400"><span>Item</span><span>Qty</span><span className="text-right">Amount</span></div><ul className="divide-y divide-slate-800">{Object.values(cart).map((item) => <li key={item.id} className="grid grid-cols-[1fr_auto_auto] items-start gap-2 py-2.5 text-xs"><span className="font-semibold text-slate-100">{item.name}<span className="mt-0.5 block text-[10px] font-normal text-slate-400">₹{item.price.toFixed(2)} each</span></span><span className="text-slate-300">×{item.quantity}</span><span className="text-right font-bold text-white">₹{(item.price * item.quantity).toFixed(2)}</span></li>)}</ul></div>
                <div className="mt-2 space-y-2 border-t border-slate-700 pt-3 text-xs">{cartDiscount > 0 && <div className="flex justify-between text-emerald-300"><span>Offers & savings</span><span>−₹{cartDiscount.toFixed(2)}</span></div>}<div className="flex justify-between text-base font-black text-white"><span>Payable total</span><span>₹{cartTotal.toFixed(2)}</span></div></div>
                {storeSettings.upiId && <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 p-3"><img src={storeSettings.upiQrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(`upi://pay?pa=${storeSettings.upiId}&pn=${storeSettings.upiName}&am=${cartTotal.toFixed(2)}&cu=INR`)}`} alt="Store UPI QR code" className="h-20 w-20 rounded bg-white object-contain p-1" /><div className="min-w-0 flex-1"><p className="text-xs font-bold text-white">Pay via UPI</p><p className="truncate text-[10px] text-slate-400">{storeSettings.upiId}</p><a href={`upi://pay?pa=${encodeURIComponent(storeSettings.upiId)}&pn=${encodeURIComponent(storeSettings.upiName)}&am=${cartTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent("Store order")}`} className="mt-2 inline-flex rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white">Pay ₹{cartTotal.toFixed(2)}</a></div></div>}
                <p className="mt-4 text-center text-[10px] text-slate-500">Thank you for shopping with us.</p>
              </article>
            </div>
            <div className="flex flex-col gap-2 p-4 sm:flex-row"><button onClick={() => setReceiptOpen(false)} className="min-h-11 flex-1 rounded-xl border border-[#34445f] bg-[#152036] px-4 py-2 text-sm font-bold text-slate-200">Back to order</button><button onClick={shareOrder} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-black text-white" style={{ backgroundColor: storeSettings.accentColor }}><MessageCircle size={18} /> Share order</button></div>
          </section>
        </div>
      )}

      {isPromoOpen && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="promo-title" className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-amber-400/40 bg-slate-900 shadow-2xl">{storeSettings.promoImageUrl && <img src={storeSettings.promoImageUrl} alt="" className="h-48 w-full object-cover" />}<button onClick={() => { setPromoOpen(false); sessionStorage.setItem("jay-store-promo-dismissed", "true"); }} aria-label="Close offer" className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white"><X size={18} /></button><div className="p-6"><p className="mb-2 text-xs font-black uppercase tracking-widest text-amber-400">Special offer</p><h2 id="promo-title" className="text-2xl font-black text-white">{storeSettings.promoTitle || "Seasonal offer"}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{storeSettings.promoText}</p><button onClick={() => { setPromoOpen(false); sessionStorage.setItem("jay-store-promo-dismissed", "true"); }} className="mt-5 rounded-xl bg-amber-500 px-5 py-3 text-sm font-black text-slate-950">Explore store</button></div></section></div>}

      {confetti && <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">{Array.from({ length: 42 }, (_, index) => <span key={index} className="confetti-piece" style={{ left: `${(index * 37) % 100}%`, backgroundColor: ["#f59e0b", "#10b981", "#f43f5e", "#38bdf8"][index % 4], animationDelay: `${(index % 9) * 0.08}s` }} />)}</div>}

      {/* Floating Bottom Cart */}
      {totalCartCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 max-w-xl mx-auto z-30">
          <div className="bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white rounded-2xl p-3 shadow-2xl flex items-center justify-between border border-amber-300/40">
            <div className="flex items-center gap-3 pl-1">
              <div className="cart-heartbeat w-10 h-10 rounded-xl bg-black/25 flex items-center justify-center text-lg font-bold text-amber-200">
                <ShoppingBag size={20} />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-amber-100">Order Summary</div>
                <div className="text-sm font-black flex items-center gap-2">
                  <span className="px-2 py-0.2 bg-white text-slate-900 rounded-full text-xs font-black">
                    {totalCartCount}
                  </span>
                  <span>items selected</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setCartOpen(true)}
              className="px-4 py-2 bg-slate-950 text-amber-300 hover:text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-lg transition"
            >
              <span>Review & Order</span><ExternalLink size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Cart Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="cart-drawer bg-[#0f172a] border border-[#1f2e4d] w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-[#1f2e4d] flex items-center justify-between bg-[#152036]">
              <h3 className="font-black text-sm text-white">Order Summary</h3>
              <button
                onClick={() => setCartOpen(false)}
                className="w-8 h-8 rounded-full bg-[#0c1322] text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X size={17} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1 divide-y divide-[#1f2e4d]">
              {Object.keys(cart).map((k) => {
                const item = cart[k];
                return (
                  <div key={k} className="py-2 flex items-center justify-between gap-2">
                    <div className="flex-1 pr-2">
                      <h5 className="text-xs font-bold text-white">{item.name}</h5>
                      <span className="text-[10px] text-slate-400">₹{item.price.toFixed(2)} each · ₹{(item.quantity * item.price).toFixed(2)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-[#0c1322] border border-[#1f2e4d] rounded-xl p-0.5">
                        <button
                          onClick={() => updateQty(k, -1)}
                          className="w-6 h-6 rounded-lg bg-[#152036] text-slate-200 flex items-center justify-center font-bold"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="w-7 text-center font-black text-xs text-white">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQty(k, 1)}
                          className="w-6 h-6 rounded-lg bg-orange-500 text-white flex items-center justify-center font-bold"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="space-y-2 border-t border-slate-700 pt-3 text-xs"><div className="flex justify-between text-slate-300"><span>Subtotal</span><span>₹{Object.values(cart).reduce((sum, item) => sum + item.quantity * (products.find((product) => product.id === item.id)?.originalPrice ?? item.price), 0).toFixed(2)}</span></div>{cartDiscount > 0 && <div className="flex justify-between text-emerald-300"><span>Offers & savings</span><span>−₹{cartDiscount.toFixed(2)}</span></div>}<div className="flex justify-between font-black text-white"><span>Payable total</span><span>₹{cartTotal.toFixed(2)}</span></div></div>
            </div>

            <div className="p-4 bg-[#152036] border-t border-[#1f2e4d] space-y-3">
              <div className="grid grid-cols-2 gap-2"><button onClick={() => setFulfillment("delivery")} className={`rounded-lg border px-3 py-2 text-xs font-bold ${fulfillment === "delivery" ? "border-amber-400 bg-amber-400/10 text-amber-200" : "border-slate-700 text-slate-400"}`}>Home Delivery</button><button onClick={() => setFulfillment("pickup")} className={`rounded-lg border px-3 py-2 text-xs font-bold ${fulfillment === "pickup" ? "border-amber-400 bg-amber-400/10 text-amber-200" : "border-slate-700 text-slate-400"}`}>Store Pickup</button></div>
              {fulfillment === "delivery" && <><select value={deliverySlot} onChange={(event) => setDeliverySlot(event.target.value)} aria-label="Preferred delivery slot" className="w-full rounded-xl border border-[#1f2e4d] bg-[#0c1322] px-3 py-2 text-xs text-white"><option>Morning</option><option>Afternoon</option><option>Evening</option></select>{cartTotal < storeSettings.minimumDeliveryOrder && <p className="text-[11px] text-amber-300">Minimum home delivery order is ₹{storeSettings.minimumDeliveryOrder}. Choose pickup or add ₹{(storeSettings.minimumDeliveryOrder - cartTotal).toFixed(2)} more.</p>}</>}
              <input
                type="text"
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                placeholder="Your name *"
                className="w-full px-3 py-2 bg-[#0c1322] border border-[#1f2e4d] rounded-xl text-xs text-white focus:outline-none"
              />
              <input
                type="tel"
                maxLength={10}
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
                placeholder="10-digit mobile number *"
                className="w-full px-3 py-2 bg-[#0c1322] border border-[#1f2e4d] rounded-xl text-xs text-white focus:outline-none"
              />
              <input
                type="text"
                value={custAddress}
                onChange={(e) => setCustAddress(e.target.value)}
                placeholder="Village / area"
                className="w-full px-3 py-2 bg-[#0c1322] border border-[#1f2e4d] rounded-xl text-xs text-white focus:outline-none"
              />

              <button
                onClick={handleSendWhatsAppOrder}
                disabled={isPreparingReceipt}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-xl disabled:cursor-wait disabled:opacity-70"
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