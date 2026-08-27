"use client";

import { useEffect, useState } from "react";
import { cartTotal, clearCart, getCart, type CartItem } from "@/lib/cart";

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [justOrdered, setJustOrdered] = useState(false);

  useEffect(() => {
    setItems(getCart());
    const onChange = (e: Event) => setItems((e as CustomEvent<CartItem[]>).detail);
    window.addEventListener("demo-cart:changed", onChange);
    return () => window.removeEventListener("demo-cart:changed", onChange);
  }, []);

  function checkout() {
    // Fake checkout only — this demo store doesn't create a real Order or
    // call the API. Wiring add-to-cart/order events to real attribution
    // (ARCHITECTURE.md §10, §26-28) is Phase 3's OrderTrackingAdapter work,
    // not part of this Phase 1 slice.
    clearCart();
    setItems([]);
    setJustOrdered(true);
  }

  return (
    <div className="container" style={{ maxWidth: 560 }}>
      <h1 className="product-title">Your cart</h1>

      {justOrdered && <div className="success-banner">Order placed — thanks! (simulated, no real checkout)</div>}

      {items.length === 0 ? (
        <div className="empty-state">Your cart is empty.</div>
      ) : (
        <>
          {items.map((item) => (
            <div className="cart-row" key={item.productId}>
              <span>
                {item.title} × {item.quantity}
              </span>
              <span>
                {item.price * item.quantity} {item.currency}
              </span>
            </div>
          ))}
          <div className="cart-total">
            <span>Total</span>
            <span>
              {cartTotal(items)} {items[0]?.currency}
            </span>
          </div>
          <button type="button" className="btn btn-primary" style={{ marginTop: 20 }} onClick={checkout}>
            Checkout
          </button>
        </>
      )}
    </div>
  );
}
