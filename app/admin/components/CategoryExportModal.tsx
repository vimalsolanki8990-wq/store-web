"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  CheckSquare,
  Square,
  FileSpreadsheet,
  FileText,
  Check,
  AlertCircle,
} from "lucide-react";
import { Product } from "../../types/product";
import {
  PRIMARY_STORE_CATEGORIES,
  PrimaryCategoryConfig,
  normalizeCategoryToPrimary,
} from "../../lib/csvProductUtils";

export interface CategoryExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  storeCategories?: Array<{ id: string; name?: string }>;
  onExportExcel: (selectedSheetNames: string[]) => void;
  onExportCsv: (selectedSheetNames: string[]) => void;
}

export default function CategoryExportModal({
  isOpen,
  onClose,
  products,
  storeCategories,
  onExportExcel,
  onExportCsv,
}: CategoryExportModalProps) {
  // Selected category IDs from PRIMARY_STORE_CATEGORIES
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(PRIMARY_STORE_CATEGORIES.map((c) => c.id))
  );

  // Re-initialize selection to all 7 primary categories when opening modal
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(PRIMARY_STORE_CATEGORIES.map((c) => c.id)));
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Compute item counts mapped to each of the 7 primary categories
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of PRIMARY_STORE_CATEGORIES) {
      counts[cat.id] = 0;
    }
    for (const p of products) {
      const normalized = normalizeCategoryToPrimary(p.category, storeCategories);
      counts[normalized.id] = (counts[normalized.id] || 0) + 1;
    }
    return counts;
  }, [products, storeCategories]);

  // Total products in selected categories
  const selectedProductCount = useMemo(() => {
    let count = 0;
    for (const id of selectedIds) {
      count += categoryCounts[id] || 0;
    }
    return count;
  }, [selectedIds, categoryCounts]);

  if (!isOpen) return null;

  const isAllSelected = selectedIds.size === PRIMARY_STORE_CATEGORIES.length;
  const isNoneSelected = selectedIds.size === 0;

  const selectAll = () => {
    setSelectedIds(new Set(PRIMARY_STORE_CATEGORIES.map((c) => c.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const toggleCategory = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const getSelectedSheetNames = () => {
    return PRIMARY_STORE_CATEGORIES.filter((c) => selectedIds.has(c.id)).map(
      (c) => c.sheetName
    );
  };

  const handleExportExcelClick = () => {
    if (selectedIds.size === 0) return;
    onExportExcel(getSelectedSheetNames());
    onClose();
  };

  const handleExportCsvClick = () => {
    if (selectedIds.size === 0) return;
    onExportCsv(getSelectedSheetNames());
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-export-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex flex-col w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-700/80 bg-[#0f172a] shadow-2xl shadow-black/80">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-[#152036] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                Data Export Center
              </p>
              <h3 id="category-export-title" className="text-base font-black text-white sm:text-lg">
                Category-Wise Export
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Info Sub-banner */}
        <div className="border-b border-slate-800/80 bg-slate-900/60 px-5 py-3">
          <p className="text-xs text-slate-300 leading-relaxed">
            Exporting across the store&apos;s active 7 primary categories. Multi-sheet Excel (
            <span className="text-emerald-300 font-semibold">.xlsx</span>) creates a separate tab
            for each category with rate and stock details. Empty categories with 0 items are cleanly omitted.
          </p>
        </div>

        {/* Selection Controls Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-[#0c1322] px-5 py-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                isAllSelected
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-slate-800/70 text-slate-300 hover:bg-slate-700 border border-slate-700"
              }`}
            >
              <CheckSquare size={13} />
              <span>Select All</span>
            </button>
            <button
              type="button"
              onClick={deselectAll}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                isNoneSelected
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                  : "bg-slate-800/70 text-slate-300 hover:bg-slate-700 border border-slate-700"
              }`}
            >
              <Square size={13} />
              <span>Deselect All</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="font-semibold text-slate-200">
              {selectedIds.size} of {PRIMARY_STORE_CATEGORIES.length}
            </span>{" "}
            categories ({selectedProductCount} items)
          </div>
        </div>

        {/* Category List - STRICT 7 ACTIVE CATEGORIES */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2 max-h-[380px]">
          {PRIMARY_STORE_CATEGORIES.map((cat, idx) => {
            const isChecked = selectedIds.has(cat.id);
            const itemCount = categoryCounts[cat.id] || 0;

            return (
              <div
                key={cat.id}
                onClick={() => toggleCategory(cat.id)}
                className={`group flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer transition select-none ${
                  isChecked
                    ? "border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/15"
                    : "border-slate-800 bg-[#121c2e]/60 hover:border-slate-700 hover:bg-[#15233e]"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                      isChecked
                        ? "border-emerald-500 bg-emerald-500 text-slate-950 font-bold"
                        : "border-slate-600 bg-slate-800 text-transparent"
                    }`}
                  >
                    <Check size={13} strokeWidth={3} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-500">
                        {idx + 1}.
                      </span>
                      <span
                        className={`text-sm font-semibold truncate ${
                          isChecked ? "text-white" : "text-slate-300 group-hover:text-white"
                        }`}
                      >
                        {cat.displayName}
                      </span>
                    </div>
                  </div>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${
                    itemCount > 0
                      ? isChecked
                        ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
                        : "border-slate-700 bg-slate-800 text-slate-300"
                      : "border-slate-800/80 bg-slate-900/60 text-slate-500"
                  }`}
                >
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Warning if nothing selected */}
        {isNoneSelected && (
          <div className="flex items-center gap-2 px-5 py-2 bg-amber-500/10 border-t border-amber-500/20 text-xs text-amber-300">
            <AlertCircle size={14} className="shrink-0" />
            <span>Please select at least one category to export.</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 border-t border-slate-800 bg-[#152036] p-4 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition order-last sm:order-first"
          >
            Cancel
          </button>

          {/* Secondary: Single-Sheet CSV */}
          <button
            type="button"
            disabled={isNoneSelected}
            onClick={handleExportCsvClick}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-xs font-bold text-sky-200 hover:bg-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="Export selected categories into a single UTF-8 CSV"
          >
            <FileText size={15} />
            <span>Single-Sheet CSV</span>
          </button>

          {/* Primary Default: Multi-Sheet Excel (.xlsx) */}
          <button
            type="button"
            disabled={isNoneSelected}
            onClick={handleExportExcelClick}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-950/40 hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none transition"
            title="Export each selected category to its own sheet tab in Excel (.xlsx)"
          >
            <FileSpreadsheet size={16} />
            <span>Export Multi-Sheet Excel (.xlsx)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
