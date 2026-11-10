# E Electrics CRM - Backend API

> NestJS v10 REST API and Email Engine for E Electrics CRM, backed by SQLite and Prisma ORM.

---

## 1. Architecture & Core Responsibilities

The backend handles all business logic, document sequencing, PDF generation, email synchronization (IMAP/SMTP), and public client interfaces:

- **Auth & Team:** Simple token-based admin authorization with `scrypt` hashing for team accounts and global guard.
- **Documents Module:** Invoices, Bookings, Quotations, revisions history, line items calculation, and email dispatch.
- **Counters Service:** Atomic sequence numbering for `BKG-XXXX`, `INV-XXXX`, `QTN-XXXX`, and case files.
- **Mailbox Module:** Full two-way email integration via `imapflow` (sync from mail server) and `nodemailer` (SMTP outbound), plus Server-Sent Events (SSE) for real-time frontend updates.
- **PDF Module:** HTML-based invoice and quotation rendering with E Electrics letterhead, NAPIT logo, and line item tables.
- **Public Portals:** Unauthenticated token endpoints for customer booking confirmations and Stripe payment redirects.
- **Address Autocomplete:** Integrated with Woosmap for UK postcode & street address lookup.

---

## 2. Directory Layout

```
EElectrics-CRM-Backend/
├── prisma/
│   ├── schema.prisma           # Prisma schema (SQLite dev.db)
│   ├── seed.ts                 # Database seeder (sample client, case file, booking)
│   └── dev.db                  # Local SQLite database file
├── data/
│   └── auth-users.json         # Managed sub-admin team accounts
├── src/
│   ├── main.ts                 # Bootstrap, CORS config, global ValidationPipe
│   ├── app.module.ts           # Root NestJS module & global AuthGuard
│   ├── common/
│   │   ├── prisma.service.ts   # Prisma Client database hook
│   │   └── counters.service.ts # Sequential number generator
│   └── modules/
│       ├── auth/               # Auth controller, service, guard, and user management
│       ├── clients/            # Client CRUD & case file relations
│       ├── documents/          # Document CRUD, cloning, mail sender, public booking/payment
│       ├── mailbox/            # IMAP sync, email threads, message replies, SSE stream
│       ├── dashboard/          # Dashboard summary & aggregates
│       ├── addresses/          # Woosmap address search proxy
│       └── pdf/                # PDF preview and download renderer
```

---

## 3. Environment Configuration

Create or update `.env` in `EElectrics-CRM-Backend/`:

```env
# Database
DATABASE_URL="file:./dev.db"
PORT=4000
WEB_ORIGIN="http://localhost:5173"
PUBLIC_APP_URL="http://localhost:5173"

# Admin Authentication
ADMIN_EMAIL="admin@eelectrics.co.uk"
ADMIN_PASSWORD="admin123"
AUTH_TOKEN="modern-crm-local-token"

# Mail Server (IMAP & SMTP)
MAIL_MAILER="smtp"
MAIL_HOST="mail.eelectrics.co.uk"
MAIL_PORT="465"
MAIL_USERNAME="admin@eelectrics.co.uk"
MAIL_PASSWORD="your-secure-mail-password"
MAIL_ENCRYPTION="ssl"
MAIL_FROM_ADDRESS="admin@eelectrics.co.uk"
MAIL_FROM_NAME="E Electrics Ltd"

# Payments & Addresses
STRIPE_KEY="pk_test_..."
STRIPE_SECRET="sk_test_..."
WOOSMAP_API_KEY="your-woosmap-key"
```

---

## 4. Database Setup & Seeding

```bash
# Install packages
npm install

# Push schema directly to SQLite
npm run db:push

# Generate Prisma Client
npm run db:generate

# Seed default client, case file, and booking
npm run seed

# (Optional) Open Prisma Studio UI in browser
npm run db:studio
```

---

## 5. Running the Backend

```bash
# Start development server with hot-reload
npm run dev

# Production build & start
npm run build
npm run start
```
*The API is hosted at `http://localhost:4000/api`.*

---

## 6. Authentication Details

- **Protected by Default:** All routes require the HTTP header:
  ```http
  Authorization: Bearer modern-crm-local-token
  ```
- **SSE & Downloads:** For browser Server-Sent Events or file downloads that cannot pass headers, the token may be passed as a query param:
  `?token=modern-crm-local-token`
- **Public Routes:** Marked with `@Public()`, including:
  - `POST /api/auth/login`
  - `GET /api/public/bookings/:id`
  - `POST /api/public/bookings/:id/confirm`
  - `GET /api/public/payments/:id`
