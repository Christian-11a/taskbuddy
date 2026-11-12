# APK test report: revoked verification + certificate expiry (2026-11-13)

Build and test of the mobile APK from `main` at PR #137 (mobile/expiry-and-revoked), following
`docs/handoff-mobile-expiry-and-revoked.md`. Test accounts only (a test provider and a test client);
no real user's account was changed. Screenshots are in `docs/apk-test-screenshots/`.

## Build

- Built from `main` at PR #137: `npx expo prebuild -p android --clean`, then `gradlew assembleRelease`.
- Checks before building: `npx tsc --noEmit` passed. `npx jest`: 3223 of 3225 tests passed. The 2 failures
  were in `HOHomeScreen.test.tsx`; that file passes 41/41 when run alone, so they look like timing flakes
  under load (cause not proven, not related to this change).
- First two Gradle attempts failed with `Self-suppression not permitted / Metaspace` (the generated
  `gradle.properties` caps metaspace at 512 MB). The third attempt succeeded with
  `-Dorg.gradle.jvmargs="-Xmx3g -XX:MaxMetaspaceSize=1g"` and `-PreactNativeArchitectures=arm64-v8a`.
- The APK is therefore **arm64-v8a only** (about 53 MB). It does not run on x86 emulators.
- Release signing uses the debug keystore (the Expo template default).

## Results

| # | Check | Result |
|---|---|---|
| 1 | Home card says the certificate was revoked, offers "Upload again" | Pass (`c1-home.png`) |
| 2 | Verification screen opens without a crash, shows "ID approved · certificate revoked" | Pass on the crash. The revoke **reason is not shown** on this screen (see note 1) (`c2-verification.png`) |
| 3 | Certifications: "Revoked", reason, "Resubmit", no "Remove" | Pass (`c3-certifications-list.png`) |
| 4 | Notifications: "Verification revoked" with the reason | Pass (`c4-notifications.png`) |
| 5a | Submit with no date and no box: expiry error | Pass (`5a-expiry-error.png`) |
| 5b | Ticking the box greys out the date button; picking a date works | Pass (`5b-noexpiry-ticked.png`, `5b-resubmit-noexpiry.png`) |
| 5c | Submit with a date, and with the box ticked | Both reached the server (see note 2) |
| 6 | Admin: certificate shows the date, or "No expiry date (provider says). Check the photo"; approving makes the provider Verified | Pass (`c6-verified.png`) |
| 7 | Job feed and job details open without a crash | Pass (`c7-feed.png`, `c7-job-details.png`) |
| old APK | Old app on the revoked certificate | **Not tested** (no old APK on a second phone) |

## Notes and open items

1. **Revoke reason on the Verification screen.** `mobile/src/lib/verificationStatus.ts` shows a fixed line for a
   revoked certificate ("Upload a new certificate to get verified again."). The admin's reason appears on
   the Certifications screen (and in the notification). The reason is shown on the Verification screen only for
   a revoked ID. The checklist wording ("shows ... and the reason") does not match the code. No code was changed.
2. **Slow certificate upload.** Two of three resubmit attempts ended with "Could not upload the image. Check your
   connection." after about 60 seconds (the XHR timeout in `src/lib/api.ts`, `putMultipart`), although the phone's
   connection was fine. The third attempt reached the server and the certificate appeared as under review.
   Probably a slow upload to storage; not confirmed. Worth retesting on a steady connection.
3. **Job-details check** needed an open job near the test provider, so a test Plumbing job was posted from the test
   client and cancelled afterwards. The cancel came about 22 minutes after posting, past the 15-minute invite
   window. The job still showed "Open" when cancelled, but whether any provider was invited was not verified
   (no database access in the session).

## Release (not done)

1. Share the APK with everyone who tests the app.
2. Only after everyone has installed it, set `REQUIRE_CREDENTIAL_EXPIRY=true` on the Render `taskbuddy` service and
   redeploy. Do not do this earlier: the old app sends no expiry answer, so certificate uploads from it would fail.

## Manuscript

Figure 6 got a new image with panels (d) certificate form with "no expiry date" and (e) a revoked certificate with
its reason (`docs/apk-test-screenshots/fig6-new-apk-certificate-expiry-and-revoked.png`). Its caption was extended
and highlighted with a comment. Panel (c) of the same figure still shows the old "Expiry date (optional)" form.
Figure 20(a) already had a screening plus revoke-form screenshot; the `admin-*.jpg` files here are spares.
