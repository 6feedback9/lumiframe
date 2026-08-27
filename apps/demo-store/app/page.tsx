import { CATALOG } from "@/lib/catalog";

export default function CatalogPage() {
  return (
    <div className="container">
      <div className="grid">
        {CATALOG.map((product) => (
          <a key={product.id} className="card" href={`/product/${product.id}`}>
            <img src={product.image} alt={product.title} />
            <div className="card-body">
              <div className="card-title">{product.title}</div>
              <div className="card-price">
                {product.price} {product.currency}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
