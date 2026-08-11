import './style.css';
import Game from './core/Game';

// ── Canvas ───────────────────────────────────────────────────────────────────
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

// ── Overlay container ────────────────────────────────────────────────────────
const overlay = document.createElement('div');
overlay.id = 'nr-overlay';
document.body.appendChild(overlay);

// ── Selection Events screen ──────────────────────────────────────────────────
// Add more events here later — just push to SELECTION_EVENTS array.
const SELECTION_EVENTS = [
    {
        id          : 'qualifier_40',
        icon        : '🌍',
        title       : '40 Min Qualifier',
        subtitle    : '249 flags · rounds run until time is up · top winners advance to the Final',
        color       : '#3D7CFF',
        borderColor : 'rgba(46, 98, 232, 0.70)',
        glowColor   : 'rgba(61, 124, 255, 0.25)',
        badge       : 'CLASSIC',
    },
    {
        id          : 'highest_wins',
        icon        : '🏆',
        title       : 'Highest Winner Wins',
        subtitle    : '40 min · every country keeps fighting · most wins at the end is champion',
        color       : '#FFC83D',
        borderColor : 'rgba(255, 200, 61, 0.70)',
        glowColor   : 'rgba(255, 200, 61, 0.22)',
        badge       : 'NEW',
    },
    // Future home events: push another object here + add a mode class under src/modes/
];

const homeScreen = document.createElement('div');
homeScreen.id = 'nr-home-screen';

homeScreen.innerHTML = `
  <div class="nr-home-header">
    <div class="nr-waving-flag" aria-hidden="true">
      <div class="nr-flag-pole"></div>
      <div class="nr-flag-cloth">
        <svg class="nr-flag-svg" viewBox="0 0 120 72" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="nrFlagGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#3D7CFF"/>
              <stop offset="45%" stop-color="#38D5FF"/>
              <stop offset="100%" stop-color="#FFC83D"/>
            </linearGradient>
          </defs>
          <path class="nr-flag-shape" d="M4,6 L112,4 Q118,20 112,36 Q106,52 112,68 L4,66 Z" fill="url(#nrFlagGrad)"/>
          <circle cx="28" cy="36" r="11" fill="none" stroke="#F4F7FF" stroke-width="2.2" opacity="0.9"/>
          <circle cx="28" cy="36" r="4" fill="#F4F7FF" opacity="0.95"/>
        </svg>
      </div>
    </div>
    <div class="nr-home-title">FLAG BATTLE ARENA</div>
    <div class="nr-home-tagline">Choose your battle</div>
  </div>

  <div class="nr-event-list" id="nr-event-list">
    ${SELECTION_EVENTS.map(ev => `
      <button
        type="button"
        class="nr-event-card"
        data-event-id="${ev.id}"
        style="
          --ev-color: ${ev.color};
          --ev-border: ${ev.borderColor};
          --ev-glow:   ${ev.glowColor};
        "
      >
        <div class="nr-event-card-left">
          <span class="nr-event-icon">${ev.icon}</span>
        </div>
        <div class="nr-event-card-body">
          <div class="nr-event-card-top">
            <span class="nr-event-title">${ev.title}</span>
            <span class="nr-event-badge">${ev.badge}</span>
          </div>
          <div class="nr-event-subtitle">${ev.subtitle}</div>
        </div>
        <div class="nr-event-card-arrow">›</div>
      </button>
    `).join('')}
  </div>

  <div class="nr-home-footer">Tap an event to start · 2 modes available</div>
`;
overlay.appendChild(homeScreen);

// ── Game ─────────────────────────────────────────────────────────────────────
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
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

// ── Game loop ────────────────────────────────────────────────────────────────
let isPaused = false;

function loop() {
    if (!isPaused) { game.update(); game.draw(); }
    requestAnimationFrame(loop);
}

// ── Keep screen awake while a match is running (mobile) ─────────────────────
let _wakeLock = null;

async function requestWakeLock() {
    try {
        if (navigator.wakeLock && navigator.wakeLock.request) {
            _wakeLock = await navigator.wakeLock.request('screen');
            _wakeLock.addEventListener('release', function () {
                _wakeLock = null;
            });
        }
    } catch (err) {
        _wakeLock = null;
    }
}

async function releaseWakeLock() {
    try {
        if (_wakeLock) {
            await _wakeLock.release();
            _wakeLock = null;
        }
    } catch (err) {
        _wakeLock = null;
    }
}

document.addEventListener('visibilitychange', function () {
    isPaused = document.hidden;
    if (!isPaused) {
        setTimeout(function () { isPaused = false; }, 50);
        // Re-acquire wake lock when returning to a live match
        if (homeScreen.style.display === 'none') {
            requestWakeLock();
        }
    }
});

