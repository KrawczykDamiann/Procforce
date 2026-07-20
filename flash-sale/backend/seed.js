const { PrismaClient } = require('@prisma/client');

// Wklejamy połączenie bezpośrednio tutaj, żeby Node na 100% trafił do chmury
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://flash_sale_db_nexf_user:0lPcSaWvDRQ1fFOamElK3LyqNJKuXlus@dpg-d9f6mk61a83c73diddeg-a.oregon-postgres.render.com/flash_sale_db_nexf"
    }
  }
});

async function main() {
  // 1. Czyszczenie starego, zerowego rekordu z chmury
  await prisma.event.deleteMany({});
  console.log('Stare rekordy usunięte z bazy na Renderze.');

  // 2. Dodanie wydarzenia z pełną pulą biletów
  const newEvent = await prisma.event.create({
    data: {
      id: 1, // Wymuszamy ID 1, żeby frontend na pewno go znalazł
      name: "Mecz Otwarcia Flash Sale",
      totalTickets: 150,
      availableTickets: 150
    }
  });

  console.log('Sukces! Wgrano nowe dane do chmury:', newEvent);
}

main()
  .catch((e) => console.error('Błąd podczas seedowania:', e))
  .finally(async () => await prisma.$disconnect());