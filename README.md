# Morrow

**Your money. Tomorrow, explained.**

Morrow is a personal investment tracker designed to make investing easier to understand. It brings portfolio tracking, investment journeys and simple financial projections together in one approachable dashboard.

## Release overview

- **Morrow 1.0** — Original portfolio tracker.
- **Morrow 1.1** — Investment Journey: historical VUAG performance, illustrative future scenarios and stress testing.
- **Morrow 1.2 (in development)** — International portfolio foundations, including selectable display currency and currency-conversion support.
- **Morrow 1.3 (development preview)** — Portfolio-first dashboard, cash accounting, transaction history, CSV import review and provider-fee estimates.

The `main` branch is the live 1.0 site. Versions 1.2 and 1.3 are being developed on the `development` branch and published to the preview folder. `main` retains the original live app.

## Morrow 1.3 — investment accounting and portfolio-first layout

**Implementation status: development preview for hands-on testing, not production-ready.**

### What changed

- Investment holdings and portfolio totals are the first screen; the new-investment form opens in a four-step dialog.
- Account cash, net contributions, portfolio value, income and recorded fees are shown separately, with a contributed-capital-versus-growth donut chart.
- New Transactions page for deposits, withdrawals, purchases, sales, dividends, interest and fees.
- Starting holding snapshots are preserved separately from later activity. Purchases/sales can recalculate units and cost basis from the snapshot rather than overwriting it repeatedly.
- Holding details include current unit price rounded to two decimals, transaction history, Investment Journey shortcut and **Update current value** for reconciling imported activity with a provider's actual value.
- CSV import is optional at onboarding and available thereafter. It accepts CSV (500 transactions / 4 MB per batch) with column mapping, review, duplicate warnings and historical-only records for rows on or before the starting snapshot.
- **Vanguard UK report import:** original `.xlsx`/`.xls` Client Transactions Listing workbooks, and corresponding Numbers-exported multi-section CSV reports, are recognised without manual column mapping. The importer pairs cash-side and investment-side trades by type, quantity, amount and nearby settlement dates.
- **History choice:** Vanguard imports offer an update-existing mode (old entries are references only) or full-history rebuild mode. Rebuild requires selected cash flows to reconcile with Vanguard's reported closing balance, confirms account-scoped replacement and downloads a full backup before changes.
- **Ambiguous ledger rows:** unlabelled investment entries are flagged as possible transfers in and deliberately unchecked by default. Users must review them to avoid missing investment units. Unmatched trade rows block full-history rebuild.
- **Workbook dependency:** Excel parsing uses SheetJS 0.20.3 loaded from the official SheetJS CDN. Files are read and parsed inside the browser; the spreadsheet contents are not sent to Morrow's Worker. For a future production release, vendor and audit the dependency instead of relying on a third-party runtime CDN.
- Provider-account selection and editable fees. Vanguard UK fee estimates are offered for self-managed, Junior and managed plans; other providers can use custom fixed/percentage fees. Fund OCF is disclosed separately. Estimates do not generate fee transactions or affect the account balance.
- Full JSON backup now includes holdings, accounts, baselines, transaction ledger and display-currency preference. Legacy holdings-only JSON can still be restored.

### Important limitations to test before release

- Non-Vanguard CSV imports still use a **generic header-mapping workflow**. Selecting other providers labels the source but does not imply that their proprietary exports have been validated. The Vanguard adapter was designed from a real 2026 UK report format, but additional Vanguard versions and account types still need validation.
- Vanguard UK Client Transactions Listing XLSX/XLS files are supported. Other providers still require CSV column mapping; PDF statement parsing is **not** supported.
- Importing a CSV covering dates before a holding's starting snapshot imports those rows as historical reference only; it does not reconstruct full history or silently replace current balances.
- Current values for non-VUAG holdings may need manual updates from provider statements. A historical buy/sell ledger alone does not establish the current market price.
- The portfolio's percentage return is a **simple net-contributions comparison**, not a time-weighted or money-weighted investment return. The Investment Journey historical VUAG series is price history, not historical total-account performance.
- The accounting engine currently assumes transactions and cash balances are recorded in **GBP**. Other currencies are rejected at CSV review; complete native-currency accounting and correct FX-cost-basis handling remain future work.
- The account-fee estimates are illustrative and need testing against real provider rules and combinations of account types. Vanguard managed-account estimates include the 0.20% management fee, but fund OCF remains separately disclosed.
- A clean provider export may include cash movements in a different structure from trades; make sure to import opening cash or deposits as appropriate to avoid negative cash balances. Morrow warns rather than hiding negative cash.
- No automatic broker connection, server-side user database, authenticated sync or live automated fund reconciliation has been implemented.
- Data is stored in localStorage. Back up regularly. The preview has passed script syntax and structural control checks, but not a full cross-browser test suite.

## Morrow 1.2 updates introduced so far

### Selectable portfolio display currency

A new setting lets the user choose how portfolio figures are displayed:

- **GBP** — pounds sterling (default)
- **USD** — US dollars
- **EUR** — euros

The selection is saved in the browser using local storage and is restored on the next visit.

The display-currency setting changes the currency used to present portfolio figures. It does not change the underlying investment, its trading currency or the original purchase records.

### Currency conversion endpoint

The Cloudflare Worker now provides an `/fx` endpoint:

