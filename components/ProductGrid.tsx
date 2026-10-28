"use client";

import React, { useMemo } from "react";
import { Product } from "../app/types/product";
import { StoreCategory, DEFAULT_CATEGORIES } from "../app/store-config";
import { matchesCategory } from "../lib/products";

export const normalize = (str?: string) => (str || "").trim().toLowerCase();

export interface ProductGridProps {
  products: Product[];
  selectedCategory?: string;
  storeCategories?: StoreCategory[];
  favorites?: string[];
  cart?: Record<string, { quantity: number }>;
  bouncedProductId?: string | null;
  primaryColor?: string;
  onToggleFavorite?: (id: string) => void;
  onShareProduct?: (product: Product) => void;
  onAddToCart?: (product: Product) => void;
  onUpdateQty?: (id: string, delta: number) => void;
  onClearFilter?: () => void;
}

export function ProductGrid({
  products,
  selectedCategory,
  storeCategories = DEFAULT_CATEGORIES,
  favorites = [],
  cart = {},
  bouncedProductId = null,
  primaryColor = "#ea580c",
  onToggleFavorite,
  onShareProduct,
  onAddToCart,
  onUpdateQty,
  onClearFilter,
}: ProductGridProps) {
  // Temporary development debug logging before the filter
  console.log("Selected:", selectedCategory, "Sample Item Category:", products[0]?.category);

  const filteredProducts = useMemo(() => {
    const norm = (str?: string) => (str || "").trim().toLowerCase();
    const normActive = norm(selectedCategory);

    if (!normActive || normActive === "all" || normActive === "all items") {
      return products;
    }

    return products.filter((item) => {
      const prodCat = norm(item.category || (item as any).categoryName || (item as any).category_name);

      const matchesCat = 
        prodCat === normActive ||
        prodCat.replace(/\s+/g, "-") === normActive ||
        normActive.replace(/\s+/g, "-") === prodCat;

      if (matchesCat) {
        return true;
      }

      // Cross-match via store categories and primary category aliases
      return matchesCategory(prodCat, selectedCategory, storeCategories);
    });
  }, [products, selectedCategory, storeCategories]);

  if (filteredProducts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 flex flex-col items-center justify-center gap-3">
        <p>No matching products. Try another search or filter.</p>
        {onClearFilter && (
          <button
            type="button"
            onClick={onClearFilter}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold hover:bg-orange-100 transition shadow-2xs"
          >
            Clear Filter
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-4 pb-12 lg:pb-24">
      {filteredProducts.map((item) => {
        const inCartQty = cart[item.id]?.quantity ?? 0;
        const isFavorite = favorites.includes(item.id);
        const isBounced = bouncedProductId === item.id;
        const isAvailable = item.inStock && item.stockCount > 0;
        const unitChip = item.units && item.units.length > 0 ? item.units[0] : "1 pc";

        return (
          <div
            key={item.id}
            className={`bg-white border border-orange-100 rounded-2xl overflow-hidden flex flex-col hover:shadow-md hover:border-orange-200 transition-all duration-200 shadow-xs relative group ${
              isBounced ? "scale-98 ring-2 ring-orange-400" : ""
            }`}
          >
            <div className="relative aspect-square w-full bg-slate-50 overflow-hidden">
              <img
                src={item.photoUrl || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60"}
                alt={item.name || "Product"}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              {item.offer && (
                <span className="absolute top-2 left-2 bg-gradient-to-r from-red-600 to-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-xs">
                  SPECIAL OFFER
                </span>
              )}
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={() => onToggleFavorite(item.id)}
                  aria-label="Toggle Favorite"
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-white/90 backdrop-blur-sm text-slate-400 hover:text-red-500 transition shadow-xs"
                >
                  <span className={isFavorite ? "text-red-500 font-bold" : ""}>♥</span>
                </button>
              )}
            </div>

            <div className="p-3 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-1 text-[11px] text-slate-500 mb-1">
                  <span className="truncate">{item.brand || "Standard"}</span>
                  <span className="shrink-0 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-600">
                    {unitChip}
                  </span>
                </div>
                <h3 className="font-bold text-xs sm:text-sm text-slate-800 line-clamp-2 leading-tight">
                  {item.name}
                </h3>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm sm:text-base font-black text-slate-900">
                      ₹{item.price}
                    </span>
                    {item.originalPrice > item.price && (
                      <span className="text-[11px] text-slate-400 line-through">
                        ₹{item.originalPrice}
                      </span>
                    )}
                  </div>
                </div>

                {isAvailable ? (
                  inCartQty > 0 ? (
                    <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-xl px-2 py-1">
                      <button
                        type="button"
                        onClick={() => onUpdateQty?.(item.id, -1)}
                        className="text-orange-700 font-bold text-xs px-1 hover:text-orange-900"
                      >
                        -
                      </button>
                      <span className="text-xs font-black text-orange-900 min-w-4 text-center">
                        {inCartQty}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQty?.(item.id, 1)}
                        className="text-orange-700 font-bold text-xs px-1 hover:text-orange-900"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAddToCart?.(item)}
                      style={{ backgroundColor: primaryColor }}
                      className="px-3 py-1.5 rounded-xl text-white text-xs font-bold shadow-xs hover:opacity-95 active:scale-95 transition"
                    >
                      Add
                    </button>
                  )
                ) : (
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-2 py-1 rounded-lg">
                    Out of Stock
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ProductGrid;
