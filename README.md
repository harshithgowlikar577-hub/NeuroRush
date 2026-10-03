# NeuroRush — AI Powered Cognitive Skills Training Platform

A high-performance full-stack cognitive skills training and telemetry web platform designed to evaluate and enhance executive cognitive faculties: Working Memory, Motor Reflex, Selective Attention, and Typing Velocity.

---

## 🚀 Features

- 🧠 **Memory Challenge:** Progressive n-back and visual spatial sequence recall challenges.
- ⚡ **Reflex Challenge:** Sub-millisecond auditory and visual stimulus reaction latency tracking.
- 🎯 **Attention Challenge:** Rapid target discrimination under visual clutter and cognitive distractors.
- ⌨️ **Typing Challenge:** Real-time Words Per Minute (WPM), character accuracy, and keystroke rhythm analysis.
- 📊 **Analytics Dashboard:** Empirical performance radar, historical telemetry, cognitive domain comparisons, and session trends.
- 📈 **Performance Tracking & Adaptive Difficulty:** Dynamic difficulty scaling driven by historical user capability metrics.
- 🏆 **Global & Categorized Leaderboards:** Filterable, paginated rankings with personal best benchmarks.
- 🔒 **Enterprise-Grade Authentication:** JWT authentication with bcrypt password hashing and request rate limiting.
- 👤 **Profile & Achievement Management:** Gamified milestone badges and persistent cognitive progress records.

---

## 🛠️ Technologies Used

### Frontend
- **Core:** HTML5, CSS3, JavaScript (ES6+)
- **Architecture:** Responsive Single-Page Application (SPA) with dynamic view routing
- **Visuals & Charts:** Chart.js, CSS Glassmorphism, CSS Custom Properties Design System
- **Typography:** Google Fonts (*Outfit*, *JetBrains Mono*)

### Backend
- **Runtime:** Node.js (v18+)
- **Framework:** Express.js REST API
- **Security:** JSON Web Tokens (`jsonwebtoken`), `bcryptjs`, `cors`, `express-rate-limit`
- **Database Driver:** `mysql2` connection pooling with promise interface and prepared statements

### Database
- **Engine:** MySQL 8.0+
- **Architecture:** Normalized Third Normal Form (3NF) relational architecture
- **DDL:** Pre-configured schema export available in [`database.sql`](database.sql)

### Hosting & Deployment
- **Frontend / Fullstack:** Vercel (Edge CDN + Serverless Functions via [`vercel.json`](vercel.json))
- **Backend / Database:** Railway / Render / Docker Containerization ([`Dockerfile`](Dockerfile), [`docker-compose.yml`](docker-compose.yml))
- **Version Control:** Git & GitHub

---

## 📂 Repository Architecture

```text
NeuroRush/
├── api/
│   └── index.js             # Vercel serverless function entry point
├── backend/
│   ├── controllers/         # Express controllers (auth, session, leaderboard, etc.)
│   ├── database/            # MySQL connection pool & URL resolver (db.js)
│   ├── middleware/          # JWT authMiddleware
│   ├── public/              # Production static client assets
│   ├── routes/              # Express API route declarations
│   ├── utils/               # JWT, queuing, and skill rating calculations
│   ├── package.json         # Backend dependencies & scripts
│   └── server.js            # Express API server & static file server
├── frontend/
│   ├── index.html           # Main SPA UI container
│   ├── styles.css           # Design tokens, themes & layout styling
│   ├── app.js               # Client state engine & API consumer
│   └── package.json         # Frontend build scripts
├── database/
│   ├── schema.sql           # Initial database schema DDL
│   ├── erd.md               # Entity Relationship Diagram & 3NF proof
│   └── config.example.json  # Database config template
├── database.sql             # Root SQL import for cloud database provisioning
├── .env.example             # Environment variable template
├── .gitignore               # Strict exclusion rules for secrets and build outputs
├── .dockerignore            # Docker context exclusions
├── Dockerfile               # Node.js 20 Alpine container
├── docker-compose.yml       # Unified stack (Node.js + MySQL 8.0)
├── package.json             # Root workspace scripts & engine definitions
└── vercel.json              # Full-stack Vercel routing configuration
```

---

## 💻 Running Locally

### 1. Prerequisites
- Node.js (v18 or higher)
- MySQL Server (v8.0 or higher) running locally or remotely

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/<YOUR_USERNAME>/NeuroRush.git
cd NeuroRush

# Install dependencies for both root and backend
npm install
```

### 3. Database Setup
Log into your MySQL client and initialize the database:
```bash
mysql -u root -p < database.sql
```

### 4. Configure Environment Variables
Copy `.env.example` to `backend/.env` and enter your database credentials:
```bash
cp .env.example backend/.env
```
Inside `backend/.env`:
```env
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=neurorush
JWT_SECRET=your_jwt_secret_key_change_in_production
JWT_EXPIRES_IN=24h
NODE_ENV=development
```

### 5. Start the Application
```bash
# Start backend server and frontend serving
npm start
```
Open [http://localhost:5000](http://localhost:5000) in your browser.

---

## ☁️ Deployment Guide

### Deploying to GitHub

```bash
# 1. Initialize git (if not already initialized)
git init

# 2. Stage all clean project files
git add .

# 3. Create initial commit
git commit -m "Initial NeuroRush Deployment"

# 4. Set main branch and connect remote
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/NeuroRush.git

# 5. Push to GitHub
git push -u origin main
```

---

### Deploying to Vercel

NeuroRush includes a pre-configured [`vercel.json`](vercel.json) that automatically handles both edge static frontend delivery and serverless API routing:

1. **Connect GitHub to Vercel:**
   - Log into [Vercel](https://vercel.com) and click **Add New...** → **Project**.
   - Import your **NeuroRush** GitHub repository.
2. **Configure Environment Variables in Vercel:**
   In the Vercel project settings under **Environment Variables**, add:
   - `DB_HOST`: Hostname of your cloud MySQL instance (e.g., from Railway, Aiven, or PlanetScale)
   - `DB_PORT`: `3306`
   - `DB_USER`: Your cloud database user
   - `DB_PASSWORD`: Your cloud database password
   - `DB_NAME`: `neurorush`
   - `JWT_SECRET`: A secure production JWT secret key
   - `JWT_EXPIRES_IN`: `24h`
   - `NODE_ENV`: `production`
   - *(Optional)* `DATABASE_URL`: Cloud MySQL connection URI (if using Railway or PlanetScale)
   - *(Optional)* `DB_SSL`: `true`
3. **Deploy:**
   - Click **Deploy**. Vercel will build the frontend and register the serverless API routes.
   - Your application will be live at `https://neurorush.vercel.app` (or your assigned Vercel URL).

---

## 🛡️ Security Implementation

- **Bcrypt Password Hashing:** User passwords hashed using salted bcrypt hashes before database insertion.
- **JWT Authentication:** Cryptographically signed tokens required for protected endpoints (`/api/session`, `/api/leaderboard`, etc.).
- **Rate Limiting:** IP-based rate limiting via `express-rate-limit` prevents brute-force attempts and DoS.
- **CORS Protection:** Configured cross-origin resource sharing.
- **Environment Isolation:** Zero credentials checked into Git via strict `.gitignore`.

---

## 📄 License
This project is open-source and available under the MIT License.
