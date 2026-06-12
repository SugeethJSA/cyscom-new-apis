# Cyscom Open Source Portal API Gateway

This is the Node.js / Express API server that acts as a secure cryptographic gateway and middleware proxy for the Cyscom VIT Chennai Open Source Portal.

## 🛠️ Stack
- **Node.js** (>= 18.0.0)
- **Express.js** (Web server framework)
- **CORS** (Cross-origin resource sharing middleware)
- **Dotenv** (Environment variables configuration loader)

---

## ⚙️ Configuration Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the sample environment settings:
   ```bash
   cp .env.example .env
   ```

3. Update the `.env` configuration file with your running port and Firebase REST API URL:
   ```env
   PORT=5000
   FIREBASE_DB_URL=https://your-project-id-default-rtdb.firebaseio.com/
   ```

---

## 🚀 Running the API Server

- **Start Production Mode**:
  ```bash
  npm start
  ```

- **Start Watcher Developer Mode**:
  ```bash
  npm run dev
  ```

---

## 🔗 Endpoint Catalog

The server exposes the following REST API endpoints under `/api`:

### 📁 Projects Hub
- `GET /api/projects`: Retrieve projects catalog.
- `POST /api/projects`: Register or update a project card.
- `DELETE /api/projects/:name`: Delete a project from the catalog.

### 🏆 Hall of Fame
- `GET /api/hall-of-fame`: Retrieve event winner details.
- `POST /api/hall-of-fame`: Register or update event winners.
- `DELETE /api/hall-of-fame/:name`: Delete an event winner record.

### 👥 Legacy Members
- `GET /api/legacy`: Retrieve legacy committee archives.
- `POST /api/legacy`: Add or update a legacy member card.
- `DELETE /api/legacy/:name`: Delete a legacy member card.

### 🔐 Access Control
- `GET /api/users`: Retrieve administrator accounts list (hashes only).
- `POST /api/users`: Provision or update administrator privileges.
- `DELETE /api/users/:username`: Revoke admin console access.
