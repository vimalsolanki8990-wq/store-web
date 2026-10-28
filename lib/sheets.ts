import {
  prepareImportProducts,
  prepareImportProductsFromWorkbook,
  normalizeCategoryToPrimary,
  parseCsvRows,
  parseCleanNumber,
  parseExcelBoolean,
  parsePackingUnits,
} from "../app/lib/csvProductUtils";
import { Product } from "../app/types/product";

/**
 * Standard utility for Google Sheets and CSV row ingestion.
 * Cleans column names by trimming headers, sanitizes category values,
 * and ensures category is never parsed as undefined or null.
 */
export function sanitizeCategoryValue(categoryValue?: unknown): string {
  if (categoryValue === null || categoryValue === undefined) {
    return "Grains & Pulses";
  }
  const trimmed = String(categoryValue).trim();
  if (!trimmed) {
    return "Grains & Pulses";
  }
  const normalized = normalizeCategoryToPrimary(trimmed);
  return (normalized?.sheetName || trimmed || "Grains & Pulses").trim() || "Grains & Pulses";
}

/**
 * Inspects row headers and extracts category value in a schema-resilient manner.
 * Supports trimmed variations: 'Category', 'category', 'CATEGORY', etc.
 */
export function extractCategoryFromRow(
  row: Record<string, unknown> | Array<unknown>,
  headerRow?: string[]
): string {
  if (!row) {
    return "Grains & Pulses";
  }

  // Handle object row
  if (!Array.isArray(row) && typeof row === "object") {
    // Normalize keys with trimming
    const cleanRow: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(row)) {
      const cleanKey = key.trim();
      cleanRow[cleanKey] = val;
      cleanRow[cleanKey.toLowerCase()] = val;
    }

    const categoryValue =
      cleanRow["Category"] ||
      cleanRow["category"] ||
      cleanRow["CATEGORY"] ||
      cleanRow["Category Name"] ||
      cleanRow["category name"] ||
      cleanRow["category_name"] ||
      "";

    return sanitizeCategoryValue(categoryValue);
  }

  // Handle array row with headers
  if (Array.isArray(row)) {
    if (headerRow && headerRow.length > 0) {
      const cleanHeaders = headerRow.map((h) => String(h || "").trim().toLowerCase());
      const catIdx = cleanHeaders.findIndex((h) =>
        ["category", "categoryname", "category_name", "itemcategory"].includes(
          h.replace(/[\s_\-]/g, "")
        )
      );
      if (catIdx !== -1 && row[catIdx] !== undefined) {
        return sanitizeCategoryValue(row[catIdx]);
      }
    }
  }

  return "Grains & Pulses";
}

export {
  prepareImportProducts,
  prepareImportProductsFromWorkbook,
  normalizeCategoryToPrimary,
  parseCsvRows,
};