```text
/fx?from=USD&to=GBP
/fx?from=GBP&to=USD
/fx?from=EUR&to=GBP
```

The endpoint:

- Uses Twelve Data's exchange-rate service for supported currency pairs.
- Returns the source currency, target currency, rate, provider and retrieval timestamp.
- Returns a rate of 1 when the source and target currencies are the same.
- Handles GBP/GBX conversion directly for sterling pounds and pence.
- Validates currency codes and reports errors when a usable rate is unavailable.

Example response:

```json
{
  "from": "USD",
  "to": "GBP",
  "rate": 0.74601,
  "timestamp": 1793645580,
  "datetime": null,
  "provider": "Twelve Data",
  "retrievedAt": "2026-11-02T18:54:39.193Z"
}
```

Rates are retrieved from the provider and can change. The example above is illustrative of the response format, not a fixed exchange rate.

### Important implementation status

The display-currency selector and exchange-rate retrieval are the first stage of multi-currency support. Native-currency handling for each individual holding is **not yet complete**.

Before treating portfolio totals as fully multi-currency accurate, the app still needs to:

- Store each investment's native quote currency, exchange/listing and instrument metadata.
- Keep purchase prices and latest prices associated with their correct currencies.
- Convert each holding into the selected portfolio currency before calculating totals, gains/losses and projections.
- Display the quote currency, data source and price date/freshness clearly.
- Handle provider coverage and unavailable quotes safely.

Until that work is complete, treat the currency selector as an early development feature and do not rely on it for accurate mixed-currency portfolio accounting.

## Existing features

### Portfolio tracker

- Add, edit and remove investment holdings.
- Record ticker, investment name, units, average purchase price and latest price.
- View portfolio value, amount invested and gain/loss.
- Save holdings in the browser using local storage.
- Export holdings to a JSON backup and restore from a backup.

### Automatic VUAG price refresh

- VUAG prices are retrieved through the Cloudflare Worker using Newton Analytics.
- The feed provides an end-of-day reference price, not a live trading quote.
- The app records the quote date and source.
- Other holdings can currently be updated manually.

### Investment Journey (Morrow 1.1)

- Historical VUAG price chart with 1M, 6M, 1Y, 5Y and All periods.
- Illustrative future scenarios using 2%, 5% and 8% annual growth assumptions.
- Projection periods from 1 to 20 years.
- Optional monthly contributions for an individual holding.
- Stress tests showing the effect of hypothetical 20%, 30% and 40% market falls.

Historical data and projections have limitations. Projections are assumptions, not forecasts or guarantees. They exclude fees, tax and inflation.

### Financial Future calculator

A separate calculator models the possible future value of savings and investments using an initial amount, monthly contributions, an assumed annual growth rate and a time horizon. It is an educational illustration, not a prediction.

## Technical overview

- **Frontend:** `index.html`, with the Morrow 1.3 additions in `morrow-v13.js`, `morrow-v13.css`, `morrow-vanguard.js` and `morrow-vanguard-ui.js`.
- **Hosting:** GitHub Pages.
- **Backend:** Cloudflare Worker.
- **Market data:** Newton Analytics for the VUAG reference-price feed; Twelve Data for supported symbol search, quotes and FX requests.
- **Browser storage:** local storage for holdings, accounts, snapshot baselines, transactions and the display-currency preference.

The Worker URL currently used by the app is:

```text
https://morrow-price-feed.jnkbnfzksg.workers.dev/
```

### Worker endpoints

| Endpoint | Purpose |
|---|---|
| `/health` | Check that the Worker is responding |
| `/vuag` | Latest available VUAG daily reference price |
| `/vuag-history` | Historical VUAG data |
| `/search?q=...` | Search for supported instruments |
| `/price?symbol=...` | Retrieve a supported instrument quote |
| `/quote?symbol=...` | Legacy Twelve Data quote response |
| `/fx?from=USD&to=GBP` | Retrieve a currency conversion rate |

The Twelve Data API key is stored as a Cloudflare Worker secret named `TWELVE_DATA_API_KEY`; it must not be placed in frontend code or committed to the repository.

## Development and preview

- `main` — live Morrow 1.0 site.
- `development` — ongoing development, including Morrow 1.2 and 1.3.
- GitHub Actions publishes the development branch into the `preview/` folder on `main`.

Live site: https://rpr9bn8wf7-create.github.io/my-stock-tracker/

Development preview: https://rpr9bn8wf7-create.github.io/my-stock-tracker/preview/

After changes are pushed to `development`, check the **Publish Morrow development preview** workflow in GitHub Actions before reviewing the preview site.

## Current limitations and future work

Morrow is currently a personal development project, not a commercial investment service.

Planned 1.2 work includes:

- Predictive instrument search with exchange, listing and currency distinctions.
- Automatic quote retrieval when an instrument is selected.
- Correct native-currency storage and conversion into the selected display currency.
- Clear quote-source, quote-date and price-freshness information.
- Broader instrument coverage, subject to data-provider availability and licensing.

Market-data availability, delays, usage limits and redistribution rights depend on each provider and exchange. A free API tier does not automatically grant commercial redistribution rights. Commercial release would require appropriate data licences, security and privacy work, hosting and operational planning, and review of any applicable financial-services regulation.

Morrow is intended to help users understand and track their own investments. It does not currently execute trades or provide personalised regulated investment advice.

---

*This README describes the development branch and features implemented in the Morrow 1.3 preview.*
