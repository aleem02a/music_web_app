# Aurafy Music - Android App

## Prerequisites

1. **Java JDK 17+** — Download from https://adoptium.net/
2. **Android Studio** — Download from https://developer.android.com/studio
3. **Node.js 18+** — Already installed if you're running the web app

## Setup Instructions

### Step 1: Install Capacitor dependencies
```bash
cd android-app
npm install @capacitor/core @capacitor/cli @capacitor/android
```

### Step 2: Initialize Capacitor
```bash
npx cap init "Aurafy Music" "com.aurafy.music" --web-dir www
```

### Step 3: Add Android platform
```bash
npx cap add android
```

### Step 4: Sync and open in Android Studio
```bash
npx cap sync android
npx cap open android
```

### Step 5: Build APK in Android Studio
1. Android Studio will open with the project
2. Go to **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. The APK will be generated in `android/app/build/outputs/apk/debug/`

### Step 6: Install APK on your phone
- Transfer the APK file to your Android phone
- Open it and tap "Install"
- You may need to enable "Install from unknown sources" in settings

## Configuration

The app loads your live Render deployment at:
`https://aurafy-music-player.onrender.com`

To change the URL, edit `capacitor.config.json` → `server.url`

## Background Audio
The app runs in a native Android WebView with background audio permissions.
Music will continue playing when you:
- Switch to other apps
- Lock your screen
- Use the notification media controls
