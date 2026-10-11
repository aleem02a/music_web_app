# Firebase authentication setup

Aurafy uses Firebase Authentication for email/password and Google sign-in. The browser receives the Firebase web app settings from the server, and the server verifies Firebase ID tokens before creating the Aurafy session used for library sync.

## Connect a Firebase project

1. Create or choose a project in the [Firebase Console](https://console.firebase.google.com/) and register a **Web app** in Project settings.
2. Under **Authentication → Sign-in method**, enable **Email/Password** and **Google**.
3. Add the app's local and production hostnames under **Authentication → Settings → Authorized domains**. For local development, add `localhost`.
4. Copy the web app's **API key**, **Auth domain**, and **Project ID** into the root `.env` file:

   ```env
   FIREBASE_API_KEY=your-web-app-api-key
   FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   FIREBASE_PROJECT_ID=your-project-id
   ```

5. Restart Aurafy with `npm start`, then try **Continue with Google** or the email form.

These are the Firebase web app settings, not a service-account private key. Do not put a service-account JSON file or private key in the browser or commit it to source control.

## Optional Supabase library storage

Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to `.env` if using the Supabase database integration. The anon key is a public client key; protect database tables with Row-Level Security. See [`supabase-schema.sql`](supabase-schema.sql) for the library table schema.

## AI features

AI playlist generation and voice intent require `GROQ_API_KEY` on the server. The browser does not store or send provider keys. Production AI requests require a signed-in account; Firebase Authentication (configured with `FIREBASE_PROJECT_ID`) is sufficient, so Supabase credentials are only needed if you use Supabase Auth or the database integration. Anonymous AI requests are rejected when `AI_REQUIRE_AUTH=true`.

## Start the app

```powershell
npm start
```

The Android Capacitor app and Windows Electron app load the hosted Aurafy site. Add the deployed site hostname to Firebase's authorized domains as well as the local development hostname.
