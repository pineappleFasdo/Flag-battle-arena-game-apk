import './style.css';
import Game from './core/Game';

// ── Canvas ──────────────────────────────────────────────────────────────────
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

// ── HTML Overlay ────────────────────────────────────────────────────────────
const overlay = document.createElement('div');
overlay.id = 'nr-overlay';
document.body.appendChild(overlay);

// Start screen
const startScreen = document.createElement('div');
startScreen.id = 'nr-start-screen';
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

// FIX CRISP: Scale the canvas backing store by devicePixelRatio so every pixel
// on high-DPI screens (retina, most Android/iOS phones) is drawn at native
// resolution. The CSS size stays at 100%/100% (logical pixels) — only the
// internal resolution increases. This eliminates the blurry flag / text issue.
function resize() {
    const vp  = window.visualViewport;
    const dpr = window.devicePixelRatio || 1;

    // Logical (CSS) size — what the OS reports
    const logicalW = vp ? vp.width  : window.innerWidth;
    const logicalH = vp ? vp.height : window.innerHeight;

    // Physical (backing-store) size — what we actually render at
    const physicalW = Math.round(logicalW * dpr);
    const physicalH = Math.round(logicalH * dpr);

    // Only resize if the dimensions actually changed (avoids a physics rebuild
    // every frame on browsers that fire frequent visualViewport events)
    if (canvas.width === physicalW && canvas.height === physicalH) return;

    game.resize(physicalW, physicalH, dpr);
}

window.addEventListener('resize', resize);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resize);
}
resize();

// ── Game loop with visibility-aware pause ───────────────────────────────────
// FIX VISIBILITY: When a phone notification arrives or the user switches apps,
// the browser fires visibilitychange. We stop rAF while hidden and restart it
// when the page becomes visible again. This prevents:
//   • The game clock jumping forward by the hidden duration
//   • Multiple audio events firing at once on resume
//   • The physics engine running unseen (wasted CPU / battery)

let rafId    = null;
let isPaused = false;

function loop() {
    if (!isPaused) {
        game.update();
        game.draw();
    }
    rafId = requestAnimationFrame(loop);
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page went to background — freeze the game loop
        isPaused = true;
    } else {
        // Page came back — resume from where we left off
        // Small delay lets the AudioContext.resume() in AudioManager settle first
        setTimeout(() => { isPaused = false; }, 50);
    }
});

// Start the loop
rafId = requestAnimationFrame(loop);

// ── Button Handlers ─────────────────────────────────────────────────────────
document.getElementById('nr-start-btn').addEventListener('click', function () {
    startScreen.classList.add('nr-hiding');
    setTimeout(function () {
        startScreen.style.display = 'none';
        game.startGame();
    }, 380);
});

// ── Capacitor plugins (loaded after page is ready, never block render) ──────
// All Capacitor calls are inside a plain function — no top-level await.
// Dynamic import() is still used so the web build works without native runtime.
function initCapacitor() {
    // StatusBar — hide it so canvas fills edge-to-edge
    import('@capacitor/status-bar').then(function (m) {
        m.StatusBar.setOverlaysWebView({ overlay: true });
        m.StatusBar.setStyle({ style: m.Style.Dark });
        m.StatusBar.setBackgroundColor({ color: '#0a0b10' });
    }).catch(function () { /* browser — ignore */ });

    // SplashScreen — hide after game has initialised
    import('@capacitor/splash-screen').then(function (m) {
        m.SplashScreen.hide({ fadeOutDuration: 400 });
    }).catch(function () { /* browser — ignore */ });

    // App — intercept Android back button
    import('@capacitor/app').then(function (m) {
        m.App.addListener('backButton', function () {
            if (game.gameState === 'START_SCREEN') {
                m.App.exitApp();
            } else {
                if (game._doReset) game._doReset();
            }
        });
    }).catch(function () { /* browser — ignore */ });
}

// Run after first paint so the game canvas is visible immediately
requestAnimationFrame(function () {
    setTimeout(initCapacitor, 0);
});
