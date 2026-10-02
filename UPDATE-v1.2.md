# BD API Balances v1.2

## Added: total used balance by API key

A new section on **API keys balances** shows the total `Used` amount for every provider.

Available ranges:

- **All Time**
- **1 Day**
- **1 Week**
- **1 Month**
- **Custom Range** using From/To calendar inputs

The custom range is inclusive. Example: `2026-09-01` through `2026-09-20` includes both September 1 and September 20.

Preset ranges end on the latest saved balance date. This keeps them useful if the latest record is backdated or there is no entry for the current day.

## Units

Providers keep their own units:

- OpenRouter, Parallel, Exa, desearch, Vercel(GateWay): USD
- Firecrawl, Tavily: credits
- Chutes: `t`

The page also shows range totals by unit. Different units are never added together.

## New source files

```text
backend/app/routers/usage.py
backend/app/services/usage_service.py
frontend/js/components/usageRangeSummary.js
frontend/js/config/providerUi.js
```

## Existing files updated

```text
backend/app/main.py
frontend/js/api/client.js
frontend/js/pages/apiBalancesPage.js
frontend/styles/balances.css
README.md
```
