# BD API Key Balances Dashboard

A small team dashboard for manually tracking API-provider balances and usage.

The current build intentionally contains only:

- **Dashboard** — empty placeholder page for future features.
- **API keys balances** — current balances, cumulative usage, per-API usage ranges, new history entries, and editable saved history.
- **Login / Register** — separate team accounts stored in the same local SQLite database.

The code is split into small frontend pages/components and backend routers/services so you can add more pages later without rebuilding the whole project.

A fresh install starts with the provider catalog and no balance history. Add your own balances after creating an account. Existing database files keep their current history.

## Main behavior

### New Balance

The balance-entry form is hidden until you click **+ New Balance**.

For each API provider:

- **Total Balance** is the latest saved remaining balance and is read-only in this form.
- Enter **Used** and **Left** is calculated automatically.
- Enter **Left** and **Used** is calculated automatically.
- Inputs support more than two decimal places.
- Typing no longer rewrites the active field on every keystroke, so selecting the entire number and replacing it does not move the cursor to the end.

The relationship is:

```text
Total = Used + Left
```

If you click **Save to History** without changing any values, the latest remaining balances are saved again with `0` new usage.

The form checks whether the latest balance changed after it was opened. If another teammate saved first, this entry is rejected so the old form cannot overwrite newer balances.

### Add Balance

Click **+ Add Balance** when you buy/top up an API account. Enter only the amount added. The dashboard shows:

```text
New Total Balance = Current Balance + Added Balance
```

Saving creates a new balance snapshot. Added funds/credits are not counted as usage. The server performs the addition against the latest saved balance so a stale browser page does not overwrite a newer team update.

### Balance History

History has server-side pagination with selectable page sizes of 5, 10, 20 or 50 rows.

Each saved row has:

- **Edit** — correct the date, Total, Used or Left values.
- **Delete** — remove a wrong/unwanted history entry after a confirmation prompt.

Deleting a row also removes that row's usage from the cumulative totals.

### Total used balance

The large blue number is cumulative usage for providers whose unit is **USD**. Credits and Chutes `t` are not added to the dollar total because those units are not dollars. Their usage is tracked separately.

### Total used balance by API key and date range

The **Total Used Balance by API Key** section shows the summed `Used` value for every provider. It supports:

- **All Time** — every saved history entry.
- **1 Day** — the latest saved balance date.
- **1 Week** — the latest saved date plus the previous 6 calendar days.
- **1 Month** — the latest saved date plus the previous 29 calendar days.
- **Custom Range** — choose inclusive **From** and **To** dates with the calendar inputs, for example September 1 through September 20.

Preset ranges end on the latest saved history date rather than the computer clock. This means the buttons still show useful data if the most recent balance entry was backdated or no entry has been saved today.

Each API key keeps its own unit. USD, credits, and Chutes `t` are shown separately instead of being added together into a meaningless mixed-unit total.

### Light and dark appearance

Use the **Light mode / Dark mode** button on the sign-in and registration pages or in the sidebar after signing in. Your choice is saved in the current browser and is used the next time you open the dashboard.

## Folder structure

```text
bd-api-balances/
│
├── backend/
│   └── app/
│       ├── main.py                    # FastAPI app + frontend hosting
│       ├── config.py                  # .env/server/database settings
│       ├── database.py                # SQLite schema/connection
│       ├── security.py                # password/session security
│       ├── dependencies.py            # logged-in-user dependency
│       ├── routers/
│       │   ├── auth.py                # login/register/logout/me API
│       │   ├── balances.py            # balance/history API endpoints
│       │   └── usage.py               # usage-range API endpoint
│       └── services/
│           ├── balance_service.py     # balance calculations + history logic
│           ├── usage_service.py       # totals by API key/date range
│           └── seed_service.py        # initial API provider catalog
│
├── frontend/
│   ├── index.html
│   ├── styles/
│   │   ├── base.css                   # buttons, fields, cards, modal
│   │   ├── layout.css                 # sidebar + general page layout
│   │   ├── auth.css                   # login/register pages
│   │   └── balances.css               # API balance page styling
│   └── js/
│       ├── app.js                     # frontend router
│       ├── theme.js                   # theme preference and switching
│       ├── api/client.js              # calls backend APIs
│       ├── components/
│       │   ├── sidebar.js
│       │   ├── themeToggle.js
│       │   ├── modal.js
│       │   ├── toast.js
│       │   └── usageRangeSummary.js   # 1 day/week/month/custom usage UI
│       ├── config/
│       │   └── providerUi.js           # provider symbols used by balance UI
│       ├── pages/
│       │   ├── dashboardPage.js       # empty dashboard page
│       │   ├── apiBalancesPage.js     # main page + edit history modal
│       │   ├── loginPage.js
│       │   └── registerPage.js
│       └── utils/format.js
│
├── data/
│   └── bd_dashboard.db               # created automatically on first run
│
├── tests/
│   ├── test_balance_integrity.py      # balance and startup regressions
│   ├── test_theme_state.mjs           # theme persistence and control state
│   └── test_theme_ui.mjs              # theme controls on app screens
├── .env.example
├── requirements.txt
├── run.py
├── setup-windows.bat
├── start-windows.bat
├── setup-linux.sh
└── start-linux.sh
```

