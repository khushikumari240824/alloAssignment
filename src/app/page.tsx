"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, RefreshCw, AlertCircle, ShoppingBag } from "lucide-react";

interface StockLevel {
  warehouseId: string;
  warehouseName: string;
  location: string | null;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  stockLevels: StockLevel[];
}

export default function CatalogPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [reservingKey, setReservingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchProducts = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setIsRefreshing(true);
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch products");
      const data = await res.json();
      setProducts(data);
      setErrorMessage(null);
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Could not load products. Please ensure the database is seeded and try again.");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleReserve = async (productId: string, warehouseId: string) => {
    const key = `${productId}-${warehouseId}`;
    setReservingKey(key);
    setErrorMessage(null);

    // Generate a client-side UUID for the Idempotency-Key
    const idempotencyKey = crypto.randomUUID();

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          productId,
          warehouseId,
          quantity: 1,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        // Stock not available (race condition)
        setErrorMessage(`Stock depletion alert: The last unit was just reserved by another shopper. (Status 409 Conflict)`);
        // Refresh products to show updated stock
        fetchProducts();
      } else if (!res.ok) {
        throw new Error(data.error || "Failed to create reservation");
      } else {
        // Reservation success! Redirect to checkout page
        router.push(`/checkout/${data.reservation.id}`);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "An unexpected error occurred during reservation.");
    } finally {
      setReservingKey(null);
    }
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="header">
        <div className="header-title">
          <h1>Allo Fulfillment Platform</h1>
          <p>Real-time inventory mapping and checkout reservation manager</p>
        </div>
        <div className="header-status">
          <div className="badge-db">Live DB Connected</div>
          <button
            onClick={() => fetchProducts(true)}
            disabled={isRefreshing || loading}
            className="action-btn action-btn-secondary"
            style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", width: "auto", marginTop: 0 }}
            title="Refresh Inventory Counts"
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
            {isRefreshing ? "Refreshing..." : "Refresh Stock"}
          </button>
        </div>
      </header>

      {/* Global Errors */}
      {errorMessage && (
        <div className="alert-banner alert-danger">
          <AlertCircle size={20} className="shrink-0" />
          <div>{errorMessage}</div>
        </div>
      )}

      {/* Loading States */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "300px", flexDirection: "column", gap: "1rem" }}>
          <div className="spinner" style={{ width: "2.5rem", height: "2.5rem" }}></div>
          <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Loading live catalog and stock levels...</span>
        </div>
      ) : products.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 2rem", background: "var(--panel-bg)", border: "1px dashed var(--panel-border)", borderRadius: "var(--radius-lg)" }}>
          <ShoppingBag size={48} style={{ margin: "0 auto 1.5rem", color: "var(--text-muted)" }} />
          <h3 style={{ fontSize: "1.25rem", fontWeight: "700", marginBottom: "0.5rem" }}>No products found</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", maxWidth: "400px", margin: "0 auto 1.5rem" }}>
            The database appears to be empty. Run the migrations and seed script to populate products and warehouses.
          </p>
        </div>
      ) : (
        /* Products Grid */
        <main className="products-grid">
          {products.map((product) => (
            <article key={product.id} className="glass-card product-card">
              <div className="product-image-container">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="product-img"
                    loading="lazy"
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.02)" }}>
                    <Package size={40} style={{ color: "var(--text-muted)" }} />
                  </div>
                )}
              </div>

              <div className="product-info">
                <div className="product-meta">
                  <h2 className="product-title">{product.name}</h2>
                  <span className="product-price">${product.price.toFixed(2)}</span>
                </div>
                <span className="product-sku">{product.sku}</span>

                <p className="product-description">{product.description}</p>

                {/* Stock Levels breakdown per Warehouse */}
                <div className="stock-levels-container">
                  <h3 className="stock-title">Warehouse Inventory</h3>
                  {product.stockLevels.map((stock) => {
                    const key = `${product.id}-${stock.warehouseId}`;
                    const isReserving = reservingKey === key;
                    const isOutOfStock = stock.availableUnits <= 0;

                    return (
                      <div key={stock.warehouseId} className="stock-row">
                        <div className="warehouse-info">
                          <span className="warehouse-name">{stock.warehouseName}</span>
                          <span className="warehouse-loc">{stock.location || "Default Location"}</span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
                          <div className="stock-count-box">
                            <div className="stock-available" style={{ color: isOutOfStock ? "var(--danger)" : "var(--text-primary)" }}>
                              {isOutOfStock ? "Out of Stock" : `${stock.availableUnits} available`}
                            </div>
                            <div className="stock-breakdown">
                              Total: {stock.totalUnits} | Held: {stock.reservedUnits}
                            </div>
                          </div>

                          <button
                            onClick={() => handleReserve(product.id, stock.warehouseId)}
                            disabled={isOutOfStock || reservingKey !== null}
                            className="reserve-btn"
                          >
                            {isReserving ? (
                              <>
                                <div className="spinner"></div>
                                <span>Holding...</span>
                              </>
                            ) : (
                              "Reserve Unit"
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </article>
          ))}
        </main>
      )}
    </div>
  );
}
