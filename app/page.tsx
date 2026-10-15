"use client";

import { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, doc, getDocs, onSnapshot } from "firebase/firestore";

interface Product {
  id: string;
  nameGu: string;
  nameEn?: string;
  category: string;
  units: string[];
  price: number;
  inStock: boolean;
  photoUrl: string;
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
  nameGu: string;
  unit: string;
  quantity: number;
  price: number;
}

interface StoreSettings {
  noticeEnabled: boolean;
  noticeText: string;
  whatsappNumber: string;
  address: string;
  hours: string;
}

const DEFAULT_STORE_SETTINGS: StoreSettings = {
  noticeEnabled: true,
  noticeText: "Fresh seasonal spices and pure groundnut oil are now available!",
  whatsappNumber: "919876543210",
  address: "Zanzmer, Dhoraji, Gujarat",
  hours: "7:00 AM - 10:00 PM",
};

const APP_CATEGORIES = [
  { id: "all", name: "All Items", icon: "✨" },
  { id: "કઠોળ-અનાજ", name: "Grains & Pulses", icon: "🌾" },
  { id: "તેલ-ઘી", name: "Oil & Ghee", icon: "🛢️" },
  { id: "મસાલા", name: "Spices", icon: "🌶️" },
  { id: "નાસ્તો-ફરસાણ", name: "Snacks", icon: "🍪" },
  { id: "પર્સનલ કેર", name: "Personal Care", icon: "🧼" },
  { id: "પૂજાપો-અન્ય", name: "Pooja & Others", icon: "🪔" },
];

const CUSTOM_UNIT = "__custom__";