requestAnimationFrame(loop);

// ── Event card click handler ──────────────────────────────────────────────────
document.getElementById('nr-event-list').addEventListener('click', function (e) {
    const card = e.target.closest('[data-event-id]');
    if (!card) return;

    const eventId = card.dataset.eventId;

    // Animate card out
    card.classList.add('nr-card-pressed');
    homeScreen.classList.add('nr-hiding');

    setTimeout(function () {
        homeScreen.style.display = 'none';
        requestWakeLock();
        game.startEvent(eventId);   // Game.js reads the eventId to configure the session
    }, 380);
});

// ── DEBUG: 5 rapid taps → instant Final Mode ─────────────────────────────────
// DELETE before public release.
let _debugTaps = 0, _debugTimer = null;
canvas.addEventListener('click', function () {
    if (game.gameState !== 'PLAYING' && game.gameState !== 'COUNTDOWN') return;
    _debugTaps++;
    clearTimeout(_debugTimer);
    _debugTimer = setTimeout(function () { _debugTaps = 0; }, 1500);
    if (_debugTaps >= 5) {
        _debugTaps = 0;
        game.sessionStartTime = Date.now() - game.QUALIFY_DURATION_MS - 1;
        console.log('[DEBUG] Final Mode on next winner');
    }
});

// ── DEBUG: Keyboard shortcuts ─────────────────────────────────────────────────
// Shift+P  →  Drain the qualify pool down to 1 country remaining (leaving only
//             1 in _qualifyPool, rest in _qualifyWinners).  On the NEXT round,
//             _pickQualifyBatch() will see pool.length < 2, trigger the refill,
//             and start a new round with all 249 flags again.  This lets you
//             test the pool-exhaustion edge case in seconds instead of 40 mins.
//
// Shift+F  →  Skip the qualifier timer so Final Mode triggers on next winner.
//
// DELETE before public release.
document.addEventListener('keydown', function (e) {
    if (!e.shiftKey) return;

    // Shift+P — simulate pool near-exhaustion (1 country left in pool)
    if (e.key === 'P' || e.key === 'p') {
        if (game.isFinalMode) {
            console.warn('[DEBUG] Shift+P ignored — already in Final Mode.');
            return;
        }

        const pool    = game._qualifyPool;
        const winners = game._qualifyWinners;

        if (pool.length === 0) {
            console.warn('[DEBUG] Shift+P — pool is already empty.');
            return;
        }

        // Move all but 1 country from pool → winners, simulating 248 prior wins
        const keep = pool.splice(pool.length - 1, 1);   // keep last entry in pool
        const moved = pool.splice(0, pool.length);       // drain the rest
        moved.forEach(function (c) { winners.push(c); });
        pool.push(keep[0]);   // restore the single survivor

        console.log(
            '[DEBUG] Shift+P — pool drained to 1.',
            '_qualifyPool:', game._qualifyPool.map(function(c){ return c.name; }),
            '| _qualifyWinners count:', game._qualifyWinners.length,
            '\nNext call to _pickQualifyBatch() will refill and restart with all', game.allCountries.length, 'countries.'
        );
    }

    // Shift+F — skip qualifier timer (Final Mode on next winner)
    if (e.key === 'F' || e.key === 'f') {
        if (game.gameState !== 'PLAYING' && game.gameState !== 'COUNTDOWN') {
            console.warn('[DEBUG] Shift+F ignored — game is not running.');
            return;
        }
        game.sessionStartTime = Date.now() - game.QUALIFY_DURATION_MS - 1;
        console.log('[DEBUG] Shift+F — Final Mode will trigger on next winner.');
    }
});

// ── Capacitor plugins ────────────────────────────────────────────────────────
function initCapacitor() {
    import('@capacitor/status-bar').then(function (m) {
        m.StatusBar.setOverlaysWebView({ overlay: true });
        m.StatusBar.setStyle({ style: m.Style.Dark });
        m.StatusBar.setBackgroundColor({ color: '#050816' });
    }).catch(function () {});
    import('@capacitor/splash-screen').then(function (m) {
        m.SplashScreen.hide({ fadeOutDuration: 400 });
    }).catch(function () {});
    import('@capacitor/app').then(function (m) {
        m.App.addListener('backButton', function () {
            if (game.gameState === 'START_SCREEN') {
                // Show home screen again instead of exiting
                releaseWakeLock();
                homeScreen.style.display = '';
                homeScreen.classList.remove('nr-hiding');
            } else {
                game._doReset();
                releaseWakeLock();
                homeScreen.style.display = '';
                homeScreen.classList.remove('nr-hiding');
            }
        });
    }).catch(function () {});
}
requestAnimationFrame(function () { setTimeout(initCapacitor, 0); });
