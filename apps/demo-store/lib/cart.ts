// Client-only, localStorage-backed. Lumi Frame's widget never touches
// this directly (ARCHITECTURE.md §1: we don't own cart/checkout) — it
// only emits `tryon:add-to-cart`, which this store's own page listens for
// and reacts to, exactly like a real merchant's theme code would.

export interface CartItem {
  productId: string;
  title: string;
  price: number;
  currency: string;
  quantity: number;
}

const CART_KEY = "lumiframe_demo_cart";

function read(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

function write(items: CartItem[]): void {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("demo-cart:changed", { detail: items }));
  } catch {
    // storage unavailable — cart just won't persist across reloads
  }
}

export function getCart(): CartItem[] {
  return read();
}

export function addToCart(item: Omit<CartItem, "quantity">): CartItem[] {
  const items = read();
  const existing = items.find((i) => i.productId === item.productId);
  if (existing) existing.quantity += 1;
  else items.push({ ...item, quantity: 1 });
  write(items);
  return items;
}

export function clearCart(): void {
  write([]);
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}
