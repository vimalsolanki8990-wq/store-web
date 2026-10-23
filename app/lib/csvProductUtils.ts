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
 * Format and escape a single CSV cell according to RFC-4180 standards.
 * Wraps values containing commas, double quotes, line breaks, or whitespace in double quotes.
 */
export function formatCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  // If the cell contains quotes, commas, newlines, or whitespace, wrap in double quotes with RFC-4180 escaping
  if (/[",\r\n\s]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export products to an RFC-4180 compliant CSV string prefixed with UTF-8 BOM (\uFEFF)
 * for perfect rendering in Microsoft Excel Online, Excel Desktop, and Google Sheets.
 * Strictly excludes any image / photo / base64 data.
 */
export function exportProductsToCsvString(products: Product[]): string {
  const headerLine = CSV_PRODUCT_COLUMNS.map(formatCsvCell).join(",");

  const dataLines = products.map((product) => {
    const idVal = product.id || "";
    const nameVal = product.name || product.nameGu || product.nameEn || "";
    const categoryVal = product.category || "";
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

  // Prefix with UTF-8 Byte Order Mark (\uFEFF) so Excel natively renders Gujarati and special characters
  return `\uFEFF${[headerLine, ...dataLines].join("\r\n")}`;
}

/**
 * Robust RFC-4180 CSV parser that properly handles:
 * - UTF-8 BOM
 * - Quoted fields with embedded commas
 * - Escaped double quotes ("")
 * - Embedded newlines inside quoted cells
 * - Windows (CRLF) and Unix (LF) line endings
 */
export function parseCsvRows(csvText: string): string[][] {
  const text = csvText.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          // Escaped quote
          currentCell += '"';
          i++;
        } else {
          // Closing quote
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        if (currentCell.trim() === "") {
          currentCell = "";
        }
        inQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentCell.trim());
        currentCell = "";
      } else if (char === "\r") {
        if (i + 1 < text.length && text[i + 1] === "\n") {
          i++; // skip LF in CRLF
        }
        currentRow.push(currentCell.trim());
        currentCell = "";
        if (currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
      } else if (char === "\n") {
        currentRow.push(currentCell.trim());
        currentCell = "";
        if (currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
      } else {
        currentCell += char;
      }
    }
  }

  // Push remaining cell and row
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
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
 * Parse boolean strings from CSV (e.g. TRUE, true, 1, yes, false, 0, no).
 */
export function parseBoolean(val?: string, defaultVal = false): boolean {
  if (!val || !val.trim()) return defaultVal;
  const s = val.trim().toLowerCase();
  if (["true", "1", "yes", "y", "on", "active"].includes(s)) return true;
  if (["false", "0", "no", "n", "off", "inactive"].includes(s)) return false;
  return defaultVal;
}

export interface PreparedImportProduct {
  id: string;
  isExisting: boolean;
  payload: Record<string, unknown>;
}

/**
 * Parse and prepare imported CSV rows for Firestore synchronization.
 * Strictly preserves existing photos/images in Firestore for existing products.
 */
export function prepareImportProducts(
  csvText: string,
  existingProducts: Product[]
): PreparedImportProduct[] {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    throw new Error("CSV file must contain a header row and at least one product row.");
  }

  const headerRow = rows[0].map((h) => h.trim());
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
    "isspecialoffer",
    "is_special_offer",
    "offer",
    "specialoffer",
    "special_offer",
    "isoffer"
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

  const productsToSave: PreparedImportProduct[] = [];

  for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex++) {
    const row = rows[rowIndex + 1];
    const rawId = idIdx !== -1 ? row[idIdx]?.trim() || "" : "";
    const rawName = nameIdx !== -1 ? row[nameIdx]?.trim() || "" : "";

    if (!rawName) {
      throw new Error(`Row ${rowIndex + 2}: Product name cannot be empty.`);
    }

    const rawPriceStr = priceIdx !== -1 ? row[priceIdx]?.trim() || "" : "";
    const cleanedPrice = rawPriceStr.replace(/[^0-9.]/g, "");
    const price = parseFloat(cleanedPrice);
    if (!Number.isFinite(price) || price < 0) {
      throw new Error(
        `Row ${rowIndex + 2}: Invalid price value "${rawPriceStr}".`
      );
    }

    const rawCategory =
      categoryIdx !== -1 ? row[categoryIdx]?.trim() || "" : "";
    const rawOrigPriceStr =
      origPriceIdx !== -1 ? row[origPriceIdx]?.trim() || "" : "";
    const cleanedOrigPrice = rawOrigPriceStr
      ? parseFloat(rawOrigPriceStr.replace(/[^0-9.]/g, ""))
      : price;
    const originalPrice =
      Number.isFinite(cleanedOrigPrice) && cleanedOrigPrice > 0
        ? cleanedOrigPrice
        : price;

    const rawPacking = packingIdx !== -1 ? row[packingIdx]?.trim() || "" : "";
    const rawBrand = brandIdx !== -1 ? row[brandIdx]?.trim() || "" : "";
    const rawQuantityStr =
      quantityIdx !== -1 ? row[quantityIdx]?.trim() || "" : "";
    const rawOfferStr = offerIdx !== -1 ? row[offerIdx]?.trim() || "" : "";
    const rawInStockStr =
      inStockIdx !== -1 ? row[inStockIdx]?.trim() || "" : "";

    const isExisting = Boolean(rawId && existingMap.has(rawId));
    const targetId = isExisting
      ? rawId
      : rawId || `p_${Date.now()}_${rowIndex}`;
    const existingProduct = isExisting ? existingMap.get(rawId) : undefined;

    const units = rawPacking
      ? parsePackingUnits(rawPacking)
      : existingProduct?.units || ["1 pc"];
    const brand = rawBrand || existingProduct?.brand || "Other";
    const category =
      rawCategory || existingProduct?.category || "કઠોળ-અનાજ";

    let quantity = 1;
    if (rawQuantityStr) {
      const parsedQty = parseInt(rawQuantityStr.replace(/[^0-9]/g, ""), 10);
      if (Number.isFinite(parsedQty)) {
        quantity = Math.max(0, parsedQty);
      }
    } else if (existingProduct?.stockCount !== undefined) {
      quantity = existingProduct.stockCount;
    }

    let inStock = true;
    if (rawInStockStr) {
      inStock = parseBoolean(rawInStockStr, quantity > 0);
    } else if (existingProduct?.inStock !== undefined) {
      inStock = existingProduct.inStock;
    } else {
      inStock = quantity > 0;
    }

    const stockCount = inStock ? Math.max(1, quantity) : 0;

    let isSpecialOffer = false;
    if (rawOfferStr) {
      isSpecialOffer = parseBoolean(rawOfferStr, originalPrice > price);
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
      price,
      originalPrice,
      units,
      packing: units.join(", "),
      brand,
      stockCount,
      quantity: stockCount,
      offer: isSpecialOffer,
      isSpecialOffer,
      inStock,
      in_stock: inStock,
    };

    // STRICT MEDIA PRESERVATION:
    // If the product is existing, do NOT include photoUrl or photo_url in the payload.
    // Firestore setDoc with { merge: true } strictly preserves the existing photo/image.
    if (!isExisting) {
      docPayload.photoUrl = defaultPhoto;
      docPayload.photo_url = defaultPhoto;
    }

    productsToSave.push({ id: targetId, isExisting, payload: docPayload });
  }

  return productsToSave;
}
