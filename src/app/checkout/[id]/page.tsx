"use client";

import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { Clock, AlertTriangle, CheckCircle, ArrowLeft, ShieldCheck, MapPin, Receipt, XCircle } from "lucide-react";

interface ReservationDetails {
  id: string;
  productId: string;
  productName: string;
  productPrice: number;
  productSku: string;
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string | null;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string;
  createdAt: string;
}

export default function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id: reservationId } = use(params);

  const [reservation, setReservation] = useState<ReservationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number>(0); // in milliseconds
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const currencyFormatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });

  const fetchReservation = async () => {
    try {
      const res = await fetch(`/api/reservations/${reservationId}`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Reservation not found.");
        }
        throw new Error("Failed to load reservation details.");
      }
      const data = await res.json();
      setReservation(data);

      if (data.status === "PENDING") {
        const expiry = new Date(data.expiresAt).getTime();
        const diff = expiry - Date.now();
        setTimeLeft(Math.max(0, diff));
      }
    } catch (err: any) {
      console.error(err);
      setErrorBanner(err.message || "An error occurred while loading checkout.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservation();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [reservationId]);

  // Countdown timer effect
  useEffect(() => {
    if (!reservation || reservation.status !== "PENDING") return;

    timerRef.current = setInterval(() => {
      const expiry = new Date(reservation.expiresAt).getTime();
      const diff = expiry - Date.now();

      if (diff <= 0) {
        setTimeLeft(0);
        if (timerRef.current) clearInterval(timerRef.current);
        // Reservation expired! Mark state as released locally
        setReservation((prev) => prev ? { ...prev, status: "RELEASED" } : null);
        setErrorBanner("Time's up! Your 10-minute hold has expired (Status 410 Gone) and the inventory has been released.");
      } else {
        setTimeLeft(diff);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [reservation]);

  const handleConfirm = async () => {
    if (!reservation) return;
    setIsProcessing(true);
    setErrorBanner(null);

    // Generate a unique idempotency key for confirming payment
    const idempotencyKey = `confirm-${reservation.id}`;

    try {
      const res = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
      });

      const data = await res.json();

      if (res.status === 410) {
        // Reservation has expired (Gone)
        setReservation((prev) => prev ? { ...prev, status: "RELEASED" } : null);
        setErrorBanner("Checkout Failed: This reservation has expired and the stock was already returned to the catalog (Status 410 Gone).");
      } else if (!res.ok) {
        throw new Error(data.error || "Payment confirmation failed");
      } else {
        // Confirm successful!
        setReservation((prev) => prev ? { ...prev, status: "CONFIRMED" } : null);
        setSuccessBanner("Payment confirmed successfully! Your stock unit is secured and order is in fulfillment.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorBanner(err.message || "An unexpected error occurred during confirmation.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!reservation) return;
    setIsProcessing(true);
    setErrorBanner(null);

    try {
      const res = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to cancel reservation");
      }

      setReservation((prev) => prev ? { ...prev, status: "RELEASED" } : null);
      setErrorBanner("Reservation cancelled. The stock has been immediately released back to the catalog.");
    } catch (err: any) {
      console.error(err);
      setErrorBanner(err.message || "Failed to cancel reservation.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper to format milliseconds to MM:SS
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getTimerClassName = () => {
    const totalSeconds = Math.floor(timeLeft / 1000);
    if (totalSeconds < 30) return "timer-countdown danger";
    if (totalSeconds < 120) return "timer-countdown warning";
    return "timer-countdown";
  };

  if (loading) {
    return (
      <div className="dashboard-container" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "400px", flexDirection: "column", gap: "1rem" }}>
        <div className="spinner" style={{ width: "2.5rem", height: "2.5rem" }}></div>
        <span style={{ color: "var(--text-secondary)" }}>Loading checkout details...</span>
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="dashboard-container">
        <div className="alert-banner alert-danger">
          <AlertTriangle size={20} />
          <div>Reservation not found. Please return to the catalog and reserve a product.</div>
        </div>
        <button onClick={() => router.push("/")} className="action-btn action-btn-secondary" style={{ width: "auto" }}>
          <ArrowLeft size={16} /> Return to Catalog
        </button>
      </div>
    );
  }

  const isPending = reservation.status === "PENDING";
  const isConfirmed = reservation.status === "CONFIRMED";
  const isReleased = reservation.status === "RELEASED";

  return (
    <div className="dashboard-container">
      {/* Back to Catalog */}
      <div style={{ marginBottom: "2rem" }}>
        <button
          onClick={() => router.push("/")}
          className="action-btn action-btn-secondary"
          style={{ width: "auto", display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <ArrowLeft size={16} /> Back to Product Catalog
        </button>
      </div>

      {/* Notifications */}
      {successBanner && (
        <div className="alert-banner alert-success" style={{ marginBottom: "2rem" }}>
          <CheckCircle size={20} className="shrink-0" />
          <div>{successBanner}</div>
        </div>
      )}

      {errorBanner && (
        <div className="alert-banner alert-danger" style={{ marginBottom: "2rem" }}>
          <div>{errorBanner}</div>
        </div>
      )}

      <header className="header" style={{ marginBottom: "2rem", borderBottom: "none", paddingBottom: 0 }}>
        <div className="header-title">
          <div className="page-kicker">Checkout / Reservation Hold</div>
          <h1>Secure Checkout</h1>
          <p>Confirm or release the hold before the timer runs out.</p>
        </div>
        <div className="header-status">
          {isPending && (
            <span className="badge-db" style={{ background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.2)", color: "var(--warning)" }}>
              Reservation Active
            </span>
          )}
          {isConfirmed && (
            <span className="badge-db" style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.2)", color: "var(--success)" }}>
              Paid & Secured
            </span>
          )}
          {isReleased && (
            <span className="badge-db" style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", color: "var(--danger)" }}>
              Hold Released
            </span>
          )}
        </div>
      </header>

      <div className="checkout-layout">
        {/* Main Content */}
        <div className="checkout-main">
          {/* Reservation Expiry Countdown */}
          <div className="glass-card timer-card">
            {isPending ? (
              <>
                <div className="timer-title">Time remaining to secure stock</div>
                <div className={getTimerClassName()}>{formatTime(timeLeft)}</div>
                <div className="timer-subtext">
                  After this timer reaches zero, your reserved units are returned to stock and other shoppers can purchase them.
                </div>
              </>
            ) : isConfirmed ? (
              <div style={{ padding: "1.5rem 0" }}>
                <CheckCircle size={64} style={{ color: "var(--success)", margin: "0 auto 1.5rem" }} />
                <h2 style={{ fontSize: "1.75rem", fontWeight: "800", marginBottom: "0.5rem" }}>Purchase Complete</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", maxWidth: "450px", margin: "0 auto" }}>
                  Thank you! Your payment succeeded. The physical stock unit in {reservation.warehouseName} has been permanently decremented.
                </p>
              </div>
            ) : (
              <div style={{ padding: "1.5rem 0" }}>
                <XCircle size={64} style={{ color: "var(--danger)", margin: "0 auto 1.5rem" }} />
                <h2 style={{ fontSize: "1.75rem", fontWeight: "800", marginBottom: "0.5rem" }}>Reservation Released</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", maxWidth: "450px", margin: "0 auto" }}>
                  This reservation is no longer active. The stock unit has been returned to {reservation.warehouseName} and is available for other shoppers.
                </p>
              </div>
            )}
          </div>

          {/* Reservation Details Table */}
          <div className="glass-card" style={{ padding: "1rem 0" }}>
            <div className="detail-row">
              <span className="detail-label">Reservation Reference ID</span>
              <span className="detail-val" style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {reservation.id}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Product Name</span>
              <span className="detail-val">{reservation.productName}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">SKU Reference</span>
              <span className="detail-val" style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>
                {reservation.productSku}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Fulfillment Warehouse</span>
              <span className="detail-val" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <div>{reservation.warehouseName}</div>
                {reservation.warehouseLocation && (
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.25rem", marginTop: "0.15rem" }}>
                    <MapPin size={10} /> {reservation.warehouseLocation}
                  </div>
                )}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Reserved Quantity</span>
              <span className="detail-val">{reservation.quantity} unit(s)</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Fulfillment Status</span>
              <span className="detail-val" style={{ color: isConfirmed ? "var(--success)" : isReleased ? "var(--danger)" : "var(--warning)" }}>
                {reservation.status}
              </span>
            </div>
          </div>
        </div>

        {/* Sidebar Order Summary */}
        <div className="checkout-sidebar">
          <div className="glass-card summary-card">
            <h2 className="summary-title">Order Summary</h2>
            <div className="summary-row">
              <span>{reservation.productName} (Qty {reservation.quantity})</span>
              <span>{currencyFormatter.format(reservation.productPrice * reservation.quantity)}</span>
            </div>
            <div className="summary-row">
              <span>Fulfillment Fee (Standard)</span>
              <span>FREE</span>
            </div>
            <div className="summary-row">
              <span>Tax (GST / Sales Tax)</span>
              <span>Calculated at next step</span>
            </div>

            <div className="summary-total">
              <span>Grand Total</span>
              <span>{currencyFormatter.format(reservation.productPrice * reservation.quantity)}</span>
            </div>

            {/* Actions */}
            <div className="checkout-actions">
              <button
                onClick={handleConfirm}
                disabled={!isPending || isProcessing}
                className="action-btn action-btn-primary"
              >
                {isProcessing && isPending ? (
                  <>
                    <div className="spinner"></div>
                    <span>Processing Payment...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={18} />
                    <span>Confirm Purchase (Pay Now)</span>
                  </>
                )}
              </button>

              <button
                onClick={handleCancel}
                disabled={!isPending || isProcessing}
                className="action-btn action-btn-secondary"
              >
                {isProcessing && !isPending ? (
                  <div className="spinner"></div>
                ) : (
                  "Cancel & Release Hold"
                )}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", color: "var(--text-muted)", fontSize: "0.75rem", padding: "0 0.5rem" }}>
            <Clock size={12} />
            <span>Guaranteed stock hold for 10 minutes. Early cancellations help other buyers!</span>
          </div>
        </div>
      </div>
    </div>
  );
}
