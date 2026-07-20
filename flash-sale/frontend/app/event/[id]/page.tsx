"use client";

import { useEffect, useState, use } from "react";
import useSWR from "swr";
import { TEXTS } from "../../../config/constants";
import styles from "../../../styles/page.module.scss";

interface EventDetails {
  id: number;
  name: string;
  totalTickets: number;
  availableTickets: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const userId = "user_123"; // Static user ID for recruitment task purposes

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isReserving, setIsReserving] = useState<boolean>(false);
  const [isPaying, setIsPaying] = useState<boolean>(false);

  // Track the active reservation
  const [reservedTicketId, setReservedTicketId] = useState<number | null>(null);
  const [isPaid, setIsPaid] = useState<boolean>(false);

  // SWR handles data fetching and real-time caching with explicit EventDetails typing
  const { data, mutate } = useSWR<EventDetails>(
    `http://localhost:3001/api/events/${id}`,
    fetcher,
  );

  // Connect to Server-Sent Events (SSE) for real-time ticket updates
  useEffect(() => {
    const eventSource = new EventSource(
      `http://localhost:3001/api/events/${id}/live`,
    );

    eventSource.onmessage = (event) => {
      const liveData = JSON.parse(event.data);
      
      // Using functional update with explicit type declaration to prevent ESLint 'no-explicit-any' warnings
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

  // Handle temporary 5-minute ticket reservation
  const handleReserve = async () => {
    if (!data || data.availableTickets <= 0 || reservedTicketId) return;

    setIsReserving(true);
    setError(null);
    setSuccessMessage(null);

    // Optimistic UI Update: Decrease counter immediately for better UX
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
      // Revert Optimistic UI update if database transaction fails
      mutate();
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

  // Handle reservation payment settlement
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
            className={`${styles.button} ${isSoldOut || isReserving ? styles.disabled : ""}`}
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
