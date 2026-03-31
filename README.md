# TriPlan — Triathlon Training Planner

A clean, dark-themed triathlon training calendar for planning runs, bikes, and swims with weekly volume tracking, athlete profiles, and race countdowns.

![TriPlan](https://img.shields.io/badge/TriPlan-Training%20Planner-E07B39?style=flat-square)

## Features

- **Infinite calendar** — scroll forward and backward through weeks (Sun–Sat)
- **Color-coded activities** — Run (orange), Bike (teal), Swim (blue)
- **Weekly summaries** — automatic totals for miles run, miles biked, yards swum
- **Weekly goals** — set volume targets with green/red hit indicators
- **5 athlete profiles** — each with name, birthday, password, and A/B/C races
- **Race countdowns** — days until each target race in the profile banner
- **Admin gate** — master password to access the app
- **Edit/View modes** — password-protected editing per athlete, view-only for others
- **Export/Import** — JSON backup and restore
- **Keyboard shortcuts** — ← → navigate weeks, T for today, Esc to close modals

## Project Structure

```
triplan/
├── index.html          # Main HTML structure
├── css/
│   └── style.css       # All styles
├── js/
│   └── app.js          # Application logic
└── README.md           # This file
```

## Important Notes

### Data Storage
- All data is stored in your browser's **localStorage**
- Data is **per-browser, per-device** — it won't sync between your laptop and phone
- Clearing browser data will erase your training plans
- **Always export a JSON backup** regularly

### Security
- This uses client-side password hashing (not cryptographic — it's obfuscation)
- Suitable for a personal/small-group tool, not for sensitive data
- Anyone with browser dev tools can inspect localStorage
- For real security, we'd need a backend with bcrypt and a database

### Sharing with Training Partners
Since localStorage is per-browser, each person visiting your GitHub Pages URL will have their **own independent copy** of the app. To share training plans:
1. One person exports their data as JSON
2. Share the JSON file
3. Other person imports it

---

## Future Upgrade Path

Real Auth

| Component | Current | Future |
|-----------|---------|--------|
| Hosting | GitHub Pages | GitHub Pages (frontend) |
| Auth | Client-side hash | Firebase Auth / Auth0 |
| Database | localStorage | Firebase Firestore / Supabase |
| Sync | None (per-browser) | Real-time across devices |

The `appData` JSON structure maps directly to a Firestore document collection — the migration is straightforward. Need to impliment

---

## License

MIT — use it, modify it, share it.
