"use client";

import React, { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { Product } from "../app/types/product";
import { normalize, matchesCategory } from "../lib/products";
import { StoreCategory, DEFAULT_CATEGORIES } from "../app/store-config";

export { normalize };

interface ProductContextType {
  products: Product[];
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  filteredProducts: Product[];
  categories: StoreCategory[];
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export function ProductProvider({
  children,
  initialProducts = [],
  categories = DEFAULT_CATEGORIES,
}: {
  children: ReactNode;
  initialProducts?: Product[];
  categories?: StoreCategory[];
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [products] = useState<Product[]>(initialProducts);

  // Temporary development debug logging before the filter
  console.log("Selected:", selectedCategory, "Sample Item Category:", products[0]?.category);

  const filteredProducts = useMemo(() => {
    if (!selectedCategory || normalize(selectedCategory) === "all" || normalize(selectedCategory) === "all items") {
      return products;
    }
    return products.filter((item) => {
      const itemCategory = item.category || (item as any).categoryName || (item as any).category_name || "";
      if (normalize(itemCategory) === normalize(selectedCategory)) {
        return true;
      }
      return matchesCategory(itemCategory, selectedCategory, categories);
    });
  }, [products, selectedCategory, categories]);

  return (
    <ProductContext.Provider
      value={{
        products,
        selectedCategory,
        setSelectedCategory,
        filteredProducts,
        categories,
      }}
    >
      {children}
    </ProductContext.Provider>
  );
}

export function useProductContext() {
  const context = useContext(ProductContext);
  if (!context) {
    throw new Error("useProductContext must be used within a ProductProvider");
  }
  return context;
}
