import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Store connected clients for Server-Sent Events (SSE)
const clients = new Map<number, Set<express.Response>>();

// Helper function to emit the current ticket count via SSE to connected clients
async function emitTicketUpdate(eventId: number) {
  try {
    const tickets = await prisma.ticket.findMany({
      where: { eventId }
    });
    
    const now = new Date();
    const availableCount = tickets.filter(t => 
      t.status === 'AVAILABLE' || 
      (t.status === 'RESERVED' && t.reservedAt && (now.getTime() - t.reservedAt.getTime()) > 5 * 60 * 1000)
    ).length;

    const eventClients = clients.get(eventId);
    if (eventClients) {
      const message = `data: ${JSON.stringify({ availableTickets: availableCount })}\n\n`;
      eventClients.forEach(client => client.write(message));
    }
  } catch (error) {
    console.error('Error emitting ticket update:', error);
  }
}

// 0. GET ALL EVENTS (Used for SSG/ISR Landing Page)
app.get('/api/events', async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      include: { tickets: true }
    });

    const now = new Date();
    
    const formattedEvents = events.map(event => {
      const availableTickets = event.tickets.filter(ticket => {
        if (ticket.status === 'AVAILABLE') return true;
        if (ticket.status === 'RESERVED' && ticket.reservedAt) {
          const diff = now.getTime() - ticket.reservedAt.getTime();
          return diff > 5 * 60 * 1000;
        }
        return false;
      }).length;

      return {
        id: event.id,
        name: event.name,
        totalTickets: event.totalTickets,
        availableTickets
      };
    });

    res.json(formattedEvents);
  } catch (error) {
    console.error('Error fetching events list:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 1. GET EVENT DETAILS (Includes 5-minute reservation expiration logic)
app.get('/api/events/:id', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    if (isNaN(eventId)) return res.status(400).json({ error: 'Invalid event ID' });

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { tickets: true }
    });

    if (!event) return res.status(404).json({ error: 'Event not found' });

    const now = new Date();
    const availableTickets = event.tickets.filter(ticket => {
      if (ticket.status === 'AVAILABLE') return true;
      if (ticket.status === 'RESERVED' && ticket.reservedAt) {
        const diff = now.getTime() - ticket.reservedAt.getTime();
        return diff > 5 * 60 * 1000;
      }
      return false;
    }).length;

    res.json({
      id: event.id,
      name: event.name,
      totalTickets: event.totalTickets,
      availableTickets
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2. TICKET RESERVATION (Concurrency safe + 5-minute expiration lock)
app.post('/api/reserve', async (req, res) => {
  const { eventId, userId } = req.body;

  if (!eventId || !userId) {
    return res.status(400).json({ error: 'Missing eventId or userId' });
  }

  try {
    const now = new Date();

    // Using Prisma Interactive Transaction to guarantee database consistency
    const result = await prisma.$transaction(async (tx) => {
      // PESSIMISTIC LOCKING: Find exactly one available or expired ticket and lock the row.
      // Uses native PostgreSQL UTC time alignment to prevent application/database timezone mismatches.
      const availableTickets: any[] = await tx.$queryRaw`
        SELECT id FROM "Ticket" 
        WHERE "eventId" = ${parseInt(eventId, 10)} 
        AND ("status" = 'AVAILABLE' OR ("status" = 'RESERVED' AND "reservedAt" < (NOW() AT TIME ZONE 'UTC') - INTERVAL '5 minutes'))
        LIMIT 1 
        FOR UPDATE SKIP LOCKED
      `;

      if (!availableTickets || availableTickets.length === 0) {
        throw new Error('SOLD_OUT');
      }

      const ticketToReserve = availableTickets[0];

      const updatedTicket = await tx.ticket.update({
        where: { id: ticketToReserve.id },
        data: {
          status: 'RESERVED',
          reservedAt: now,
          userId: userId
        }
      });

      return updatedTicket;
    });

    await emitTicketUpdate(parseInt(eventId, 10));
    return res.json({ success: true, message: 'Ticket reserved for 5 minutes', ticketId: result.id });

  } catch (error: any) {
    if (error.message === 'SOLD_OUT') {
      return res.status(400).json({ error: 'Tickets are sold out.' });
    }
    console.error('Reservation error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 3. PAYMENT ENDPOINT (Finalizes reservation and sets status to PAID)
app.post('/api/pay', async (req, res) => {
  const { ticketId, userId } = req.body;

  if (!ticketId || !userId) {
    return res.status(400).json({ error: 'Missing ticketId or userId' });
  }

  try {
    const now = new Date();
    const expirationThreshold = new Date(now.getTime() - 5 * 60 * 1000);

    // Verify the ticket belongs to the user, is currently reserved, and hasn't expired yet
    const ticket = await prisma.ticket.findFirst({
      where: {
        id: parseInt(ticketId, 10),
        userId: userId,
        status: 'RESERVED',
        reservedAt: {
          gte: expirationThreshold
        }
      }
    });

    if (!ticket) {
      return res.status(400).json({ error: 'Reservation expired or ticket not found.' });
    }

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'PAID' }
    });

    await emitTicketUpdate(ticket.eventId);
    return res.json({ success: true, message: 'Payment successful. Ticket secured!' });

  } catch (error) {
    console.error('Payment error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4. SERVER-SENT EVENTS (SSE) ENDPOINT FOR REAL-TIME UPDATES
app.get('/api/events/:id/live', (req, res) => {
  const eventId = parseInt(req.params.id, 10);
  if (isNaN(eventId)) return res.status(400).json({ error: 'Invalid event ID' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!clients.has(eventId)) {
    clients.set(eventId, new Set());
  }
  clients.get(eventId)?.add(res);

  req.on('close', () => {
    clients.get(eventId)?.delete(res);
  });
});

// POTĘŻNY ENDPOINT SEEDUJĄCY - GENERUJE WYDARZENIE I 150 BILETÓW
app.get('/api/fix-database', async (req, res) => {
  try {
    // 1. Czyszczenie starych danych, aby uniknąć konfliktów ID
    await prisma.ticket.deleteMany({});
    await prisma.event.deleteMany({});
    console.log('Stare dane wyczyszczone.');

    // 2. Tworzenie wydarzenia głównego
    const event = await prisma.event.create({
      data: {
        id: 1,
        name: "Mecz Otwarcia Flash Sale",
        totalTickets: 150
      }
    });

    // 3. Generowanie tablicy 150 dostępnych biletów
    const ticketsData = Array.from({ length: 150 }).map(() => ({
      eventId: event.id,
      status: 'AVAILABLE' as const
    }));

    // 4. Masowy zapis biletów w bazie danych PostgreSQL
    await prisma.ticket.createMany({
      data: ticketsData
    });

    res.json({
      success: true,
      message: "Baza danych została pomyślnie zasilona biletami!",
      event,
      ticketsCreated: ticketsData.length
    });
  } catch (error: any) {
    console.error("Błąd podczas fixu bazy:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