## Windows 11 setup

### 1. Extract the project

For example:

```text
D:\Projects\bd-api-balances
```

### 2. Run setup once

Double-click:

```text
setup-windows.bat
```

It creates `.venv`, installs FastAPI/Uvicorn **inside that virtual environment**, and creates `.env` from `.env.example`. The setup script uses any working Python 3.10+ installation already on the PC and uses `.venv\Scripts\python.exe` directly, so it does not depend on `activate.bat` or require Python 3.11 specifically.

If an earlier setup attempt left an incomplete `.venv`, run `setup-windows.bat` again. The corrected script removes the incomplete environment and rebuilds it.

### 3. Set a team registration code for network access

Open `.env` and set:

```text
BD_REGISTRATION_CODE=a-long-private-team-code
```

For local-only use, the code can remain blank. For LAN access, also set:

```text
BD_HOST=0.0.0.0
```

The server refuses to start on a non-local interface without a registration code. Only teammates who know that code can register.

### 4. Start the dashboard

Double-click:

```text
start-windows.bat
```

On the computer running the server, open:

```text
http://127.0.0.1:8765
```

Register your first account, then sign in.

## Let teammates use it from another PC on the same network

To allow LAN connections, set `BD_HOST=0.0.0.0` and a private `BD_REGISTRATION_CODE` in `.env`, then restart the server. By default it listens only on the host PC.

Another device can connect if Windows Firewall allows the port.

### 1. Find the host PC IPv4 address

On the host PC, open Command Prompt:

```bat
ipconfig
```

Look for an address similar to:

```text
192.168.1.50
```

### 2. Allow port 8765 through Windows Firewall

Open **PowerShell as Administrator** on the host PC:

```powershell
New-NetFirewallRule -DisplayName "BD Dashboard 8765" -Direction Inbound -Protocol TCP -LocalPort 8765 -Action Allow -Profile Private
```

Use this on a trusted **Private** network, not an untrusted public Wi-Fi network.

### 3. Friend opens the dashboard

From the friend's computer on the same LAN/Wi-Fi:

```text
http://192.168.1.50:8765
```

Replace `192.168.1.50` with the actual IPv4 address of the computer running the dashboard.

Every teammate registers/logs in through the same server, so everyone sees the same balance history stored in:

```text
data/bd_dashboard.db
```

## Access from outside your home/office network

Do **not** directly expose port 8765 to the public internet with router port forwarding.

For remote access, use one of these approaches instead:

- Tailscale between team computers.
- A VPS with HTTPS/reverse proxy.
- A secure tunnel/reverse proxy with HTTPS.

If you later run the dashboard behind HTTPS, set:

```text
BD_COOKIE_SECURE=true
```

## Where to edit things later

### Change the API balance page

```text
frontend/js/pages/apiBalancesPage.js
```

### Change login/register pages

```text
frontend/js/pages/loginPage.js
frontend/js/pages/registerPage.js
```

### Add a new page

1. Create a new file in:

```text
frontend/js/pages/
```

2. Add the link in:

```text
frontend/js/components/sidebar.js
```

3. Add the route in:

```text
frontend/js/app.js
```

### Add a new backend function/API

Create or edit a router in:

```text
backend/app/routers/
```

For larger business logic, put the logic in:

```text
backend/app/services/
```

Then include the router from:

```text
backend/app/main.py
```

### Change the API provider catalog

```text
backend/app/services/seed_service.py
```

The catalog is added on startup when missing. The app does not seed sample balance history. Existing history remains in your database.

## Database backup

Stop the dashboard and copy this file somewhere safe:

```text
data/bd_dashboard.db
```

That single file contains users, sessions, API providers, and balance history.

## Run the integrity tests

From the project folder, run:

```bash
python -m unittest discover -s tests -v
```
