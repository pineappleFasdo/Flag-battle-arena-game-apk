import "./style.css";
import Game from "./core/Game";

// ── Capacitor bootstrap ─────────────────────────────────────────────────────
// We import Capacitor plugins lazily so the web build works fine
// when Capacitor native runtime isn't present (e.g. browser dev mode).
async function initCapacitor() {
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0a0b10" });
    await StatusBar.setOverlaysWebView({ overlay: true });
  } catch (_) {
    // Running in browser — StatusBar not available, that's fine
  }

  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide({ fadeOutDuration: 400 });
  } catch (_) {
    // Running in browser — SplashScreen not available, that's fine
  }
}

// ── Canvas ──────────────────────────────────────────────────────────────────
const canvas = document.createElement("canvas");
document.body.appendChild(canvas);

// ── HTML Overlay ────────────────────────────────────────────────────────────
const overlay = document.createElement("div");
overlay.id = "nr-overlay";
document.body.appendChild(overlay);

// Start screen
const startScreen = document.createElement("div");
startScreen.id = "nr-start-screen";
startScreen.innerHTML = `
  <div class="nr-title-block">
    <div class="nr-globe">🌍</div>
    <div class="nr-title">NATIONAL ROYALE</div>
    <div class="nr-subtitle">Last flag standing wins the round!</div>
  </div>
  <button id="nr-start-btn" class="nr-btn nr-btn-primary">▶&nbsp; START PLAYING</button>
`;
overlay.appendChild(startScreen);

// ── Game ────────────────────────────────────────────────────────────────────
const game = new Game(canvas);

function resize() {
  // Use visualViewport on mobile so the canvas accounts for the soft keyboard
  // and safe-area insets correctly.
  const vp = window.visualViewport;
  game.resize(
    vp ? vp.width  : window.innerWidth,
    vp ? vp.height : window.innerHeight
  );
}

window.addEventListener("resize", resize);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", resize);
}
resize();
game.loop();

// ── Capacitor back-button (Android) ────────────────────────────────────────
// Without this, pressing Back closes the app immediately.
// We let it restart the game instead (or exit if on start screen).
try {
  const { App } = await import("@capacitor/app");
  App.addListener("backButton", ({ canGoBack }) => {
    if (game.gameState === "START_SCREEN") {
      App.exitApp();
    } else {
      game._doReset?.();
    }
  });
} catch (_) { /* browser */ }

// ── Button Handlers ─────────────────────────────────────────────────────────
document.getElementById("nr-start-btn").addEventListener("click", () => {
  startScreen.classList.add("nr-hiding");
  setTimeout(() => {
    startScreen.style.display = "none";
    game.startGame();
  }, 380);
});

// ── Capacitor init ──────────────────────────────────────────────────────────
initCapacitor();
