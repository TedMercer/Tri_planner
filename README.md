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

## Quick Start (Local)

Just open `index.html` in any modern browser. No build tools, no dependencies, no server required.

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/triplan.git
cd triplan

# Open in browser
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

---

## Deploy to GitHub Pages (Free Hosting)

### Step 1: Create a GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Name it `triplan` (or whatever you'd like)
3. Set it to **Public** (required for free GitHub Pages)
4. Do **NOT** initialize with a README (we already have one)
5. Click **Create repository**

### Step 2: Push Your Code

Open your terminal and navigate to the `triplan` folder:

```bash
cd /path/to/triplan

# Initialize git repo
git init

# Add all files
git add .

# First commit
git commit -m "Initial commit — TriPlan training planner"

# Add your remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/triplan.git

# Push to main branch
git push -u origin main
```

### Step 3: Enable GitHub Pages

1. Go to your repo on GitHub: `https://github.com/YOUR_USERNAME/triplan`
2. Click **Settings** (gear icon, top bar)
3. Scroll down to **Pages** in the left sidebar
4. Under **Source**, select:
   - Branch: `main`
   - Folder: `/ (root)`
5. Click **Save**
6. Wait 1–2 minutes for deployment

### Step 4: Access Your Site

Your site will be live at:

```
https://YOUR_USERNAME.github.io/triplan/
```

GitHub will show the URL in the Pages settings once it's deployed.

---

## Default Login Credentials

- **Admin Password:** `14_MA_Street_DSon1923!!!`
- **Pre-loaded Athlete:** Teddy Mercer
  - **User Password:** `default_change_me` (change this by creating a new profile)
  - **A Race:** Jones Beach — 70.3, Sep 26, 2026
  - **B Race:** Cohasset — Sprint, Jun 28, 2026
  - **C Race:** Hopkinton Season Opener — Sprint, May 17, 2026

### Changing Your Password

Since passwords are stored client-side, the simplest way to change your password is:
1. Export your data (JSON backup)
2. Create a new profile with your desired password
3. Import the old data into the new profile's activities

---

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
- For real security, you'd need a backend with bcrypt and a database

### Sharing with Training Partners
Since localStorage is per-browser, each person visiting your GitHub Pages URL will have their **own independent copy** of the app. To share training plans:
1. One person exports their data as JSON
2. Share the JSON file
3. Other person imports it

---

## Future Upgrade Path

When you're ready for shared data and real auth, the architecture is designed to migrate to:

| Component | Current | Future |
|-----------|---------|--------|
| Hosting | GitHub Pages | GitHub Pages (frontend) |
| Auth | Client-side hash | Firebase Auth / Auth0 |
| Database | localStorage | Firebase Firestore / Supabase |
| Sync | None (per-browser) | Real-time across devices |

The `appData` JSON structure maps directly to a Firestore document collection — the migration is straightforward.

---

## License

MIT — use it, modify it, share it.
