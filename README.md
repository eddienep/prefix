# Caffeine half-life tracker (MVP)

Single-page web app: log caffeine (time + mg), model exponential decay with a configurable half-life, chart active caffeine over the last 24 hours and next 12 hours, and compare to a simple sleep-safe threshold (1.5 mg/kg body weight).

**Not medical advice**—for behavioral awareness only.

## Run locally

```bash
cd caffeine-half-life-tracker
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Build

```bash
npm run build
npm run preview   # optional: serve production build
```

Data is stored in **localStorage** in the browser (no backend).

## Stack

- React + TypeScript (Vite)
- Recharts (chart)
- Day.js (formatting)
