# Zadanie rekrutacyjne: System Rezerwacji Biletów "Flash Sale"

Cześć! Dziękujemy za dotychczasowy udział w procesie rekrutacyjnym do zespołu **procforce**. Przechodzimy do etapu technicznego, w którym chcielibyśmy sprawdzić Twoje podejście do projektowania architektury, rozwiązywania problemów ze współbieżnością (concurrency) oraz znajomość nowoczesnego ekosystemu JavaScript/TypeScript.

Nie szukamy idealnego produktu gotowego na produkcję, ale chcemy zobaczyć, jak myślisz, jakich narzędzi używasz do rozwiązania konkretnych problemów i jak dbasz o jakość kodu.

## Cel projektu

Stworzenie uproszczonej aplikacji do sprzedaży limitowanej puli biletów na popularne wydarzenia. Platforma musi być odporna na sytuację, w której wielu użytkowników próbuje kupić ten sam bilet w dokładnie tym samym ułamku sekundy.

---

## Wymagania

### 1. Backend (Node.js)

- **Technologia:** Node.js z wybranym frameworkiem (Express, NestJS, Fastify itp.).
- **Baza danych:** Dowolna relacyjna (np. PostgreSQL), z wykorzystaniem transakcji.
- **Race Condition:** Zaimplementuj mechanizm zapobiegający "overbookingowi" (sprzedaniu większej liczby biletów niż zakłada pula) na endpoincie `/reserve`. Oczekujemy wykorzystania transakcji bazodanowych, blokad (Pessimistic/Optimistic Locking) lub rozwiązań in-memory (np. Redis Redlock).
- **Tymczasowa rezerwacja:** Kliknięcie "Rezerwuj" blokuje bilet dla użytkownika na 5 minut. Jeśli po tym czasie nie zostanie on "opłacony" (możesz to zasymulować oddzielnym endpointem `/pay`), bilet wraca do ogólnodostępnej puli.
- **Real-time:** Wykorzystaj WebSockets lub Server-Sent Events (SSE), aby emitować na żywo aktualną liczbę dostępnych biletów do wszystkich podłączonych klientów.

### 2. Frontend (Next.js + React)

- **Technologia:** Next.js, React, TypeScript.
- **Wydajność:** Strona z listą wydarzeń powinna wykorzystywać SSG lub ISR.
- **Interfejs na żywo:** Strona szczegółów wydarzenia musi wyświetlać dynamiczny licznik dostępnych biletów, aktualizowany w czasie rzeczywistym (nasłuchiwanie na WebSockets/SSE z backendu).
- **Zarządzanie stanem i UX:** Zaimplementuj obsługę błędu w przypadku odrzucenia transakcji (np. z powodu wyprzedania biletów w trakcie klikania). Oczekujemy płynnego interfejsu wykorzystującego np. Optimistic UI lub odpowiednie zarządzanie stanem asynchronicznym (React Query / SWR / Zustand).

---

## Wymagania techniczne i "Plusy"

- **Projekt musi być napisany w TypeScript.**
- **Plusem będzie:** Dostarczenie środowiska w Dockerze (`docker-compose.yml` uruchamiający bazę, backend i frontend).
- **Plusem będzie:** Napisanie testu integracyjnego, który udowadnia, że Twój mechanizm rezerwacji radzi sobie z równoległymi żądaniami i zapobiega overbookingowi.
- **Plusem będzie:** Podstawowy Rate Limiting na endpoincie rezerwacji.

---

## Informacje organizacyjne

- **Jak zacząć:** Kliknij zielony przycisk **"Use this template"** w prawym górnym rogu tego repozytorium, aby utworzyć własne, **prywatne** repozytorium na swoim koncie GitHub.
- **Sposób dostarczenia:** Prześlij nam link do swojego wygenerowanego i uzupełnionego repozytorium. W wiadomości mailowej podamy Ci loginy kont GitHub, którym powinieneś nadać uprawnienia "Collaborator", abyśmy mogli przejrzeć Twój kod.
- **Uruchomienie:** Koniecznie zaktualizuj plik `README.md` w swoim repozytorium dodając jasną, krótką instrukcję, jak uruchomić Twój projekt lokalnie (jak zainstalować zależności, odpalić bazę, zseedować początkowe dane itp.).
- **Czas na wykonanie:** Proponujemy 3 dni od momentu otrzymania wiadomości. Jeśli potrzebujesz więcej czasu, daj nam znać.

W razie jakichkolwiek pytań technicznych lub wątpliwości dotyczących wymagań – śmiało pisz. Chętnie odpowiemy.

Powodzenia!  
**Zespół Procforce**

---

---

# 🚀 Dokumentacja i Implementacja Rozwiązania

Zadanie zostało w pełni zrealizowane zgodnie z wytycznymi, uwzględniając wszystkie wymagania funkcjonalne oraz punkty dodatkowe.

## 🛠️ Stack Techniczny

- **Środowisko uruchomieniowe:** Node.js 20 LTS / Docker
- **Backend:** Express, TypeScript, Prisma ORM, `tsx` (TypeScript Execute)
- **Frontend:** Next.js (App Router), React, Turbopack
- **Baza danych:** PostgreSQL 15
- **Real-time:** Server-Sent Events (SSE)

