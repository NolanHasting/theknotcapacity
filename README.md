 # Knot Gym Intelligence — Firebase-only project

A standalone website, scheduled one-minute occupancy logger, Firestore historical store, and read-only API. **No Google Apps Script, Google Sheets, or Cloudflare Worker required.**

This is a new project. Its history starts from zero. Do not disable your existing Apps Script logger until this Firebase version has been deployed and verified.

## Estimated cost

At one source check per minute (up to 1,440/day) and about 500 visitors/month, use **Blaze pay-as-you-go** but expect **about $0** if within applicable allowances; this is not guaranteed. Firebase requires an attached billing account to deploy scheduled Functions. Enable **Cloud Billing budgets/alerts**, review daily usage, and set conservative quotas on exposed APIs where supported. Budgets are not hard spending caps.

The design uses one scheduled collector, 3 Firestore document writes and 3 reads per minute while open, plus up to 1 write/minute while closed. The public API reads only 3 documents, not the entire database. There is no one-document-per-minute collection. History is stored in one Firestore document per day. Summarized weekday/hour patterns live in a compact weekly rollup document. For this gym's 7AM-11PM maximum schedule, the daily document remains safely below Firestore's 1 MiB document limit under normal samples.

## Firebase services used

- Firebase Hosting — static web interface and custom domain, same-origin `/api/status` rewrite.
- Cloud Functions for Firebase (Node.js 22) — `collectOccupancy` scheduled every minute and public `getOccupancy` read API.
- Cloud Scheduler — one recurring job, created automatically from `onSchedule`.
- Cloud Firestore Standard edition — `system/current`, `system/weekly`, `days/YYYY-MM-DD`.
- Firestore security rules deny all direct client access. Functions use Admin SDK to read/write.

## First-time setup (Mac)

