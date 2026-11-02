# Morrow

**Your money. Tomorrow, explained.**

Morrow is a personal investment tracker designed to make investing easier to understand. It brings portfolio tracking, investment journeys and simple financial projections together in one approachable dashboard.

## Release overview

- **Morrow 1.0** — Original portfolio tracker.
- **Morrow 1.1** — Investment Journey: historical VUAG performance, illustrative future scenarios and stress testing.
- **Morrow 1.2 (in development)** — International portfolio foundations, including selectable display currency and currency-conversion support.

The `main` branch is the live 1.0 site. Work on 1.2 is being developed on the `development` branch and published to the preview folder.

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

- **Frontend:** HTML, CSS and JavaScript in `index.html`.
- **Hosting:** GitHub Pages.
- **Backend:** Cloudflare Worker.
- **Market data:** Newton Analytics for the VUAG reference-price feed; Twelve Data for supported symbol search, quotes and FX requests.
- **Browser storage:** local storage for holdings and the display-currency preference.

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
- `development` — ongoing development, including Morrow 1.2.
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

*This README describes the development branch and the features implemented at the time of writing. It should be updated as Morrow 1.2 progresses.*