---

## 🏗️ Architektura i Rozwiązanie Kluczowych Problemów

### 1. Zapobieganie Race Conditions (Overbooking)

Do ochrony przed zjawiskiem wyścigu wykorzystano mechanizm **Pessimistic Locking** na poziomie bazy danych PostgreSQL. Wewnątrz bezpiecznej transakcji interaktywnej Prismy (`prisma.$transaction`) wykonywane jest surowe zapytanie SQL wyszukujące wolny bilet i blokujące go dla konkretnego wątku:

```sql
SELECT id FROM "Ticket"
WHERE "eventId" = $1
AND ("status" = 'AVAILABLE' OR ("status" = 'RESERVED' AND "reservedAt" < (NOW() AT TIME ZONE 'UTC') - INTERVAL '5 minutes'))
LIMIT 1
FOR UPDATE SKIP LOCKED
```

Zastosowanie klauzuli `FOR UPDATE SKIP LOCKED` sprawia, że baza danych natychmiast blokuje wybrany wiersz dla bieżącego żądania. Każde inne równoległe zapytanie pomija zablokowany rekord i szuka kolejnego wolnego biletu. Zapobiega to konfliktom wyścigu, eliminując ryzyko overbookingu i zapewniając natychmiastową spójność przy ogromnym natężeniu ruchu.

### 2. Obsługa 5-minutowych Blokad oraz Płatności

Bilety posiadają statusy `AVAILABLE`, `RESERVED` oraz `PAID`. Podczas rezerwacji przypisywany jest znacznik czasu `reservedAt`. Logika biznesowa automatycznie traktuje bilety ze statusem `RESERVED`, których blokada minęła, jako ponownie wolne. Endpoint `/pay` trwale zmienia status na `PAID` przed upływem wyznaczonego czasu, weryfikując uprawnienia użytkownika.

### 3. Komunikacja Real-Time i Architektura Frontendu

- **Strona główna (ISR):** Wykorzystuje wbudowane mechanizmy Next.js do odświeżania listy wydarzeń w tle co 10 sekund (`revalidate = 10`).
- **Szczegóły wydarzenia (SSE + SWR):** Strumień Server-Sent Events (SSE) na backendzie emituje aktualną liczbę wolnych biletów po każdej udanej zmianie stanu w bazie danych. Frontend nasłuchuje zdarzeń i błyskawicznie aktualizuje lokalną pamięć podręczną biblioteki SWR.
- **Optimistic UI:** Przycisk rezerwacji natychmiastowo zmniejsza stan licznika na ekranie użytkownika, zapewniając doskonały UX. W przypadku błędu sieciowego lub odrzucenia transakcji przez serwer (np. brak biletów), stan licznika jest automatycznie wycofywany do stanu faktycznego.

---

## 🚦 Instrukcja Uruchomienia

Aplikacja została w pełni przystosowana do działania w chmurze (Backend na **Render**, Frontend na **Vercel**), ale można ją uruchomić w 100% lokalnie.

### Wariant 1: Szybki start przez Docker (Zalecane)

Wymagany zainstalowany Docker oraz Docker Compose. W głównym katalogu projektu uruchom:

```bash
docker-compose up --build
```

Kontener automatycznie skonfiguruje bazę danych PostgreSQL, wykona automatyczną synchronizację struktury tabel (`prisma db push`), a następnie uruchomi backend i frontend.

### Wariant 2: Uruchomienie w pełni lokalne

Upewnij się, że posiadasz uruchomioną lokalną instancję PostgreSQL oraz poprawnie skonfigurowany plik `.env` w folderze backendu.

1. **Konfiguracja i start backendu:**

   ```bash
   cd flash-sale/backend
   npm install
   npm run dev
   ```

   _Skrypt startowy automatycznie wywołuje `npx prisma db push`, zapewniając natychmiastową synchronizację modeli bazodanowych bez konieczności ręcznego uruchamiania migracji._

2. **Start frontendu (w osobnym oknie terminala):**
   ```bash
   cd flash-sale/frontend
   npm install
   npm run dev
   ```

---

## 🧪 Testy Współbieżności (Concurrency Stress-Test)

W katalogu backendu przygotowany został automatyczny skrypt integracyjny, który symuluje jednoczesne uderzenie 150 użytkowników próbujących zarezerwować bilet w tej samej milisekundzie. Pozwala to naocznie zweryfikować odporność bazy danych na zjawisko wyścigu (race conditions).

Aby go uruchomić:

1. Upewnij się, że serwer backendu działa.
2. Otwórz terminal w folderze backendu i wywołaj komendę:
   ```bash
   npx tsx test-concurrency.ts
   ```

Skrypt wyświetli w konsoli szczegółowe podsumowanie, pokazując ile rezerwacji zakończyło się sukcesem, a ile zostało bezpiecznie odrzuconych przez blokadę bazodanową z komunikatem o wyprzedaniu biletów, udowadniając brak występowania problemu overbookingu.