export default function CustomerStorePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sliderIndex, setSliderIndex] = useState(0);

  // Cart
  const [cart, setCart] = useState<{ [key: string]: CartItem }>({});
  const [selectedUnits, setSelectedUnits] = useState<{ [prodId: string]: string }>({});
  const [isCartOpen, setCartOpen] = useState(false);
  const [customUnitProduct, setCustomUnitProduct] = useState<Product | null>(null);
  const [customUnitValue, setCustomUnitValue] = useState("");

  // Customer Form
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custAddress, setCustAddress] = useState("");

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
            } as Product;
          });
          setProducts(list);
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
      },
      (error) => {
        console.error("Failed to listen for slider updates:", error);
        setBanners([]);
      },
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      doc(db, "storeSettings", "main"),
      (snapshot) => {
        const data = snapshot.data() ?? {};
        setStoreSettings({
          noticeEnabled: data.noticeEnabled !== false,
          noticeText: String(data.noticeText ?? DEFAULT_STORE_SETTINGS.noticeText),
          whatsappNumber: String(data.whatsappNumber ?? DEFAULT_STORE_SETTINGS.whatsappNumber),
          address: String(data.address ?? DEFAULT_STORE_SETTINGS.address),
          hours: String(data.hours ?? DEFAULT_STORE_SETTINGS.hours),
        });
      },
      (error) => {
        console.error("Failed to listen for store settings:", error);
        setStoreSettings(DEFAULT_STORE_SETTINGS);
      },
    );
  }, []);

  // Slider Rotate
  useEffect(() => {
    const active = banners.filter((b) => b.active);
    setSliderIndex((current) => (active.length ? current % active.length : 0));
    if (active.length <= 1) return;
    const timer = setInterval(() => {
      setSliderIndex((prev) => (prev + 1) % active.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [banners]);

  const addToCart = (product: Product) => {
    if (!product.inStock) return;
    const unit = selectedUnits[product.id] || "1 kg";
    const key = `${product.id}__${unit}`;

    setCart((prev) => {
      const existing = prev[key];
      return {
        ...prev,
        [key]: {
          id: product.id,
          nameGu: product.nameEn?.trim() || product.nameGu,
          unit,
          price: product.price || 0,
          quantity: existing ? existing.quantity + 1 : 1,
        },
      };
    });

    showToast(`${product.nameEn?.trim() || product.nameGu} (${unit}) added to your list.`);
  };

  const handleCustomUnitSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!customUnitProduct || !customUnitValue.trim()) return;
    setSelectedUnits((current) => ({ ...current, [customUnitProduct.id]: customUnitValue.trim() }));
    setCustomUnitProduct(null);
    setCustomUnitValue("");
  };

  const updateQty = (key: string, delta: number) => {
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

  const handleSendWhatsAppOrder = () => {
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

    let msg = `🛍️ *New Order - Jay Vachhraj General Store*\n`;
    msg += `📍 *${storeSettings.address}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `👤 *Customer:* ${custName.trim()}\n`;
    msg += `📞 *Mobile:* ${cleanPhone}\n`;
    if (custAddress.trim()) msg += `🏡 *Area:* ${custAddress.trim()}\n`;
    msg += `📅 *Date:* ${new Date().toLocaleDateString("en-IN")}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📋 *Order items:*\n`;

    let idx = 1;
    keys.forEach((k) => {
      const item = cart[k];
      msg += `${idx}. *${item.nameGu}*\n`;
      msg += `   ➥ Unit: ${item.unit} | Quantity: *${item.quantity}*`;
      if (item.price > 0) msg += ` (₹${item.price})`;
      msg += `\n`;
      idx++;
    });

    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🙏 _Please confirm this order and share the total._`;

    const encoded = encodeURIComponent(msg);
    const whatsappNumber = storeSettings.whatsappNumber.replace(/\D/g, "");
    window.open(`https://wa.me/${whatsappNumber}?text=${encoded}`, "_blank");
    setCartOpen(false);
  };

  const totalCartCount = Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);

  const q = searchQuery.toLowerCase().trim();
  const filteredProducts = products.filter((p) => {
    const matchesCat = activeCategory === "all" || p.category === activeCategory;
    const matchesSearch =
      !q ||
      p.nameGu.toLowerCase().includes(q) ||
      (p.nameEn && p.nameEn.toLowerCase().includes(q)) ||
      (APP_CATEGORIES.find((category) => category.id === p.category)?.name.toLowerCase().includes(q) ?? false) ||
      p.category.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  const activeBanners = banners.filter((b) => b.active);

  return (
    <div className="bg-[#070b14] text-slate-100 min-h-screen font-sans flex flex-col antialiased">
      {toastMsg && (
        <div className="fixed top-16 right-4 z-50 bg-[#0f172a] text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs border border-orange-500">
          <span className="text-emerald-400 font-bold">✔</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Notice */}
      {storeSettings.noticeEnabled && (
      <div className="sticky top-0 z-40 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 py-2 px-3 text-xs font-semibold text-white shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-amber-200">📢</span>
            <span className="truncate font-medium">
              {storeSettings.noticeText}
            </span>
          </div>
        </div>
      </div>
      )}

      {/* Header */}
      <header className="sticky top-8 z-30 border-b border-[#1f2e4d] bg-[#0f172a]/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white text-xl shadow-lg">
                🏪
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-black text-white">
                  Jay Vachhraj General Store
                </h1>
                <p className="text-xs text-amber-400 font-bold">
                  Zanzmer • Fresh, quality groceries
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={`tel:+${storeSettings.whatsappNumber.replace(/\D/g, "")}`}
                className="px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-700/50 text-emerald-300 text-xs font-bold"
              >
                📞 Call
              </a>
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(storeSettings.address)}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-xl bg-sky-950/40 border border-sky-700/50 text-sky-300 text-xs font-bold"
              >
                📍 Directions
              </a>
            </div>
          </div>

          <div className="mt-2.5 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-9 pr-8 py-2 bg-[#0c1322] border border-[#1f2e4d] rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
              🔍
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 w-full flex-1">
        {/* Slider */}
        {activeBanners.length > 0 && (
          <div className="mb-5 relative rounded-2xl overflow-hidden shadow-lg border border-[#1f2e4d] bg-slate-900">
            <div className="relative w-full aspect-[21/9] sm:aspect-[24/8] max-h-56 overflow-hidden">
              {activeBanners.map((b, idx) => (
                <div
                  key={b.id}
                  className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                    idx === sliderIndex ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
                  }`}
                >
                  <img
                    src={b.imgUrl}
                    alt={b.title}
                    className="w-full h-full object-cover brightness-[0.45]"
                  />
                  <div className="absolute inset-0 p-4 sm:p-6 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent">
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
                    idx === sliderIndex ? "w-5 bg-orange-500" : "w-2 bg-white/50"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Categories */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <span>📂</span> Shop by category
            </span>
            <span className="text-[11px] text-slate-400">
              {filteredProducts.length} items
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none text-xs">
            {APP_CATEGORIES.map((cat) => {
              const isSel = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl whitespace-nowrap font-bold transition-all flex items-center gap-1.5 ${
                    isSel
                      ? "bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-lg"
                      : "bg-[#152036] text-slate-300 border border-[#1f2e4d] hover:border-orange-500"
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Product Cards */}
        {loading ? (
          <div role="status" className="py-20 text-center text-slate-400">Loading products...</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {filteredProducts.map((item) => {
              const selUnit = selectedUnits[item.id] || "1 kg";
              return (
                <div
                  key={item.id}
                  className="bg-[#152036] border border-[#1f2e4d] rounded-2xl overflow-hidden flex flex-col justify-between hover:border-orange-500 transition-all duration-200 shadow-sm relative group"
                >
                  <div className="relative w-full aspect-[4/3] bg-[#070b14] overflow-hidden">
                    <img
                      src={item.photoUrl}
                      alt={item.nameGu}
                      className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
                        !item.inStock ? "grayscale opacity-50" : ""
                      }`}
                    />
                    <span className="absolute top-2 left-2 bg-black/75 backdrop-blur-md text-amber-300 border border-white/10 text-[9px] font-bold px-2 py-0.5 rounded-md">
                      {APP_CATEGORIES.find((category) => category.id === item.category)?.name ?? "Other"}
                    </span>

                    {!item.inStock && (
                      <span className="absolute bottom-2 left-2 bg-rose-600 text-white text-[9px] font-black px-2 py-0.5 rounded-md shadow">
                        Out of stock
                      </span>
                    )}
                  </div>

                  <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                    <div>
                      <h4 className="font-bold text-white text-xs sm:text-sm line-clamp-1">
                        {item.nameEn?.trim() || item.nameGu}
                      </h4>
                      <p className="text-[10px] text-slate-400 line-clamp-1">
                        {item.nameEn?.trim() ? item.nameGu : ""}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                        <span>Market Rate / ₹</span>
                        <span className="text-amber-400 font-bold text-xs">₹{item.price} / kg</span>
                      </div>

                      <select
                        aria-label={`Unit for ${item.nameEn?.trim() || item.nameGu}`}
                        value={selUnit === "1 kg" ? "1 kg" : CUSTOM_UNIT}
                        onChange={(event) => {
                          if (event.target.value === CUSTOM_UNIT) {
                            setCustomUnitProduct(item);
                            setCustomUnitValue("");
                            return;
                          }
                          setSelectedUnits((current) => ({ ...current, [item.id]: "1 kg" }));
                        }}
                        className="w-full rounded-xl border border-[#34445f] bg-[#0c1322] px-3 py-2 text-xs font-semibold text-slate-100 outline-none transition-all duration-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                      >
                        <option value="1 kg">1 kg</option>
                        <option value={CUSTOM_UNIT}>+ Custom</option>
                      </select>
                      {selUnit !== "1 kg" && (
                        <p className="mt-1 text-xs text-orange-300">Custom quantity: {selUnit}</p>
                      )}
                    </div>

                    <button
                      onClick={() => addToCart(item)}
                      disabled={!item.inStock}
                      className={`w-full mt-1 py-2 px-3 rounded-xl font-bold text-xs transition active:scale-95 ${
                        item.inStock
                          ? "bg-orange-500 hover:bg-orange-600 text-white shadow-md"
                          : "bg-[#0c1322] text-slate-500 cursor-not-allowed border border-[#1f2e4d]"
                      }`}
                    >
                      {item.inStock ? "+ Add to List" : "Out of stock"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-[#263653] bg-[#0c1322] text-slate-300">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <section>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 text-xl">🏪</span>
              <h2 className="text-lg font-black text-white">Jay Vachhraj Store</h2>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">Your neighborhood grocery store for carefully selected, fresh everyday essentials.</p>
            <p className="mt-4 rounded-xl border border-[#263653] bg-[#111c32] px-3 py-2 text-xs font-semibold text-amber-200">Shop Time: {storeSettings.hours}</p>
          </section>

          <section>
            <h3 className="text-sm font-black uppercase tracking-wider text-white">Contact & Address</h3>
            <p className="mt-4 text-sm leading-6 text-slate-400">{storeSettings.address}</p>
            <a href={`tel:+${storeSettings.whatsappNumber.replace(/\D/g, "")}`} className="mt-3 block text-sm font-semibold text-slate-200 transition-all duration-200 hover:text-orange-300">Call: +{storeSettings.whatsappNumber}</a>
            <a href={`https://wa.me/${storeSettings.whatsappNumber.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 transition-all duration-200 hover:text-emerald-200">💬 Chat on WhatsApp</a>
          </section>

          <section>
            <h3 className="text-sm font-black uppercase tracking-wider text-white">Our Quality Promise</h3>
            <ul className="mt-4 space-y-3 text-sm text-slate-400">
              <li className="flex gap-2"><span className="text-emerald-400">✓</span>100% Pure & Cleaned Goods</li>
              <li className="flex gap-2"><span className="text-emerald-400">✓</span>Fair Pricing</li>
              <li className="flex gap-2"><span className="text-emerald-400">✓</span>Quick Village Pickup</li>
              <li className="flex gap-2"><span className="text-emerald-400">✓</span>Digital Payments Accepted</li>
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-black uppercase tracking-wider text-white">Quick Actions</h3>
            <div className="mt-4 grid gap-3">
              <a href={`tel:+${storeSettings.whatsappNumber.replace(/\D/g, "")}`} className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center text-sm font-bold text-emerald-200 transition-all duration-200 hover:bg-emerald-500/20">📞 Direct Call</a>
              <a href={`https://maps.google.com/?q=${encodeURIComponent(storeSettings.address)}`} target="_blank" rel="noreferrer" className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-center text-sm font-bold text-sky-200 transition-all duration-200 hover:bg-sky-500/20">📍 Google Maps</a>
            </div>
          </section>
        </div>
        <div className="border-t border-[#263653] px-4 py-4 text-center text-xs text-slate-500">© {new Date().getFullYear()} Jay Vachhraj General Store. All rights reserved.</div>
      </footer>

      {customUnitProduct && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <form onSubmit={handleCustomUnitSubmit} role="dialog" aria-modal="true" aria-labelledby="custom-unit-title" className="w-full max-w-sm space-y-4 rounded-3xl border border-[#34445f] bg-[#0f172a] p-6 shadow-2xl shadow-black/50">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-orange-300">Custom quantity</p>
              <h2 id="custom-unit-title" className="mt-1 text-lg font-black text-white">{customUnitProduct.nameEn?.trim() || customUnitProduct.nameGu}</h2>
              <p className="mt-1 text-sm text-slate-400">Enter a weight or quantity, such as 2.5 kg or 3 pieces.</p>
            </div>
            <input
              autoFocus
              required
              type="text"
              value={customUnitValue}
              onChange={(event) => setCustomUnitValue(event.target.value)}
              placeholder="e.g. 2.5 kg"
              className="w-full rounded-xl border border-[#34445f] bg-[#0a111f] px-3 py-3 text-sm text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
            />
            <div className="flex gap-3">
              <button type="button" onClick={() => setCustomUnitProduct(null)} className="min-h-11 flex-1 rounded-xl border border-[#34445f] bg-[#152036] px-4 py-2 text-sm font-bold text-slate-300 transition-all duration-200 hover:bg-[#1b2a44]">Cancel</button>
              <button type="submit" className="min-h-11 flex-1 rounded-xl bg-orange-500 px-4 py-2 text-sm font-black text-white transition-all duration-200 hover:bg-orange-400">Use quantity</button>
            </div>
          </form>
        </div>
      )}

      {/* Floating Bottom Cart */}
      {totalCartCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 max-w-xl mx-auto z-30">
          <div className="bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white rounded-2xl p-3 shadow-2xl flex items-center justify-between border border-amber-300/40">
            <div className="flex items-center gap-3 pl-1">
              <div className="w-10 h-10 rounded-xl bg-black/25 flex items-center justify-center text-lg font-bold text-amber-200">
                🛒
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
              <span>Review & Order ➔</span>
            </button>
          </div>
        </div>
      )}

      {/* Cart Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#0f172a] border border-[#1f2e4d] w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-[#1f2e4d] flex items-center justify-between bg-[#152036]">
              <h3 className="font-black text-sm text-white">Order Summary</h3>
              <button
                onClick={() => setCartOpen(false)}
                className="w-8 h-8 rounded-full bg-[#0c1322] text-slate-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1 divide-y divide-[#1f2e4d]">
              {Object.keys(cart).map((k) => {
                const item = cart[k];
                return (
                  <div key={k} className="py-2 flex items-center justify-between gap-2">
                    <div className="flex-1 pr-2">
                      <h5 className="text-xs font-bold text-white">{item.nameGu}</h5>
                      <span className="px-2 py-0.5 bg-[#0c1322] text-amber-400 rounded text-[10px] font-bold border border-[#1f2e4d]">
                        {item.unit}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-[#0c1322] border border-[#1f2e4d] rounded-xl p-0.5">
                        <button
                          onClick={() => updateQty(k, -1)}
                          className="w-6 h-6 rounded-lg bg-[#152036] text-slate-200 flex items-center justify-center font-bold"
                        >
                          -
                        </button>
                        <span className="w-7 text-center font-black text-xs text-white">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQty(k, 1)}
                          className="w-6 h-6 rounded-lg bg-orange-500 text-white flex items-center justify-center font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 bg-[#152036] border-t border-[#1f2e4d] space-y-3">
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
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-xl"
              >
                💬 Send Order on WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}