import './style.css';
import Game from './core/Game';
import HighestWinsMode from './modes/HighestWinsMode.js';
import LongBattleMode from './modes/LongBattleMode.js';
import { THEME_LIST, DEFAULT_THEME } from './themes/ThemeConfig.js';

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
    {
        id          : 'long_battle',
        icon        : '⏱️',
        title       : '5 Hour Championship',
        subtitle    : '40-min rounds for 5 hours · highest wins each round · elimination grand final',
        color       : '#A78BFA',
        borderColor : 'rgba(167, 139, 250, 0.75)',
        glowColor   : 'rgba(167, 139, 250, 0.28)',
        badge       : '5H LIVE',
    },
];

let selectedThemeId = DEFAULT_THEME;

const homeScreen = document.createElement('div');
homeScreen.id = 'nr-home-screen';

homeScreen.innerHTML = `
  <div class="nr-home-header">
    <div class="nr-crossed-flags" aria-hidden="true">
      <div class="nr-cross-flag nr-cross-flag--left">
        <div class="nr-cross-pole"></div>
        <div class="nr-cross-cloth nr-cross-cloth--a">
          <span class="nr-cross-stripe s1"></span>
          <span class="nr-cross-stripe s2"></span>
          <span class="nr-cross-stripe s3"></span>
        </div>
      </div>
      <div class="nr-cross-flag nr-cross-flag--right">
        <div class="nr-cross-pole"></div>
        <div class="nr-cross-cloth nr-cross-cloth--b">
          <span class="nr-cross-stripe s1"></span>
          <span class="nr-cross-stripe s2"></span>
          <span class="nr-cross-stripe s3"></span>
        </div>
      </div>
    </div>
    <div class="nr-home-title">FLAG BATTLE ARENA</div>
    <div class="nr-home-tagline">Choose your battle</div>
  </div>

  <div class="nr-theme-section">
    <div class="nr-theme-label">Theme</div>
    <div class="nr-theme-list" id="nr-theme-list">
      ${THEME_LIST.map(th => `
        <button type="button" class="nr-theme-chip${th.id === selectedThemeId ? ' nr-theme-active' : ''}"
          data-theme-id="${th.id}"
          style="--th-accent: ${th.accent};">
          <span class="nr-theme-icon">${th.icon}</span>
          <span class="nr-theme-name">${th.name}</span>
        </button>
      `).join('')}
    </div>
  </div>

  <div class="nr-mode-label">Mode</div>
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

  <div id="nr-load-bar-wrap" style="
      padding: 10px 18px 4px;
      display: flex; flex-direction: column; gap: 5px;
    ">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span id="nr-load-label" style="
        font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
        color: rgba(255,255,255,0.55); font-family: 'Orbitron', system-ui, sans-serif;
      ">LOADING FLAGS…</span>
      <span id="nr-load-pct" style="
        font-size: 11px; font-weight: 700;
        color: rgba(255,255,255,0.45); font-family: monospace;
      ">0%</span>
    </div>
    <div style="
      width: 100%; height: 5px; background: rgba(255,255,255,0.10);
      border-radius: 3px; overflow: hidden;
    ">
      <div id="nr-load-fill" style="
        height: 100%; width: 0%; border-radius: 3px;
        background: linear-gradient(90deg, #3D7CFF, #38D5FF);
        transition: width 0.15s ease;
      "></div>
    </div>
  </div>
  <div class="nr-home-footer">Pick a theme, then a mode to start</div>
`;
overlay.appendChild(homeScreen);

// ── Game ─────────────────────────────────────────────────────────────────────
const game = new Game(canvas);

