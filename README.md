# InvoiceFlow

React + Node.js + Firebase invoice maker.

## Run
1. Install Node.js 20+.
2. Copy `.env.example` to `.env` and add your Firebase Web App configuration, including `VITE_FIREBASE_DATABASE_URL`.
3. In Firebase Console enable **Authentication → Email/Password**.
4. Create a Realtime Database in Firebase Studio.
5. Deploy `database.rules` using Firebase CLI, or paste them into Realtime Database Rules.
6. Run `npm install`.
7. Run `npm run dev`.
8. Open the Vite URL shown in the terminal (normally http://localhost:5173).

The Node server exposes `/api/health`; authentication and invoice persistence are handled directly by Firebase from the React app.
