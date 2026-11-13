# Knot Capacity

Independent live crowd tracker for The Knot Climbing Gym in Gainesville, Florida.

**Public site:** https://climbtheknot.live/  
**Official gym website (unaffiliated):** https://climbtheknot.com/

## What it shows

- Current count reported by the gym's public capacity endpoint.
- Historical reported counts and inferred staff recounts, shown separately.
- Short-term forecasts through closing, and future-date crowd estimates.
- A weekly heatmap and suggested quieter climbing hours.

**Interpretation:** The gym's reported counter appears to increase with check-ins. Downward corrections are treated as staff recounts and the ending counts are used as stronger historical occupancy observations. Their magnitude does **not** measure the number of departures. Some staff recounts may increase the count, which cannot reliably be identified from public source changes alone. All prediction ranges are estimates, not independently certified headcounts.

## Architecture

| Path | Purpose |
| --- | --- |
| `functions/index.js` | Cloud Functions, hourly schedule, Firestore collection, read-only APIs |
| `functions/health.js` | Schedule-aware source freshness and public status |
| `functions/logic.js` | Crowd categories, observed trend, weekly averages, legacy forecast fallback |
| `functions/recounts.js` | Group downward corrections into one staff recount episode |
| `functions/seasonal.js` | Recount-anchored seasonal forecast, chronological backtest, empirical interval bands |
| `functions/analytics.js` | Daily compact summaries, frozen forecasts, model-specific accuracy scores |
| `functions/history.js` | Historical and fallback future-date APIs |
| `public/` | Static dashboard, CSS and search metadata |
| `tests/` | Node regression checks |
| `.github/workflows/` | Tests, previews, production deploy, cleanup, manual export |

### Storage collections

- `system/current`: latest reading, health, current forecasts and recent observations.
- `system/weekly`: cumulative day/hour and 15-minute aggregates.
- `system/seasonalModel`: completed-day recount profile and historical backtest.
- `days/YYYY-MM-DD`: minute observations, used by history and training.
- `dailySummaries`: 15-minute summaries.
- `forecastSnapshots`: frozen predictions (with model version).
- `forecastScores`: daily scores separated by model.
- `recountEvents`: inferred staff recount episodes.

Firestore client access is denied. The public website uses GET-only Cloud Functions at `/api/status` and `/api/history?date=YYYY-MM-DD`.

### Schedules

Times shown are America/New_York.

- Every minute: `collectOccupancy`, which fetches only during configured gym hours.
- 2:15 AM: `scoreOccupancyForecasts`, which evaluates yesterday's saved forecasts.
- 4:20 AM: `trainSeasonalForecast`, which refreshes the model using up to 60 completed days.

Gym hours are configured in `functions/logic.js` (`HOURS`); verify against the official gym when operating hours change. The scheduled closing-time zero is a modeling assumption, not a measurement.

### Forecasting constraints

The real-time forecast is anchored to the latest reported count; if enough completed days have recount observations, the seasonal model blends recent trend with a learned daily curve. Unsupported hours do not receive arbitrary long-gap interpolations. Prediction intervals use measured errors against later recounts only when enough independent days and comparisons exist. Otherwise, they are explicitly provisional.

`forecastAccuracy` in the status API reflects only the active forecast version; previous models' results are retained in daily `forecastScores`.

## Local development

Node.js 22 required.

```bash
npm ci --prefix functions
npm test --prefix functions
node --check functions/index.js
```

Firebase project: `theknotcapacity`. Deployments occur from merged commits on `main` via GitHub Actions. Do not commit service-account credentials or `.env` secrets. Use the existing GitHub secret `FIREBASE_SERVICE_ACCOUNT_THEKNOTCAPACITY` with the deployment workflow.

## Backup and data export

Historical backup branches are kept under `backup/`. For data backups, use the manual **Export historical Firestore occupancy data** workflow. The export is encrypted before upload and requires `EXPORT_ENCRYPTION_PASSWORD`; never commit extracted data or an unencrypted export.

**Scaling consideration:** The original collector rewrites a growing `days/YYYY-MM-DD` array and cumulative `system/weekly` aggregates. Firestore document size limits may eventually require chunked day records and a data migration. Do not replace these schemas without updating the history, training and export readers together and verifying recovered history first.

## Search indexing

The single public indexable page is `https://climbtheknot.live/`. Its XML sitemap is at `https://climbtheknot.live/sitemap.xml` and is linked from `/robots.txt`. A sitemap lists URLs for crawlers; it is not a duplicate of the webpage. Submit the full sitemap URL in Google Search Console for the custom domain. The XSL stylesheet only makes the XML more readable in browsers.

## Disclaimer

Knot Capacity is an independent project, not owned or endorsed by The Knot Climbing Gym. Live count and historical reports come from the gym's public capacity feed. No guarantee of actual headcount, future capacity, opening hours or admission is made.
