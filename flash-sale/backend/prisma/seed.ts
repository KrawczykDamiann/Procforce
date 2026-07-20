import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Clear existing data to ensure a clean slate for testing
  await prisma.ticket.deleteMany({});
  await prisma.event.deleteMany({});

  console.log('Cleared existing data from the database.');

  // Create a single test event with ID 1 to match the frontend route
  const event = await prisma.event.create({
    data: {
      id: 1,
      name: 'Mega Flash Sale Concert 2026',
      totalTickets: 100,
    },
  });

  console.log(`Created test event: ${event.name} (ID: ${event.id})`);

  // Generate an array of 100 available tickets linked to the event
  const ticketsData = Array.from({ length: 100 }).map(() => ({
    eventId: event.id,
    status: 'AVAILABLE',
  }));

  // Insert all tickets in a single, efficient bulk query
  await prisma.ticket.createMany({
    data: ticketsData,
  });

  console.log('Successfully seeded 100 available tickets into the database!');
}

main()
  .catch((e) => {
    console.error('Error during database seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    // Disconnect from the database when finished
    await prisma.$disconnect();
  });