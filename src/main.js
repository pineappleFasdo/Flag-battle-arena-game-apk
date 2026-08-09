import "./style.css";
import Game from "./core/Game";

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

// ── Button Handlers ─────────────────────────────────────────────────────────
document.getElementById("nr-start-btn").addEventListener("click", function() {
  startScreen.classList.add("nr-hiding");
  setTimeout(function() {
    startScreen.style.display = "none";
    game.startGame();
  }, 380);
});

// ── Capacitor plugins (loaded after page is ready, never block render) ──────
// All Capacitor calls are inside a plain function — no top-level await.
// Dynamic import() is still used so the web build works without native runtime.
function initCapacitor() {
  // StatusBar — hide it so canvas fills edge-to-edge
  import("@capacitor/status-bar").then(function(m) {
    m.StatusBar.setOverlaysWebView({ overlay: true });
    m.StatusBar.setStyle({ style: m.Style.Dark });
    m.StatusBar.setBackgroundColor({ color: "#0a0b10" });
  }).catch(function() { /* browser — ignore */ });

  // SplashScreen — hide after game has initialised
  import("@capacitor/splash-screen").then(function(m) {
    m.SplashScreen.hide({ fadeOutDuration: 400 });
  }).catch(function() { /* browser — ignore */ });

  // App — intercept Android back button
  import("@capacitor/app").then(function(m) {
    m.App.addListener("backButton", function() {
      if (game.gameState === "START_SCREEN") {
        m.App.exitApp();
      } else {
        if (game._doReset) game._doReset();
      }
    });
  }).catch(function() { /* browser — ignore */ });
}

// Run after first paint so the game canvas is visible immediately
requestAnimationFrame(function() {
  setTimeout(initCapacitor, 0);
});
