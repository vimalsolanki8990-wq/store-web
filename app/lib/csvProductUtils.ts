import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Product } from "../types/product";

/**
 * Strict clean business columns for store product CSV export and import.
 * Images / photos / base64 data are strictly excluded to ensure files open
 * cleanly in Microsoft Excel Online and Desktop without broken rows or corruption.
 */
export const CSV_PRODUCT_COLUMNS = [
  "id",
  "name",
  "category",
  "price",
  "originalPrice",
  "packing",
  "brand",
  "quantity",
  "isSpecialOffer",
  "inStock",
] as const;

export type CsvProductColumn = (typeof CSV_PRODUCT_COLUMNS)[number];

/**
 * Clean standard business columns for Excel (.xlsx) category-wise multi-sheet export.
 */
export const EXCEL_PRODUCT_COLUMNS = [
  "id",
  "name",
  "category",
  "price",
  "originalPrice",
  "packing",
  "brand",
  "quantity",
  "isSpecial",
  "inStock",
] as const;

export type ExcelProductColumn = (typeof EXCEL_PRODUCT_COLUMNS)[number];

/**
 * The Strict 7 Active Store Categories for Jay Vachhraj General Store.
 * Every product and category variant (Gujarati, English, or raw Firestore system ID)
 * maps directly into one of these 7 primary categories.
 */
export interface PrimaryCategoryConfig {
  id: string;
  sheetName: string;
  displayName: string;
  englishName: string;
  gujaratiName: string;
  aliases: string[];
}

export const PRIMARY_STORE_CATEGORIES: PrimaryCategoryConfig[] = [
  {
    id: "grains-pulses",
    sheetName: "Grains & Pulses",
    displayName: "Grains & Pulses (કઠોળ-અનાજ)",
    englishName: "Grains & Pulses",
    gujaratiName: "કઠોળ-અનાજ",
    aliases: [
      "grains & pulses",
      "grains and pulses",
      "grains",
      "pulses",
      "grain",
      "pulse",
      "કઠોળ-અનાજ",
      "કઠોળ",
      "અનાજ",
      "kathol",
      "anaj",
      "kathol-anaj",
      "kathol anaj",
      "dal",
      "dall",
      "chana",
      "rice",
      "wheat",
      "juwar",
      "bajra",
      "tuver",
      "mug",
      "urad",
    ],
  },
  {
    id: "oil-ghee",
    sheetName: "Oil & Ghee",
    displayName: "Oil & Ghee (તેલ-ઘી)",
    englishName: "Oil & Ghee",
    gujaratiName: "તેલ-ઘી",
    aliases: [
      "oil & ghee",
      "oil and ghee",
      "oil & ghi",
      "oil",
      "ghee",
      "ghi",
      "તેલ-ઘી",
      "તેલ",
      "ઘી",
      "tel",
      "tel-ghee",
      "tel ghee",
      "edible oil",
      "cooking oil",
      "singtel",
      "cottonseed",
      "groundnut oil",
      "mustard oil",
      "sunflower oil",
      "soya oil",
    ],
  },
  {
    id: "spices",
    sheetName: "Spices",
    displayName: "Spices (મસાલા / Spices)",
    englishName: "Spices",
    gujaratiName: "મસાલા",
    aliases: [
      "spices",
      "spice",
      "મસાલા",
      "મસાલા / spices",
      "spices (મસાલા)",
      "masala",
      "masalo",
      "mirch",
      "haldi",
      "dhaniya",
      "jeera",
      "hing",
      "garam masala",
      "rai",
      "methi",
      "salt",
      "nimak",
      "mithu",
    ],
  },
  {
    id: "snacks",
    sheetName: "Snacks",
    displayName: "Snacks (નાસ્તો-ફરસાણ)",
    englishName: "Snacks",
    gujaratiName: "નાસ્તો-ફરસાણ",
    aliases: [
      "snacks",
      "snack",
      "નાસ્તો-ફરસાણ",
      "નાસ્તો",
      "ફરસાણ",
      "nasto",
      "farsan",
      "namkeen",
      "biscuits",
      "biscuit",
      "bakery",
      "chips",
      "chivda",
      "gathiya",
      "sev",
      "wafer",
      "cookies",
    ],
  },
  {
    id: "personal-care",
    sheetName: "Personal Care",
    displayName: "Personal Care (પર્સનલ કેર)",
    englishName: "Personal Care",
    gujaratiName: "પર્સનલ કેર",
    aliases: [
      "personal care",
      "personalcare",
      "personal-care",
      "પર્સનલ કેર",
      "પર્સનલ",
      "કેર",
      "soap",
      "shampoo",
      "toothpaste",
      "brush",
      "cream",
      "lotion",
      "beauty",
      "cosmetics",
      "hair oil",
      "powder",
      "detergent powder",
      "washing powder",
    ],
  },
  {
    id: "pooja-others",
    sheetName: "Pooja & Others",
    displayName: "Pooja & Others (પૂજાપો-અન્ય)",
    englishName: "Pooja & Others",
    gujaratiName: "પૂજાપો-અન્ય",
    aliases: [
      "pooja & others",
      "pooja and others",
      "pooja",
      "puja",
      "poojapo",
      "pujapo",
      "પૂજાપો-અન્ય",
      "પૂજાપો",
      "પૂજા",
      "અન્ય",
      "others",
      "other",
      "general",
      "agarbatti",
      "dhoop",
      "diya",
      "matchbox",
      "cotton wicks",
      "kapur",
      "camphor",
      "sindoor",
    ],
  },
  {
    id: "liquid",
    sheetName: "Liquid",
    displayName: "Liquid (Liquid)",
    englishName: "Liquid",
    gujaratiName: "લિક્વિડ",
    aliases: [
      "liquid",
      "liquids",
      "લિક્વિડ",
      "drink",
      "drinks",
      "beverage",
      "beverages",
      "juice",
      "cold drink",
      "sharbat",
      "syrup",
      "cleaner",
      "detergent liquid",
      "floor cleaner",
      "dishwash liquid",
      "phenyl",
      "harpic",
      "colin",
      "handwash",
    ],
  },
];

