# Climbing Planner — setup and rollback

The planner is an optional section at `/planner.html`. The original occupancy dashboard, Scriptable widget, live data collector, public status endpoint, historical data and forecasting stay unchanged.

## Safe backup

- **Backup branch:** `backup/pre-planner-2026-11-12`
- **Original main commit:** `4537587a89e4b80fb9ee60189a2528a83157daaf`
- **Planner branch:** `feature/alerts-friends-events-pwa`
- The backup branch is not eligible for the automatic `feature/*` / `fix/*` cleanup.
- This backs up **code and hosted site assets**, not Firestore records. Do not delete users' personal planner data as part of a code rollback.

To restore the pre-planner code, revert the planner PR merge on `main` using GitHub's Revert option (or a normal `git revert -m 1 <merge-sha>` for a merge commit). The production GitHub Action redeploys. You can also redeploy the backup commit after a separate approval; avoid resetting public branch history.

## One-time Firebase Console setup

1. Firebase Console > **Build > Authentication > Sign-in method**: enable **Email/Password**.
2. Authentication > **Settings > Authorized domains**: authorize the public Firebase Hosting domain `theknotcapacity.web.app` and any custom planner domain used.
3. Confirm `https://theknotcapacity.web.app/__/firebase/init.json` returns the Firebase public web-app config. If it does not, register a Firebase Web App and configure the Hosting web-app association.
4. Firebase Console > **Project settings > Cloud Messaging > Web Push certificates**: generate a key pair. Copy the **public VAPID key** into `public/planner-config.js` as `vapidKey`. This key is meant to be public; do **not** put Firebase service-account private keys in the browser.
5. Deploy the changed configuration through the normal GitHub `main` workflow. The scheduled Cloud Functions use the preconfigured runtime service account and might require sufficient Scheduler and Messaging permissions.
6. From an iPhone running iOS 16.4+, open the hosted planner in Safari, choose **Share > Add to Home Screen**, launch the Home Screen app, sign in, and press **Enable phone notifications**. iOS web push requires a Home Screen web app and explicit notification permission.
7. Verify the privacy controls and alerts with two test accounts and two separate devices before inviting other users.

## Privacy and limitations

- Authentication and verification are handled by Firebase Authentication.
- All planner data remains inaccessible through client Firestore rules. `plannerApi` checks valid Firebase ID tokens and verified email addresses before private reads or writes.
- Climbing plans are private by default. A plan becomes visible to someone else only when marked `share=true` **and** both people have mutually approved a friendship.
- Friend requests are made using private friend codes. No public people search or location tracking.
- A cooldown of 90 minutes and a 3-person hysteresis buffer limit rapid threshold notifications.
- Early predictive alerts remain off unless explicitly enabled by the user and the model has at least two matching historical days. Inaccurate forecasts should not be sent as confident recommendations.
- Crowd alerts use the gym's **reported count**, which may include staff recount corrections; these values are not verified physical capacity.
- New scheduled functions operate separately from occupancy collection and skip alerts if source data is missing or more than three minutes old.
- Users may remove their plans, disable a device's push subscription, remove friends, or delete their planner account.
- Browser push notification delivery is subject to device permissions, browser/platform restrictions and network availability.

## Gym schedule integration

- The uploaded HTML identifies the official booking calendar as [portal.climbtheknot.com/gnv/n/calendar](https://portal.climbtheknot.com/gnv/n/calendar) powered by **Redpoint HQ**.
- The HTML contains a `StorefrontCalendarQuery` identifier and plan categories, but not a confirmed public JSON/ICS feed of upcoming dated sessions. Do not assume this internal query is an authorized third-party API.
- The scheduled `refreshKnotEvents` function reads the gym's public [events page](https://climbtheknot.com/events/) every six hours and only publishes events with **explicitly parsed future dates**. It preserves previously valid results if the parser fails, and the website always links to the authoritative Redpoint calendar and closures page.
- Event imports are not currently a training signal for the occupancy model or authoritative closure overrides; add these only when dates and venue effects can be verified.

## Monitoring

Firebase Console > Functions/Cloud Scheduler:
- `plannerApi`: sign-in-protected requests and public event listing.
- `evaluatePlannerAlerts`: every five minutes while fresh occupancy is available.
- `refreshKnotEvents`: every six hours, read-only website ingestion.
- Existing `collectOccupancy` remains scheduled every minute.

If user accounts or push notifications are unconfigured, the planner displays setup / permissions feedback; **the existing occupancy dashboard continues independently**.
