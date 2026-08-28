"use client";

// Product ask: clicking a photo thumbnail should just show that photo
// bigger, not navigate into a whole separate page. A plain full-screen
// overlay — click anywhere (or Esc) to close.

import { useEffect } from "react";

export function PhotoLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(5,7,15,0.86)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        cursor: "zoom-out",
      }}
    >
      <img
        src={url}
        alt=""
        style={{ maxWidth: "min(90vw, 640px)", maxHeight: "88vh", borderRadius: 16, boxShadow: "0 24px 80px rgba(0,0,0,0.5)", objectFit: "contain" }}
      />
    </div>
  );
}

/** Click handler helper: stops the row's own onClick (navigate to detail) from also firing. */
export function openLightbox(setUrl: (url: string) => void, url: string) {
  return (e: React.MouseEvent) => {
    e.stopPropagation();
    setUrl(url);
  };
}
