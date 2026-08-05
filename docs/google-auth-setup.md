# Google Sign-In — Backend Setup Guide

This document is for the developer with access to **Render** and **Supabase**.
The mobile/frontend code is already implemented. You only need to complete the
steps below to activate Google Sign-In end-to-end.

---

## How the flow works (overview)

```
Mobile app
  → opens browser to GET /auth/google/authorize?app_redirect=<deep-link>
    Backend
      → redirects browser to Google consent screen
        Google
          → redirects to https://taskbuddy-1d48.onrender.com/auth/google/callback
            Backend
              → exchanges code for id_token (server-to-server)
              → calls Supabase signInWithIdToken
              → redirects browser back to <deep-link>?access_token=...
Mobile app
  → reads tokens from the redirect URL, user is signed in
```

The mobile app **never** contacts Google directly. Google only ever sees the
backend's HTTPS callback URL, which is why it works in both Expo Go and
production builds.

### Allowed deep-link targets

The final redirect carries a live Supabase session in its query string, so the
backend only redirects to targets on an allowlist
(`backend/src/auth/google-redirect.ts`):

| Target | Used by |
|--------|---------|
| `taskbuddy://…`, `exp+taskbuddy://…` | standalone and dev-client builds |
| `exp://<LAN or loopback IP>…`, `exp://….exp.direct` | Expo Go (LAN or tunnel) |
| `http://localhost:<port>`, `http://127.0.0.1:<port>` | web / local browser dev |

Anything else is rejected with `app_redirect is not an allowed target`. Without
this, `…/auth/google/authorize?app_redirect=https://attacker.example` would
deliver a real user's tokens to the attacker. Add new schemes there — not by
loosening the check.

---

## Step 1 — Google Cloud Console

You need a **Web Application** OAuth 2.0 client.

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Click **Create Credentials → OAuth client ID**.
3. Choose **Web application**.
4. Under **Authorized redirect URIs**, add exactly:
   ```
   https://taskbuddy-1d48.onrender.com/auth/google/callback
   ```
   > For local backend development also add: `http://localhost:3000/auth/google/callback`
5. Click **Create**. Copy the **Client ID** and **Client Secret** — you'll need both below.

---

## Step 2 — Supabase Dashboard

1. Open your Supabase project → **Authentication → Providers → Google**.
2. Toggle it **Enabled**.
3. Paste the **Client ID** and **Client Secret** from Step 1.
4. Click **Save**.

> Supabase uses the Client ID to verify the `aud` claim in the Google ID token.
> Both fields are required.

---

## Step 3 — Render Environment Variables

In the Render dashboard for the `taskbuddy` backend service, go to
**Environment** and add these four variables:

| Key | Value |
|-----|-------|
| `GOOGLE_CLIENT_ID` | The Client ID from Step 1 |
| `GOOGLE_CLIENT_SECRET` | The Client Secret from Step 1 |
| `GOOGLE_CALLBACK_URL` | `https://taskbuddy-1d48.onrender.com/auth/google/callback` |
| `GOOGLE_STATE_SECRET` | A random 32-byte hex string (run `openssl rand -hex 32` to generate one) |

After saving, Render will redeploy automatically.

---

## Step 4 — Verify it works

Once deployed, test the flow end-to-end:

1. Open the app in Expo Go.
2. Tap **Continue with Google**.
3. The device browser should open Google's consent screen.
4. Sign in with a Google account.
5. The browser closes and you should be signed in.

**Check the Render logs** (`/auth/google/callback`) if anything goes wrong.

| Error message | Likely cause |
|---------------|--------------|
| `redirect_uri_mismatch` | The URI in Google Cloud Console doesn't exactly match `GOOGLE_CALLBACK_URL` |
| `Google did not return an ID token` | Wrong client secret, or client not set to **Web application** type |
| `Google sign-in failed` | Supabase Google provider not enabled, or wrong Client ID in Supabase dashboard |
| `Invalid state signature` | `GOOGLE_STATE_SECRET` is missing or mismatched on the server |
| `Google sign-in is not configured on this server` (503) | One or more `GOOGLE_*` vars missing on Render — the exact names are logged at startup |
| `app_redirect is not an allowed target` | The app's deep link isn't on the allowlist above (e.g. an Expo tunnel host that isn't `.exp.direct`) |

---

## Local backend development

To test the Google flow against a locally running backend:

1. Add `http://localhost:3000/auth/google/callback` to the same Google Cloud
   Console client's **Authorized redirect URIs**.
2. In `backend/.env`, set:
   ```env
   GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
   ```
3. In `mobile/.env`, point the app at your machine's LAN IP:
   ```env
   EXPO_PUBLIC_API_URL=http://192.168.x.x:3000
   ```