/**
 * Robust category normalization helper:
 * Converts to lowercase, trims, replaces '&' with 'and', and removes non-alphanumeric characters.
 */
export const normalizeCategory = (cat?: string): string => {
  if (!cat) return "";
  return cat
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, ""); // removes spaces, dashes, underscores, symbols
};

/**
 * Normalize any category string (including Gujarati text, English aliases,
 * or raw Firestore store settings ID like 'category_1792246279849')
 * strictly into one of the 7 primary store categories.
 */
export function normalizeCategoryToPrimary(
  rawCat: string | undefined | null,
  storeCategories?: Array<{ id: string; name?: string }>
): PrimaryCategoryConfig {
  if (!rawCat || !rawCat.trim()) {
    return PRIMARY_STORE_CATEGORIES[5]; // Default to Pooja & Others
  }

  const clean = rawCat.trim().toLowerCase();
  const normKey = normalizeCategory(rawCat);
  const strippedKey = normKey.replace(/and/g, "");

  // 1. If it matches a raw system ID like "category_1792246279849", resolve via storeCategories
  if (storeCategories && storeCategories.length > 0) {
    const matchedStoreCat = storeCategories.find(
      (sc) => sc.id.toLowerCase() === clean || normalizeCategory(sc.id) === normKey
    );
    if (
      matchedStoreCat &&
      matchedStoreCat.name &&
      matchedStoreCat.name.toLowerCase() !== clean
    ) {
      return normalizeCategoryToPrimary(matchedStoreCat.name, storeCategories);
    }
  }

  // 2. Exact match check (including normalized slug and & / and variants)
  for (const primary of PRIMARY_STORE_CATEGORIES) {
    const normSheet = normalizeCategory(primary.sheetName);
    const normId = normalizeCategory(primary.id);
    if (
      primary.id.toLowerCase() === clean ||
      primary.sheetName.toLowerCase() === clean ||
      primary.englishName.toLowerCase() === clean ||
      primary.gujaratiName.toLowerCase() === clean ||
      primary.displayName.toLowerCase() === clean ||
      normSheet === normKey ||
      normId === normKey ||
      normSheet.replace(/and/g, "") === strippedKey ||
      normId.replace(/and/g, "") === strippedKey
    ) {
      return primary;
    }

    for (const alias of primary.aliases) {
      const normAlias = normalizeCategory(alias);
      if (
        alias.toLowerCase() === clean ||
        normAlias === normKey ||
        normAlias.replace(/and/g, "") === strippedKey
      ) {
        return primary;
      }
    }
  }

  // 3. Partial substring match check
  for (const primary of PRIMARY_STORE_CATEGORIES) {
    for (const alias of primary.aliases) {
      const a = alias.toLowerCase();
      if (clean.includes(a) || a.includes(clean)) {
        return primary;
      }
    }
  }

  // Fallback to Pooja & Others
  return PRIMARY_STORE_CATEGORIES[5];
}

