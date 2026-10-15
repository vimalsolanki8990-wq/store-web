"use client";

import { useState, useEffect } from "react";
import { db, auth, googleProvider } from "../firebase";
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
} from "firebase/firestore";

// ONLY THIS EMAIL HAS ADMIN ACCESS
const AUTHORIZED_ADMIN_EMAIL = "vimalsolanki8990@gmail.com";

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

const APP_CATEGORIES = [
  { id: "all", name: "બધી વસ્તુઓ (All)", icon: "✨" },
  { id: "કઠોળ-અનાજ", name: "અનાજ અને કઠોળ", icon: "🌾" },
  { id: "તેલ-ઘી", name: "તેલ અને ઘી", icon: "🛢️" },
  { id: "મસાલા", name: "મસાલા & તેજાના", icon: "🌶️" },
  { id: "નાસ્તો-ફરસાણ", name: "ફરસાણ & નાસ્તો", icon: "🍪" },
  { id: "પર્સનલ કેર", name: "સાબુ & પર્સનલ કેર", icon: "🧼" },
  { id: "પૂજાપો-અન્ય", name: "પૂજાપો & અન્ય", icon: "🪔" },
];

export default function VisualAdminProtectedPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sliderIndex, setSliderIndex] = useState(0);

  // Modals
  const [isProductModalOpen, setProductModalOpen] = useState(false);
  const [isBannerModalOpen, setBannerModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Product Form
  const [formNameGu, setFormNameGu] = useState("");
  const [formNameEn, setFormNameEn] = useState("");
  const [formCategory, setFormCategory] = useState("કઠોળ-અનાજ");
  const [formUnits, setFormUnits] = useState("500g, 1kg, 2kg, 5kg");
  const [formPrice, setFormPrice] = useState("0");
  const [formPhotoUrl, setFormPhotoUrl] = useState("");
  const [formInStock, setFormInStock] = useState(true);

  // Banner Form
  const [newBanTitle, setNewBanTitle] = useState("");
  const [newBanTag, setNewBanTag] = useState("ઓફર");
  const [newBanDesc, setNewBanDesc] = useState("");
  const [newBanImg, setNewBanImg] = useState("");

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // 1. Check Authentication on Load
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        if (user.email === AUTHORIZED_ADMIN_EMAIL) {
          setCurrentUser(user);
          setAuthError(null);
          loadData();
        } else {
          setCurrentUser(null);
          setAuthError(`તમને પરવાનગી નથી! ફક્ત ${AUTHORIZED_ADMIN_EMAIL} એડમિન બની શકે છે.`);
          signOut(auth);
        }
      } else {
        setCurrentUser(null);
      }
      setAuthChecking(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Google Login Trigger
  const handleGoogleLogin = async () => {
    try {
      setAuthError(null);
      const res = await signInWithPopup(auth, googleProvider);
      if (res.user.email !== AUTHORIZED_ADMIN_EMAIL) {
        setAuthError(`ખોટું એકાઉન્ટ! ફક્ત ${AUTHORIZED_ADMIN_EMAIL} જ એડમિન પેનલ ખોલી શકે.`);
        await signOut(auth);
      }
   } catch (err: any) {
  console.error(err);
  setAuthError(`${err.code || err.message}`);
}
  };

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentUser(null);
  };

  // 3. Load Firebase Data
  const loadData = async () => {
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
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

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
      setFormNameGu(product.nameGu);
      setFormNameEn(product.nameEn || "");
      setFormCategory(product.category);
      setFormUnits(product.units.join(", "));
      setFormPrice(product.price.toString());
      setFormPhotoUrl(product.photoUrl);
      setFormInStock(product.inStock);
    } else {
      setEditingProduct(null);
      setFormNameGu("");
      setFormNameEn("");
      setFormCategory("કઠોળ-અનાજ");
      setFormUnits("500g, 1kg, 2kg, 5kg");
      setFormPrice("0");
      setFormPhotoUrl("");
      setFormInStock(true);
    }
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNameGu.trim()) {
      showToast("નામ લખવું જરૂરી છે!");
      return;
    }
    const unitsArr = formUnits.split(",").map((u) => u.trim()).filter(Boolean);
    const targetId = editingProduct ? editingProduct.id : "p_" + Date.now();
    const finalPhoto = formPhotoUrl.trim() || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60";
    const priceNum = parseFloat(formPrice) || 0;

    const payload = {
      id: targetId,
      nameGu: formNameGu,
      name_gu: formNameGu,
      nameEn: formNameEn,
      name_en: formNameEn,
      category: formCategory,
      units: unitsArr.length > 0 ? unitsArr : ["1 નંગ"],
      price: priceNum,
      inStock: formInStock,
      in_stock: formInStock,
      photoUrl: finalPhoto,
      photo_url: finalPhoto,
    };

    try {
      await setDoc(doc(db, "products", targetId), payload, { merge: true });
      showToast(`'${formNameGu}' સેવ થઈ ગયું!`);
      setProductModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      showToast("સેવ કરવામાં ભૂલ આવી!");
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!confirm(`શું '${name}' કાઢી નાખવું છે?`)) return;
    try {
      await deleteDoc(doc(db, "products", id));
      setProducts((prev) => prev.filter((p) => p.id !== id));
      showToast("કાઢી નાખ્યું!");
    } catch (err) {
      console.error(err);
      showToast("ભૂલ આવી!");
    }
  };

  const handleToggleStock = async (p: Product) => {
    const newStatus = !p.inStock;
    try {
      await setDoc(
        doc(db, "products", p.id),
        { inStock: newStatus, in_stock: newStatus },
        { merge: true }
      );
      setProducts((prev) =>
        prev.map((item) => (item.id === p.id ? { ...item, inStock: newStatus } : item))
      );
      showToast(newStatus ? "સ્ટોક હાજર કર્યો!" : "સ્ટોક પૂર્ણ કર્યો!");
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddBanner = async () => {
    if (!newBanTitle.trim()) return;
    const newB: Banner = {
      id: "b_" + Date.now(),
      title: newBanTitle,
      tag: newBanTag || "ઓફર",
      desc: newBanDesc,
      imgUrl: newBanImg || "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=1000&auto=format&fit=crop&q=80",
      active: true,
    };
    try {
      await setDoc(doc(db, "banners", newB.id), newB);
      setBanners((prev) => [newB, ...prev]);
      setNewBanTitle("");
      setNewBanDesc("");
      setNewBanImg("");
      showToast("નવું બેનર ઉમેરાયું!");
    } catch (err) {
      console.error(err);
    }
  };

  // If checking auth status
  if (authChecking) {
    return (
      <div className="bg-[#070b14] min-h-screen flex items-center justify-center text-slate-300">
        સુરક્ષા ચકાસણી થઈ રહી છે...
      </div>
    );
  }

  // If NOT Logged In, Show Lock Screen
  if (!currentUser) {
    return (
      <div className="bg-[#070b14] min-h-screen flex items-center justify-center p-4">
        <div className="bg-[#0f172a] border border-[#1f2e4d] max-w-sm w-full rounded-3xl p-6 text-center shadow-2xl">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-orange-500/10 text-orange-400 flex items-center justify-center text-3xl mb-4 border border-orange-500/20">
            🔒
          </div>
          <h2 className="text-lg font-black text-white">વેપારી એડમિન લૉગિન</h2>
          <p className="text-xs text-slate-400 mt-1 mb-6">
            જય વછરાજ જનરલ સ્ટોર - માત્ર અધિકૃત સંચાલક માટે
          </p>

          {authError && (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-semibold mb-4 text-left">
              ⚠️ {authError}
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            className="w-full py-3 px-4 bg-white hover:bg-slate-100 text-slate-900 rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
          >
            <span>Google વડે લૉગિન કરો</span>
          </button>
          <p className="text-[10px] text-slate-500 mt-4">
            ફક્ત <strong>{AUTHORIZED_ADMIN_EMAIL}</strong> ને પ્રવેશ મળશે.
          </p>
        </div>
      </div>
    );
  }

  // Filter
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
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-16 right-4 z-50 bg-[#0f172a] text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs border border-orange-500">
          <span className="text-emerald-400 font-bold">✔</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Notice */}
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

      {/* Main Header */}
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

      {/* Admin Visual Action Bar with Logged In User & Logout */}
      <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white px-4 py-2 text-xs font-bold shadow-lg border-b border-amber-300/40 z-30">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-pulse" />
            <span>🔐 એડમિન સક્રિય: {currentUser.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openModal()}
              className="px-3 py-1 bg-white text-slate-900 rounded-lg text-xs font-bold hover:bg-amber-100 transition shadow"
            >
              + નવી આઇટમ
            </button>
            <button
              onClick={() => setBannerModalOpen(true)}
              className="px-3 py-1 bg-slate-900/70 text-amber-200 rounded-lg text-xs hover:bg-slate-900 transition"
            >
              🖼️ સ્લાઇડર મેનેજર
            </button>
            <button
              onClick={handleLogout}
              className="px-3 py-1 bg-rose-900/80 text-rose-100 rounded-lg text-xs hover:bg-rose-900 transition"
            >
              લૉગઆઉટ
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-4 w-full flex-1">
        {/* Carousel / Slider */}
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

        {/* Product Grid */}
        {loading ? (
          <div className="text-center py-20 text-slate-400">સામાન લોડ થાય છે...</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {filteredProducts.map((item) => (
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

                  {/* Merchant Action Buttons */}
                  <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                    <button
                      onClick={() => openModal(item)}
                      className="w-7 h-7 rounded-lg bg-amber-500 text-slate-900 flex items-center justify-center text-xs shadow hover:bg-amber-400 font-bold"
                      title="સુધારો"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(item.id, item.nameGu)}
                      className="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center text-xs shadow hover:bg-rose-700 font-bold"
                      title="કાઢી નાખો"
                    >
                      🗑️
                    </button>
                  </div>
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
                      <span>પેકિંગ:</span>
                      <span className="text-amber-400 font-bold text-xs">₹{item.price}</span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {item.units?.map((u, i) => (
                        <span
                          key={i}
                          className="text-[10px] px-2 py-0.5 rounded-lg border border-[#1f2e4d] bg-[#0c1322] text-slate-300"
                        >
                          {u}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleStock(item)}
                    className={`w-full mt-1 py-1.5 px-3 rounded-xl font-bold text-xs transition ${
                      item.inStock
                        ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40"
                        : "bg-rose-600/20 text-rose-300 border border-rose-500/40"
                    }`}
                  >
                    {item.inStock ? "✔ સ્ટોકમાં હાજર" : "✕ સ્ટોક ખલાસ"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-[#1f2e4d] w-full max-w-md rounded-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-[#1f2e4d] flex items-center justify-between bg-[#152036]">
              <h3 className="font-black text-sm text-white">
                {editingProduct ? "આઇટમમાં સુધારો કરો" : "નવી આઇટમ ઉમેરો"}
              </h3>
              <button
                onClick={() => setProductModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#0c1322] text-slate-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">ગુજરાતી નામ *</label>
                <input
                  type="text"
                  required
                  value={formNameGu}
                  onChange={(e) => setFormNameGu(e.target.value)}
                  placeholder="દા.ત. પ્રીમિયમ દેશી તુવેર દાળ"
                  className="w-full p-2 bg-[#0c1322] border border-[#1f2e4d] rounded-xl text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">અંગ્રેજી નામ</label>
                <input
                  type="text"
                  value={formNameEn}
                  onChange={(e) => setFormNameEn(e.target.value)}
                  placeholder="દા.ત. Desi Toor Dal"
                  className="w-full p-2 bg-[#0c1322] border border-[#1f2e4d] rounded-xl text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">કેટેગરી *</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full p-2 bg-[#0c1322] border border-[#1f2e4d] rounded-xl text-white focus:outline-none"
                >
                  <option value="કઠોળ-અનાજ">🌾 અનાજ અને કઠોળ</option>
                  <option value="તેલ-ઘી">🛢️ તેલ અને ઘી</option>
                  <option value="મસાલા">🌶️ મસાલા & તેજાના</option>
                  <option value="નાસ્તો-ફરસાણ">🍪 ફરસાણ & નાસ્તો</option>
                  <option value="પર્સનલ કેર">🧼 સાબુ & પર્સનલ કેર</option>
                  <option value="પૂજાપો-અન્ય">🪔 પૂજાપો & અન્ય</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  વજન / પેકિંગ (અલ્પવિરામ વડે અલગ કરો) *
                </label>
                <input
                  type="text"
                  value={formUnits}
                  onChange={(e) => setFormUnits(e.target.value)}
                  placeholder="500g, 1kg, 2kg, 5kg"
                  className="w-full p-2 bg-[#0c1322] border border-[#1f2e4d] rounded-xl text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">ભાવ / કિંમત (₹)</label>
                <input
                  type="number"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  placeholder="0"
                  className="w-full p-2 bg-[#0c1322] border border-[#1f2e4d] rounded-xl text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">ફોટો વેબ લિંક (Photo URL)</label>
                <input
                  type="url"
                  value={formPhotoUrl}
                  onChange={(e) => setFormPhotoUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full p-2 bg-[#0c1322] border border-[#1f2e4d] rounded-xl text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 bg-[#0c1322] border border-[#1f2e4d] rounded-xl">
                <span className="font-bold text-slate-300">સ્ટોકમાં હાજર છે? (In Stock)</span>
                <input
                  type="checkbox"
                  checked={formInStock}
                  onChange={(e) => setFormInStock(e.target.checked)}
                  className="w-4 h-4 accent-orange-500 rounded"
                />
              </div>

              <div className="p-3 bg-[#152036] border-t border-[#1f2e4d] flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="flex-1 py-2 bg-[#0c1322] text-slate-300 rounded-xl font-bold"
                >
                  રદ કરો
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold shadow"
                >
                  સાચવો (Save)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slider Modal */}
      {isBannerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-[#1f2e4d] w-full max-w-lg rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-[#1f2e4d] flex items-center justify-between bg-[#152036]">
              <h3 className="font-black text-sm text-white">🖼️ સ્લાઇડર / બેનર મેનેજર</h3>
              <button
                onClick={() => setBannerModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#0c1322] text-slate-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
              <div className="p-3 bg-[#0c1322] rounded-2xl border border-[#1f2e4d] space-y-2.5">
                <h4 className="font-bold text-amber-400">નવું બેનર ઉમેરો</h4>
                <input
                  type="text"
                  value={newBanTitle}
                  onChange={(e) => setNewBanTitle(e.target.value)}
                  placeholder="બેનર શીર્ષક (દા.ત. શુદ્ધ સીંગતેલ ઓફર)"
                  className="w-full p-2 bg-[#152036] border border-[#1f2e4d] rounded-xl text-white"
                />
                <input
                  type="text"
                  value={newBanTag}
                  onChange={(e) => setNewBanTag(e.target.value)}
                  placeholder="બેજ ટેગ (દા.ત. ખાસ ઓફર)"
                  className="w-full p-2 bg-[#152036] border border-[#1f2e4d] rounded-xl text-white"
                />
                <input
                  type="text"
                  value={newBanDesc}
                  onChange={(e) => setNewBanDesc(e.target.value)}
                  placeholder="નાની વિગત (દા.ત. ૧૫ કિલો ડબ્બા પર આકર્ષક ભાવ)"
                  className="w-full p-2 bg-[#152036] border border-[#1f2e4d] rounded-xl text-white"
                />
                <input
                  type="url"
                  value={newBanImg}
                  onChange={(e) => setNewBanImg(e.target.value)}
                  placeholder="ફોટો વેબ URL"
                  className="w-full p-2 bg-[#152036] border border-[#1f2e4d] rounded-xl text-white"
                />
                <button
                  type="button"
                  onClick={handleAddBanner}
                  className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl shadow"
                >
                  + બેનર સેવ કરો
                </button>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-300">હાલના બેનર્સ:</h4>
                {banners.map((b) => (
                  <div
                    key={b.id}
                    className="p-2.5 bg-[#152036] border border-[#1f2e4d] rounded-xl flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 flex-1 overflow-hidden">
                      <img
                        src={b.imgUrl}
                        alt=""
                        className="w-12 h-9 object-cover rounded-lg border border-[#1f2e4d]"
                      />
                      <div className="truncate">
                        <h5 className="font-bold text-white truncate">{b.title}</h5>
                        <span className="text-[10px] text-amber-400">{b.tag}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setBanners((prev) => prev.filter((x) => x.id !== b.id))}
                      className="text-rose-400 p-1 font-bold"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}