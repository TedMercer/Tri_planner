# TriPlan — Triathlon Training Planner

A dark-themed triathlon training calendar with analytics, Strava sync, and multi-athlete support.

## Features

- **Infinite calendar** — Sun–Sat weeks, scroll forward/backward endlessly
- **Planned vs Actual** — toggle between planned training and actual completed workouts
- **Strava sync** — connect Strava to auto-import actual activities
- **Analytics dashboard** — weekly/monthly bars, cumulative mileage, discipline split donut, training heatmap, planned vs actual comparison
- **Athlete comparison** — overlay another athlete's data on your charts
- **5 athlete profiles** — each with races, passwords, and independent data
- **Race countdowns** — A/B/C race tracking with days-until display

## Project Structure

```
triplan/
├── index.html
├── css/style.css
├── js/
│   ├── app.js          # Core app logic, auth, calendar
│   ├── strava.js       # Strava OAuth + activity sync
│   └── analytics.js    # Chart.js analytics dashboard
├── worker/
│   └── strava-proxy.js # Cloudflare Worker for Strava token exchange
└── README.md
```

## Quick Start

Open `index.html` in any browser. No build tools required.

## Data Notes

- All data stored in browser localStorage (per-device)
- Export/Import JSON for backups and transfers
- Strava sync imports last 30 days of Run, Bike, Swim activities
- Planned and Actual data are stored separately

## License

MIT
