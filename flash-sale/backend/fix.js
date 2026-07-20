const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    // Aktualizujemy wszystkie wydarzenia w bazie, ustawiająg im pulę biletów
    const result = await prisma.event.updateMany({
      data: { 
        totalTickets: 150
      }
    });
    console.log(` sukces! Zaktualizowano wydarzenia. Zmienione rekordy: ${result.count}`);
  } catch (error) {
    console.error("Błąd podczas aktualizacji:", error);
  } finally {
    await prisma.$disconnect();
  }
}

run();