// ── Flag preloading ───────────────────────────────────────────────────────────
// Kick off loading all flags in the background immediately.
// Event cards are disabled with a visual indicator until ready.
(function initFlagPreload() {
    const codes = game.allCountries.map(c => c.code);
    const fill  = document.getElementById('nr-load-fill');
    const pct   = document.getElementById('nr-load-pct');
    const label = document.getElementById('nr-load-label');
    const cards = document.getElementById('nr-event-list');

    // Disable cards visually
    if (cards) {
        cards.querySelectorAll('.nr-event-card').forEach(function(btn) {
            btn.style.opacity       = '0.45';
            btn.style.pointerEvents = 'none';
            btn.style.filter        = 'grayscale(0.5)';
        });
    }

    game.flagLoader.preloadAll(codes,
        function onProgress(loaded, total) {
            const p = total > 0 ? (loaded / total) : 1;
            const pStr = Math.round(p * 100) + '%';
            if (fill)  fill.style.width = pStr;
            if (pct)   pct.textContent  = pStr;
        },
        function onComplete() {
            // All flags settled — enable cards and hide bar
            if (cards) {
                cards.querySelectorAll('.nr-event-card').forEach(function(btn) {
                    btn.style.opacity       = '';
                    btn.style.pointerEvents = '';
                    btn.style.filter        = '';
                });
            }
            if (fill)  fill.style.width            = '100%';
            if (pct)   pct.textContent             = '100%';
            if (label) label.textContent           = 'READY';
            if (label) label.style.color           = 'rgba(56,213,255,0.80)';
            // Fade bar out after 1.2 s
            setTimeout(function() {
                var wrap = document.getElementById('nr-load-bar-wrap');
                if (wrap) {
                    wrap.style.transition = 'opacity 0.6s';
                    wrap.style.opacity    = '0';
                    setTimeout(function() {
                        if (wrap) wrap.style.display = 'none';
                    }, 650);
                }
            }, 1200);
        }
    );
})();

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

// ── Theme chip click ──────────────────────────────────────────────────────────
document.getElementById('nr-theme-list').addEventListener('click', function (e) {
    const chip = e.target.closest('[data-theme-id]');
    if (!chip) return;
    selectedThemeId = chip.dataset.themeId;
    document.querySelectorAll('.nr-theme-chip').forEach(c => {
        c.classList.toggle('nr-theme-active', c.dataset.themeId === selectedThemeId);
    });
});

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
        game.startEvent(eventId, selectedThemeId);
    }, 380);
});

// ── DEBUG: 5 rapid taps → Final Battle (40-min Qualifier ONLY) ───────────────
// DELETE before public release.
// 5 rapid taps:
//   • Highest Winner Wins → end current 40-min round now (round winner → next 40-min)
//   • 40-Min Qualifier   → Final Battle on next winner
//   • 5H Championship    → ignored (use Shift+L / Shift+M)
let _debugTaps = 0, _debugTimer = null;
canvas.addEventListener('click', function () {
    if (game.gameState !== 'PLAYING' && game.gameState !== 'COUNTDOWN') return;
    if (game.isLongBattleMode) return; // leave 5H alone
    _debugTaps++;
    clearTimeout(_debugTimer);
    _debugTimer = setTimeout(function () { _debugTaps = 0; }, 1500);
    if (_debugTaps < 5) return;
    _debugTaps = 0;

    if (game.isHighestWinsMode) {
        // Expire 40-min clock and force segment end immediately
        if (game.sessionMode && typeof game.sessionMode.debugExpireSegment === 'function') {
            game.sessionMode.debugExpireSegment();
        } else if (game.sessionMode) {
            game.sessionMode.sessionStartTime = Date.now() - (game.sessionMode.constructor.DURATION_MS || 40*60*1000) - 1000;
            game.sessionStartTime = game.sessionMode.sessionStartTime;
        }
        // Ensure leaderboard has someone to crown
        var lb = game.winnerManager.getLeaderboard();
        if (!lb.length) {
            var pool = (game.activeCountries && game.activeCountries.length)
                ? game.activeCountries
                : (game.allCountries || []);
            for (var i = 0; i < Math.min(3, pool.length); i++) {
                var c = pool[i];
                game.winnerManager._wins[c.code] = {
                    name: c.name,
                    imageSrc: (c.image && c.image.src) ? c.image.src : null,
                    wins: 3 - i,
                };
                if (c.image) game.winnerManager._imageCache[c.code] = c.image;
            }
            try { game.winnerManager._saveWins(); } catch (_) {}
        }
        // Silent force end of current arena → onRoundComplete → segment_end → round winner
        var fakeWinner = { isTie: true, countries: [], isSilent: true };
        game.winnerManager.winner = fakeWinner;
        if (game.winnerManager.onWin) game.winnerManager.onWin(fakeWinner);
        console.log('[DEBUG] 5-tap: Highest Wins 40-min round ended → ROUND WINNER display');
        return;
    }

    // 40-Min Qualifier only
    game.sessionStartTime = Date.now() - game.QUALIFY_DURATION_MS - 1;
    console.log('[DEBUG] 5-tap: Final Battle on next winner (40-min Qualifier only)');
});