/**
 * Format and escape a single CSV cell according to RFC-4180 standards.
 * Wraps values containing commas, double quotes, line breaks, or whitespace in double quotes.
 */
export function formatCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  if (/[",\r\n\s]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export products to an RFC-4180 compliant CSV string prefixed with UTF-8 BOM (\uFEFF)
 * for perfect rendering in Microsoft Excel Online, Excel Desktop, and Google Sheets.
 * Filters strictly by selected primary category sheet names and normalizes category values.
 */
export function exportProductsToCsvString(
  products: Product[],
  selectedCategorySheetNames?: string[],
  storeCategories?: Array<{ id: string; name?: string }>
): string {
  const targetCategories =
    selectedCategorySheetNames && selectedCategorySheetNames.length > 0
      ? PRIMARY_STORE_CATEGORIES.filter((c) =>
          selectedCategorySheetNames.some(
            (s) =>
              s === c.sheetName ||
              s === c.id ||
              s === c.displayName ||
              s === c.gujaratiName ||
              s === c.englishName
          )
        )
      : PRIMARY_STORE_CATEGORIES;

  const targetCategoryIds = new Set(targetCategories.map((c) => c.id));

  const targetProducts = products.filter((p) => {
    const normalized = normalizeCategoryToPrimary(p.category, storeCategories);
    return targetCategoryIds.has(normalized.id);
  });

  const headerLine = CSV_PRODUCT_COLUMNS.map(formatCsvCell).join(",");

  const dataLines = targetProducts.map((product) => {
    const normalized = normalizeCategoryToPrimary(product.category, storeCategories);
    const idVal = product.id || "";
    const nameVal = product.name || product.nameGu || product.nameEn || "";
    const categoryVal = normalized.sheetName;
    const priceVal =
      typeof product.price === "number" && !isNaN(product.price)
        ? product.price
        : Number(product.price) || 0;
    const originalPriceVal =
      typeof product.originalPrice === "number" &&
      !isNaN(product.originalPrice) &&
      product.originalPrice > 0
        ? product.originalPrice
        : Number(product.originalPrice) || priceVal;
    const packingVal =
      Array.isArray(product.units) && product.units.length > 0
        ? product.units.join(", ")
        : product.packing || "1 pc";
    const brandVal = product.brand || "Other";
    const quantityVal =
      typeof product.stockCount === "number" && !isNaN(product.stockCount)
        ? Math.max(0, product.stockCount)
        : 1;
    const isSpecialOfferVal = Boolean(product.offer || product.isSpecialOffer)
      ? "TRUE"
      : "FALSE";
    const inStockVal = Boolean(product.inStock) ? "TRUE" : "FALSE";

    const rowCells = [
      formatCsvCell(idVal),
      formatCsvCell(nameVal),
      formatCsvCell(categoryVal),
      formatCsvCell(priceVal),
      formatCsvCell(originalPriceVal),
      formatCsvCell(packingVal),
      formatCsvCell(brandVal),
      formatCsvCell(quantityVal),
      formatCsvCell(isSpecialOfferVal),
      formatCsvCell(inStockVal),
    ];

    return rowCells.join(",");
  });

  return `\uFEFF${[headerLine, ...dataLines].join("\r\n")}`;
}

/**
 * Export products to a multi-sheet Excel (.xlsx) workbook Uint8Array buffer.
 * STRICT DIRECTIVES:
 * 1. Strictly creates sheets ONLY for the 7 primary active categories:
 *    - Grains & Pulses
 *    - Oil & Ghee
 *    - Spices
 *    - Snacks
 *    - Personal Care
 *    - Pooja & Others
 *    - Liquid
 * 2. Every product category (e.g. 'કઠોળ-અનાજ', 'category_1792246279849') is normalized
 *    into its corresponding primary category sheet.
 * 3. Blank / 0-item sheets are not created.
 */
export function exportProductsToExcelBuffer(
  products: Product[],
  selectedCategorySheetNames?: string[],
  storeCategories?: Array<{ id: string; name?: string }>
): Uint8Array {
  const wb = XLSX.utils.book_new();

  const targetCategories =
    selectedCategorySheetNames && selectedCategorySheetNames.length > 0
      ? PRIMARY_STORE_CATEGORIES.filter((c) =>
          selectedCategorySheetNames.some(
            (s) =>
              s === c.sheetName ||
              s === c.id ||
              s === c.displayName ||
              s === c.gujaratiName ||
              s === c.englishName
          )
        )
      : PRIMARY_STORE_CATEGORIES;

  const header = [
    "id",
    "name",
    "category",
    "price",
    "originalPrice",
    "packing",
    "brand",
    "quantity",
    "isSpecial",
    "inStock",
  ];

  let sheetsCreated = 0;

  for (const primary of targetCategories) {
    // Collect all products that normalize into this primary category
    const catProducts = products.filter((p) => {
      const normalized = normalizeCategoryToPrimary(p.category, storeCategories);
      return normalized.id === primary.id;
    });

    // Zero-item check: do NOT create blank sheets
    if (catProducts.length === 0) {
      continue;
    }

    const rows: (string | number)[][] = [header];

    for (const product of catProducts) {
      const idVal = product.id || "";
      const nameVal = product.name || product.nameGu || product.nameEn || "";
      const categoryVal = primary.sheetName;
      const priceVal =
        typeof product.price === "number" && !isNaN(product.price)
          ? product.price
          : Number(product.price) || 0;
      const originalPriceVal =
        typeof product.originalPrice === "number" &&
        !isNaN(product.originalPrice) &&
        product.originalPrice > 0
          ? product.originalPrice
          : Number(product.originalPrice) || priceVal;
      const packingVal =
        Array.isArray(product.units) && product.units.length > 0
          ? product.units.join(", ")
          : product.packing || "1 pc";
      const brandVal = product.brand || "Other";
      const quantityVal =
        typeof product.stockCount === "number" && !isNaN(product.stockCount)
          ? Math.max(0, product.stockCount)
          : 1;
      const isSpecialVal = Boolean(product.offer || product.isSpecialOffer)
        ? "TRUE"
        : "FALSE";
      const inStockVal = Boolean(product.inStock) ? "TRUE" : "FALSE";

      rows.push([
        idVal,
        nameVal,
        categoryVal,
        priceVal,
        originalPriceVal,
        packingVal,
        brandVal,
        quantityVal,
        isSpecialVal,
        inStockVal,
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Auto-fit column widths for clear readability in Excel
    ws["!cols"] = [
      { wch: 18 }, // id
      { wch: 32 }, // name
      { wch: 22 }, // category
      { wch: 12 }, // price
      { wch: 14 }, // originalPrice
      { wch: 14 }, // packing
      { wch: 16 }, // brand
      { wch: 10 }, // quantity
      { wch: 12 }, // isSpecial
      { wch: 10 }, // inStock
    ];

    XLSX.utils.book_append_sheet(wb, ws, primary.sheetName);
    sheetsCreated++;
  }

  // In the rare edge case where no products were found in any selected categories,
  // append 1 default sheet with headers so Excel does not throw an invalid empty workbook error.
  if (sheetsCreated === 0) {
    const fallbackCategory = targetCategories[0] || PRIMARY_STORE_CATEGORIES[0];
    const ws = XLSX.utils.aoa_to_sheet([header]);
    XLSX.utils.book_append_sheet(wb, ws, fallbackCategory.sheetName);
  }

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Uint8Array(out);
}

/**
 * Download an Excel workbook buffer to the client browser.
 */
export function downloadExcelWorkbook(buffer: Uint8Array, fileName: string): void {
  const blob = new Blob([buffer as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Compliant RFC-4180 CSV parser using PapaParse.
 * Correctly handles:
 * - Preserves commas inside quoted strings (e.g. packing: "500g, 1kg, 2kg, 5kg")
 * - Quoted strings with double-quote escaping ("")
 * - UTF-8 Byte Order Marks (\uFEFF)
 * - Multiline strings and linebreaks
 * - Both CRLF and LF line endings
 */
export function parseCsvRows(csvText: string): string[][] {
  const clean = csvText.replace(/^\uFEFF/, "");
  const parsed = Papa.parse<string[]>(clean, {
    skipEmptyLines: "greedy",
  });
  return parsed.data || [];
}

/**
 * Split packing strings such as "500g, 1kg", "250g; 500g", or "1 pc" into clean unit arrays.
 */
export function parsePackingUnits(packingVal?: string): string[] {
  if (!packingVal || !packingVal.trim()) return ["1 pc"];
  const parsed = packingVal
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : ["1 pc"];
}

/**
 * Robust Boolean Normalization for CSV and Excel.
 * Explicitly normalizes:
 * - "TRUE" / "FALSE"
 * - "true" / "false"
 * - "1" / "0"
 * - Numeric 1 and 0
 * - Native boolean true and false
 */
export function parseExcelBoolean(val: unknown, defaultVal = false): boolean {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === "boolean") return val;
  if (typeof val === "number") {
    if (val === 1) return true;
    if (val === 0) return false;
    return val > 0;
  }
  const s = String(val).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on", "active"].includes(s)) return true;
  if (["false", "0", "no", "n", "off", "inactive"].includes(s)) return false;
  return defaultVal;
}

/**
 * Backward compatibility alias for parseExcelBoolean.
 */
export const parseBoolean = parseExcelBoolean;

/**
 * Parse numeric values from CSV and Excel into clean numbers (Number(val) || 0).
 * Strips currency symbols (e.g. ₹, $), spaces, and thousand-separator commas.
 */
export function parseCleanNumber(val: unknown, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "number") {
    return isNaN(val) ? fallback : val;
  }
  const str = String(val).trim();
  if (!str) return fallback;
  // Clean currency symbols, commas, and formatting
  const sanitized = str.replace(/[₹$€£,\s]/g, "").trim();
  const num = Number(sanitized);
  return isNaN(num) ? fallback : num;
}

export interface PreparedImportProduct {
  id: string;
  isExisting: boolean;
  payload: Record<string, unknown>;
}

export interface RowValidationError {
  rowNumber: number;
  itemName?: string;
  field?: string;
  message: string;
}

export interface ImportPreparationResult {
  validProducts: PreparedImportProduct[];
  errors: RowValidationError[];
  updatedCount: number;
  insertedCount: number;
  totalParsed: number;
}

/**
 * Parse and prepare imported CSV rows for Firestore synchronization.
 * Uses PapaParse to preserve quoted commas (e.g. packing: "500g, 1kg, 2kg, 5kg").
 * Strictly validates fields, normalizes boolean and numeric data types,
 * and preserves existing photos/images in Firestore for existing products.
 */
export function prepareImportProducts(
  csvText: string,
  existingProducts: Product[],
  defaultCategory?: string,
  sheetContext?: string
): ImportPreparationResult {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    throw new Error("CSV/sheet must contain a header row and at least one product row.");
  }

  const headerRow = rows[0].map((h) => String(h || "").trim());
  const findColIndex = (...candidates: string[]) => {
    const normalizedCandidates = candidates.map((c) =>
      c.toLowerCase().replace(/[\s_\-]/g, "")
    );
    return headerRow.findIndex((h) => {
      const normH = h.toLowerCase().replace(/[\s_\-]/g, "");
      return normalizedCandidates.includes(normH);
    });
  };

  const idIdx = findColIndex("id", "productid", "product_id");
  const nameIdx = findColIndex(
    "name",
    "itemname",
    "item_name",
    "item name",
    "namegu",
    "name_gu",
    "nameen",
    "name_en",
    "productname"
  );
  const categoryIdx = findColIndex("category", "categoryname");
  const priceIdx = findColIndex("price", "rate", "sellingprice");
  const origPriceIdx = findColIndex(
    "originalprice",
    "compareatprice",
    "mrp",
    "original_price",
    "oldprice"
  );
  const packingIdx = findColIndex(
    "packing",
    "units",
    "unit",
    "pack",
    "packaging"
  );
  const brandIdx = findColIndex("brand", "brandname", "company");
  const quantityIdx = findColIndex(
    "quantity",
    "stockcount",
    "stock_count",
    "stock",
    "qty"
  );
  const offerIdx = findColIndex(
    "isspecial",
    "is_special",
    "isspecialoffer",
    "is_special_offer",
    "offer",
    "specialoffer",
    "special_offer",
    "isoffer",
    "special"
  );
  const inStockIdx = findColIndex("instock", "in_stock", "available", "status");

  if (nameIdx === -1 || priceIdx === -1) {
    throw new Error(
      "Missing required columns: 'name' and 'price' headers are required."
    );
  }

  const existingMap = new Map<string, Product>(
    existingProducts.map((p) => [p.id, p])
  );
  const defaultPhoto =
    "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60";

  const validProducts: PreparedImportProduct[] = [];
  const errors: RowValidationError[] = [];

  for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex++) {
    const row = rows[rowIndex + 1];
    const displayRowNum = rowIndex + 2;

    // Skip empty lines
    if (!row || row.every((c) => !String(c || "").trim())) {
      continue;
    }

    const rawId = idIdx !== -1 ? String(row[idIdx] ?? "").trim() : "";
    const rawName = nameIdx !== -1 ? String(row[nameIdx] ?? "").trim() : "";

    // VALIDATION 1: Product name cannot be empty
    if (!rawName) {
      errors.push({
        rowNumber: displayRowNum,
        itemName: "Unnamed Product",
        field: "name",
        message: sheetContext
          ? `[${sheetContext}] Product name is required and cannot be empty.`
          : `Product name is required and cannot be empty.`,
      });
      continue;
    }

    // VALIDATION 2: Price must be a valid non-negative number
    const rawPriceStr = priceIdx !== -1 ? String(row[priceIdx] ?? "").trim() : "";
    if (!rawPriceStr) {
      errors.push({
        rowNumber: displayRowNum,
        itemName: rawName,
        field: "price",
        message: sheetContext
          ? `[${sheetContext}] Price is required.`
          : `Price is required.`,
      });
      continue;
    }
    const price = parseCleanNumber(rawPriceStr, NaN);
    if (isNaN(price) || price < 0) {
      errors.push({
        rowNumber: displayRowNum,
        itemName: rawName,
        field: "price",
        message: sheetContext
          ? `[${sheetContext}] Invalid price "${rawPriceStr}". Must be a valid non-negative number.`
          : `Invalid price "${rawPriceStr}". Must be a valid non-negative number.`,
      });
      continue;
    }

    // DIRECTIVE 1.1: If id is missing or empty, auto-generate a timestamped ID (p_ + Date.now() + index)
    const isExisting = Boolean(rawId && existingMap.has(rawId));
    const targetId = isExisting
      ? rawId
      : (rawId ? rawId : `p_${Date.now()}_${rowIndex}`);
    const existingProduct = isExisting ? existingMap.get(rawId) : undefined;

    // VALIDATION 3: Original price (defaults to price if missing or <= 0)
    const rawOrigPriceStr =
      origPriceIdx !== -1 ? String(row[origPriceIdx] ?? "").trim() : "";
    let originalPrice = price;
    if (rawOrigPriceStr !== "") {
      const parsedOrig = parseCleanNumber(rawOrigPriceStr, NaN);
      if (isNaN(parsedOrig) || parsedOrig < 0) {
        errors.push({
          rowNumber: displayRowNum,
          itemName: rawName,
          field: "originalPrice",
          message: sheetContext
            ? `[${sheetContext}] Invalid originalPrice "${rawOrigPriceStr}". Must be a valid number.`
            : `Invalid originalPrice "${rawOrigPriceStr}". Must be a valid number.`,
        });
        continue;
      }
      originalPrice = parsedOrig > 0 ? parsedOrig : price;
    } else if (existingProduct?.originalPrice !== undefined && existingProduct.originalPrice > 0) {
      originalPrice = existingProduct.originalPrice;
    } else {
      originalPrice = price;
    }

    // Build row record with trimmed column names for flexible schema support
    const rowObj: Record<string, string> = {};
    headerRow.forEach((colName, idx) => {
      const cleanCol = (colName || "").trim();
      if (cleanCol) {
        const val = String(row[idx] ?? "").trim();
        rowObj[cleanCol] = val;
        rowObj[cleanCol.toLowerCase()] = val;
      }
    });

    // Clean column names by trimming and checking schema variants
    const categoryValue =
      rowObj["Category"] ||
      rowObj["category"] ||
      rowObj["CATEGORY"] ||
      rowObj["Category Name"] ||
      rowObj["category name"] ||
      rowObj["category_name"] ||
      rowObj["CATEGORY_NAME"] ||
      (categoryIdx !== -1 ? String(row[categoryIdx] ?? "").trim() : "");

    const rawCategory = (categoryValue || "").trim();
    const rawPacking =
      packingIdx !== -1 ? String(row[packingIdx] ?? "").trim() : "";
    const rawBrand =
      brandIdx !== -1 ? String(row[brandIdx] ?? "").trim() : "";
    const rawQuantityStr =
      quantityIdx !== -1 ? String(row[quantityIdx] ?? "").trim() : "";
    const rawOfferStr =
      offerIdx !== -1 ? String(row[offerIdx] ?? "").trim() : "";
    const rawInStockStr =
      inStockIdx !== -1 ? String(row[inStockIdx] ?? "").trim() : "";

    // DIRECTIVE 1.5: If packing is missing, default to standard single piece
    const units = rawPacking
      ? parsePackingUnits(rawPacking)
      : existingProduct?.units || ["1 pc"];
    const packing =
      rawPacking || (Array.isArray(units) && units.length > 0 ? units.join(", ") : "1 pc");

    // DIRECTIVE 1.4: If brand is missing, default to "Other"
    const brand = rawBrand || existingProduct?.brand || "Other";

    // Normalize category into 7 primary store categories and sanitize against undefined/null
    const unnormalizedCategory =
      rawCategory || defaultCategory || existingProduct?.category || "Grains & Pulses";
    const normalizedCategoryConfig = normalizeCategoryToPrimary(unnormalizedCategory);
    const category =
      (normalizedCategoryConfig?.sheetName || unnormalizedCategory || "Grains & Pulses").trim() ||
      "Grains & Pulses";

    // DIRECTIVE 1.3: If quantity is empty or missing, default to 0
    let quantity = 0;
    if (rawQuantityStr !== "") {
      const parsedQty = parseCleanNumber(rawQuantityStr, NaN);
      if (isNaN(parsedQty) || parsedQty < 0) {
        errors.push({
          rowNumber: displayRowNum,
          itemName: rawName,
          field: "quantity",
          message: sheetContext
            ? `[${sheetContext}] Invalid quantity "${rawQuantityStr}". Must be a valid non-negative number.`
            : `Invalid quantity "${rawQuantityStr}". Must be a valid non-negative number.`,
        });
        continue;
      }
      quantity = Math.max(0, Math.floor(parsedQty));
    } else if (existingProduct?.stockCount !== undefined) {
      quantity = existingProduct.stockCount;
    } else {
      quantity = 0;
    }

    // DIRECTIVE 1.2: If inStock is missing, default to true
    let inStock = true;
    if (rawInStockStr !== "") {
      inStock = parseExcelBoolean(rawInStockStr, true);
    } else if (existingProduct?.inStock !== undefined) {
      inStock = existingProduct.inStock;
    } else {
      inStock = true;
    }

    const stockCount = inStock ? Math.max(0, quantity) : 0;

    let isSpecialOffer = false;
    if (rawOfferStr !== "") {
      isSpecialOffer = parseExcelBoolean(rawOfferStr, originalPrice > price);
    } else if (existingProduct?.offer !== undefined) {
      isSpecialOffer = existingProduct.offer;
    } else {
      isSpecialOffer = originalPrice > price;
    }

    const docPayload: Record<string, unknown> = {
      id: targetId,
      name: rawName,
      nameGu: rawName,
      name_gu: rawName,
      nameEn: existingProduct?.nameEn || rawName,
      name_en: existingProduct?.nameEn || rawName,
      category,
      categoryName: category,
      category_name: category,
      price,
      originalPrice,
      units,
      packing,
      brand,
      stockCount,
      quantity,
      offer: isSpecialOffer,
      isSpecialOffer,
      inStock,
      in_stock: inStock,
    };

    // STRICT MEDIA PRESERVATION:
    // If the product is existing, do NOT include photoUrl in the payload.
    // Firestore setDoc with { merge: true } strictly preserves the existing photo.
    if (!isExisting) {
      docPayload.photoUrl = defaultPhoto;
      docPayload.photo_url = defaultPhoto;
    }

    validProducts.push({ id: targetId, isExisting, payload: docPayload });
  }

  const updatedCount = validProducts.filter((p) => p.isExisting).length;
  const insertedCount = validProducts.filter((p) => !p.isExisting).length;

  return {
    validProducts,
    errors,
    updatedCount,
    insertedCount,
    totalParsed: validProducts.length,
  };
}

/**
 * Parse and prepare products from a multi-sheet or single-sheet Excel workbook.
 * Iterates through all sheets, extracts product rows, maps them, and merges them.
 * Preserves photos for existing products in Firestore.
 */
export function prepareImportProductsFromWorkbook(
  workbook: XLSX.WorkBook,
  existingProducts: Product[]
): ImportPreparationResult {
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error("Excel workbook contains no sheets.");
  }

  const preparedById = new Map<string, PreparedImportProduct>();
  const allErrors: RowValidationError[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) {
      continue;
    }

    const sheetCsv = XLSX.utils.sheet_to_csv(sheet);
    const parsedRows = parseCsvRows(sheetCsv);
    if (parsedRows.length < 2) {
      continue;
    }

    const defaultCategory =
      sheetName && !/^sheet\d+$/i.test(sheetName.trim())
        ? sheetName.trim()
        : undefined;

    try {
      const sheetResult = prepareImportProducts(
        sheetCsv,
        existingProducts,
        defaultCategory,
        sheetName
      );

      for (const item of sheetResult.validProducts) {
        preparedById.set(item.id, item);
      }
      allErrors.push(...sheetResult.errors);
    } catch (err) {
      allErrors.push({
        rowNumber: 1,
        itemName: sheetName,
        message: `Sheet "${sheetName}": ${err instanceof Error ? err.message : "Invalid sheet content"}`,
      });
      continue;
    }
  }

  const validProducts = Array.from(preparedById.values());
  const updatedCount = validProducts.filter((p) => p.isExisting).length;
  const insertedCount = validProducts.filter((p) => !p.isExisting).length;

  if (validProducts.length === 0 && allErrors.length === 0) {
    throw new Error(
      "No valid product rows found in the Excel workbook. Please ensure sheets contain 'name' and 'price' columns."
    );
  }

  return {
    validProducts,
    errors: allErrors,
    updatedCount,
    insertedCount,
    totalParsed: validProducts.length,
  };
}
