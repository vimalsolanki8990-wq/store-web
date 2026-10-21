"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { ZoomIn, ZoomOut, Move, RotateCcw, Check, X, Crop } from "lucide-react";

export interface ImageCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  aspectRatio: number; // e.g. 1 for square, 16/9 for banner
  title?: string;
  outputWidth?: number;
  outputHeight?: number;
  onConfirm: (croppedDataUrl: string) => void;
}

export function ImageCropModal({
  isOpen,
  onClose,
  imageSrc,
  aspectRatio = 1,
  title = "Crop & Position Image",
  outputWidth = 600,
  outputHeight = 600,
  onConfirm,
}: ImageCropModalProps) {
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset zoom and pan when image or modal opens
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPanX(0);
      setPanY(0);
      setIsDragging(false);
    }
  }, [isOpen, imageSrc]);

  // Read natural image dimensions
  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({
      width: img.naturalWidth || 600,
      height: img.naturalHeight || 600,
    });
  };

  // Drag to pan handling
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setPanX(e.clientX - dragStart.x);
    setPanY(e.clientY - dragStart.y);
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch handling for mobile drag
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - panX,
        y: e.touches[0].clientY - panY,
      });
    }
  };

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    setPanX(e.touches[0].clientX - dragStart.x);
    setPanY(e.touches[0].clientY - dragStart.y);
  }, [isDragging, dragStart]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove);
      window.addEventListener("touchend", handleTouchEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  const handleReset = () => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  };

  // Process and crop via Canvas
  const handleApply = async () => {
    if (!imageRef.current || !containerRef.current) return;
    setIsProcessing(true);

    try {
      const container = containerRef.current;
      const cropBoxWidth = container.clientWidth;
      const cropBoxHeight = container.clientHeight;

      const img = imageRef.current;
      const imgWidth = img.naturalWidth || cropBoxWidth;
      const imgHeight = img.naturalHeight || cropBoxHeight;

      // Base dimensions inside container
      const boxAspect = cropBoxWidth / cropBoxHeight;
      const imgAspect = imgWidth / imgHeight;

      let baseWidth: number;
      let baseHeight: number;

      if (imgAspect > boxAspect) {
        baseHeight = cropBoxHeight;
        baseWidth = cropBoxHeight * imgAspect;
      } else {
        baseWidth = cropBoxWidth;
        baseHeight = cropBoxWidth / imgAspect;
      }

      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context is not available.");

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Scale factor from preview container to output canvas
      const scaleFactor = outputWidth / cropBoxWidth;

      ctx.save();
      const centerX = outputWidth / 2 + panX * scaleFactor;
      const centerY = outputHeight / 2 + panY * scaleFactor;
      ctx.translate(centerX, centerY);
      ctx.scale(zoom, zoom);

      const scaledBaseWidth = baseWidth * scaleFactor;
      const scaledBaseHeight = baseHeight * scaleFactor;

      ctx.drawImage(
        img,
        -scaledBaseWidth / 2,
        -scaledBaseHeight / 2,
        scaledBaseWidth,
        scaledBaseHeight
      );
      ctx.restore();

      // Export as optimized WebP or JPEG
      let dataUrl = canvas.toDataURL("image/webp", 0.82);
      if (!dataUrl.startsWith("data:image/webp")) {
        dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      }

      // If dataURL exceeds 600KB, re-export at slightly lower quality
      if (dataUrl.length > 700_000) {
        dataUrl = canvas.toDataURL("image/webp", 0.70);
      }

      onConfirm(dataUrl);
      onClose();
    } catch (err) {
      console.error("Image crop failed:", err);
      alert("Unable to adjust this image. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  // Determine container styling based on aspect ratio
  const isWidescreen = aspectRatio > 1.2;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-5">
      <div
        role="dialog"
        aria-modal="true"
        className="relative my-auto flex max-h-[95dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-[#34445f] bg-[#0c1322] shadow-2xl text-white animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Processing Spinner Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-xs">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-orange-400 border-t-transparent" />
            <p className="mt-3 text-xs font-bold text-orange-200">Processing & saving image…</p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#23334d] bg-[#111c30] px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <Crop size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">{title}</h3>
              <p className="text-[10px] text-slate-400">
                {isWidescreen ? "16:9 Banner container ratio" : "1:1 Square container ratio"} · Drag to reposition
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#34445f] bg-[#152036] text-slate-400 hover:text-white hover:border-slate-400 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Live Box Preview Viewport */}
        <div className="flex flex-col items-center justify-center bg-[#070b14] p-4 sm:p-6 overflow-hidden select-none">
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            className={`relative overflow-hidden rounded-2xl border-2 border-orange-500/80 shadow-2xl shadow-orange-950/40 cursor-grab active:cursor-grabbing bg-black/50 ${
              isWidescreen
                ? "w-full max-w-[380px] sm:max-w-[420px] aspect-video"
                : "w-56 h-56 sm:w-64 sm:h-64 aspect-square"
            }`}
          >
            {/* Guide Grid overlay */}
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 z-10">
              <div className="border-r border-b border-white/15" />
              <div className="border-r border-b border-white/15" />
              <div className="border-b border-white/15" />
              <div className="border-r border-b border-white/15" />
              <div className="border-r border-b border-white/15" />
              <div className="border-b border-white/15" />
              <div className="border-r border-b border-white/15" />
              <div className="border-r border-b border-white/15" />
              <div />
            </div>

            {/* Corner Alignment Badges */}
            <div className="pointer-events-none absolute top-2 left-2 z-10 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-mono text-orange-300 backdrop-blur-xs">
              {isWidescreen ? "16:9 Banner" : "1:1 Product"}
            </div>

            {/* The Image inside container */}
            <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
              <img
                ref={imageRef}
                src={imageSrc}
                alt="Preview to adjust"
                onLoad={onImageLoad}
                draggable={false}
                style={{
                  transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
                  transformOrigin: "center center",
                  transition: isDragging ? "none" : "transform 0.05s ease-out",
                  maxWidth: "none",
                  maxHeight: "none",
                }}
                className={`select-none pointer-events-none ${
                  naturalSize.width / naturalSize.height > aspectRatio
                    ? "h-full w-auto"
                    : "w-full h-auto"
                }`}
              />
            </div>
          </div>

          <p className="mt-2.5 text-[11px] text-slate-400 flex items-center gap-1.5">
            <Move size={12} className="text-orange-400" />
            Drag photo with mouse or finger to adjust position
          </p>
        </div>

        {/* Intuitive Controls (Zoom & Sliders) */}
        <div className="space-y-3.5 border-t border-[#23334d] bg-[#111c30] p-4 sm:p-5">
          {/* Zoom Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-200">
              <span className="flex items-center gap-1.5 text-amber-300">
                <ZoomIn size={14} /> Zoom Level
              </span>
              <span className="font-mono text-xs rounded-md bg-[#1a2942] px-2 py-0.5 text-orange-300">
                {zoom.toFixed(2)}x
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setZoom((prev) => Math.max(1, +(prev - 0.1).toFixed(2)))}
                aria-label="Zoom out"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#34445f] bg-[#1a2942] text-slate-300 hover:text-white"
              >
                <ZoomOut size={14} />
              </button>
              <input
                type="range"
                min="1"
                max="3"
                step="0.02"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-[#1f2f4c] accent-orange-500"
              />
              <button
                type="button"
                onClick={() => setZoom((prev) => Math.min(3, +(prev + 0.1).toFixed(2)))}
                aria-label="Zoom in"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#34445f] bg-[#1a2942] text-slate-300 hover:text-white"
              >
                <ZoomIn size={14} />
              </button>
            </div>
          </div>

          {/* Quick Center Reset */}
          <div className="flex items-center justify-between gap-2 pt-1 text-xs">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#34445f] bg-[#152036] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-[#1a2942] transition"
            >
              <RotateCcw size={12} /> Reset Center
            </button>
            <span className="text-[10px] text-slate-500 font-mono">
              X: {Math.round(panX)}px · Y: {Math.round(panY)}px
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 flex-1 rounded-xl border border-[#34445f] bg-[#152036] px-4 py-2 text-xs sm:text-sm font-bold text-slate-300 hover:text-white hover:bg-[#1a2942] transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={isProcessing}
              className="min-h-11 flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 px-4 py-2 text-xs sm:text-sm font-black text-white shadow-lg shadow-orange-950/40 transition active:scale-95 flex items-center justify-center gap-1.5"
            >
              <Check size={16} /> Confirm Crop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
