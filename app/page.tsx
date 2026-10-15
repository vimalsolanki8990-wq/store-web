"use client";

import { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";

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

const APP_CATEGORIES = [
  { id: "all", name: "બધી વસ્તુઓ (All)", icon: "✨" },
  { id: "કઠોળ-અનાજ", name: "અનાજ અને કઠોળ", icon: "🌾" },
  { id: "તેલ-ઘી", name: "તેલ અને ઘી", icon: "🛢️" },
  { id: "મસાલા", name: "મસાલા & તેજાના", icon: "🌶️" },
  { id: "નાસ્તો-ફરસાણ", name: "ફરસાણ & નાસ્તો", icon: "🍪" },
  { id: "પર્સનલ કેર", name: "સાબુ & પર્સનલ કેર", icon: "🧼" },
  { id: "પૂજાપો-અન્ય", name: "પૂજાપો & અન્ય", icon: "🪔" },
];

export default function CustomerStorePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sliderIndex, setSliderIndex] = useState(0);

  // Cart
  const [cart, setCart] = useState<{ [key: string]: CartItem }>({});
  const [selectedUnits, setSelectedUnits] = useState<{ [prodId: string]: string }>({});
  const [isCartOpen, setCartOpen] = useState(false);

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

        const banSnap = await getDocs(collection(db, "banners"));
        if (!banSnap.empty) {
          const bList = banSnap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as Banner[];
          setBanners(bList);
        } else {
          setBanners([
            {
              id: "b_1",
              title: "નવા ઘાણીના સીંગતેલના ડબ્બા ઉપલબ્ધ",
              tag: "ખાસ સીઝનલ ઓફર",
              desc: "૧૫ કિલો તાજા ડબ્બા પર આકર્ષક ભાવ. આજે જ ઓર્ડર કરો.",
              imgUrl: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=1000&auto=format&fit=crop&q=80",
              active: true,
            },
          ]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadStore();
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
    if (!product.inStock) return;
    const unit = selectedUnits[product.id] || product.units[0] || "1 નંગ";
    const key = `${product.id}__${unit}`;

    setCart((prev) => {
      const existing = prev[key];
      return {
        ...prev,
        [key]: {
          id: product.id,
          nameGu: product.nameGu,
          unit,
          price: product.price || 0,
          quantity: existing ? existing.quantity + 1 : 1,
        },
      };
    });

    showToast(`'${product.nameGu} (${unit})' લિસ્ટમાં ઉમેરાઈ!`);
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
      alert("ઓર્ડર માટે ઓછામાં ઓછી ૧ વસ્તુ પસંદ કરો!");
      return;
    }
    if (!custName.trim()) {
      alert("કૃપા કરીને તમારું નામ દાખલ કરો!");
      return;
    }
    const cleanPhone = custPhone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      alert("કૃપા કરીને સાચો ૧૦ આંકડાનો મોબાઈલ નંબર દાખલ કરો!");
      return;
    }

    let msg = `🛍️ *નવો ઓર્ડર - જય વછરાજ જનરલ સ્ટોર*\n`;
    msg += `📍 *ઝાંઝમેર (ધોરાજી)*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `👤 *ગ્રાહક:* ${custName.trim()}\n`;
    msg += `📞 *મોબાઈલ:* ${cleanPhone}\n`;
    if (custAddress.trim()) msg += `🏡 *વિસ્તાર:* ${custAddress.trim()}\n`;
    msg += `📅 *તારીખ:* ${new Date().toLocaleDateString("gu-IN")}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📋 *સામાનની યાદી:*\n`;

    let idx = 1;
    keys.forEach((k) => {
      const item = cart[k];
      msg += `${idx}. *${item.nameGu}*\n`;
      msg += `   ➥ વજન: ${item.unit} | જથ્થો: *${item.quantity}*`;
      if (item.price > 0) msg += ` (₹${item.price})`;
      msg += `\n`;
      idx++;
    });

    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🙏 _કૃપા કરીને ઓર્ડર કન્ફર્મ કરી કુલ બિલ જણાવશો._`;

    const encoded = encodeURIComponent(msg);
    window.open(`https://wa.me/919876543210?text=${encoded}`, "_blank");
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
      <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white py-2 px-3 text-xs font-semibold shadow-md relative z-40">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-amber-200">📢</span>
            <span className="truncate font-medium">
              ખાસ નોંધ: દિવાળી તથા શિયાળુ તાજા મસાલા અને શુદ્ધ સીંગતેલના નવા ડબ્બા આવી ગયા છે!
            </span>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0f172a]/95 backdrop-blur-md border-b border-[#1f2e4d]">
        <div className="max-w-6xl mx-auto px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white text-xl shadow-lg">
                🏪
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-black text-white">
                  જય વછરાજ જનરલ સ્ટોર
                </h1>
                <p className="text-xs text-amber-400 font-bold">
                  ઝાંઝમેર • શુદ્ધ અને તાજું કરિયાણું
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a
                href="tel:+919876543210"
                className="px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-700/50 text-emerald-300 text-xs font-bold"
              >
                📞 ફોન
              </a>
              <a
                href="https://maps.google.com/?q=Zanzmer,Dhoraji,Gujarat"
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-xl bg-sky-950/40 border border-sky-700/50 text-sky-300 text-xs font-bold"
              >
                📍 નકશો
              </a>
            </div>
          </div>

          <div className="mt-2.5 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="શોધો... તુવેર દાળ, સીંગતેલ, જીરું..."
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
              <span>📂</span> કેટેગરી પસંદ કરો:
            </span>
            <span className="text-[11px] text-slate-400">
              {filteredProducts.length} આઇટમ ઉપલબ્ધ
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
          <div className="text-center py-20 text-slate-400">સામાન લોડ થાય છે...</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {filteredProducts.map((item) => {
              const selUnit = selectedUnits[item.id] || item.units[0] || "1 નંગ";
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
                      {item.category}
                    </span>

                    {!item.inStock && (
                      <span className="absolute bottom-2 left-2 bg-rose-600 text-white text-[9px] font-black px-2 py-0.5 rounded-md shadow">
                        સ્ટોક પૂર્ણ
                      </span>
                    )}
                  </div>

                  <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                    <div>
                      <h4 className="font-bold text-white text-xs sm:text-sm line-clamp-1">
                        {item.nameGu}
                      </h4>
                      <p className="text-[10px] text-slate-400 line-clamp-1">
                        {item.nameEn || ""}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                        <span>વજન પસંદ કરો:</span>
                        <span className="text-amber-400 font-bold text-xs">₹{item.price}</span>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {item.units?.map((u, i) => {
                          const isSel = selUnit === u;
                          return (
                            <button
                              key={i}
                              onClick={() => setSelectedUnits((prev) => ({ ...prev, [item.id]: u }))}
                              className={`text-[10px] px-2 py-0.5 rounded-lg border font-bold transition ${
                                isSel
                                  ? "bg-orange-500 text-white border-orange-500"
                                  : "border-[#1f2e4d] bg-[#0c1322] text-slate-300"
                              }`}
                            >
                              {u}
                            </button>
                          );
                        })}
                      </div>
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
                      {item.inStock ? "+ યાદીમાં ઉમેરો" : "સ્ટોક નથી"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Bottom Cart */}
      {totalCartCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 max-w-xl mx-auto z-30">
          <div className="bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white rounded-2xl p-3 shadow-2xl flex items-center justify-between border border-amber-300/40">
            <div className="flex items-center gap-3 pl-1">
              <div className="w-10 h-10 rounded-xl bg-black/25 flex items-center justify-center text-lg font-bold text-amber-200">
                🛒
              </div>
              <div>
                <div className="text-[11px] font-semibold text-amber-100">ઓર્ડર યાદી</div>
                <div className="text-sm font-black flex items-center gap-2">
                  <span className="px-2 py-0.2 bg-white text-slate-900 rounded-full text-xs font-black">
                    {totalCartCount}
                  </span>
                  <span>વસ્તુ પસંદ થઈ</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setCartOpen(true)}
              className="px-4 py-2 bg-slate-950 text-amber-300 hover:text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-lg transition"
            >
              <span>યાદી જુઓ & ઓર્ડર ➔</span>
            </button>
          </div>
        </div>
      )}

      {/* Cart Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#0f172a] border border-[#1f2e4d] w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-[#1f2e4d] flex items-center justify-between bg-[#152036]">
              <h3 className="font-black text-sm text-white">ઓર્ડર રસીદ & લિસ્ટ</h3>
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
                placeholder="તમારું નામ (Customer Name) *"
                className="w-full px-3 py-2 bg-[#0c1322] border border-[#1f2e4d] rounded-xl text-xs text-white focus:outline-none"
              />
              <input
                type="tel"
                maxLength={10}
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
                placeholder="૧૦ આંકડાનો મોબાઈલ નંબર *"
                className="w-full px-3 py-2 bg-[#0c1322] border border-[#1f2e4d] rounded-xl text-xs text-white focus:outline-none"
              />
              <input
                type="text"
                value={custAddress}
                onChange={(e) => setCustAddress(e.target.value)}
                placeholder="ગામ / વિસ્તાર"
                className="w-full px-3 py-2 bg-[#0c1322] border border-[#1f2e4d] rounded-xl text-xs text-white focus:outline-none"
              />

              <button
                onClick={handleSendWhatsAppOrder}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-xl"
              >
                💬 WhatsApp પર ઓર્ડર મોકલો
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}