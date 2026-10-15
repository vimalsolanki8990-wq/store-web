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
  onSnapshot,
  writeBatch,
} from "firebase/firestore";

// Admin authorization remains enforced here; only the login prompt is generic.
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

export default function VisualAdminProtectedPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [settingsForm, setSettingsForm] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sliderIndex, setSliderIndex] = useState(0);

  // Modals
  const [isProductModalOpen, setProductModalOpen] = useState(false);
  const [isBannerModalOpen, setBannerModalOpen] = useState(false);
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
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
  const [newBanActive, setNewBanActive] = useState(true);
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);
  const [isSavingBanner, setIsSavingBanner] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

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
          setAuthError("This Google account is not authorized to access the admin panel.");
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
        setAuthError("This Google account is not authorized to access the admin panel.");
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

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) {
      setBanners([]);
      return;
    }

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
        showToast("સ્લાઇડર લોડ કરવામાં ભૂલ આવી!");
      },
    );
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setStoreSettings(DEFAULT_STORE_SETTINGS);
      setSettingsForm(DEFAULT_STORE_SETTINGS);
      return;
    }

    return onSnapshot(
      doc(db, "storeSettings", "main"),
      (snapshot) => {
        const data = snapshot.data() ?? {};
        const nextSettings: StoreSettings = {
          noticeEnabled: data.noticeEnabled !== false,
          noticeText: String(data.noticeText ?? DEFAULT_STORE_SETTINGS.noticeText),
          whatsappNumber: String(data.whatsappNumber ?? DEFAULT_STORE_SETTINGS.whatsappNumber),
          address: String(data.address ?? DEFAULT_STORE_SETTINGS.address),
          hours: String(data.hours ?? DEFAULT_STORE_SETTINGS.hours),
        };
        setStoreSettings(nextSettings);
        setSettingsForm(nextSettings);
      },
      (error) => {
        console.error("Failed to listen for store settings:", error);
        showToast("Unable to load store settings.");
      },
    );
  }, [currentUser]);

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

  const resetBannerForm = () => {
    setEditingBannerId(null);
    setNewBanTitle("");
    setNewBanTag("ઓફર");
    setNewBanDesc("");
    setNewBanImg("");
    setNewBanActive(true);
  };

  const handleSaveBanner = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSavingBanner) return;
    if (!newBanTitle.trim()) {
      showToast("બેનરનું શીર્ષક લખવું જરૂરી છે!");
      return;
    }

    const wasEditing = editingBannerId !== null;
    const bannerId = editingBannerId ?? `b_${Date.now()}`;
    const banner: Banner = {
      id: bannerId,
      title: newBanTitle.trim(),
      tag: newBanTag.trim() || "ઓફર",
      desc: newBanDesc.trim(),
      imgUrl: newBanImg.trim() || "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=1000&auto=format&fit=crop&q=80",
      active: newBanActive,
    };

    try {
      setIsSavingBanner(true);
      await setDoc(doc(db, "banners", bannerId), banner);
      setBanners((current) => [banner, ...current.filter((item) => item.id !== bannerId)]);
      resetBannerForm();
      showToast(wasEditing ? "બેનરમાં ફેરફાર સેવ થયો!" : "નવું બેનર ઉમેરાયું!");
    } catch (err) {
      console.error(err);
      showToast("બેનર સેવ કરવામાં ભૂલ આવી!");
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
      showToast(!banner.active ? "બેનર સક્રિય કર્યું!" : "બેનર છુપાવ્યું!");
    } catch (err) {
      console.error(err);
      showToast("બેનરની સ્થિતિ અપડેટ કરવામાં ભૂલ આવી!");
    }
  };

  const handleDeleteBanner = async (banner: Banner) => {
    if (!confirm(`શું '${banner.title}' બેનર કાઢી નાખવું છે?`)) return;
    try {
      await deleteDoc(doc(db, "banners", banner.id));
      if (editingBannerId === banner.id) resetBannerForm();
      showToast("બેનર કાઢી નાખ્યું!");
    } catch (err) {
      console.error(err);
      showToast("બેનર કાઢવામાં ભૂલ આવી!");
    }
  };

  const handleSaveSettings = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSavingSettings) return;
    setIsSavingSettings(true);
    try {
      await setDoc(doc(db, "storeSettings", "main"), settingsForm);
      setStoreSettings(settingsForm);
      showToast("Store settings saved.");
    } catch (err) {
      console.error(err);
      showToast("Unable to save store settings.");
    } finally {
      setIsSavingSettings(false);
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

  // If checking auth status
  if (authChecking) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b14] px-4 text-slate-200">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(249,115,22,0.12),_transparent_55%)]" />
        <div className="relative flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-[#263653] bg-[#0f172a]/90 p-8 text-center shadow-2xl shadow-black/30">
          <span className="h-10 w-10 animate-spin rounded-full border-2 border-orange-400/30 border-t-orange-400" />
          <p className="text-sm font-semibold">સુરક્ષા ચકાસણી થઈ રહી છે...</p>
        </div>
      </div>
    );
  }

  // If NOT Logged In, Show Lock Screen
  if (!currentUser) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b14] px-4 py-10 text-slate-100 sm:px-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(249,115,22,0.16),_transparent_55%)]" />
        <section className="relative w-full max-w-md rounded-3xl border border-[#263653] bg-gradient-to-b from-[#111c32] to-[#0c1322] p-6 text-center shadow-2xl shadow-black/40 sm:p-9">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-400/25 bg-orange-500/10 text-3xl text-orange-300 shadow-lg shadow-orange-950/20 sm:h-[4.5rem] sm:w-[4.5rem]">
            🔒
          </div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-orange-300">JAY VACHHRAJ GENERAL STORE</p>
          <h1 className="text-xl font-black text-white sm:text-2xl">Admin Sign In</h1>
          <p className="mb-6 mt-2 text-sm leading-6 text-slate-400">
            Sign in with your Google account to manage your store.
          </p>

          {authError && (
            <div role="alert" className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-left text-xs font-semibold leading-5 text-rose-200">
              ⚠️ {authError}
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            className="flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border border-white/80 bg-white px-4 py-3 text-sm font-black text-slate-900 shadow-lg shadow-black/20 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-400/40 active:scale-[0.99]"
          >
            <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-blue-600">G</span>
            Continue with Google
          </button>
          <p className="mt-5 text-xs leading-5 text-slate-500">
            Admin access is limited to approved accounts.
          </p>
        </section>
      </main>
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
    <div className="min-h-screen min-w-0 bg-[#070b14] font-sans text-slate-100 antialiased">
      {/* Toast */}
      {toastMsg && (
        <div role="status" className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-orange-500/60 bg-[#0f172a] px-4 py-3 text-xs text-white shadow-2xl sm:inset-x-auto sm:right-4 sm:top-16">
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
      <header className="sticky top-0 z-30 border-b border-[#263653] bg-[#0f172a]/95 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 text-xl text-white shadow-lg">
                🏪
              </div>
              <div>
                <h1 className="text-sm font-black text-white sm:text-lg">
                  જય વછરાજ જનરલ સ્ટોર
                </h1>
                <p className="text-xs text-amber-400 font-bold">
                  ઝાંઝમેર • શુદ્ધ અને તાજું કરિયાણું
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <a
                href="tel:+919876543210"
                className="rounded-xl border border-emerald-700/50 bg-emerald-950/40 px-2.5 py-2 text-[11px] font-bold text-emerald-300 transition hover:bg-emerald-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:px-3 sm:text-xs"
              >
                📞 ફોન
              </a>
              <a
                href="https://maps.google.com/?q=Zanzmer,Dhoraji,Gujarat"
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-sky-700/50 bg-sky-950/40 px-2.5 py-2 text-[11px] font-bold text-sky-300 transition hover:bg-sky-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 sm:px-3 sm:text-xs"
              >
                📍 નકશો
              </a>
            </div>
          </div>

          <div className="relative mt-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="શોધો... તુવેર દાળ, સીંગતેલ, જીરું..."
              className="w-full rounded-xl border border-[#263653] bg-[#0c1322] py-2.5 pl-9 pr-8 text-sm text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
              🔍
            </span>
          </div>
        </div>
      </header>

      {/* Admin Visual Action Bar with Logged In User & Logout */}
      <section aria-label="એડમિન નિયંત્રણો" className="border-b border-orange-300/20 bg-gradient-to-r from-amber-700 via-orange-700 to-orange-600 px-4 py-3 text-white shadow-lg sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2 text-xs font-bold sm:text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-pulse" />
            <span className="truncate">🔐 એડમિન સક્રિય: {currentUser.email}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            <button
              onClick={() => openModal()}
              className="min-h-10 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-900 shadow transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              + નવી આઇટમ
            </button>
            <button
              onClick={() => setBannerModalOpen(true)}
              className="min-h-10 rounded-xl border border-white/15 bg-slate-950/40 px-3 py-2 text-xs font-bold text-amber-100 transition hover:bg-slate-950/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              🖼️ સ્લાઇડર મેનેજર
            </button>
            <button
              onClick={() => {
                setSettingsForm(storeSettings);
                setSettingsModalOpen(true);
              }}
              className="min-h-10 rounded-xl border border-white/15 bg-slate-950/40 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-950/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              ⚙️ Store Settings
            </button>
            <button
              onClick={handleLogout}
              className="min-h-10 rounded-xl border border-rose-200/15 bg-rose-950/60 px-3 py-2 text-xs font-bold text-rose-100 transition hover:bg-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              લૉગઆઉટ
            </button>
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-7">
        <section className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-[#1f2e4d] pb-4">
          <div>
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-orange-300">સ્ટોર મેનેજમેન્ટ</p>
            <h2 className="text-xl font-black text-white sm:text-2xl">દુકાનના સામાનનું સંચાલન</h2>
          </div>
          <p className="rounded-full border border-[#263653] bg-[#111c32] px-3 py-1.5 text-xs font-semibold text-slate-300">
            કુલ {products.length} વસ્તુઓ
          </p>
        </section>
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
        <section aria-label="કેટેગરી ફિલ્ટર" className="mb-5 rounded-2xl border border-[#1f2e4d] bg-[#0c1322]/70 p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <span>📂</span> કેટેગરી પસંદ કરો:
            </span>
            <span className="text-[11px] text-slate-400">
              {filteredProducts.length} આઇટમ ઉપલબ્ધ
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {APP_CATEGORIES.map((cat) => {
              const isSel = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl whitespace-nowrap font-bold transition-all flex items-center gap-1.5 ${
                    isSel
                      ? "bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-lg"
                      : "border border-[#263653] bg-[#152036] text-slate-300 hover:border-orange-400 hover:bg-[#1b2a44]"
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Product Grid */}
        {loading ? (
          <div role="status" className="flex min-h-48 flex-col items-center justify-center gap-4 rounded-2xl border border-[#1f2e4d] bg-[#0c1322]/70 py-12 text-sm text-slate-400">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-orange-400/30 border-t-orange-400" />
            સામાન લોડ થાય છે...
          </div>
        ) : (
          filteredProducts.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {filteredProducts.map((item) => (
              <div
                key={item.id}
                className="group relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-[#263653] bg-gradient-to-b from-[#152036] to-[#101a2d] shadow-lg shadow-black/10 transition duration-200 hover:-translate-y-0.5 hover:border-orange-400/70 hover:shadow-orange-950/20"
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
                      aria-label={`${item.nameGu} સુધારો`}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 bg-amber-400 text-sm font-bold text-slate-950 shadow-lg transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      title="સુધારો"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(item.id, item.nameGu)}
                      aria-label={`${item.nameGu} કાઢી નાખો`}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-rose-600 text-sm font-bold text-white shadow-lg transition hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      title="કાઢી નાખો"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                  <div>
                    <h4 className="line-clamp-1 text-sm font-bold text-white sm:text-base">
                      {item.nameGu}
                    </h4>
                    <p className="line-clamp-1 text-xs text-slate-400">
                      {item.nameEn || ""}
                    </p>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                      <span>પેકિંગ:</span>
                      <span className="text-amber-400 font-bold text-xs">₹{item.price}</span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {item.units?.map((u, i) => (
                        <span
                          key={i}
                          className="rounded-lg border border-[#263653] bg-[#0c1322] px-2 py-1 text-[11px] text-slate-300"
                        >
                          {u}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleStock(item)}
                    className={`mt-1 min-h-10 w-full rounded-xl border px-3 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 ${
                      item.inStock
                        ? "border-emerald-500/40 bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600/25"
                        : "border-rose-500/40 bg-rose-600/15 text-rose-300 hover:bg-rose-600/25"
                    }`}
                  >
                    {item.inStock ? "✔ સ્ટોકમાં હાજર" : "✕ સ્ટોક ખલાસ"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#34445f] bg-[#0c1322]/70 px-5 py-12 text-center">
              <p className="text-3xl" aria-hidden="true">🧺</p>
              <h3 className="mt-3 text-base font-bold text-white">કોઈ વસ્તુ મળી નથી</h3>
              <p className="mt-1 text-sm text-slate-400">શોધ અથવા કેટેગરી બદલીને ફરી પ્રયાસ કરો.</p>
            </div>
          )
        )}
      </main>

      {/* Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <div role="dialog" aria-modal="true" aria-labelledby="product-modal-title" className="my-auto flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-[#34445f] bg-[#0f172a] shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-[#263653] bg-[#152036] px-4 py-4 sm:px-6">
              <div>
                <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-orange-300">પ્રોડક્ટ વિગતો</p>
                <h3 id="product-modal-title" className="text-base font-black text-white sm:text-lg">
                {editingProduct ? "આઇટમમાં સુધારો કરો" : "નવી આઇટમ ઉમેરો"}
                </h3>
              </div>
              <button
                onClick={() => setProductModalOpen(false)}
                aria-label="વિન્ડો બંધ કરો"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#34445f] bg-[#0c1322] text-slate-400 transition hover:border-slate-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="flex-1 space-y-4 overflow-y-auto p-4 text-sm sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-bold text-slate-300">ગુજરાતી નામ *</label>
                <input
                  type="text"
                  required
                  value={formNameGu}
                  onChange={(e) => setFormNameGu(e.target.value)}
                  placeholder="દા.ત. પ્રીમિયમ દેશી તુવેર દાળ"
                  className="w-full rounded-xl border border-[#34445f] bg-[#0a111f] px-3 py-3 text-sm text-white placeholder:text-slate-600 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">અંગ્રેજી નામ</label>
                <input
                  type="text"
                  value={formNameEn}
                  onChange={(e) => setFormNameEn(e.target.value)}
                  placeholder="દા.ત. Desi Toor Dal"
                  className="w-full rounded-xl border border-[#34445f] bg-[#0a111f] px-3 py-3 text-sm text-white placeholder:text-slate-600 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">કેટેગરી *</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full rounded-xl border border-[#34445f] bg-[#0a111f] px-3 py-3 text-sm text-white focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
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
                <label className="mb-1.5 block text-xs font-bold text-slate-300">
                  વજન / પેકિંગ (અલ્પવિરામ વડે અલગ કરો) *
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
                <label className="mb-1.5 block text-xs font-bold text-slate-300">ભાવ / કિંમત (₹)</label>
                <input
                  type="number"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-[#34445f] bg-[#0a111f] px-3 py-3 text-sm text-white placeholder:text-slate-600 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-300">ફોટો વેબ લિંક (Photo URL)</label>
                <input
                  type="url"
                  value={formPhotoUrl}
                  onChange={(e) => setFormPhotoUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full rounded-xl border border-[#34445f] bg-[#0a111f] px-3 py-3 text-sm text-white placeholder:text-slate-600 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-[#34445f] bg-[#0a111f] p-3 sm:col-span-2">
                <span className="text-xs font-bold text-slate-300">સ્ટોકમાં હાજર છે? (In Stock)</span>
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
                  રદ કરો
                </button>
                <button
                  type="submit"
                  className="min-h-11 flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-orange-950/30 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <div role="dialog" aria-modal="true" aria-labelledby="banner-modal-title" className="my-auto flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[#34445f] bg-[#0f172a] shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-[#263653] bg-[#152036] px-4 py-4 sm:px-6">
              <div>
                <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-orange-300">હોમપેજ દેખાવ</p>
                <h3 id="banner-modal-title" className="text-base font-black text-white sm:text-lg">🖼️ સ્લાઇડર / બેનર મેનેજર</h3>
              </div>
              <button
                type="button"
                onClick={() => setBannerModalOpen(false)}
                aria-label="વિન્ડો બંધ કરો"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#34445f] bg-[#0c1322] text-slate-400 transition hover:border-slate-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              >
                ✕
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
                    {editingBannerId ? "બેનરમાં ફેરફાર કરો" : "નવું બેનર ઉમેરો"}
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">સ્લાઇડરમાં દેખાડવા માટે શીર્ષક, વિગતો અને ફોટો ઉમેરો.</p>
                </div>
                <input
                  type="text"
                  required
                  value={newBanTitle}
                  onChange={(e) => setNewBanTitle(e.target.value)}
                  placeholder="બેનર શીર્ષક (દા.ત. શુદ્ધ સીંગતેલ ઓફર)"
                  className="w-full rounded-xl border border-[#34445f] bg-[#152036] px-3 py-3 text-sm text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                />
                <input
                  type="text"
                  value={newBanTag}
                  onChange={(e) => setNewBanTag(e.target.value)}
                  placeholder="બેજ ટેગ (દા.ત. ખાસ ઓફર)"
                  className="w-full rounded-xl border border-[#34445f] bg-[#152036] px-3 py-3 text-sm text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                />
                <input
                  type="text"
                  value={newBanDesc}
                  onChange={(e) => setNewBanDesc(e.target.value)}
                  placeholder="નાની વિગત (દા.ત. ૧૫ કિલો ડબ્બા પર આકર્ષક ભાવ)"
                  className="w-full rounded-xl border border-[#34445f] bg-[#152036] px-3 py-3 text-sm text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                />
                <input
                  type="url"
                  value={newBanImg}
                  onChange={(e) => setNewBanImg(e.target.value)}
                  placeholder="ફોટો વેબ URL"
                  className="w-full rounded-xl border border-[#34445f] bg-[#152036] px-3 py-3 text-sm text-white placeholder:text-slate-500 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                />
                <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[#34445f] bg-[#152036] px-3 py-2 text-xs font-semibold text-slate-200">
                  <span>હોમપેજ સ્લાઇડરમાં દેખાડો</span>
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
                    ? "સેવ થઈ રહ્યું છે..."
                    : editingBannerId
                      ? "બેનર ફેરફાર સેવ કરો"
                      : "+ બેનર સેવ કરો"}
                </button>
                {editingBannerId && (
                  <button
                    type="button"
                    onClick={resetBannerForm}
                    className="min-h-10 w-full rounded-xl border border-[#34445f] bg-[#152036] px-4 py-2 text-xs font-bold text-slate-300 transition hover:bg-[#1b2a44]"
                  >
                    ફેરફાર રદ કરો
                  </button>
                )}
              </form>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-200">હાલના બેનર્સ ({banners.length})</h4>
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
                        aria-label={b.active ? `${b.title} છુપાવો` : `${b.title} સક્રિય કરો`}
                        aria-pressed={b.active}
                        className={`min-h-9 rounded-lg border px-2 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 ${
                          b.active
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                            : "border-slate-500/30 bg-slate-500/10 text-slate-300 hover:bg-slate-500/20"
                        }`}
                      >
                        {b.active ? "સક્રિય" : "છુપાવેલ"}
                      </button>
                      <button
                        onClick={() => handleEditBanner(b)}
                        aria-label={`${b.title} સંપાદિત કરો`}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 p-1 font-bold text-amber-300 transition hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteBanner(b)}
                        aria-label={`${b.title} દૂર કરો`}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/10 p-1 font-bold text-rose-300 transition hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <section role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" className="my-auto flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[#34445f] bg-[#0f172a] shadow-2xl shadow-black/50">
            <header className="flex items-center justify-between border-b border-[#263653] bg-[#152036] px-4 py-4 sm:px-6">
              <div>
                <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-orange-300">Store configuration</p>
                <h2 id="settings-modal-title" className="text-lg font-black text-white">Store Settings</h2>
              </div>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                aria-label="Close store settings"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#34445f] bg-[#0c1322] text-slate-400 transition-all duration-200 hover:text-white"
              >
                ✕
              </button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
              <form onSubmit={handleSaveSettings} className="space-y-4 rounded-2xl border border-[#263653] bg-[#0c1322] p-4 sm:p-5">
                <label className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-[#34445f] bg-[#152036] px-3 py-2 text-sm font-semibold text-slate-200">
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
                <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
                  WhatsApp order mobile number (with country code)
                  <input
                    type="tel"
                    value={settingsForm.whatsappNumber}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, whatsappNumber: event.target.value }))}
                    placeholder="919876543210"
                    className="w-full rounded-xl border border-[#34445f] bg-[#152036] px-3 py-3 text-sm text-white focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                  />
                </label>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
                  Store address
                  <input
                    type="text"
                    value={settingsForm.address}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, address: event.target.value }))}
                    className="w-full rounded-xl border border-[#34445f] bg-[#152036] px-3 py-3 text-sm text-white focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                  />
                </label>
                <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
                  Store timings
                  <input
                    type="text"
                    value={settingsForm.hours}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, hours: event.target.value }))}
                    placeholder="7:00 AM - 10:00 PM"
                    className="w-full rounded-xl border border-[#34445f] bg-[#152036] px-3 py-3 text-sm text-white focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="min-h-11 w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 text-sm font-black text-white transition-all duration-200 hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                >
                  {isSavingSettings ? "Saving settings..." : "Save Store Settings"}
                </button>
              </form>

              <section className="space-y-3 rounded-2xl border border-[#263653] bg-[#0c1322] p-4 sm:p-5">
                <div>
                  <h3 className="font-bold text-white">Data Backup</h3>
                  <p className="mt-1 text-xs text-slate-400">Export or restore store products, banners, and settings.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    className="min-h-11 rounded-xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm font-bold text-sky-200 transition-all duration-200 hover:bg-sky-500/20"
                  >
                    Export JSON Backup
                  </button>
                  <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-center text-sm font-bold text-emerald-200 transition-all duration-200 hover:bg-emerald-500/20">
                    Restore from JSON
                    <input type="file" accept="application/json,.json" onChange={handleRestoreBackup} className="sr-only" />
                  </label>
                </div>
              </section>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}