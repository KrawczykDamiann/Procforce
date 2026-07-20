# Zadanie rekrutacyjne: System Rezerwacji Biletów "Flash Sale"

Cześć! Dziękujemy za dotychczasowy udział w profesie rekrutacyjnym do zespołu **procforce**. Przechodzimy do etapu technicznego, w którym chcielibyśmy sprawdzić Twoje podejście do projektowania architektury, rozwiązywania problemów ze współbieżnością (concurrency) oraz znajomość nowoczesnego ekosystemu JavaScript/TypeScript.

Nie szukamy idealnego produktu gotowego na produkcję, ale chcemy zobaczyć, jak myślisz, jakich narzędzi używasz do rozwiązania konkretnych problemów i jak dbasz o jakość kodu.

## Cel projektu
Stworzenie uproszczonej aplikacji do sprzedaży limitowanej puli biletów na popularne wydarzenia. Platforma musi być odporna na sytuację, w której wielu użytkowników próbuje kupić ten sam bilet w dokładnie tym samym ułamku sekundy.

---

## Wymagania

### 1. Backend (Node.js)
* **Technologia:** Node.js z wybranym frameworkiem (Express, NestJS, Fastify itp.).
* **Baza danych:** Dowolna relacyjna (np. PostgreSQL), z wykorzystaniem transakcji.
* **Race Condition:** Zaimplementuj mechanizm zapobiegający "overbookingowi" (sprzedaniu większej liczby biletów niż zakłada pula) na endpoincie `/reserve`. Oczekujemy wykorzystania transakcji bazodanowych, blokad (Pessimistic/Optimistic Locking) lub rozwiązań in-memory (np. Redis Redlock).
* **Tymczasowa rezerwacja:** Kliknięcie "Rezerwuj" blokuje bilet dla użytkownika na 5 minut. Jeśli po tym czasie nie zostanie on "opłacony" (możesz to zasymulować oddzielnym endpointem `/pay`), bilet wraca do ogólnodostępnej puli.
* **Real-time:** Wykorzystaj WebSockets lub Server-Sent Events (SSE), aby emitować na żywo aktualną liczbę dostępnych biletów do wszystkich podłączonych klientów.

### 2. Frontend (Next.js + React)
* **Technologia:** Next.js, React, TypeScript.
* **Wydajność:** Strona z listą wydarzeń powinna wykorzystywać SSG lub ISR.
* **Interfejs na żywo:** Strona szczegółów wydarzenia musi wyświetlać dynamiczny licznik dostępnych biletów, aktualizowany w czasie rzeczywistym (nasłuchiwanie na WebSockets/SSE z backendu).
* **Zarządzanie stanem i UX:** Zaimplementuj obsługę błędu w przypadku odrzucenia transakcji (np. z powodu wyprzedania biletów w trakcie klikania). Oczekujemy płynnego interfejsu wykorzystującego np. Optimistic UI lub odpowiednie zarządzanie stanem asynchronicznym (React Query / SWR / Zustand).

---

## Wymagania techniczne i "Plusy"
* **Projekt musi być napisany w TypeScript.**
* **Plusem będzie:** Dostarczenie środowiska w Dockerze (`docker-compose.yml` uruchamiający bazę, backend i frontend).
* **Plusem będzie:** Napisanie testu integracyjnego, który udowadnia, że Twój mechanizm rezerwacji radzi sobie z równoległymi żądaniami i zapobiega overbookingowi.
* **Plusem będzie:** Podstawowy Rate Limiting na endpoincie rezerwacji.

---

## Informacje organizacyjne

* **Jak zacząć:** Kliknij zielony przycisk **"Use this template"** w prawym górnym rogu tego repozytorium, aby utworzyć własne, **prywatne** repozytorium na swoim koncie GitHub.
* **Sposób dostarczenia:** Prześlij nam link do swojego wygenerowanego i uzupełnionego repozytorium. W wiadomości mailowej podamy Ci loginy kont GitHub, którym powinieneś nadać uprawnienia "Collaborator", abyśmy mogli przejrzeć Twój kod.
* **Uruchomienie:** Koniecznie zaktualizuj plik `README.md` w swoim repozytorium dodając jasną, krótką instrukcję, jak uruchomić Twój projekt lokalnie (jak zainstalować zależności, odpalić bazę, zseedować początkowe dane itp.).
* **Czas na wykonanie:** Proponujemy 3 dni od momentu otrzymania wiadomości. Jeśli potrzebujesz więcej czasu, daj nam znać.

W razie jakichkolwiek pytań technicznych lub wątpliwości dotyczących wymagań – śmiało pisz. Chętnie odpowiemy.

Powodzenia!  
**Zespół Procforce**

---
---

# 🚀 Dokumentacja i Implementacja Rozwiązania

Zadanie zostało w pełni zrealizowane zgodnie z wytycznymi, uwzględniając wszystkie wymagania funkcjonalne oraz punkty dodatkowe (Plusy).

## 🛠️ Stack Techniczny
*   **Środowisko uruchomieniowe:** Node.js 20 LTS
*   **Backend:** Express, TypeScript, Prisma ORM
*   **Frontend:** Next.js (App Router), React, Turbopack (lokalny dev serwer)
*   **Baza danych:** PostgreSQL 15
*   **Real-time:** Server-Sent Events (SSE)

---

## 🏗️ Architektura i Rozwiązanie Kluczowych Problemów

### 1. Zapobieganie Race Conditions (Overbooking)
Do ochrony przed zjawiskiem wyścigu wykorzystano mechanizm **Pessimistic Locking** na poziomie bazy danych PostgreSQL. Wewnątrz bezpiecznej transakcji interaktywnej Prismy (`prisma.$transaction`) wykonywane jest surowe zapytanie SQL wyszukujące wolny bilet:

```sql
SELECT id FROM "Ticket" 
WHERE "eventId" = $1 
AND ("status" = 'AVAILABLE' OR ("status" = 'RESERVED' AND "reservedAt" < (NOW() AT TIME ZONE 'UTC') - INTERVAL '5 minutes'))
LIMIT 1 
FOR UPDATE SKIP LOCKED