# CYSCOM OpenSrc API

Welcome to the central backend engine for the CYSCOM OpenSrc Ecosystem. This repository houses the Node.js/Express REST API that serves as the singular source of truth for both the internal admin portal (`cyscom-new-members`) and the public-facing participant portal (`cyscom-events-hub`).

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Core Functionalities](#core-functionalities)
3. [Database Schema](#database-schema)
4. [Security & Cryptography](#security--cryptography)
5. [Local Development Setup](#local-development-setup)
6. [API Routes Structure](#api-routes-structure)

---

## Architecture Overview
The API is built using **Express.js** and interfaces directly with a **PostgreSQL** database using raw queries (via `pg` Pool). It operates statelessly, utilizing JSON Web Tokens (JWT) for authentication and role-based access control (RBAC). 

It acts as the hub for all data transactions: creating events, designing dynamic JSON-schema registration forms, routing payments, tracking accounting ledgers, encrypting QR code tickets, and managing the central user directory.

---

## Core Functionalities

### 1. Dynamic Event & Intake System
Events are not static. The API allows admins to define custom JSON schemas (`registration_schema`) for each event. When a participant registers via the `intakeRoutes`, the API dynamically validates the incoming payload against the event's specific schema to ensure all required fields, dropdowns, and file uploads are valid.

### 2. Advanced Financials Engine
The API handles complex event budgeting:
- **Projections**: Stores `projected_registrations_count`, `projected_amount_per_registration`, and `projected_sponsorship_amount` to calculate a theoretical operational budget.
- **Estimates**: Allows itemized drafting of expected expenditures (`event_budget_estimates`).
- **Actuals (Bills & Sponsorships)**: Logs real expenditures (`event_bills`) and inbound revenue (`event_sponsorships`). 
- **Bulk Transfers**: Supports moving bulk bills between draft budgets natively.
- **Global Expenses**: Superadmins can define `standard_expenses` across the entire ecosystem.

### 3. QR Code Ticket Dispatching & Scanning
Tickets are heavily encrypted before being dispatched. When a user registers, their payload is AES-256 encrypted. The `scannerRoutes` decrypt this payload on the fly when physical checkpoints ping the API, verifying the ticket and recording the timestamp in the `attendance_logs`.

### 4. User & Participant Directory
- **Superadmins/Admins**: Internal team members who run the organization.
- **Participants**: External users who attend events. The API maps recurring participants, allowing cross-syncing of standard registration fields (e.g., Name, Phone) across multiple future events.
- **Teams**: Exposes endpoints for Participants to form teams using unique Participant IDs.

---

## Security & Cryptography
To prevent ticket spoofing, all QR codes contain an encrypted hexadecimal string rather than plain text data.
- **Algorithm**: `aes-256-cbc`
- **Keys**: Handled via the `QR_MASTER_SECRET` environment variable.
- **Validation**: Scanners submit the encrypted hex; the API decrypts it, validates the event slug, and checks for duplication to prevent "double-scanning" at checkpoints.

---

## Local Development Setup

To run this API locally alongside the frontend applications, you must provide a PostgreSQL instance and the appropriate environment variables.

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Create a `.env` file in the root directory:
```env
# Server
PORT=5000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
APP_PUBLIC_URL=http://localhost:5173

# Database use your own url
DATABASE_URL=postgresql://username:password@localhost:5432/cyscom_db

# Security
JWT_SECRET=replace_with_a_long_random_jwt_secret
QR_MASTER_SECRET=replace_with_32_byte_base64_secret_for_aes_encryption

# SMTP / Email (For QR Dispatch)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM="Cyscom Events <noreply@cyscom.com>"
```

### 3. Database Migrations
The database schema is heavily versioned. Ensure your database is up to date by running the server; it will automatically run pending migrations in the `/migrations` folder on startup.

### 4. Start the Server
```bash
npm run dev
```
The API will be available at `http://localhost:5000/api`.

---

## API Routes Structure
- `/api/auth`: Login, Token verification, Password updates.
- `/api/events`: CRUD operations for Events, Schemas, and Event Status toggling.
- `/api/finances`: Budgets, Estimates, Bills, Sponsorships, Transfers.
- `/api/intake`: Guest Checkouts, Participant Registrations, Team building integrations.
- `/api/scanner`: QR Decryption, Check-in verification, Attendance Logging.
- `/api/members`: Internal user management, User Groups Registry.
