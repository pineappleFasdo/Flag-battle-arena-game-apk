# 🌍 National Royale — Capacitor Mobile App

A physics-based battle royale game where country flags fight to be the last one standing.  
Packaged with **Capacitor 6** to run natively on **Android** and **iOS**.

---

## 📁 Project Structure

```
national-royale/
├── src/                  ← Vite source (your game code)
├── public/
│   ├── icons/
│   │   ├── icon.svg      ← App icon (used to generate all sizes)
│   │   └── splash.svg    ← Splash screen
│   └── favicon.svg
├── dist/                 ← Built web assets (git-ignored, created by `npm run build`)
├── android/              ← Android Studio project (created by `npx cap add android`)
├── ios/                  ← Xcode project      (created by `npx cap add ios`)
├── capacitor.config.json ← Capacitor settings
├── vite.config.js        ← Vite build settings
└── .github/workflows/    ← Automated APK/IPA builds via GitHub Actions
```

---

## 🚀 Quick Start (First-Time Setup)

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 | https://nodejs.org |
| Android Studio | Latest | https://developer.android.com/studio |
| Xcode (iOS, Mac only) | ≥ 15 | App Store |

### 1. Install dependencies

```bash
npm install
```

### 2. Build the web app

```bash
npm run build
```

### 3. Add native platforms (first time only)

```bash
npx cap add android
npx cap add ios          # Mac only
```

### 4. Sync Capacitor (run after every build)

```bash
npx cap sync
```

### 5. Open in Android Studio / Xcode

```bash
npm run cap:android      # opens Android Studio
npm run cap:ios          # opens Xcode (Mac only)
```

Then press **Run** (▶) in Android Studio / Xcode to install on your device or emulator.

---

## 📱 Installing on Your Android Phone Directly (No Android Studio Needed)

### Option A — GitHub Actions (recommended, no setup required)

1. Push this project to a GitHub repository (see below).
2. Go to **Actions** → **Build Android APK** → **Run workflow**.
3. Wait ~5 minutes for the build to finish.
4. Download `national-royale-debug.apk` from the **Artifacts** section.
5. Transfer the APK to your phone (email, Google Drive, USB, etc.).
6. On your phone: **Settings → Security → Install unknown apps** → allow your browser/file manager.
7. Open the APK and tap **Install**.

### Option B — Build locally

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleDebug          # on Windows: gradlew.bat assembleDebug
```

The APK will be at:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 🔁 Day-to-Day Workflow (After Initial Setup)

```bash
# Make changes to your game in src/
npm run build          # rebuilds dist/
npx cap sync           # copies dist/ to android/ and ios/
# Then press Run in Android Studio / Xcode
```

Or use the helper script:

```bash
npm run deploy         # = npm run build + npx cap sync
```

---

## 📤 Pushing to GitHub

```bash
# First time:
git init                                                  # (already done — .git exists)
git remote add origin https://github.com/YOUR_USERNAME/national-royale.git
git add .
git commit -m "Initial commit — Capacitor setup"
git push -u origin main

# After that, just:
git add .
git commit -m "your message"
git push
```

Every push to `main` will automatically trigger the **Build Android APK** workflow.

---

## 🍎 iOS Setup (Mac required)

```bash
npx cap add ios
npm run build
npx cap sync ios
npm run cap:ios          # opens Xcode
```

In Xcode:
1. Select your Apple account under **Signing & Capabilities → Team**.
2. Connect your iPhone and press **Run (▶)**.
3. On your iPhone: **Settings → General → VPN & Device Management → trust your developer cert**.

---

## ⚙️ Capacitor Config Reference (`capacitor.config.json`)

| Key | Value | Notes |
|-----|-------|-------|
| `appId` | `com.nationalroyale.game` | Unique reverse-domain ID. Change to your own domain. |
| `appName` | `National Royale` | Display name on home screen |
| `webDir` | `dist` | Vite output folder |
| `androidScheme` | `https` | Makes `fetch()` and audio work on Android |
| `SplashScreen.launchShowDuration` | `1500` | ms to show splash before hiding |
| `StatusBar.overlaysWebView` | `true` | Canvas extends under the notch |

---

## 🎮 Mobile-Specific Changes Made

| File | What changed |
|------|-------------|
| `src/main.js` | Capacitor plugin init (StatusBar, SplashScreen, back button) |
| `src/style.css` | Safe-area insets, `dvh`, touch-action, overscroll-behavior |
| `vite.config.js` | `base: "./"` (relative paths for `file://` URLs), ES2020 target |
| `package.json` | Capacitor 6 packages added |
| `capacitor.config.json` | New file — app ID, webDir, plugin config |
| `.github/workflows/` | Automated APK + IPA builds |

---

## 🔧 Troubleshooting

**"App won't install — INSTALL_FAILED_ABORTED"**  
→ Enable **Unknown sources** in Settings → Security.

**Blank screen on Android**  
→ Make sure `base: "./"` is set in `vite.config.js`. Run `npm run build` again, then `npx cap sync`.

**Audio doesn't play on iOS**  
→ The Web Audio API requires a user gesture. The START PLAYING button tap correctly unlocks it.

**Status bar overlaps UI**  
→ `env(safe-area-inset-top)` in the CSS handles this. If still broken, check `StatusBar.overlaysWebView: true` in `capacitor.config.json`.

**Build fails with "SDK not found"**  
→ Open Android Studio → SDK Manager → install Android API 34+.
