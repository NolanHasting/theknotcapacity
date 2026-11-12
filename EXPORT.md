# Export occupancy history

Open GitHub **Actions** > **Export historical Firestore occupancy data** > **Run workflow**.
Once the workflow succeeds, open its run and download **knot-firestore-export** from Artifacts.

The ZIP contains:
- `occupancy-readings.csv`: one row per timestamp and observed count
- `firestore-history.json`: day documents and current/weekly Firestore summaries
- `summary.json`: coverage, first and last timestamps, maximum and overall mean

The workflow uses the same `FIREBASE_SERVICE_ACCOUNT_THEKNOTCAPACITY` secret as the existing Firebase deployment. Its identity needs **Cloud Datastore User** or an equivalent Firestore read permission. No Firestore security rules are loosened. Because this is a public GitHub repository, exported data **must be encrypted** before uploading as an artifact. The workflow refuses to upload raw data without the required encryption password; its encrypted artifact expires after 1 day. Keep the password separate from the archive.

To export on a trusted local machine instead, from the repository root:

```bash
npm ci --prefix functions
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json node functions/export-firestore.js
```

Do not commit the exports or service-account keys. Only run exports from a trusted branch.

## How to interpret the data

For each hour and date, first average minute readings into a single daily hourly average. Then calculate the weekday/hour typical mean and dispersion from those daily means. This prevents a day with more polling records from dominating the pattern. Separate predicted results from observed counts and backtest predictions using later actual readings. Check missing periods and DST before claiming trends.