// ── DEBUG: Keyboard shortcuts ─────────────────────────────────────────────────
// Shift+P  →  Drain the qualify pool down to 1 country remaining (leaving only
//             1 in _qualifyPool, rest in _qualifyWinners).  On the NEXT round,
//             _pickQualifyBatch() will see pool.length < 2, trigger the refill,
//             and start a new round with all 249 flags again.  This lets you
//             test the pool-exhaustion edge case in seconds instead of 40 mins.
//
// Shift+F  →  40-MIN QUALIFIER ONLY — expire timer, Final Battle on next winner.
//             Blocked in Highest Winner Wins and 5H Championship.
//
// Shift+E  →  40-MIN QUALIFIER ONLY — instant Final Battle shortcut.
//             Seeds leaderboard if empty, Final Battle triggers on next winner.
//
// Shift+Y  →  Force Highest Wins sudden-death tiebreaker.
//             Sets 3 countries to the same top win count, ends the 40-min clock,
//             and immediately enters the sudden death round.
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

    // Shift+F — 40-Min Qualifier only: expire timer, Final Battle on next winner
    if (e.key === 'F' || e.key === 'f') {
        if (game.gameState !== 'PLAYING' && game.gameState !== 'COUNTDOWN') {
            console.warn('[DEBUG] Shift+F ignored — game is not PLAYING or COUNTDOWN.');
            return;
        }
        if (game.isHighestWinsMode || game.isLongBattleMode) {
            console.warn('[DEBUG] Shift+F is for 40-Min Qualifier only. Use Shift+H for Highest Wins, Shift+L for 5H Championship.');
            return;
        }
        game.sessionStartTime = Date.now() - game.QUALIFY_DURATION_MS - 1;
        console.log('[DEBUG] Shift+F — qualifier timer expired; Final Battle on next winner.');
    }

    // Shift+E — 40-Min Qualifier only: instant Final Battle (seeds lb if empty)
    if (e.key === 'E' || e.key === 'e') {
        if (game.isHighestWinsMode || game.isLongBattleMode) {
            console.warn('[DEBUG] Shift+E is for 40-Min Qualifier only.');
            return;
        }
        if (game.isFinalMode) {
            console.warn('[DEBUG] Shift+E — already in Final Battle.');
            return;
        }
        if (game.gameState !== 'PLAYING' && game.gameState !== 'COUNTDOWN') {
            console.warn('[DEBUG] Shift+E ignored — game is not PLAYING or COUNTDOWN.');
            return;
        }
        // Expire qualifier clock so _enterFinalMode fires on next winner
        game.sessionStartTime = Date.now() - game.QUALIFY_DURATION_MS - 1;
        // Seed leaderboard if empty so _enterFinalMode has finalists to promote
        var lbE = game.winnerManager.getLeaderboard();
        if (!lbE.length) {
            var poolE = (game.activeCountries && game.activeCountries.length)
                ? game.activeCountries : (game.allCountries || []);
            var seedE = Math.min(6, poolE.length);
            for (var ei = 0; ei < seedE; ei++) {
                var ec = poolE[ei];
                game.winnerManager._wins[ec.code] = {
                    name    : ec.name,
                    imageSrc: (ec.image && ec.image.src) ? ec.image.src : null,
                    wins    : seedE - ei,
                };
                if (ec.image) game.winnerManager._imageCache[ec.code] = ec.image;
            }
            try { game.winnerManager._saveWins(); } catch (_) {}
        }
        console.log('[DEBUG] Shift+E — Final Battle triggers on next winner (lb seeded if was empty).');
    }

    // Shift+C — instantly trigger Grand Champion screen (test what it looks like)
    // Works in both Qualifier and Highest Winner Wins mode.
    if (e.key === 'C' || e.key === 'c') {
        if (game.gameState !== 'PLAYING' && game.gameState !== 'COUNTDOWN') {
            console.warn('[DEBUG] Shift+C ignored — game is not running.');
            return;
        }
        // Pick the current leader from the leaderboard, or a random country as placeholder
        const lb = game.winnerManager.getLeaderboard();
        const topEntry = lb[0] ?? null;
        const country = topEntry
            ? { code: topEntry.code, name: topEntry.name, image: topEntry.image }
            : (game.activeCountries?.[0] ?? game.allCountries?.[0] ?? { name: 'TEST CHAMPION', image: null });

        // Inject a fake win record so it shows a win count on the champion screen
        if (topEntry && !game.winnerManager._wins[topEntry.code]) {
            game.winnerManager._wins[topEntry.code] = { name: topEntry.name, imageSrc: null, wins: 1 };
        }

        console.log('[DEBUG] Shift+C — Triggering Grand Champion for:', country.name);
        game._triggerGrandChampion(country);
    }

    // Shift+N — skip to the next round in Highest Winner Wins OR 5H Championship.
    //           Expires the 40-min clock immediately and ends the current round,
    //           showing the 1-min winner display before Round N+1 starts.
    if (e.key === 'N' || e.key === 'n') {
        if (!game.isHighestWinsMode && !game.isLongBattleMode) {
            console.warn('[DEBUG] Shift+N only works in Highest Winner Wins or 5H Championship mode.');
            return;
        }
        if (game.gameState !== 'PLAYING' && game.gameState !== 'COUNTDOWN') {
            console.warn('[DEBUG] Shift+N ignored — game is not PLAYING or COUNTDOWN.');
            return;
        }
        if (game.isLongBattleMode && game.sessionMode && game.sessionMode.inGrandFinal) {
            console.warn('[DEBUG] Shift+N — already in Grand Final, cannot skip round.');
            return;
        }

        // Ensure at least one win exists so a named winner can be displayed
        var lbN = game.winnerManager.getLeaderboard();
        if (!lbN.length) {
            var poolN = (game.activeCountries && game.activeCountries.length)
                ? game.activeCountries
                : (game.allCountries || []);
            var seedCount = Math.min(3, poolN.length);
            for (var si = 0; si < seedCount; si++) {
                var sc = poolN[si];
                game.winnerManager._wins[sc.code] = {
                    name    : sc.name,
                    imageSrc: (sc.image && sc.image.src) ? sc.image.src : null,
                    wins    : seedCount - si,
                };
                if (sc.image) game.winnerManager._imageCache[sc.code] = sc.image;
            }
            try { game.winnerManager._saveWins(); } catch (_) {}
        }

        // Expire the segment clock so onRoundComplete() returns segment_end
        game.sessionMode.debugExpireSegment();

        // Force-end the current arena round right now via a silent tie
        // so the user doesn't have to wait for flags to drain naturally.
        var fakeWinner = { isTie: true, countries: [], isSilent: true };
        game.winnerManager.winner = fakeWinner;
        if (game.winnerManager.onWin) game.winnerManager.onWin(fakeWinner);

        console.log(
            '[DEBUG] Shift+N — Round', (game.sessionMode.segmentIndex + 1),
            'ended. 1-min winner display → Round',
            (game.sessionMode.segmentIndex + 2), 'will start next.'
        );
    }

    // Shift+H — trigger Highest Wins champion end (for testing HighestWinsMode champion screen)
    if (e.key === 'H' || e.key === 'h') {
        if (!game.isHighestWinsMode) {
            console.warn('[DEBUG] Shift+H only works in Highest Winner Wins mode.');
            return;
        }
        // Force time to be up and trigger the champion declaration
        if (game.sessionMode) {
            game.sessionMode.sessionStartTime = Date.now() - HighestWinsMode.DURATION_MS - 1000;
            console.log('[DEBUG] Shift+H — Highest Wins time forced to end, champion on next win.');
        }
    }

    // Shift+Y — force Highest Wins sudden-death tiebreaker
    if (e.key === 'Y' || e.key === 'y') {
        if (!game.isHighestWinsMode) {
            console.warn('[DEBUG] Shift+Y only works in Highest Winner Wins mode.');
            return;
        }

        // Pick 3 countries to force into a tie at the top of the leaderboard
        const pool = game.allCountries?.length
            ? game.allCountries
            : (game.activeCountries || []);
        if (pool.length < 2) {
            console.warn('[DEBUG] Shift+Y — not enough countries available.');
            return;
        }

        const tieCount = Math.min(6, pool.length);
        const tied = pool.slice(0, tieCount);
        const SHARED_WINS = 5;

        // Clear existing wins then give the chosen countries the same high score
        game.winnerManager.clearWins();
        tied.forEach(function (c) {
            game.winnerManager._wins[c.code] = {
                name    : c.name,
                imageSrc: c.image?.src ?? null,
                wins    : SHARED_WINS,
            };
            if (c.image) game.winnerManager._imageCache[c.code] = c.image;
        });
        game.winnerManager._saveWins();

        // Force the 40-minute clock to be expired
        if (game.sessionMode) {
            game.sessionMode.sessionStartTime = Date.now() - HighestWinsMode.DURATION_MS - 1000;
            game.sessionMode.ended = false; // allow _declareChampion to run
        }

        console.log(
            '[DEBUG] Shift+Y — Forced tie between:',
            tied.map(function (c) { return c.name; }).join(', '),
            '(' + SHARED_WINS + ' wins each). Entering sudden death…'
        );

        // Declare champion first (this populates mode.tiedCountries when there is a tie)
        // then run the end-of-session logic which will detect the tie and start sudden death.
        if (game.sessionMode) {
            game.sessionMode._declareChampion();
        }
        game._endHighestWinsSession();
    }

    // ── Long Battle (5H Championship) test keys ─────────────────────────────
    // Shift+T — toggle FAST test mode (45s segments instead of 40 min)
    if (e.key === 'T' || e.key === 't') {
        try {
            const cur = localStorage.getItem('flag_battle_lb_fast') === '1';
            localStorage.setItem('flag_battle_lb_fast', cur ? '0' : '1');
            console.log(
                '[DEBUG] Shift+T — Long Battle FAST mode:',
                !cur ? 'ON (45s per round)' : 'OFF (40 min per round)',
                '— restart the 5H event for it to apply.'
            );
            alert(
                (!cur
                    ? 'FAST test mode ON: ~30s rounds, ~5s winner screen.\nRestart 5 Hour Championship to apply.'
                    : 'FAST test mode OFF: each round = 40 minutes.\nRestart 5 Hour Championship to apply.')
            );
        } catch (err) {
            console.warn('[DEBUG] localStorage not available', err);
        }
    }

    // Shift+L — IMMEDIATELY end current Long Battle segment (no wait)
    if (e.key === 'L' || e.key === 'l') {
        if (!game.isLongBattleMode) {
            console.warn('[DEBUG] Shift+L only works in 5 Hour Championship mode.');
            return;
        }
        if (game.sessionMode && game.sessionMode.inGrandFinal) {
            console.warn('[DEBUG] Shift+L — already in Grand Final.');
            return;
        }

        // Ensure someone is on the leaderboard so a Round Winner can be recorded
        var lb = game.winnerManager.getLeaderboard();
        if (!lb.length) {
            var pool = (game.activeCountries && game.activeCountries.length)
                ? game.activeCountries
                : (game.allCountries || []);
            var n = Math.min(3, pool.length);
            for (var i = 0; i < n; i++) {
                var c = pool[i];
                game.winnerManager._wins[c.code] = {
                    name: c.name,
                    imageSrc: (c.image && c.image.src) ? c.image.src : null,
                    wins: 3 - i,
                };
                if (c.image) game.winnerManager._imageCache[c.code] = c.image;
            }
            try { game.winnerManager._saveWins(); } catch (_) {}
            lb = game.winnerManager.getLeaderboard();
        }

        var result = game.sessionMode.debugForceCloseSegment();
        console.log(
            '[DEBUG] Shift+L — Forced end of segment. Result:',
            result,
            '| Round winners so far:',
            (game.sessionMode.segmentWinners || []).map(function (w) {
                return 'R' + w.segment + ':' + w.name;
            }).join(', ')
        );

        if (result === 'grand_final') {
            game._enterLongBattleGrandFinal();
        } else if (result === 'segment_end') {
            game._showLongBattleSegmentWinner();
        }
    }

    // Shift+M — seed 5+ round winners and jump straight to Grand Final
    if (e.key === 'M' || e.key === 'm') {
        if (!game.isLongBattleMode) {
            console.warn('[DEBUG] Shift+M only works in 5 Hour Championship mode.');
            return;
        }
        const pool = game.allCountries || [];
        if (pool.length) {
            game.winnerManager.clearWins();
            const seedN = Math.min(8, pool.length);
            for (let i = 0; i < seedN; i++) {
                const c = pool[i];
                game.winnerManager._wins[c.code] = {
                    name: c.name,
                    imageSrc: c.image && c.image.src ? c.image.src : null,
                    wins: 8 - i,
                };
                if (c.image) game.winnerManager._imageCache[c.code] = c.image;
            }
            try { game.winnerManager._saveWins(); } catch (_) {}
        }
        const winners = game.sessionMode.debugSeedWinnersAndGotoFinal(6);
        console.log(
            '[DEBUG] Shift+M — Seeded round winners:',
            winners.map(function (w) { return 'R' + w.segment + ':' + w.name; }).join(', '),
            '→ entering Grand Final'
        );
        game._enterLongBattleGrandFinal();
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