# Chess Klub Mysuru — CAMS PRD & Progress

## Problem Statement
Build a Coaching Center Management Software for Chess Klub Mysuru (single branch, v1.0).
Theme: White, Orange (#F45B2A), Black. Uses the uploaded knight logo across UI, invoices, receipts.

## Architecture
- **Backend**: FastAPI (Python), MongoDB (motor), JWT (PyJWT), bcrypt, reportlab for PDFs. Single-file `server.py`. Mock-mode WhatsApp (Twilio) + Email (SendGrid).
- **Frontend**: React 19 + react-router-dom 7, axios, shadcn/ui, lucide-react, recharts, sonner toasts. Brand tokens in `App.css`.
- **Auth**: Bearer-only JWT (token stored in localStorage). Single seeded admin (director).

## User Personas
1. Academy Director — full access (super-admin)
2. Operations Manager — students/batches/levels/attendance/invoices
3. Coach — attendance marking
4. Front Desk — onboarding + fee collection
5. Finance — invoices + payments + reports

## Implemented (as of Feb 2026)
- Auth: `/api/auth/login`, `/me`, `/logout` with role-aware JWT.
- Students: CRUD + auto `STU-YYYY-NNNN` code, search, list, detail, edit, delete.
- Batches: CRUD with enrolled count via single aggregation, schedule days picker, edit/delete.
- Levels & Fees: CRUD with admission/monthly/quarterly/annual/exam/material/penalty fees, edit/delete.
- Attendance: per-batch session marking (P/A/L/LT/H), upsert idempotency, student summary % API.
- Billing: invoice generation with `INV-YYYY-MM-NNNN`, line items, level→fee auto-fill, reminder API, payment recording with `RCP-YYYY-MM-NNNN` receipt.
- PDFs: branded invoice & receipt PDFs via reportlab (logo, orange band, academy header).
- Dashboard: active students, this-month revenue, pending dues, overdue, revenue trend (6 months), payment-mode pie, pending invoices table, subscription expiring/expired banner.
- Users: director-only team CRUD with role assignment.
- Settings: academy details + integrations health flags + live test panel (Send test WhatsApp + email).
- **Integrations**: Meta WhatsApp Cloud API direct (LIVE) + Gmail SMTP (LIVE).
- **Self-service Kiosk** (`/kiosk` — public, no auth): student types code → check-in / check-out → auto-marks attendance Present, recent check-ins panel.
- **Parent Magic Link** (`/portal/<token>` — public, signed JWT, 180-day expiry): private portal showing attendance %, history, invoices, receipts with PDF download. One-tap WhatsApp share from student detail.
- **Subscriptions**: per-student `subscription_start` / `subscription_end` / `subscription_status` (active / expiring_soon / expired). Auto-extends on payment based on plan (monthly +30, quarterly +90, annual +365). Dashboard banner shows expiring + expired counts.

## Backlog / Next
- **P1**: Razorpay live payment integration (currently stubbed).
- **P1**: Real WhatsApp (Twilio) + Email (SendGrid) — keys to be supplied later, code paths already wired (log-only mode).
- **P1**: CSV import for bulk student onboarding.
- **P2**: Parent portal (read-only attendance + receipts).
- **P2**: Multi-branch consolidation.
- **P2**: GST invoicing (GSTIN + HSN fields).
- **P2**: Scheduled email reports / digests.

## Test Credentials
See `/app/memory/test_credentials.md`.
