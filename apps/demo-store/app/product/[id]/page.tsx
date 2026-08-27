import { notFound } from "next/navigation";
import { getProduct } from "@/lib/catalog";
import { ProductClient } from "./ProductClient";

export default function ProductPage({ params }: { params: { id: string } }) {
  const product = getProduct(params.id);
  if (!product) notFound();

  return (
    <div className="container">
      <div className="product-layout">
        <img className="product-image" src={product.image} alt={product.title} />
        <div>
          <h1 className="product-title">{product.title}</h1>
          <div className="product-price">
            {product.price} {product.currency}
          </div>
          <p className="product-desc">{product.description}</p>
          <ProductClient product={product} />
        </div>
      </div>
    </div>
  );
}
