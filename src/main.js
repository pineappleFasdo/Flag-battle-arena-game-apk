import './style.css';
import Game from './core/Game';

// ── Canvas ──────────────────────────────────────────────────────────────────
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

// ── HTML Overlay ────────────────────────────────────────────────────────────
const overlay = document.createElement('div');
overlay.id = 'nr-overlay';
document.body.appendChild(overlay);

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

// FIX CRISP: pass devicePixelRatio so the canvas backing store is native resolution
function resize() {
    const vp  = window.visualViewport;
    const dpr = window.devicePixelRatio || 1;

    const logicalW = vp ? vp.width  : window.innerWidth;
    const logicalH = vp ? vp.height : window.innerHeight;

    const physicalW = Math.round(logicalW * dpr);
    const physicalH = Math.round(logicalH * dpr);

    // Always call resize on first run (canvas starts at 0×0)
    if (canvas.width === physicalW && canvas.height === physicalH) return;

    game.resize(physicalW, physicalH, dpr);
}

window.addEventListener('resize', resize);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resize);
}

// Resize first so canvas has valid dimensions before the loop starts
resize();

// ── Game loop (matches original: continuous rAF, paused while hidden) ────────
// FIX VISIBILITY: pause the loop while the app is backgrounded so physics
// time doesn't jump and audio doesn't pile up when the user returns.
let isPaused = false;

function loop() {
    if (!isPaused) {
        game.update();
        game.draw();
    }
    requestAnimationFrame(loop);
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        isPaused = true;
    } else {
        setTimeout(() => { isPaused = false; }, 50);
    }
});

// Start the loop — same as the original game.loop() call
requestAnimationFrame(loop);

// ── Button Handler ───────────────────────────────────────────────────────────
document.getElementById('nr-start-btn').addEventListener('click', function () {
    startScreen.classList.add('nr-hiding');
    setTimeout(function () {
        startScreen.style.display = 'none';
        game.startGame();
    }, 380);
});

// ── Capacitor plugins (non-blocking, safe to fail in browser) ───────────────
function initCapacitor() {
    import('@capacitor/status-bar').then(function (m) {
        m.StatusBar.setOverlaysWebView({ overlay: true });
        m.StatusBar.setStyle({ style: m.Style.Dark });
        m.StatusBar.setBackgroundColor({ color: '#0a0b10' });
    }).catch(function () {});

    import('@capacitor/splash-screen').then(function (m) {
        m.SplashScreen.hide({ fadeOutDuration: 400 });
    }).catch(function () {});

    import('@capacitor/app').then(function (m) {
        m.App.addListener('backButton', function () {
            if (game.gameState === 'START_SCREEN') {
                m.App.exitApp();
            } else {
                if (game._doReset) game._doReset();
            }
        });
    }).catch(function () {});
}

requestAnimationFrame(function () { setTimeout(initCapacitor, 0); });
