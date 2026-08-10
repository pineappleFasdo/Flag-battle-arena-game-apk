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

function resize() {
    const vp  = window.visualViewport;
    const dpr = window.devicePixelRatio || 1;

    const logicalW = vp ? vp.width  : window.innerWidth;
    const logicalH = vp ? vp.height : window.innerHeight;

    const physicalW = Math.round(logicalW * dpr);
    const physicalH = Math.round(logicalH * dpr);

    if (canvas.width === physicalW && canvas.height === physicalH) return;
    game.resize(physicalW, physicalH, dpr);
}

window.addEventListener('resize', resize);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resize);
}
resize();

// ── Game loop ────────────────────────────────────────────────────────────────
let isPaused = false;

function loop() {
    if (!isPaused) {
        game.update();
        game.draw();
    }
    requestAnimationFrame(loop);
}

document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
        isPaused = true;
    } else {
        setTimeout(function () { isPaused = false; }, 50);
    }
});

requestAnimationFrame(loop);

// ── Button Handler ───────────────────────────────────────────────────────────
document.getElementById('nr-start-btn').addEventListener('click', function () {
    startScreen.classList.add('nr-hiding');
    setTimeout(function () {
        startScreen.style.display = 'none';
        game.startGame();
    }, 380);
});

// ── DEBUG shortcut: tap arena 5× fast → instant Final Mode ──────────────────
// DELETE this block before public release.
let _debugTaps  = 0;
let _debugTimer = null;
canvas.addEventListener('click', function () {
    if (game.gameState !== 'PLAYING' && game.gameState !== 'COUNTDOWN') return;
    _debugTaps++;
    clearTimeout(_debugTimer);
    _debugTimer = setTimeout(function () { _debugTaps = 0; }, 1500);
    if (_debugTaps >= 5) {
        _debugTaps = 0;
        // Wind the session clock back past 40 minutes so next winner triggers Final Mode
        game.sessionStartTime = Date.now() - game.QUALIFY_DURATION_MS - 1;
        console.log('[DEBUG] Final Mode will trigger on next round winner');
    }
});
// ── END DEBUG ────────────────────────────────────────────────────────────────

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
