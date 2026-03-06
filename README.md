# Wakanda Mission Control (Vue + Firebase)

Mission Control migrated to **Vue 3 + Vite** with a Firestore-backed session log.

## Features

- Vue 3 app scaffolded with Vite
- Mission board UI migrated from the old static HTML
- Session Log UI (list + add entry)
- Firestore integration using collection `sessionLog`
- Firestore entry fields:
  - `createdAt` (`serverTimestamp()`)
  - `timeLabel` (`string`)
  - `description` (`string`)
- Firebase Hosting config included

## 1) Install dependencies

```bash
npm install
```

## 2) Configure environment variables

Copy `.env.example` to `.env` and fill in your Firebase project values:

```bash
cp .env.example .env
```

Required keys:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## 3) Run locally

```bash
npm run dev
```

## 4) Build production bundle

```bash
npm run build
```

## 5) Deploy to Firebase Hosting

First-time only (if not already authenticated):

```bash
firebase login
```

Set your real project ID in `.firebaserc` (replace `your-firebase-project-id`).

Deploy:

```bash
npm run deploy:hosting
```

Or deploy all Firebase targets configured in this project:

```bash
npm run deploy
```

## Firestore notes

Create a Firestore database in your Firebase project before using Session Log.

The UI shows configuration and runtime errors if Firebase env keys are missing or Firestore fails.
