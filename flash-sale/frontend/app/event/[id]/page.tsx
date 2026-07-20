"use client";

import { useEffect, useState, use } from "react";
import useSWR from "swr";
import { TEXTS } from "../../../config/constants";
import styles from "../../../styles/page.module.scss";

// Force dynamic rendering to prevent build-time ECONNREFUSED errors on Vercel
export const dynamic = 'force-dynamic';

interface EventDetails {
  id: number;
  name: string;
  totalTickets: number;
  availableTickets: number;
}

const fetcher = (url: string) => 
  fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error("Failed to fetch event data");
      return res.json();
    })
    .catch((err) => {
      console.warn("Background fetcher error:", err.message);
      return null;
    });

export default function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const userId = "user_123"; // Mock user ID for recruitment task purposes

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isReserving, setIsReserving] = useState<boolean>(false);
  const [isPaying, setIsPaying] = useState<boolean>(false);
  const [reservedTicketId, setReservedTicketId] = useState<number | null>(null);
  const [isPaid, setIsPaid] = useState<boolean>(false);

  const { data, mutate } = useSWR<EventDetails>(
    `http://localhost:3001/api/events/${id}`,
    fetcher,
  );

  // Connect to Server-Sent Events (SSE) for real-time ticket updates
  useEffect(() => {
    if (typeof window === 'undefined') return; // Prevent execution during server-side build phase

    const eventSource = new EventSource(
      `http://localhost:3001/api/events/${id}/live`,
    );

    eventSource.onmessage = (event) => {
      const liveData = JSON.parse(event.data);
      
      mutate(
        (currentData: EventDetails | undefined) => {
          if (!currentData) return currentData;
          return { ...currentData, availableTickets: liveData.availableTickets };
        },
        false,
      );
    };

    return () => eventSource.close();
  }, [id, mutate]);

  const handleReserve = async () => {
    if (!data || data.availableTickets <= 0 || reservedTicketId) return;

    setIsReserving(true);
    setError(null);
    setSuccessMessage(null);

    // Optimistic UI update: decrease counter immediately for better UX
    const optimisticData = {
      ...data,
      availableTickets: data.availableTickets - 1,
    };
    mutate(optimisticData, false);

    try {
      const response = await fetch("http://localhost:3001/api/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: parseInt(id, 10), userId }),
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || TEXTS.ERR_GENERAL);
      }

      setReservedTicketId(resData.ticketId);
      setSuccessMessage(
        "Ticket reserved! You have 5 minutes to complete the payment.",
      );
    } catch (err) {
      mutate(); // Revert optimistic update if the reservation fails
      const errorMessage = err instanceof Error ? err.message : "";
      setError(
        errorMessage === "Tickets are sold out."
          ? TEXTS.ERR_SOLD_OUT
          : TEXTS.ERR_GENERAL,
      );
    } finally {
      setIsReserving(false);
    }
  };

  const handlePay = async () => {
    if (!reservedTicketId || isPaying) return;

    setIsPaying(true);
    setError(null);

    try {
      const response = await fetch("http://localhost:3001/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: reservedTicketId, userId }),
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || "Payment failed.");
      }

      setIsPaid(true);
      setReservedTicketId(null);
      setSuccessMessage(
        "Payment successful! Your ticket is permanently secured.",
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Payment error occurred.";
      setError(errorMessage);
    } finally {
      setIsPaying(false);
    }
  };

  if (!data) return <div>Loading event...</div>;

  const isSoldOut = data.availableTickets === 0;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>{data.name || TEXTS.TITLE}</h1>
        <p>{TEXTS.SUBTITLE}</p>

        <div className={styles.counter}>
          <span>{TEXTS.AVAILABLE_TICKETS}</span>
          <strong>{data.availableTickets}</strong>
        </div>

        {!reservedTicketId && !isPaid && (
          <button
            className={`${styles.button} ${isSoldOut || isReserving ? styles.soldOut : ""}`}
            onClick={handleReserve}
            disabled={isSoldOut || isReserving}
          >
            {isReserving
              ? TEXTS.BTN_LOADING
              : isSoldOut
                ? TEXTS.BTN_SOLD_OUT
                : TEXTS.BTN_RESERVE}
          </button>
        )}

        {reservedTicketId && !isPaid && (
          <button
            className={styles.button}
            onClick={handlePay}
            disabled={isPaying}
          >
            {isPaying ? "Processing Payment..." : "Pay for Ticket Now"}
          </button>
        )}

        {error && <p className={styles.error}>{error}</p>}
        {successMessage && <p className={styles.success}>{successMessage}</p>}

        {isPaid && (
          <div className={styles.success} style={{ fontSize: "1.2rem", marginTop: "1.5rem" }}>
            🎟️ Ticket Confirmed
          </div>
        )}
      </div>
    </div>
  );
}