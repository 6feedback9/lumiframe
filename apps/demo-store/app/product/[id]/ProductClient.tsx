"use client";

import { useEffect } from "react";
import type { Product } from "@/lib/catalog";
import { addToCart } from "@/lib/cart";

declare global {
  interface Window {
    TryOn?: {
      attach: (product: Record<string, unknown>) => void;
      open: () => void;
    };
  }
}

export function ProductClient({ product }: { product: Product }) {
  // Attach the current product every time this page is shown — this is
  // the "explicit configuration" priority-1 detection layer from
  // ARCHITECTURE.md §8 / packages/sdk/README.md. A real merchant's theme
  // would call this from the product template.
  useEffect(() => {
    const imageUrl = new URL(product.image, window.location.origin).toString();
    const productUrl = new URL(`/product/${product.id}`, window.location.origin).toString();

    window.TryOn?.attach({
      productId: product.id,
      productTitle: product.title,
      productImageUrl: imageUrl,
      productUrl,
      price: product.price,
      currency: product.currency,
      sku: product.sku,
    });
  }, [product]);

  // The widget never touches this store's cart directly (ARCHITECTURE.md
  // §1/§47) — it only emits `tryon:add-to-cart`, and this page reacts to
  // it exactly like any other merchant's theme code would.
  useEffect(() => {
    function onAddToCart() {
      addToCart({ productId: product.id, title: product.title, price: product.price, currency: product.currency });
      window.location.href = "/cart";
    }
    document.addEventListener("tryon:add-to-cart", onAddToCart);
    return () => document.removeEventListener("tryon:add-to-cart", onAddToCart);
  }, [product]);

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => window.TryOn?.open()}>
        Try on your face
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          addToCart({ productId: product.id, title: product.title, price: product.price, currency: product.currency });
          window.location.href = "/cart";
        }}
      >
        Add to cart
      </button>
    </>
  );
}
