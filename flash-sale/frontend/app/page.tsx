import Link from 'next/link';
import styles from '../styles/page.module.scss';

// Enable Incremental Static Regeneration (ISR) - Revalidate cache every 10 seconds
export const revalidate = 10;

interface EventItem {
  id: number;
  name: string;
  totalTickets: number;
  availableTickets: number;
}

async function getEvents(): Promise<EventItem[]> {
  try {
    const res = await fetch('http://localhost:3001/api/events', {
      next: { revalidate } // Native Next.js fetch caching integration
    });
    
    if (!res.ok) {
      console.warn(`Failed to fetch events data. Status: ${res.status}`);
      return [];
    }
    
    return await res.json();
  } catch (error) {
    // Prevents Vercel build from crashing when backend is offline
    console.warn('Backend unavailable during build time. Using fallback empty list.');
    return [];
  }
}

export default async function HomePage() {
  const events = await getEvents();

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Upcoming Flash Sale Events</h1>
        <p className={styles.description}>
          Select an active event below to secure your tickets in real-time.
        </p>

        <div className={styles.eventList}>
          {events.length === 0 ? (
            <p className={styles.description}>No active events available at the moment.</p>
          ) : (
            events.map((event) => {
              const isSoldOut = event.availableTickets === 0;
              
              return (
                <div key={event.id} className={styles.eventItem}>
                  <div className={styles.eventInfo}>
                    <h3>{event.name}</h3>
                    <p>
                      Tickets Available: <strong>{event.availableTickets}</strong> / {event.totalTickets}
                    </p>
                  </div>
                  
                  <div>
                    <Link 
                      href={`/event/${event.id}`}
                      className={`${styles.button} ${isSoldOut ? styles.soldOut : ''}`}
                    >
                      {isSoldOut ? 'Sold Out' : 'View Event'}
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
