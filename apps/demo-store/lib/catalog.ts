// The merchant's own product data — this is what ARCHITECTURE.md §1 means
// by "the merchant's existing product page is the source of truth". Lumi
// Frame never imports or owns this; it's here only because this whole app
// IS the fake merchant for integration testing.

export interface Product {
  id: string;
  sku: string;
  title: string;
  price: number;
  currency: string;
  image: string;
  description: string;
}

export const CATALOG: Product[] = [
  {
    id: "aviator-classic",
    sku: "LF-AV-001",
    title: "Aviator Classic",
    price: 129,
    currency: "USD",
    image: "/products/aviator.svg",
    description: "The original teardrop silhouette, in polished gunmetal.",
  },
  {
    id: "wayfarer-bold",
    sku: "LF-WF-002",
    title: "Wayfarer Bold",
    price: 149,
    currency: "USD",
    image: "/products/wayfarer.svg",
    description: "A confident, squared-off acetate frame in matte black.",
  },
  {
    id: "round-gold",
    sku: "LF-RG-003",
    title: "Round Gold",
    price: 119,
    currency: "USD",
    image: "/products/round-gold.svg",
    description: "Thin gold-tone round frames with a minimal keyhole bridge.",
  },
  {
    id: "cat-eye-rouge",
    sku: "LF-CE-004",
    title: "Cat-Eye Rouge",
    price: 159,
    currency: "USD",
    image: "/products/cat-eye.svg",
    description: "A dramatic upswept cat-eye in a deep burgundy acetate.",
  },
];

export function getProduct(id: string): Product | undefined {
  return CATALOG.find((p) => p.id === id);
}
