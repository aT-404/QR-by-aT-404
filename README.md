# Event QR Management Platform

A modern, secure, and production-ready web application for generating, managing, and scanning QR code entry passes for events. The platform is designed as a reusable framework, meaning administrators can easily reconfigure it for any event (e.g., changing names, dates, custom prefixes, starting numbers, and scan limits) directly from the dashboard without modifying a single line of code.

---

## 🚀 Features & Architecture

The application is structured into three layers:

### 1. Database & Security (`supabase/schema.sql`)
* **Atomic Transactions**: Leverages a PostgreSQL stored procedure `increment_qr_usage` inside a row-level write lock (`FOR UPDATE`). This guarantees that concurrent scans, rapid refreshes, or camera jitters cannot bypass usage limits (optimistic locking/transaction safety).
* **Automatic Status Triggers**: Triggers automatically update the ticket status (`Unused`, `Partially Used`, `Fully Used`, `Disabled`) when usage counters are incremented or limit properties are adjusted.
* **Audit Trails**: Separate tables for scan history logs and administrative audit tracking.
* **Realtime Support**: Ready for PostgreSQL replication parameters, enabling instant dashboard updates without page reloads.

### 2. Node.js + Express Backend API
* **Bearer Token Auth**: Validates incoming sessions with Supabase Auth and queries user roles (`admin`, `staff`) in middleware.
* **Admin Re-verification**: Sensitive, destructive adjustments (resetting usage, changing maximum allowed usage, toggling disable states) require administrators to re-enter their password before running.
* **Asynchronous Chunk Generator**: Handles bulk generation requests (e.g., 500+ passes) in chunks of 100 to prevent request timeouts and keep the UI responsive.
* **Exports & Backups**: Exposes streams for exporting CSV logs and tools for downloading/restoring database backups as JSON.
* **OpenAPI Documentation**: API specification details are hosted statically at `/docs/openapi.json`.

### 3. React + Vite Frontend Client
* **Dynamic Design**: Built with premium glassmorphic styling, responsive layout grids, Outfit & Inter typography, and subtle micro-animations.
* **Autofocus Scanner Terminal**: Utilizes `html5-qrcode` to scan codes using the device camera. Includes an **Auto-Confirm (1-Click)** check-in mode, client-side scan cooldowns (3 seconds), and synthesized audio notifications.
* **Print Templates**: Configurable grid sheets supporting print dimensions (A4, Letter) and custom grids (2x3 to 5x10 layouts) with cut guidelines.
* **Realtime Dashboard**: Utilizes Supabase Realtime subscriptions to listen for postgres changes and auto-refresh telemetry cards, leaderboards, and recent feeds instantly.

---

## 📂 Project Structure

```
├── backend/
│   ├── config/          # Supabase client initializers (Anon & Service Role keys)
│   ├── docs/            # OpenAPI (Swagger) specifications
│   ├── middleware/      # JWT authentication and Role checks
│   ├── routes/          # Express route routers (auth, event, qr, staff, backup, reports)
│   ├── scratch/         # Automated stress testing scripts
│   ├── index.js         # Express app entrypoint
│   └── package.json     # Backend node configuration
│
├── frontend/
│   ├── src/
│   │   ├── context/     # AuthContext (state provider)
│   │   ├── pages/       # Login, PublicInfo, Scanner, Dashboard, QRRegistry, Settings
│   │   ├── App.jsx      # Guarded routers and global layouts
│   │   ├── index.css    # Tailwind styling tokens and print layouts
│   │   └── main.jsx     # Vite client entrypoint
│   ├── index.html       # Vite web entrypoint
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── vite.config.js   # Proxy setups mapping /api requests to Express port 5000
│   └── package.json     # Frontend node configuration
│
└── supabase/
    └── schema.sql       # Database tables, triggers, and PL/pgSQL stored procedures
```

---

## ⚡ Quickstart Setup

### Prerequisites
* [Node.js](https://nodejs.org) (v18+ recommended)
* A free [Supabase](https://supabase.com) account

### Step 1: Database Setup
1. Create a free project on your Supabase dashboard.
2. Open the **SQL Editor** in Supabase and execute the script inside `supabase/schema.sql`.
3. To enable real-time dashboard updates:
   * Go to **Database** &rarr; **Replication** in the Supabase sidebar.
   * Enable replication for: `qr_codes`, `scan_history`, `profiles`, and `audit_logs`.

### Step 2: Environment Variables Setup
Create a `.env` file in the `backend/` directory:
```env
PORT=5000
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

Create a `.env` file in the `frontend/` directory:
```env
VITE_API_URL=http://localhost:5000/api
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

### Step 3: Launching the Applications
1. Run the Express server:
   ```bash
   cd backend
   npm install
   npm run start
   ```

2. Run the Vite React client:
   ```bash
   cd frontend
   npm run dev
   ```

3. Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing Concurrency and Locking
A mock stress test script is provided in `backend/scratch/test_api.js` to verify concurrency safety:
```bash
cd backend
# Set variables or mock credentials
node scratch/test_api.js
```
The script fires 5 rapid parallel scan calls for a single-use ticket, demonstrating that only one scan registers successfully while the rest return `LIMIT_REACHED`.
