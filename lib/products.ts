import { Product } from "../app/types/product";
import { normalizeCategoryToPrimary } from "../app/lib/csvProductUtils";
import { DEFAULT_CATEGORIES, StoreCategory } from "../app/store-config";

/**
 * Normalizes strings by trimming whitespace and converting to lowercase.
 */
export const normalize = (str?: string): string => (str || "").trim().toLowerCase();

/**
 * Evaluates whether a product matches a selected category filter in a case-insensitive,
 * whitespace-trimmed manner, supporting primary aliases, Gujarati text, and English names.
 */
export function matchesCategory(
  itemCategoryRaw?: string,
  selectedCategoryRaw?: string,
  storeCategories: StoreCategory[] = DEFAULT_CATEGORIES
): boolean {
  if (!selectedCategoryRaw) return true;
  const normSelected = normalize(selectedCategoryRaw);
  if (!normSelected || normSelected === "all" || normSelected === "all items") {
    return true;
  }

  const normItem = normalize(itemCategoryRaw);
  if (
    normItem === normSelected ||
    normItem.replace(/\s+/g, "-") === normSelected ||
    normSelected.replace(/\s+/g, "-") === normItem
  ) {
    return true;
  }

  // Check store settings categories (cross-check id <-> name)
  const allCategories = storeCategories.length ? storeCategories : DEFAULT_CATEGORIES;
  const matchedCategoryObj = allCategories.find(
    (cat) => normalize(cat.id) === normSelected || normalize(cat.name) === normSelected
  );
  if (matchedCategoryObj) {
    if (
      normalize(matchedCategoryObj.name) === normItem ||
      normalize(matchedCategoryObj.id) === normItem
    ) {
      return true;
    }
  }

  // Cross-match primary store categories (handles aliases, Gujarati, English, and slugs)
  try {
    const primaryItem = normalizeCategoryToPrimary(itemCategoryRaw, allCategories);
    const primarySelected = normalizeCategoryToPrimary(selectedCategoryRaw, allCategories);
    if (primaryItem.id && primarySelected.id && primaryItem.id === primarySelected.id) {
      return true;
    }
  } catch {}

  return false;
}

/**
 * Filter products by category adhering to surgical fix requirements.
 */
export function filterProductsByCategory(
  products: Product[],
  selectedCategory?: string,
  storeCategories: StoreCategory[] = DEFAULT_CATEGORIES
): Product[] {
  console.log("Selected:", selectedCategory, "Sample Item Category:", products[0]?.category);

  if (!selectedCategory || normalize(selectedCategory) === "all" || normalize(selectedCategory) === "all items") {
    return products;
  }

  return products.filter((item) => {
    const itemCategory = item.category || item.categoryName || item.category_name || "";
    return matchesCategory(itemCategory, selectedCategory, storeCategories);
  });
}