1. Install Node.js 22 (from https://nodejs.org/) and confirm `node -v` and `npm -v` in Terminal.
2. Go to https://console.firebase.google.com/ and create a new Firebase project. Choose a unique project ID; this becomes `https://YOUR_PROJECT_ID.web.app`. You do **not** need to add a separate Firebase Web SDK app because this website gets its data through its own `/api/status` endpoint.
3. In the Firebase console, upgrade this project to **Blaze**, attach a billing account, and configure a budget alert in Google Cloud Billing before enabling scheduled functions.
4. In the Firebase console, open **Build → Firestore Database → Create database**. Choose Standard edition and an appropriate US region, preferably near the Cloud Functions `us-east1` region. Keep the default `(default)` database. Its client rules will be replaced with the included deny-all rules. Avoid paid extras such as TTL/PITR/backup until needed.
5. Extract this ZIP on your Mac and open Terminal in the directory containing `firebase.json`.
6. Run:

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add
   ```

   Select your new project and assign the alias `default`. (If this says no Firebase projects are found, use `firebase projects:list` and check that you logged into the same Google account.)
7. Install backend dependencies:

   ```bash
   cd functions
   npm install
   npm test
   cd ..
   ```

8. Deploy all services:

   ```bash
   firebase deploy --only firestore:rules,functions,hosting
   ```

   The first deployment can prompt you to enable the Cloud Functions, Cloud Run, Cloud Build, Artifact Registry, Cloud Scheduler, and Firestore-related APIs, and to grant related permissions. Read prompts carefully and allow the project APIs needed by Functions.
9. Open the Hosting URL printed by Firebase (e.g., `https://YOUR_PROJECT_ID.web.app`). The site can initially show 'Waiting for first scheduled reading' until the first scheduled check runs **during open hours**. When the gym is closed, it will display CLOSED after the scheduler executes.
10. Test the JSON endpoint at `https://YOUR_PROJECT_ID.web.app/api/status` — it should return JSON with `ok`, `open`, `label`, `todayHistory`, and `forecast`. (If `ok:false` with a delayed reading, inspect Functions logs and the gym endpoint.)

## Update the iPhone 11 widget

Open `ScriptableWidget_Firebase.js`; replace `YOUR_PROJECT_ID` in the first URL with your real Firebase project ID. Copy the entire script into Scriptable. The small widget requests `/api/status` and follows **the exact status labels returned by Firebase**. Keep your existing `Logo_File.png` in Scriptable's Documents folder. The widget's requested five-minute refresh is not guaranteed: iOS decides when background widget refreshes occur.

## How to make updates

- Change the interface in `public/index.html`, `public/styles.css`, or `public/app.js`.
- Change occupancy bands, gym hours, or forecasting in `functions/logic.js`.
- Change scheduled polling / database layout / the API in `functions/index.js`.
- Deploy code with `firebase deploy --only hosting` (design only) or `firebase deploy --only functions` (backend only).
- Changes to forecast calculation affect future scheduled snapshots, and no historical rows are destroyed.

## Why this is low cost

A naive implementation could query 1,440 minute records per visitor or read the entire history at each refresh. This design instead makes **three small Firestore reads per API request**, and **roughly three reads + three writes per logged minute**. More users or longer browsing sessions can still increase charges, so monitor billing.

The API returns one day's minute history and a weekly/hourly aggregate. It does not do a full database scan, and the historical daily documents retain data without paid TTL deletion. Every active minute may append one point to the day document. The remaining history stays available for future reports, although the included frontend shows only the current day and aggregate weekday patterns.

## How forecasting works

Once enough recent data exists, the system computes a trend from a previous reading around 15–45 minutes ago and blends that momentum with historical weekday/hour changes. Forecasts stop at the scheduled closing time. When there is too little data it returns no forecast. The shaded band is only an illustration of uncertainty; **it is not statistically validated confidence**. Additional weeks of data will improve historical comparisons, but this model does not promise accuracy.

## Important operational and legal notes

- `functions/logic.js` contains schedule hours from the original prototype: Sunday and Saturday 7AM–10PM; Monday–Friday 7AM–11PM (Eastern). These are **not verified live holiday hours**. CLOSED is schedule-based.
- The source endpoint `https://climbtheknot.com/api/capacity.json` may not permit commercial reuse or once-per-minute polling. Obtain the gym's permission before a public or monetized launch, and be prepared to reduce the polling interval if required.
- This package uses the previously supplied Knot logo and name. Public or commercial use could require permission. The site includes an independent-project disclaimer, which is not a substitute for permission.
- Never put Firebase Admin service account credentials in the website. The backend deploys with managed credentials; browser clients only call `/api/status`.
- As with every public endpoint, API abuse or unusual traffic can raise charges despite low expected usage. Monitor budgets and APIs.
- Firestore is configured as deny-all for browser access; the public HTTP function intentionally serves only occupancy data.

## Troubleshooting

- **Functions won't deploy**: confirm Blaze billing, required Google APIs, Node.js 22, an initialized Firestore database, and compatible function versions (`cd functions && npm install`).
- **HTTP 404 at `/api/status`**: ensure Hosting and Functions were deployed in the same project and both are in the correct region; run `firebase deploy --only functions,hosting`.
- **No live readings**: inspect Cloud Functions logs for `collectOccupancy`. When closed, the collector intentionally avoids calling the source API.
- **Source reading delayed**: check whether the gym API returns valid JSON and whether the source limits automated requests.
- **CLOSED at wrong time**: correct `HOURS` in `functions/logic.js`, then deploy functions again.
- **Missing logo on iPhone**: keep `Logo_File.png` inside the Scriptable folder.

## Official docs

- Firebase pricing: https://firebase.google.com/pricing
- Cloud Scheduler pricing: https://cloud.google.com/scheduler/pricing
- Firebase scheduled functions: https://firebase.google.com/docs/functions/schedule-functions
- Firebase Hosting custom domains: https://firebase.google.com/docs/hosting/custom-domain
