import PhysicsWorld        from "../physics/PhysicsWorld";
import { gf, GAME_FONT } from '../GameFont.js';
import ArenaPhysics        from "../physics/ArenaPhysics";
import ArenaRenderer       from "../render/ArenaRenderer";
import BottomTrayRenderer  from "../render/BottomTrayRenderer";
import FinalBottomRenderer from "../render/FinalBottomRenderer";
import ProgressBarRenderer from "../render/ProgressBarRenderer";
import FlagManager         from "../entities/FlagManager";
import SpawnManager        from "../physics/SpawnManager";
import FlagLoader          from "../assets/FlagLoader";
import EliminationManager  from "../managers/EliminationManager";
import LayoutManager       from "./LayoutManager";
import countries           from "../countries";
import DrainSystem         from "./DrainSystem";
import WinnerManager       from "../managers/WinnerManager";
import WinnerRender        from "../render/WinnerRenderer";
import Confetti            from "../effects/Confetti";
import VisualFX            from "../effects/VisualFX";
import AudioManager        from "../audio/AudioManager";
import CommentarySystem    from "../audio/CommentarySystem";
import LeaderboardRenderer from "../render/LeaderboardRenderer";
import EventManager        from "../events/EventManager";
import TrayLauncher        from "../effects/TrayLauncher";
import HighestWinsMode     from "../modes/HighestWinsMode";
import LongBattleMode       from "../modes/LongBattleMode";
import Matter              from "matter-js";
import { THEMES, DEFAULT_THEME } from "../themes/ThemeConfig.js";
import SpaceTheme              from "../themes/SpaceTheme.js";

export default class Game {

    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext("2d");

        this.flagLoader   = new FlagLoader();
        this.allCountries = countries;

        // Pre-load all flag images once
        this.allCountries.forEach(c => {
            if (!c.image) c.image = this.flagLoader.load(c.code);
        });

        // ── Qualifying pool state ─────────────────────────────────────────
        // Countries that have already won a qualifying round sit out.
        // They are added back only when the pool runs dry.
        this._qualifyPool     = [];   // countries that still haven't won
        this._qualifyWinners  = [];   // countries that have won (sit out)
        this._qualifyPoolInit = false;

        this.activeCountries = [];
        this.totalCountries  = 0;
        this.roundSize       = 249;

        this.physics            = null;
        this.arena              = null;
        this.drain              = null;
        this.flagManager        = null;
        this.eliminationManager = null;

        this.arenaRenderer       = new ArenaRenderer();
        this.bottomTrayRenderer  = new BottomTrayRenderer();
        this.finalBottomRenderer = new FinalBottomRenderer();
        this.progressBarRenderer = new ProgressBarRenderer();
        this.leaderboardRenderer = new LeaderboardRenderer();
        this.layout              = new LayoutManager();
        this.eventManager        = new EventManager();
        this.trayLauncher        = new TrayLauncher();

        this.matchStartTime     = Date.now();
        this.lastRemainingCount = -1;

        this.winnerManager = new WinnerManager();
        this.winnerRender  = new WinnerRender();
        this.confetti      = new Confetti();
        this.fx            = new VisualFX();
        this.audio         = new AudioManager();
        this.commentary    = new CommentarySystem(this.audio);
        this.spaceTheme    = new SpaceTheme();

        this.gameState             = "START_SCREEN";
        this.theme                 = THEMES[DEFAULT_THEME];
        this.winnerDisplayTime     = 0;
        this.winnerDisplayDuration = 3500; // classic short display; 5H segment uses ROUND_WINNER_DISPLAY_MS

        // ── Qualifying session ────────────────────────────────────────────
        this.QUALIFY_DURATION_MS = 40 * 60 * 1000;
        this.sessionStartTime    = 0;
        this.roundNumber         = 0;
        this.isFinalMode         = false;
        this._currentEventId     = null;

        // Active home-page mode controller (null = classic qualifier)
        // Future modes: assign a new class here from startEvent()
        this.sessionMode         = null;

        // ── Final mode ────────────────────────────────────────────────────
        this._finalists         = [];
        this._finalEliminated   = [];
        this._finalRoundNumber  = 0;
        this._finalTotalCount   = 0;

        // ── Grand champion ────────────────────────────────────────────────
        this._grandChampion        = null;
        this._champDisplayStart    = 0;
        this._champCountdownSec    = 120;
        this._champCountdownTimer  = null;
        this._champCountdownRemain = 120;
        this._champPermanent       = false;
        this._champHwRound         = false;
        this._lbGrandFinalPending  = false;

        this.nextEventTimer    = 0;
        this.nextEventDuration = 150;

        this.restartCountdown = 0;
        this.restartTimer     = null;

        this._nextSpawnPositions = null;
        this._nextFlagW          = 0;
        this._nextFlagH          = 0;

        this._frame = 0;

        this._spawnPositions = null;
        this._spawnFlagW     = 0;
        this._spawnFlagH     = 0;
        this._spawnIndex     = 0;
        this._spawnTotal     = 0;
        this._spawnPerFrame  = 12;

        // ── Final-mode elimination card (legacy pause path kept for safety) ─
        this._elimShowCountry  = null;
        this._elimShowStart    = 0;
        this._elimShowDuration = 2800;

        // LAST FLAG STANDING sequential elim (video-matched pacing):
        // one flag exits → gap seals → ELIMINATED card → settle/wobble with
        // "LAST FLAG STANDING" center text → gap reopens → next exit
        this._elimFlashQueue   = [];   // { country, remaining, start }
        this._ELIM_FLASH_MS    = 2400; // phase 1: ELIMINATED card duration
        this._SETTLE_MS        = 2800; // phase 2: wobble + LAST FLAG STANDING
        this._finalElimFreeze  = false; // gap sealed, no further drains
        this._finalElimFreezeUntil = 0;
        this._finalElimActive  = null;  // currently displayed elim { country, remaining }
        this._finalElimPhase   = null;  // "elim" | "settle" | null

        // Final-mode stalemate clock (mirrors WinnerManager qualifying logic)
        this._finalStalemateSince = 0;
        this._emptyArenaSince     = 0;

        // Winner screen timer — tracks when restartTimer will fire so the
        // countdown pill in WinnerRenderer can show live seconds remaining.
        this._winnerTimerEndsAt = null;
        this._winnerShowTick    = 0;

        // ── Highest Winner Wins — sudden death tiebreaker ─────────────────
        this._hwSuddenDeathActive   = false;
        this._hwSuddenDeathFlags    = [];   // countries in the tiebreaker
        this._hwSuddenDeathWins     = 0;    // shared win count that caused the tie
        this._suddenDeathBannerStart    = 0;
        this._suddenDeathBannerDuration = 3800;
    }

    get _lw() { return this._logicalW || this.canvas.width; }
    get _lh() { return this._logicalH || this.canvas.height; }

    // ─────────────────────────────────────────────────────────────────────────
    // QUALIFYING POOL LOGIC
    // Countries that win a round are removed from the pool so they never
    // participate in qualifying again. When the pool is exhausted, it refills
    // from the bench (all countries that won, shuffled) so rounds can continue.
    // ─────────────────────────────────────────────────────────────────────────

    _initQualifyPool() {
        this._qualifyPool    = this._shuffle([...this.allCountries]);
        this._qualifyWinners = [];
        this._qualifyPoolInit = true;
    }

    _shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    /** Remove the winning country from the qualifying pool. */
    _removeWinnerFromPool(countryCode) {
        const idx = this._qualifyPool.findIndex(c => c.code === countryCode);
        if (idx !== -1) {
            const [won] = this._qualifyPool.splice(idx, 1);
            this._qualifyWinners.push(won);
        }
    }

    /**
     * Pick the next batch of countries for a qualifying round.
     * Takes up to `roundSize` from the front of the shuffled pool.
     * If fewer than 2 are left, refills from winners so rounds can continue.
     */
    _pickQualifyBatch() {
        // Refill if pool is running low
        if (this._qualifyPool.length < 2) {
            // All countries now have wins — shuffle winners back in and start a
            // new cycle. This is the normal path when all 249 countries have won
            // at least once before 40 mins is up; rounds simply continue.
            console.log(
                `[Pool] All ${this.allCountries.length} countries have won at least once.` +
                ` Recycling pool for a new qualifying cycle.` +
                ` Session time remaining: ${Math.round((this.QUALIFY_DURATION_MS - (Date.now() - this.sessionStartTime)) / 1000)}s`
            );
            this._qualifyPool = this._shuffle([...this._qualifyWinners, ...this._qualifyPool]);
            this._qualifyWinners = [];
        }

        const size  = Math.min(this.roundSize, this._qualifyPool.length);
        const batch = this._qualifyPool.slice(0, size);
        return batch;
    }

    // ── Resize ───────────────────────────────────────────────────────────────

    resize(width, height, dpr = 1) {
        this._dpr = dpr;
        this.canvas.width  = width;
        this.canvas.height = height;

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);

        this._logicalW = width  / dpr;
        this._logicalH = height / dpr;

        const lw = width  / dpr;
        const lh = height / dpr;
        this.layout.update(lw, lh);

        this.physics = new PhysicsWorld(lw, lh);
        Matter.Events.on(this.physics.engine, "collisionStart", (event) => {
            const isPlaying   = this.gameState === "PLAYING";
            const isCountdown = this.gameState === "COUNTDOWN";
            if (!isPlaying && !isCountdown) return;

            for (const pair of event.pairs) {
                const labelA = pair.bodyA.label;
                const labelB = pair.bodyB.label;
                const isFlag = (l) => l === "flag";
                const isWall = (l) => l === "arenaWall";
                const cx = (pair.bodyA.position.x + pair.bodyB.position.x) / 2;
                const cy = (pair.bodyA.position.y + pair.bodyB.position.y) / 2;

                if (isFlag(labelA) && isFlag(labelB)) {
                    this.audio.playCollision("flag");
                    this.fx.spark(cx, cy, 6, "#FFE566");
                    break;
                }
                if (isPlaying && (isFlag(labelA) || isFlag(labelB)) && (isWall(labelA) || isWall(labelB))) {
                    this.audio.playCollision("wall");
                    this.fx.spark(cx, cy, 5, "#88CCFF");
                    break;
                }
            }
        });

        this.arena = new ArenaPhysics(
            this.physics.world,
            this.layout.arenaX,
            this.layout.arenaY,
            this.layout.arenaRadius
        );

        this.drain = new DrainSystem(this.physics.engine, this.physics.world, this.arena);
        this.drain.createSensor();

        this.eliminationManager = new EliminationManager(this.arena, this.physics.world);
        this.flagManager        = new FlagManager(this.physics.world);

        this.eventManager.pick();

        this.winnerManager.onWin = (winner) => this.handleWinner(winner);
        this.winnerManager.leaderboardRenderer = this.leaderboardRenderer;

        if (this.gameState !== "START_SCREEN") {
            this._beginCountdown();
        }
    }

    // ── Entry point from home screen ─────────────────────────────────────────

    /**
     * Called by main.js when the player taps an event card.
     * eventId matches the id defined in SELECTION_EVENTS in main.js.
     */
    startEvent(eventId, themeId = DEFAULT_THEME) {
        try { this.audio.stopWinnerLoop(); } catch (_) {}
        this._currentEventId = eventId;
        this.theme = THEMES[themeId] ?? THEMES[DEFAULT_THEME];

        // Attach isolated mode controller — classic uses null
        if (eventId === HighestWinsMode.ID) {
            this.sessionMode = new HighestWinsMode(this);
        } else if (eventId === LongBattleMode.ID) {
            this.sessionMode = new LongBattleMode(this);
        } else {
            this.sessionMode = null; // classic 40-min qualifier
        }

        // Tell leaderboard renderer which label to use
        this.leaderboardRenderer?.setHighestWinsMode(this.isHighestWinsMode);
        this.leaderboardRenderer?.setLongBattleMode?.(this.isLongBattleMode);

        this._doReset();
    }

    /** Legacy: called if something still calls startGame() */
    startGame() {
        this.startEvent('qualifier_40');
    }

    /** True when running the separate Highest Winner Wins home event. */
    get isHighestWinsMode() {
        return this.sessionMode instanceof HighestWinsMode;
    }

    /** True when running the 5-hour / 8×40min championship. */
    get isLongBattleMode() {
        return this.sessionMode instanceof LongBattleMode;
    }

    // ── Winner handling (qualifying) ──────────────────────────────────────────


    _clearRestartTimer() {
        if (this.restartTimer) {
            try { clearTimeout(this.restartTimer); } catch (_) {}
            try { clearInterval(this.restartTimer); } catch (_) {}
            this.restartTimer = null;
        }
    }

    handleWinner(winner) {
        if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }

        // Final mode winner detection is handled in _handleFinalElimination()
        if (this.isFinalMode) return;

        this.gameState         = "WINNER_SHOW";
        this.winnerDisplayTime = Date.now();
        this._winnerShowTick   = 0;  // reset so clap/confetti audio fires fresh

        if (this.theme?.stars) this.spaceTheme.notifyNotPlaying();
        this.eventManager.end(this._eventCtx());

        const isTie = winner?.isTie === true;

        if (isTie && !winner.isSilent) {
            this.confetti.start(this._lw / 2, this._lh * 0.4, 130);
            try { this.audio.stopWinnerLoop(); } catch (_) {}
            try { this.audio.playPhase('champion', { loop: true }); } catch (_) {}
            const names = (winner.countries ?? []).map(c => c.name).join(" and ");
            if (names) this.audio.speak(`It's a tie between ${names}!`);
        } else if (!isTie) {
            this.confetti.start(this._lw / 2, this._lh * 0.36, 150);
            try { this.audio.stopWinnerLoop(); } catch (_) {}
            try { this.audio.playPhase('champion', { loop: true }); } catch (_) {}
            this.audio.speak(`${winner.country.name} wins!`);

            // Classic only: remove winner from pool so they sit out until recycle
            // Highest-Wins mode keeps everyone eligible (accumulate wins)
            if (!this.isHighestWinsMode && !this.isLongBattleMode) {
                this._removeWinnerFromPool(winner.country.code);
            }
        }

        // ── Sudden death tiebreaker resolution ───────────────────────────
        if (this._hwSuddenDeathActive) {
            if (isTie) {
                // Tied again — replay sudden death with the same countries
                const names = (winner.countries ?? []).map(c => c.name).join(" and ");
                if (names) this.audio.speak(`${names} still tied — replaying sudden death!`);
                this._winnerTimerEndsAt = Date.now() + this.winnerDisplayDuration;
                this.restartTimer = setTimeout(() => {
                    this.restartTimer = null;
                    this._winnerTimerEndsAt = null;
                    this._enterHWSuddenDeath(
                        this._hwSuddenDeathFlags,
                        this._hwSuddenDeathWins
                    );
                }, this.winnerDisplayDuration);
            } else {
                // Single sudden death winner = ROUND winner for this 40-min window
                const country = winner.country;
                this._hwSuddenDeathActive = false;

                // Record as segment winner, reset board for next 40-min (same as clear winner path)
                if (this.isHighestWinsMode && this.sessionMode) {
                    const wins = this._hwSuddenDeathWins || 1;
                    this.sessionMode.lastSegmentWinner = {
                        code: country.code,
                        name: country.name,
                        image: country.image,
                        wins: country.wins || wins,
                        segment: (this.sessionMode.segmentIndex || 0) + 1,
                    };
                    this.sessionMode.segmentIndex = (this.sessionMode.segmentIndex || 0) + 1;
                    this.sessionMode.tiedCountries = [];
                    this.sessionMode.sessionStartTime = Date.now();
                    this.sessionStartTime = this.sessionMode.sessionStartTime;
                    this.QUALIFY_DURATION_MS = this.sessionMode.constructor.DURATION_MS
                        || (40 * 60 * 1000);
                    this.winnerManager.clearWins();
                    this.leaderboardRenderer?.reset();
                    // Full-screen TIME UP for the sudden-death winner, then next round
                    this._showHighestWinsRoundWinner();
                } else {
                    // Fallback (should not hit in continuous HW)
                    this._grandChampion = country;
                    this._champDisplayStart = Date.now();
                    this._champCountdownRemain = this._champCountdownSec;
                    this.gameState = "GRAND_CHAMPION";
                    this.confetti.start(this._lw / 2, this._lh * 0.36, 90);
                    try { this.audio.stopWinnerLoop(); } catch (_) {}
                    try { this.audio.playPhase("champion", { loop: true }); } catch (_) {}
                    this.audio.speak(
                        `${country.name} wins the sudden death and is the Highest Winner Champion!`
                    );
                    if (this._champCountdownTimer) clearInterval(this._champCountdownTimer);
                    this._champCountdownTimer = setInterval(() => {
                        this._champCountdownRemain--;
                        if (this._champCountdownRemain <= 0) {
                            clearInterval(this._champCountdownTimer);
                            this._champCountdownTimer = null;
                            this._doReset();
                        }
                    }, 1000);
                }
            }
            return;
        }

        // ── Mode-specific session end ─────────────────────────────────────
        if (this.isHighestWinsMode) {
            const result = this.sessionMode.onRoundComplete(winner);
            if (result === "sudden_death") {
                // 2+ countries share the top win count at 40-min end → sudden death
                const tied = this.sessionMode.tiedCountries || [];
                const sharedWins = tied[0]?.wins
                    ?? this.winnerManager.getLeaderboard()[0]?.wins
                    ?? 0;
                this._enterHWSuddenDeath(tied, sharedWins);
                return;
            }
            if (result === "segment_end") {
                // Clear winner — full-screen TIME UP, then next 40-min round
                this._showHighestWinsRoundWinner();
                return;
            }
            // Still time left — fall through to continue arena rounds
        } else if (this.isLongBattleMode) {
            const result = this.sessionMode.onRoundComplete(winner);
            if (result === "grand_final") {
                this._enterLongBattleGrandFinal();
                return;
            }
            if (result === "segment_end") {
                this._showLongBattleSegmentWinner();
                return;
            }
            if (result === "end") {
                this._endHighestWinsSession();
                return;
            }
        } else if (this.sessionStartTime > 0) {
            // Classic: 40 minutes up → Last Standing Final Mode
            const elapsed = Date.now() - this.sessionStartTime;
            if (elapsed >= this.QUALIFY_DURATION_MS) {
                this._enterFinalMode();
            }
        }

        // Qualifying keeps random events; final uses dedicated LAST STANDING physics
        if (this.isFinalMode) this.eventManager.pickEarthquake();
        else this.eventManager.pick();

        const displayDuration = (isTie && winner.isSilent) ? 500 : this.winnerDisplayDuration;
        this._winnerTimerEndsAt = Date.now() + displayDuration;
        this.restartTimer = setTimeout(() => { this._winnerTimerEndsAt = null; this._beginNextEvent(); }, displayDuration);
    }


    /**
     * Highest Winner Wins only: end of a 40-min window.
     * Full-screen TIME UP — CHAMPION (no leaderboard / tray), continuous confetti + winner BGM,
     * then next 40-min round. Does not touch Qualifier or 5H.
     */
    _showHighestWinsRoundWinner() {
        const mode = this.sessionMode;
        // Safety: if top score is still tied, force sudden death instead
        if (mode && typeof mode._getTopTied === "function") {
            const tied = mode._getTopTied();
            if (tied.length >= 2) {
                mode.tiedCountries = tied;
                this._enterHWSuddenDeath(tied, tied[0].wins);
                return;
            }
        }
        const w = mode?.lastSegmentWinner;

        this._clearRestartTimer();
        if (this._champCountdownTimer) {
            clearInterval(this._champCountdownTimer);
            this._champCountdownTimer = null;
        }

        if (this.theme?.stars) this.spaceTheme.notifyNotPlaying();
        try { this.eventManager.end(this._eventCtx()); } catch (_) {}
        try { this._clearAllFlags(); } catch (_) {}
        try { this.trayLauncher.cancel(); } catch (_) {}

        const holdMs = (typeof mode?.constructor?.ROUND_WINNER_DISPLAY_MS === "number")
            ? mode.constructor.ROUND_WINNER_DISPLAY_MS
            : 60 * 1000;

        // Full-screen champion presentation (same visual language as classic TIME UP)
        this._champHwRound = true;       // marks temporary HW round champion (not 5H permanent)
        this._champPermanent = false;
        this._champBgmKilled = false;
        this._champConfettiTick = 0;
        this._champDisplayStart = Date.now();
        this._champCountdownRemain = Math.ceil(holdMs / 1000);
        this.isFinalMode = false;

        if (w) {
            this._grandChampion = {
                code: w.code,
                name: w.name,
                image: w.image,
                wins: w.wins || 1,
            };
        } else {
            const lb = this.winnerManager.getLeaderboard();
            const top = lb[0];
            this._grandChampion = top
                ? { code: top.code, name: top.name, image: top.image, wins: top.wins || 1 }
                : { code: "??", name: "NO WINNER", image: null, wins: 0 };
        }

        this.gameState = "GRAND_CHAMPION";

        // Continuous confetti + looping winner/celebration audio for the whole hold
        this.confetti.start(this._lw / 2, this._lh * 0.08, 220, { fromTop: true });
        try { this.audio.stopBGM(); } catch (_) {}
        try { this.audio.stopWinnerLoop(); } catch (_) {}
        try { this.audio.playPhase("champion", { loop: true }); } catch (_) {}
        try { this.audio.playClap(); } catch (_) {}
        try { this.audio.playConfetti(); } catch (_) {}
        try {
            const nm = this._grandChampion?.name || "Champion";
            const wins = this._grandChampion?.wins || 1;
            this.audio.speak(
                `Time is up! ${nm} is the highest winner with ${wins} win${wins === 1 ? "" : "s"}!`
            );
        } catch (_) {}

        // Tick countdown label; after hold → next 40-min round
        this._champCountdownTimer = setInterval(() => {
            this._champCountdownRemain--;
            if (this._champCountdownRemain <= 0) {
                clearInterval(this._champCountdownTimer);
                this._champCountdownTimer = null;
                this._champHwRound = false;
                try { this.audio.stopBGM(); } catch (_) {}
                this._grandChampion = null;
                this.gameState = "NEXT_EVENT";
                this._beginNextEvent();
            }
        }, 1000);
    }

    /** End Highest Winner Wins session — champion = most wins, no final. */
    _endHighestWinsSession() {
        const mode  = this.sessionMode;
        const champ = mode?.champion;

        // ── Tie detected: two or more countries share the top win count ──────
        const tied = mode?.tiedCountries ?? [];
        if (!champ && tied.length >= 2) {
            // Derive the shared win count from the live leaderboard
            const lb2       = this.winnerManager.getLeaderboard();
            const sharedWins = lb2.length > 0 ? lb2[0].wins : 0;
            this._enterHWSuddenDeath(tied, sharedWins);
            return;
        }

        if (!champ) {
            // No wins recorded at all — just restart
            this.restartTimer = setTimeout(() => this._beginNextEvent(), 800);
            return;
        }

        // ── Clear winner ──────────────────────────────────────────────────────
        this._hwSuddenDeathActive = false;
        this.isFinalMode          = false;
        this._grandChampion       = champ.country;
        this._champDisplayStart   = Date.now();
        this._champCountdownRemain = this._champCountdownSec;
        this.gameState = "GRAND_CHAMPION";

        this.confetti.start(this._lw / 2, this._lh * 0.36, 90);
        try { this.audio.stopWinnerLoop(); } catch (_) {}
        try { this.audio.playPhase('champion', { loop: true }); } catch (_) {}
        this.audio.speak(
            `${champ.name} is the highest winner with ${champ.wins} win${champ.wins === 1 ? "" : "s"}!`
        );

        if (this._champCountdownTimer) clearInterval(this._champCountdownTimer);
        this._champCountdownTimer = setInterval(() => {
            this._champCountdownRemain--;
            if (this._champCountdownRemain <= 0) {
                clearInterval(this._champCountdownTimer);
                this._champCountdownTimer = null;
                this._doReset();
            }
        }, 1000);
    }

    // ── Long Battle (5H Championship) ─────────────────────────────────────────

    /**
     * After a 40-min segment ends: celebrate the segment winner, then continue.
     */
    _showLongBattleSegmentWinner() {
        const mode = this.sessionMode;
        const w = mode?.lastSegmentWinner;

        // ── Build a winner object the WinnerRenderer can display ─────────────
        // winnerManager.winner is what WINNER_SHOW draws. It must have a
        // .country sub-object with { name, image } — same shape as a Flag.
        // We also tag it so draw() can show "ROUND N WINNER" instead of
        // the generic "ROUND WINNER" label.
        if (w) {
            this.winnerManager.winner = {
                country: {
                    code : w.code,
                    name : w.name,
                    image: w.image,
                },
                _isSegmentWinner : true,
                _segmentNumber   : w.segment,
                _segmentWins     : w.wins,
            };
        }
        // If no segment winner data (0 wins recorded), leave winnerManager.winner
        // as whatever it was so the screen is not blank.

        this.gameState         = "WINNER_SHOW";
        this.winnerDisplayTime = Date.now();
        this._winnerShowTick   = 0;  // reset so clap/confetti audio fires fresh

        // ~1 minute on production (5s in FAST test) before next 40-min round
        const holdMs = (typeof mode?.constructor?.ROUND_WINNER_DISPLAY_MS === "number")
            ? mode.constructor.ROUND_WINNER_DISPLAY_MS
            : 60 * 1000;

        // Stop battle BGM, start looping winner BGM for the 1-minute display
        try { this.audio.stopBGM(); } catch (_) {}
        try { this.audio.playPhase('champion', { loop: true }); } catch (_) {}

        if (w) {
            this.confetti.start(this._lw / 2, this._lh * 0.36, 120);
            try { this.audio.stopWinnerLoop(); } catch (_) {}
            try { this.audio.playPhase('champion', { loop: true }); } catch (_) {}
            this.audio.speak(
                `Time is up! ${w.name} wins Round ${w.segment} with ${w.wins} win${w.wins === 1 ? "" : "s"}!`
            );
            // Keep on the flash strip under the leaderboard
            this._lbSegmentFlashQueue = this._lbSegmentFlashQueue || [];
            this._lbSegmentFlashQueue.push({
                ...w,
                showUntil: Date.now() + Math.max(holdMs, 15000),
            });
        }

        const nextSeg = (mode?.segmentIndex ?? 0) + 1;
        this._winnerTimerEndsAt = Date.now() + holdMs;
        this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            this._winnerTimerEndsAt = null;
            // Restore battle BGM now that the 1-minute winner display is over
            if (mode && !mode.inGrandFinal) {
                try { this.audio.playPhase('qualify'); } catch (_) {}
                this.audio.speak(`Round ${nextSeg} begins now!`);
            } else {
                try { this.audio.playPhase('elimination'); } catch (_) {}
            }
            this._beginNextEvent();
        }, holdMs);
    }

    /**
     * All Round Winners → Grand Final (Last Flag Standing elimination).
     * IMPORTANT: leave PLAYING immediately and clear bodies so final-elim
     * logic cannot wipe finalists before they spawn.
     */
    _enterLongBattleGrandFinal() {
        const mode = this.sessionMode;
        let finalists = mode?.getGrandFinalists?.() ?? [];

        // Resolve to full country objects (with images) from the master list
        const resolveCountry = (f) => {
            const full = this.allCountries.find(c => c.code === f.code);
            if (full) {
                if (!full.image && this.flagLoader) {
                    full.image = this.flagLoader.load(full.code);
                }
                return full;
            }
            const c = {
                code: f.code,
                name: f.name,
                image: f.image || (this.flagLoader ? this.flagLoader.load(f.code) : null),
            };
            return c;
        };

        // If seed path produced thin entries, rebuild from segmentWinners / allCountries
        if (finalists.length < 2 && mode?.segmentWinners?.length) {
            finalists = mode.getGrandFinalists();
        }

        if (finalists.length < 2) {
            // Pad with random countries so we can still test the final
            const need = 6 - finalists.length;
            const have = new Set(finalists.map(f => f.code));
            for (const c of this.allCountries) {
                if (need <= 0) break;
                if (have.has(c.code)) continue;
                finalists.push({
                    code: c.code,
                    name: c.name,
                    image: c.image,
                    country: c,
                });
                have.add(c.code);
            }
        }

        if (finalists.length < 2) {
            const last = mode?.segmentWinners?.[mode.segmentWinners.length - 1];
            if (last) {
                this._triggerGrandChampion({
                    code: last.code,
                    name: last.name,
                    image: last.image,
                });
                return;
            }
            console.warn("[LongBattle] Grand Final aborted — fewer than 2 finalists");
            return;
        }

        // ── Stop current arena immediately (prevents final-elim eating finalists)
        this._clearRestartTimer();
        // Hold state that update() will NOT auto-advance into countdown
        this._lbGrandFinalPending = true;
        this.gameState = "NEXT_EVENT";
        this.nextEventTimer = 0;
        this.nextEventDuration = 999999; // block auto NEXT_EVENT → countdown race
        try { this.eventManager.end(this._eventCtx()); } catch (_) {}
        try { this.trayLauncher.cancel(); } catch (_) {}
        try { this._clearAllFlags(); } catch (_) {}
        if (this.eliminationManager) {
            this.eliminationManager.eliminated = [];
            this.eliminationManager._lastBatchSize = 0;
            if (typeof this.eliminationManager.reset === "function") {
                this.eliminationManager.reset();
            }
        }

        const countries = finalists.map(resolveCountry).filter(Boolean);
        // De-dupe by code
        const seen = new Set();
        const unique = [];
        for (const c of countries) {
            if (!c?.code || seen.has(c.code)) continue;
            seen.add(c.code);
            unique.push(c);
        }

        this.isFinalMode = true;
        try { this.spaceTheme?.setAsteroidsDisabled?.(true); } catch (_) {}
        this._hwSuddenDeathActive = false;
        this._finalists = unique.map(c => ({ country: c }));
        this._finalEliminated = [];
        this._finalTotalCount = unique.length;
        this._finalRoundNumber = 0;
        this._finalElimFreeze = false;
        this._finalElimActive = null;
        this._finalElimPhase = null;
        this._elimFlashQueue = [];
        this._emptyArenaSince = 0;

        this.activeCountries = unique.slice();
        this.totalCountries = unique.length;

        this.winnerManager.clearWins();
        this.leaderboardRenderer.reset();
        this.leaderboardRenderer.setFinalMode(true);

        this.audio.playPhase('elimination');
        this.audio.speak(
            `Grand Final elimination! ${unique.length} round winners — last flag standing is the champion!`
        );

        this._lbSegmentFlashQueue = this._lbSegmentFlashQueue || [];
        for (const w of (mode?.segmentWinners || [])) {
            this._lbSegmentFlashQueue.push({ ...w, showUntil: Date.now() + 15000 });
        }

        console.log(
            "[LongBattle] Grand Final finalists:",
            unique.map(c => c.name).join(", ")
        );

        // Brief pause then spawn via standard final pipeline (once)
        this._clearRestartTimer();
        this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            if (this.gameState === "GRAND_CHAMPION" || this._champPermanent) return;
            // Re-assert finalists
            this.isFinalMode = true;
            this._finalists = unique.map(c => ({ country: c }));
            this.activeCountries = unique.slice();
            this.totalCountries = unique.length;
            this._lbGrandFinalPending = false;
            this.nextEventDuration = 130;
            this._beginNextEvent();
        }, 1200);
    }

    /**
     * Sudden death tiebreaker for Highest Winner Wins.
     * Only the tied countries enter — one round, winner is champion.
     * If that round itself ties (stalemate / simultaneous drain), replay with
     * the same set of countries until a single winner emerges.
     *
     * @param {Array<{code,name,image}>} tiedCountries
     * @param {number} topWins  — the shared win count (for announcement)
     */
    _enterHWSuddenDeath(tiedCountries, topWins = 0) {
        this._hwSuddenDeathActive  = true;
        this._hwSuddenDeathFlags   = tiedCountries.slice(); // canonical tied set
        this._hwSuddenDeathWins    = topWins;
        this.isFinalMode           = false;

        // Show the SUDDEN_DEATH_BANNER state briefly, then kick off the round
        this.gameState = "SUDDEN_DEATH_BANNER";
        this._suddenDeathBannerStart = Date.now();
        this._suddenDeathBannerDuration = 3800; // ms to display the banner

        // Announcement — no country names (keeps VO short)
        this.audio.playRoundStart();
        const n = tiedCountries.length;
        this.audio.speak(
            `It's a tie on ${topWins} win${topWins === 1 ? "" : "s"}! `
            + `${n} countr${n === 1 ? "y" : "ies"} will participate in sudden death!`
        );

        // No asteroids in Highest Wins sudden death
        try { this.spaceTheme?.setAsteroidsDisabled?.(true); } catch (_) {}
        if (this.spaceTheme) this.spaceTheme.onFlagBurned = null;

        // Pre-load spawn positions for the tied countries so _beginNextEvent
        // can run immediately after the banner
        this.activeCountries = tiedCountries.map(c => {
            // Find the full country object (has .image already on it)
            return this.allCountries.find(ac => ac.code === c.code) ?? c;
        });
        this.totalCountries = this.activeCountries.length;

        const spawnRadius = this.layout.arenaRadius - 20;
        const { positions, spacing } = SpawnManager.generate(
            this.layout.arenaX, this.layout.arenaY, spawnRadius, this.totalCountries
        );
        this._nextSpawnPositions = positions;
        // Few countries → large spacing → oversized flags that can't exit the gap.
        // Match the tighter final-mode cap so size stays consistent.
        const rawW = Math.max(12, spacing * 0.95);
        this._nextFlagW = Math.min(rawW, 19);
        this._nextFlagH = Math.max(8, Math.round(this._nextFlagW * 0.667));

        this._clearAllFlags();

        const launchFlags = this.activeCountries.map(c => ({ country: c }));
        this.trayLauncher.startLaunch(
            launchFlags,
            this.layout.trayTop,
            this._lw,
            this.layout.arenaX,
            this.layout.arenaY,
            this.layout.arenaRadius,
            this._nextSpawnPositions,
            this._nextFlagW,
            this._nextFlagH
        );

        // After banner duration, transition to NEXT_EVENT so the normal
        // countdown → spawn → play pipeline fires
        if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
        this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            // Transition through NEXT_EVENT → COUNTDOWN → PLAYING as normal
            // activeCountries / spawn data are already set above
            this.gameState      = "NEXT_EVENT";
            this.nextEventTimer = 0;
            this._elimFlashQueue = [];
            this._finalElimFreeze = false;
            this._finalElimActive = null;
            this._finalElimFreezeUntil = 0;
            this._finalElimPhase = null;
            if (this.theme?.stars) this.spaceTheme.notifyNotPlaying();
            // Always run Earthquake in sudden death for consistent, active physics
            this.eventManager.pickEarthquake();
            this.nextEventDuration = 130;
        }, this._suddenDeathBannerDuration);
    }

    // ── Final Mode ────────────────────────────────────────────────────────────

    _enterFinalMode() {
        this.isFinalMode       = true;
        this._finalRoundNumber = 0;
        this._finalEliminated  = [];
        this._grandChampion    = null;
        try { this.spaceTheme?.setAsteroidsDisabled?.(true); } catch (_) {}

        const lb = this.winnerManager.getLeaderboard();
        this._finalists = lb
            .filter(entry => entry.wins >= 1)
            .map(entry => ({ country: { code: entry.code, name: entry.name, image: entry.image } }));

        if (this._finalists.length < 2) {
            this._finalists = lb.slice(0, Math.max(2, lb.length))
                .map(entry => ({ country: { code: entry.code, name: entry.name, image: entry.image } }));
        }

        this._finalTotalCount = this._finalists.length;
        this.leaderboardRenderer.setFinalMode(true);
        this.audio.playPhase('elimination');
        this.audio.speak(`Qualifying is over! Grand Final begins with ${this._finalists.length} countries!`);
    }

    // ── Begin next event (qualifying or final) ────────────────────────────────

    _beginNextEvent() {
        // Never start another arena after 5H champion is locked
        if (this._champPermanent || this.gameState === "GRAND_CHAMPION") {
            console.warn("[Game] _beginNextEvent blocked — champion locked");
            return;
        }
        if (this.sessionMode && this.sessionMode.ended && !this.isFinalMode) {
            console.warn("[Game] _beginNextEvent blocked — session ended");
            return;
        }
        this.gameState      = "NEXT_EVENT";
        this.nextEventTimer = 0;
        this._elimFlashQueue = [];
        this._finalElimFreeze = false;
        this._finalElimActive = null;
        this._finalElimFreezeUntil = 0;
        if (this.theme?.stars) this.spaceTheme.notifyNotPlaying();
        this._finalElimPhase = null;

        if (this.isFinalMode) {
            // Final / Long-Battle Grand Final: only finalists, Last Standing
            const finals = (this._finalists || [])
                .map(f => f?.country)
                .filter(Boolean);
            if (finals.length >= 2) {
                this.activeCountries = finals;
            } else if (!this.activeCountries?.length) {
                // Last-resort pad so the arena is never empty in final
                this.activeCountries = this.allCountries.slice(0, 6);
                this._finalists = this.activeCountries.map(c => ({ country: c }));
            }
            this.totalCountries = this.activeCountries.length;
            this._finalTotalCount = Math.max(this._finalTotalCount || 0, this.totalCountries);
            this.eventManager.pickEarthquake();
        } else if (this.isHighestWinsMode || this.isLongBattleMode) {
            // Highest Wins / Long Battle: everyone stays eligible; mode picks the batch
            this.activeCountries = this.sessionMode.pickBatch();
            this.eventManager.pick();
        } else {
            // Classic qualifying: winners sit out until pool recycles
            this.activeCountries = this._pickQualifyBatch();
        }

        this.totalCountries = this.activeCountries.length;

        const spawnRadius = this.layout.arenaRadius - 20;
        const { positions, spacing } = SpawnManager.generate(
            this.layout.arenaX, this.layout.arenaY, spawnRadius, this.totalCountries
        );
        this._nextSpawnPositions = positions;
        // Keep flags small enough to exit the gap. Fewer countries → larger spacing;
        // hard-cap so elim / low-count rounds never spawn oversized flags.
        const rawW = Math.max(12, spacing * 0.95);
        const maxW = this.isFinalMode
            ? 22
            : (this.totalCountries <= 40 ? 27 : (this.totalCountries <= 100 ? 33 : 40));
        this._nextFlagW = Math.min(rawW, maxW);
        this._nextFlagH = Math.max(8, Math.round(this._nextFlagW * 0.667));  // standard 3:2 flag ratio

        this._clearAllFlags();

        const launchFlags = this.activeCountries.map(c => ({ country: c }));
        this.trayLauncher.startLaunch(
            launchFlags,
            this.layout.trayTop,
            this._lw,
            this.layout.arenaX,
            this.layout.arenaY,
            this.layout.arenaRadius,
            this._nextSpawnPositions,
            this._nextFlagW,
            this._nextFlagH
        );

        this.nextEventDuration = 130;
    }

    // ── Reset ─────────────────────────────────────────────────────────────────

    _doReset() {
        try { this.audio.stopWinnerLoop(); } catch (_) {}

        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            clearInterval(this.restartTimer);
            this.restartTimer = null;
        }
        if (this._champCountdownTimer) {
            clearInterval(this._champCountdownTimer);
            this._champCountdownTimer = null;
        }

        if (this.gameState === "PLAYING" && this.arena) {
            this.eventManager.end(this._eventCtx());
        }

        // Wipe leaderboard and wins for a fresh session
        this.winnerManager.clearWins();
        this.winnerManager.winner = null;
        this.leaderboardRenderer.reset();

        // Reset session state
        this.sessionStartTime  = Date.now();
        this.roundNumber       = 0;
        this.isFinalMode       = false;
        this._finalists        = [];
        this._finalEliminated  = [];
        this._finalRoundNumber = 0;
        this._finalTotalCount  = 0;
        this._grandChampion    = null;
        this._champCountdownRemain = this._champCountdownSec;
        this._elimShowCountry  = null;
        this._elimFlashQueue   = [];
        this._finalElimFreeze  = false;
        this._finalElimActive  = null;
        this._finalElimFreezeUntil = 0;
        this._finalElimPhase   = null;
        this._finalStalemateSince = 0;
        this._emptyArenaSince     = 0;

        // Winner screen state reset
        this._winnerTimerEndsAt = null;
        this._winnerShowTick    = 0;
        this._champBgmKilled    = false;

        // Sudden death tiebreaker reset
        this._hwSuddenDeathActive = false;
        this._hwSuddenDeathFlags  = [];
        this._hwSuddenDeathWins   = 0;

        // Mode-specific session init
        if (this.isHighestWinsMode || this.isLongBattleMode) {
            this.sessionMode.onSessionStart();
        } else {
            // Classic: fresh qualifying pool — winners sit out after each win
            this._initQualifyPool();
        }

        // Qualification / battle BGM (after 3-2-1). Skip if session already finished.
        if (!(this.sessionMode && this.sessionMode.ended)) {
            this.audio.playPhase('qualify');
        } else {
            try { this.audio.stopBGM(); } catch (_) {}
        }

        this.trayLauncher.cancel();
        this._clearAllFlags();
        this.confetti.particles = [];
        this.fx.reset();
        this.nextEventTimer = 0;

        // Pick first batch
        if (this.isHighestWinsMode || this.isLongBattleMode) {
            this.activeCountries = this.sessionMode.pickBatch();
        } else {
            this.activeCountries = this._pickQualifyBatch();
        }
        this.totalCountries  = this.activeCountries.length;

        const spawnRadius = this.layout.arenaRadius - 20;
        const { positions, spacing } = SpawnManager.generate(
            this.layout.arenaX, this.layout.arenaY, spawnRadius, this.totalCountries
        );
        this._nextSpawnPositions = positions;
        const rawW0 = Math.max(12, spacing * 0.95);
        const maxW0 = this.totalCountries <= 40 ? 27 : (this.totalCountries <= 100 ? 33 : 40);
        this._nextFlagW = Math.min(rawW0, maxW0);
        this._nextFlagH = Math.max(8, Math.round(this._nextFlagW * 0.667));  // standard 3:2 flag ratio

        this.eventManager.pick();
        this._beginNextEvent();
    }

    // ── Countdown ─────────────────────────────────────────────────────────────

    _beginCountdown() {
        try { this.audio.stopWinnerLoop(); } catch (_) {}
        if (this._champPermanent || this.gameState === "GRAND_CHAMPION") {
            console.warn("[Game] _beginCountdown blocked — champion locked");
            return;
        }
        this.gameState           = "COUNTDOWN";
        this.restartCountdown    = 3;
        this._countdownTickStart = performance.now();
        this.roundNumber++;

        this.arena.radius        = this.layout.arenaRadius;
        this.arena.state         = "INTRO";
        this.arena.introTimer    = 0;
        this.arena.introDuration = 99999;
        this.arena.gapSize       = 0;
        // Base gap + progressive widen as flags are eliminated (see ArenaPhysics.setRemainingFlags).
        // Final starts a bit tighter so exits feel deliberate at the start.
        if (this.isFinalMode) {
            this.arena.initialGapSize = 3;
            this.arena.maxGapSize     = 8;
        } else {
            this.arena.initialGapSize = 2;  // was 3 — slower baseline drain between events
            this.arena.maxGapSize     = 5;  // was 7 — less wide-open late game
        }
        this.arena.syncWalls();

        this.winnerManager.reset();
        this._finalStalemateSince = 0;
        this._emptyArenaSince     = 0;

        this._spawnPositions = this._nextSpawnPositions;
        this._spawnFlagW     = this._nextFlagW;
        this._spawnFlagH     = this._nextFlagH;
        this._spawnIndex     = 0;
        this._spawnTotal     = Math.min(this.totalCountries, this._spawnPositions?.length ?? 0);

        this.arena.setTotalFlags(this.totalCountries);
        this.arena.setRemainingFlags(this.totalCountries);
        this.matchStartTime     = Date.now();
        this.lastRemainingCount = -1;

        if (this.eliminationManager) {
            this.eliminationManager.reset();
            this.eliminationManager.eliminated = [];
        }

        this.confetti.particles = [];
        this.fx.reset();
        this.arena._flagsRef = this.flagManager.flags;

        this.audio.resetMilestones();
        this.audio.playCountdown(3);

        this._clearRestartTimer();
        this.restartTimer = setInterval(() => {
            this.restartCountdown--;
            this._countdownTickStart = performance.now();
            if (this.restartCountdown <= 0) {
                clearInterval(this.restartTimer);
                this.restartTimer = null;
                // Spawn any remaining flags instantly
                while (this._spawnIndex < this._spawnTotal) {
                    this.flagManager.addFlag(
                        this.activeCountries[this._spawnIndex],
                        this._spawnPositions[this._spawnIndex].x,
                        this._spawnPositions[this._spawnIndex].y,
                        this._spawnFlagW,
                        this._spawnFlagH
                    );
                    this._spawnIndex++;
                }
                this.arena._flagsRef = this.flagManager.flags;
                this._startPlaying();
            } else {
                this.audio.playCountdown(this.restartCountdown);
            }
        }, 1000);
    }

    _startPlaying() {
        this.gameState     = "PLAYING";
        this.arena.state   = "PLAYING";
        this.arena.gapSize = this.arena.initialGapSize;
        // Barrier rim: Highest Winner Wins only (test before rolling out)
        try {
            if (typeof this.arena.enableRim === "function") {
                this.arena.enableRim(!!this.isHighestWinsMode);
            }
        } catch (_) {}
        this.arena.syncWalls();
        this.audio.playRoundStart();
        // If championship already finished, never keep battle BGM running
        if (this.sessionMode && this.sessionMode.ended) {
            try { this.audio.stopBGM(); } catch (_) {}
        }
        this.eventManager.start(this._eventCtx());
        if (this.isFinalMode) this._finalRoundNumber++;

        // Reset asteroid elimination tracking for this round
        this._asteroidElimMsg = null;

        // Elimination / Grand Final / HW sudden death: never allow asteroids
        if (this.theme?.stars) {
            if (this.isFinalMode || this._hwSuddenDeathActive) {
                this.spaceTheme.setAsteroidsDisabled(true);
                this.spaceTheme.onFlagBurned = null;
            } else {
                this.spaceTheme.setAsteroidsDisabled(false);
                this.spaceTheme.onFlagBurned = (flag, x, y) => {
                    this._handleAsteroidBurn(flag, x, y);
                };
            }
            // Give SpaceTheme access to audio so it can play swoosh / hit sounds
            this.spaceTheme.audio = this.audio;
            this.spaceTheme.notifyPlaying();
        }
    }

    /**
     * Immediately eliminates a flag that was incinerated by an asteroid.
     * Called from SpaceTheme.onFlagBurned during the draw/update phase.
     * Must count toward elimination batch so 0-flags ends the round.
     */
    _handleAsteroidBurn(flag, x, y) {
        if (!flag || !flag.body) return;
        if (this.gameState !== "PLAYING") return;

        // Guard: flag might have already been eliminated (race condition)
        const flagIdx = this.flagManager?.flags?.indexOf(flag);
        if (flagIdx === undefined || flagIdx < 0) return;

        // Remove from physics world
        Matter.World.remove(this.physics.world, flag.body);

        // Remove from live flags list
        this.flagManager.flags.splice(flagIdx, 1);

        // Tag so tray / UI can style asteroid kills
        flag._eliminatedByAsteroid = true;

        // Record as eliminated + track this frame's batch size
        // (WinnerManager uses _lastBatchSize when remaining hits 0)
        this.eliminationManager.eliminated.push(flag);
        this.eliminationManager._lastBatchSize =
            (this.eliminationManager._lastBatchSize || 0) + 1;

        // Update asteroid elimination message tracking (below leaderboard + tray)
        if (!this._asteroidElimMsg) {
            this._asteroidElimMsg = { countries: [], time: Date.now() };
        } else if (Date.now() - this._asteroidElimMsg.time > 8000) {
            this._asteroidElimMsg = { countries: [], time: Date.now() };
        }
        const alreadyListed = this._asteroidElimMsg.countries.some(
            f => (f.country?.code ?? f.code) === flag.country?.code
        );
        if (!alreadyListed) {
            this._asteroidElimMsg.countries.push(flag);
        }
        this._asteroidElimMsg.time = Date.now();

        const left = this.flagManager.flags.length;

        // Sound & milestone feedback
        this.audio?.playElimination?.();
        this.audio?.playMilestone?.(left, this.totalCountries);
        this.audio?.playAsteroidHit?.();

        // Update remaining-flag counter on arena (progressive gap)
        this.arena?.setRemainingFlags?.(left);

        // Final mode: sequential elim card path
        if (this.isFinalMode) {
            this._handleFinalElimination();
            return;
        }

        // Qualifying / Highest Wins: force winner resolution when 0 or 1 left
        // so an asteroid wipe (or last-survivor burn) cannot leave the round stuck.
        if (left <= 1) {
            this.winnerManager.update(this.flagManager, this.eliminationManager);
        }
    }

    _clearAllFlags() {
        if (this.flagManager) {
            this.flagManager.flags.forEach(flag => {
                Matter.World.remove(this.physics.world, flag.body);
            });
            this.flagManager.flags = [];
        }
        if (this.eliminationManager) {
            this.eliminationManager.eliminated = [];
        }
    }

    _eventCtx() {
        return {
            arena       : this.arena,
            physics     : this.physics,
            drain       : this.drain,
            flagManager : this.flagManager,
        };
    }

    // ── Update ────────────────────────────────────────────────────────────────

    update() {
        if (this.gameState === "START_SCREEN")   return;

        // Sudden death banner — purely visual, setTimeout drives transition
        if (this.gameState === "SUDDEN_DEATH_BANNER") {
            this.confetti.update();
            this.fx.update();
            return;
        }

        // Keep confetti alive during champion screen
        if (this.gameState === "GRAND_CHAMPION") {
            this.confetti.update();
            this._champConfettiTick = (this._champConfettiTick || 0) + 1;

            // Highest Wins 40-min ROUND winner: continuous confetti + celebration SFX
            if (this._champHwRound) {
                if (this._champConfettiTick % 24 === 0) {
                    this.confetti.rain(this._lw, 8, { alphaScale: 0.75 });
                }
                if (this._champConfettiTick % 90 === 0) {
                    try { this.audio.playClap(); } catch (_) {}
                }
                if (this._champConfettiTick % 120 === 0) {
                    try { this.audio.playConfetti(); } catch (_) {}
                }
                // Keep champion BGM looping (started in _showHighestWinsRoundWinner)
                return;
            }

            // Other champion screens (5H permanent / classic): short celebration then settle
            // Keep winner fanfare looping; only stop battle BGM once
            if (!this._champBgmKilled) {
                this._champBgmKilled = true;
                try { this.audio.stopBGM(); } catch (_) {}
            }
            if (this._champConfettiTick < 480 && this._champConfettiTick % 36 === 0) {
                this.confetti.rain(this._lw, 6, { alphaScale: 0.5 });
            }
            if (this._champConfettiTick < 180) {
                if (this._champConfettiTick === 90) this.audio.playConfetti();
                if (this._champConfettiTick === 150) this.audio.playClap();
            }
            return;
        }

        // ── WINNER_SHOW: block ALL game logic — nothing runs behind the winner screen ──
        // The restartTimer (set by handleWinner / _showLongBattleSegmentWinner) is the
        // sole driver of progression. No arena ticking, no nextEventTimer, nothing.
        if (this.gameState === "WINNER_SHOW") {
            this.confetti.update();
            this.fx.update();
            // Drip extra confetti for the first ~4 s of the winner reveal
            this._winnerShowTick = (this._winnerShowTick || 0) + 1;
            if (this._winnerShowTick < 240 && this._winnerShowTick % 18 === 0) {
                this.confetti.rain(this._lw, 4, { alphaScale: 0.7 });
            }
            // Clap + confetti sfx staged across the display (only fires once per show)
            // Extra SFX only during long round-winner holds (not 3s arena wins)
            const longHold = this._winnerTimerEndsAt && (this._winnerTimerEndsAt - Date.now()) > 5000;
            if (longHold) {
                if (this._winnerShowTick === 72)  { try { this.audio.playClap();     } catch(_){} }
                if (this._winnerShowTick === 150) { try { this.audio.playConfetti(); } catch(_){} }
                if (this._winnerShowTick === 210) { try { this.audio.playClap();     } catch(_){} }
            }
            return;
        }

        if (this.gameState === "ELIM_SHOW") {
            const elapsed = Date.now() - this._elimShowStart;
            if (elapsed >= this._elimShowDuration) this._afterElimShow();
            this.confetti.update();
            this.fx.update();
            return;
        }

        const state = this.gameState;
        this._frame = (this._frame || 0) + 1;
        const evenFrame = (this._frame % 2) === 0;

        if (state === "NEXT_EVENT") {
            // Long-battle Grand Final handoff: wait for explicit _beginNextEvent only
            if (this._lbGrandFinalPending || this._champPermanent) {
                this.confetti.update();
                return;
            }
            this.nextEventTimer++;
            this.trayLauncher.update();
            if (this.trayLauncher.finished || this.nextEventTimer >= this.nextEventDuration) {
                this._beginCountdown();
            }
        }

        if (state === "COUNTDOWN") {
            if (this._spawnIndex < this._spawnTotal) {
                const end = Math.min(this._spawnIndex + this._spawnPerFrame, this._spawnTotal);
                for (let i = this._spawnIndex; i < end; i++) {
                    this.flagManager.addFlag(
                        this.activeCountries[i],
                        this._spawnPositions[i].x,
                        this._spawnPositions[i].y,
                        this._spawnFlagW,
                        this._spawnFlagH
                    );
                }
                this._spawnIndex = end;
                this.arena._flagsRef = this.flagManager.flags;
            }
            this.physics.update();
            this.arena.update();
        }

        if (state === "PLAYING") {
            this.arena.update();
            this.eventManager.update(this._eventCtx());
            this.physics.update();
            this.flagManager.update(this.arena);

            if (!this.arena.isIntro) {
                // Final-mode freeze: gap sealed during ELIMINATED card + settle
                if (this.isFinalMode && this._finalElimFreeze) {
                    // Hard-lock gap closed every frame (prevents event/arena from reopening)
                    if (this.arena.gapSize !== 0) {
                        this.arena.gapSize = 0;
                        this.arena.syncWalls();
                    }

                    const now = Date.now();
                    if (this._finalElimPhase === "elim" && now >= this._finalElimFreezeUntil) {
                        // Switch to settle: flags wobble, "LAST FLAG STANDING" center
                        this._finalElimPhase = "settle";
                        this._finalElimActive = null;
                        this._elimFlashQueue = [];
                        this._finalElimFreezeUntil = now + this._SETTLE_MS;
                    } else if (this._finalElimPhase === "settle" && now >= this._finalElimFreezeUntil) {
                        this._endFinalElimFreeze();
                    }

                    // Keep remaining flags inside + gentle damp (no exits during card)
                    if (evenFrame) {
                        this._containFlagsDuringFreeze();
                    }
                } else {
                    const countBefore = this.flagManager.flags.length;
                    this.eliminationManager.update(this.flagManager);
                    const countAfter  = this.flagManager.flags.length;

                    if (countAfter < countBefore) {
                        this.audio.playElimination();
                        this.audio.playMilestone(countAfter, this.totalCountries);
                    }

                    this.arena.setRemainingFlags(countAfter);

                    // Skip classic drain in final mode — LastStandingEvent owns forces
                    // (avoids double tangential pull that creates rim-snake motion)
                    if (evenFrame && !this.isFinalMode) {
                        this.drain.update();
                        this.drain.applyDrainForce(this.flagManager.flags);
                    } else if (evenFrame && this.isFinalMode) {
                        this.drain.update(); // sensor position only
                    }

                    // Final mode: sequential one-flag eliminations
                    if (this.isFinalMode && countAfter < countBefore) {
                        this._handleFinalElimination();
                        if (this.gameState !== "PLAYING") return;
                    }
                }

                if (this.isFinalMode) {
                    this._updateElimFlashes();
                    if (evenFrame && !this._finalElimFreeze) {
                        this._checkFinalStalemate();
                        // Safety: empty arena must never soft-lock Last Standing
                        this._recoverEmptyFinalArena();
                    }
                }
            }

            // Qualifying: normal winner detection (includes stalemate → tie)
            if (!this.isFinalMode && evenFrame) {
                this.winnerManager.update(this.flagManager, this.eliminationManager);
            }
        }

        this.confetti.update();
        this.fx.update();
    }

    /**
     * If Last Standing ends up with 0 live flags but finalists still exist
     * (e.g. multi-exit / asteroid race), resolve instead of spinning forever.
     */
    _recoverEmptyFinalArena() {
        if (!this.isFinalMode || this.gameState !== "PLAYING") return;
        if (this._finalElimFreeze) return;

        const live = this.flagManager?.flags?.length ?? 0;
        if (live > 0) {
            this._emptyArenaSince = 0;
            return;
        }

        const now = performance.now();
        if (!this._emptyArenaSince) {
            this._emptyArenaSince = now;
            return;
        }
        // Brief grace so a same-frame push-back can finish
        if (now - this._emptyArenaSince < 400) return;

        this._emptyArenaSince = 0;
        const n = this._finalists?.length ?? 0;

        if (n === 1) {
            this._triggerGrandChampion(this._finalists[0].country);
            return;
        }
        if (n === 0) {
            // Fall back to last eliminated as champion
            const last = this._finalEliminated[this._finalEliminated.length - 1];
            if (last?.country) {
                this._triggerGrandChampion(last.country);
            } else {
                this._beginNextEvent();
            }
            return;
        }

        // Multiple finalists tracked but no live bodies — respawn them and continue
        this.audio.speak("Recovering finalists!");
        this._finalists = this._finalists.slice();
        this.activeCountries = this._finalists.map(f => f.country);
        this.totalCountries = this.activeCountries.length;
        this._beginNextEvent();
    }

    // ── Final mode stalemate (few flags jammed, never exiting) ────────────────
    // Mirrors WinnerManager qualifying stalemate: after ~2.5s of near-stillness
    // with 2–8 flags left, treat as a full-tie and replay the final round.

    _checkFinalStalemate() {
        const flags = this.flagManager?.flags;
        if (!flags || flags.length < 2 || flags.length > 8) {
            this._finalStalemateSince = 0;
        this._emptyArenaSince     = 0;
            return;
        }

        let maxSpd = 0;
        for (let i = 0; i < flags.length; i++) {
            const v = flags[i].body?.velocity;
            if (!v) continue;
            const s = Math.hypot(v.x, v.y);
            if (s > maxSpd) maxSpd = s;
        }

        if (maxSpd >= 0.55) {
            this._finalStalemateSince = 0;
        this._emptyArenaSince     = 0;
            return;
        }

        const now = performance.now();
        if (!this._finalStalemateSince) {
            this._finalStalemateSince = now;
            return;
        }
        if (now - this._finalStalemateSince < 2500) return;

        this._finalStalemateSince = 0;
        this._emptyArenaSince     = 0;
        this.eventManager.end(this._eventCtx());

        // Same path as simultaneous full drain: keep these finalists, replay.
        const stuck = flags.slice();
        this._finalists = stuck.map(f => ({ country: f.country }));
        const tieCount = stuck.length;
        this.audio.speak(
            tieCount === 2
                ? `${stuck[0].country.name} and ${stuck[1].country.name} stalemate — replaying!`
                : `${tieCount} countries stalemate — replaying!`
        );
        this._beginNextEvent();
    }

    // ── Final mode elimination (LAST FLAG STANDING — video matched) ──────────
    // STRICT: one flag per exit. Extra simultaneous exits are pushed back in.
    // Gap seals (arena rebuilds solid), center ELIMINATED card shows the flag,
    // then gap reopens. Qualifying round logic is intentionally untouched.

    _handleFinalElimination() {
        if (this._finalElimFreeze) return;

        const eliminated = this.eliminationManager.eliminated;
        const batchSize  = this.eliminationManager._lastBatchSize || 1;
        if (batchSize < 1) return;

        // Flags that left the arena this frame
        const batch = eliminated.slice(-batchSize);
        if (!batch.length) return;

        // ── One flag only ──────────────────────────────────────────────────
        const primary = batch[0];
        const extras  = batch.slice(1);

        // Push any extra simultaneous exits back inside the arena AND
        // re-add them to flagManager (eliminationManager already removed them).
        if (extras.length) {
            this._pushFlagsBackInside(extras);
        }

        // Officially eliminate only the primary flag
        const code = primary.country?.code;
        if (!code) return;
        this._finalists = this._finalists.filter(f => f.country.code !== code);
        this._finalEliminated.push({ country: primary.country });

        // Strip extras from eliminationManager.eliminated so they aren't counted
        if (extras.length) {
            const extraCodes = new Set(extras.map(f => f.country?.code));
            this.eliminationManager.eliminated =
                this.eliminationManager.eliminated.filter(
                    f => !extraCodes.has(f.country?.code)
                );
            // Batch size is now only the primary
            this.eliminationManager._lastBatchSize = 1;
        }

        const remaining = this._finalists.length;

        if (remaining === 0) {
            // All finalists gone in one wave — crown last primary as champion
            this._elimFlashQueue = [];
            this._finalElimActive = null;
            this._finalElimPhase = null;
            this._finalElimFreeze = false;
            try { this.audio.stopBGM(); } catch (_) {}
            if (primary.country) {
                this._triggerGrandChampion(primary.country);
            } else {
                this._beginNextEvent();
            }
            return;
        }

        if (remaining === 1) {
            this._elimFlashQueue = [];
            this._finalElimActive = null;
            this._finalElimPhase = null;
            this._finalElimFreeze = false;
            // Kill post-countdown battle BGM the instant the final is decided
            try { this.audio.stopBGM(); } catch (_) {}
            this._triggerGrandChampion(this._finalists[0].country);
            return;
        }

        // Seal the gap (arena rebuilds solid ring) while card shows
        this._startFinalElimFreeze(primary.country, remaining);

        // Keep counters in sync with finalists + live physics flags
        const live = this.flagManager.flags.length;
        this.arena.setRemainingFlags(Math.max(live, remaining));
        this.totalCountries = this._finalists.length;

        if (primary.country?.name) {
            this.audio.speak(`${primary.country.name} eliminated!`);
        }
    }

    /** Teleport flags that accidentally exited back inside the ring. */
    _pushFlagsBackInside(flags) {
        const cx = this.arena.cx;
        const cy = this.arena.cy;
        const R  = this.arena.radius * 0.72;

        for (const flag of flags) {
            const body = flag.body;
            if (!body) continue;

            // Ensure body is in the physics world again
            try {
                if (!this.physics.world.bodies.includes(body)) {
                    Matter.World.add(this.physics.world, body);
                }
            } catch (_) { /* already in world */ }

            // Re-add to live flags list if missing (critical — without this
            // simultaneous multi-exit leaves an empty arena forever)
            if (this.flagManager && !this.flagManager.flags.includes(flag)) {
                this.flagManager.flags.push(flag);
            }

            // Random position inside the ring so they rejoin the pack
            const ang = Math.random() * Math.PI * 2;
            const dist = R * (0.25 + Math.random() * 0.55);
            Matter.Body.setPosition(body, {
                x: cx + Math.cos(ang) * dist,
                y: cy + Math.sin(ang) * dist,
            });
            Matter.Body.setVelocity(body, {
                x: (Math.random() - 0.5) * 2.5,
                y: (Math.random() - 0.5) * 2.5,
            });
            Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.2);
            Matter.Sleeping.set(body, false);

            // Re-add to world + flag list
            Matter.World.add(this.physics.world, body);
            this.flagManager.flags.push(flag);
        }
    }

    /** Seal gap and show center ELIMINATED card for one flag. */
    _startFinalElimFreeze(country, remaining) {
        const now = Date.now();
        this._finalElimFreeze = true;
        this._finalElimPhase = "elim";
        this._finalElimFreezeUntil = now + this._ELIM_FLASH_MS;
        this._finalElimActive = { country, remaining, start: now };
        this._elimFlashQueue = [{ country, remaining, start: now }];

        // Seal arena: zero gap, full wall ring — flags stay in and wobble
        this.arena.gapSize = 0;
        this.arena.syncWalls();

        // Yank every remaining flag firmly inside so none slip out mid-card
        this._containFlagsDuringFreeze(true);
    }

    /**
     * Keep all live flags inside the ring during elim freeze.
     * @param {boolean} hard — stronger inward reset right after an exit
     */
    _containFlagsDuringFreeze(hard = false) {
        const cx = this.arena.cx;
        const cy = this.arena.cy;
        const R  = this.arena.radius;
        const limit = R * 0.82;

        for (const f of this.flagManager.flags) {
            const b = f.body;
            if (!b) continue;

            const dx = b.position.x - cx;
            const dy = b.position.y - cy;
            const dist = Math.hypot(dx, dy) || 0.001;

            if (dist > limit) {
                const s = (limit * 0.9) / dist;
                Matter.Body.setPosition(b, {
                    x: cx + dx * s,
                    y: cy + dy * s,
                });
                // Kill outward velocity so they don't immediately re-exit
                const vx = b.velocity.x;
                const vy = b.velocity.y;
                const radial = (vx * dx + vy * dy) / dist;
                if (radial > 0) {
                    Matter.Body.setVelocity(b, {
                        x: vx - (dx / dist) * radial,
                        y: vy - (dy / dist) * radial,
                    });
                }
            }

            if (hard) {
                Matter.Body.setVelocity(b, {
                    x: b.velocity.x * 0.45,
                    y: b.velocity.y * 0.45,
                });
            } else {
                Matter.Body.setVelocity(b, {
                    x: b.velocity.x * 0.96,
                    y: b.velocity.y * 0.96,
                });
            }
            Matter.Sleeping.set(b, false);
        }
    }

    /** Reopen gap after elim card + settle — next elimination can happen. */
    _endFinalElimFreeze() {
        this._finalElimFreeze = false;
        this._finalElimPhase = null;
        this._finalElimActive = null;
        this._elimFlashQueue = [];
        this._finalStalemateSince = 0;
        this._emptyArenaSince     = 0;

        // Restore progressive gap (initial → max as remaining flags drop)
        this.arena.initialGapSize = 3;
        this.arena.maxGapSize     = 8;
        this.arena.state = "PLAYING";
        // Recompute gap from current remaining count
        this.arena.setRemainingFlags(this.flagManager?.flags?.length ?? 0);
        this.arena.syncWalls();
    }

    _afterElimShow() {
        // Legacy path retained if anything still enters ELIM_SHOW
        this._elimShowCountry = null;
        this._finalStalemateSince = 0;
        this._emptyArenaSince     = 0;
        this.arena.state   = "PLAYING";
        this.arena.gapSize = this.arena.initialGapSize;
        this.arena.syncWalls();
        this.gameState = "PLAYING";
        this.audio.playRoundStart();
        this._finalRoundNumber++;
    }

    /** Expire finished elim flashes (called from update while PLAYING). */
    _updateElimFlashes() {
        if (!this._elimFlashQueue.length) return;
        const now = Date.now();
        this._elimFlashQueue = this._elimFlashQueue.filter(
            item => now - item.start < this._ELIM_FLASH_MS + 50
        );
    }

    // ── Grand Champion ────────────────────────────────────────────────────────

    _triggerGrandChampion(country) {
        this._grandChampion      = country;
        this.gameState           = "GRAND_CHAMPION";
        this._champDisplayStart  = Date.now();
        this._champConfettiTick  = 0;

        // Permanent hold for 5H Grand Final; timed hold for other modes
        const permanent =
            !!(this.isLongBattleMode || this.sessionMode?.inGrandFinal);
        this._champPermanent = permanent;
        this._lbGrandFinalPending = false;
        this._clearRestartTimer();
        this._champBgmKilled = false;
        this._champCountdownRemain = permanent ? 0 : this._champCountdownSec;

        // Stop final/elim paths so we never fall back into an empty Last Standing arena
        this.isFinalMode = false;
        this._finalElimFreeze = false;
        this._finalElimActive = null;
        this._finalElimPhase = null;
        this._elimFlashQueue = [];
        this._emptyArenaSince = 0;
        this._finalists = [];
        this._finalEliminated = [];
        if (this.sessionMode) {
            this.sessionMode.ended = true;
            this.sessionMode.inGrandFinal = true;
        }
        // Cancel any pending next-round timers
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }

        this._clearAllFlags();
        try { this.eventManager.end(this._eventCtx()); } catch (_) {}
        try { this.trayLauncher.cancel(); } catch (_) {}
        if (this.eliminationManager) {
            this.eliminationManager.eliminated = [];
            this.eliminationManager._lastBatchSize = 0;
        }

        // Stop looping post-countdown battle BGM (qualify / elimination track)
        try { this.audio.stopBGM(); } catch (_) {}

        // Celebration — winner fanfare loops for whole champion screen
        this.confetti.start(this._lw / 2, this._lh * 0.08, 220, { fromTop: true });
        try { this.audio.stopWinnerLoop(); } catch (_) {}
        try { this.audio.playPhase('champion', { loop: true }); } catch (_) {}
        this.audio.playClap();
        this.audio.playConfetti();
        if (country?.name) {
            const label = permanent
                ? "5 Hour Championship champion"
                : "Grand Final Champion";
            this.audio.speak(`${country.name} is the ${label}!`);
        }

        if (this._champCountdownTimer) {
            clearInterval(this._champCountdownTimer);
            this._champCountdownTimer = null;
        }

        // 5H Grand Final: stay on this screen forever — no next event / no auto reset
        if (permanent) {
            return;
        }

        // Other modes: countdown then home
        this._champCountdownTimer = setInterval(() => {
            this._champCountdownRemain--;
            if (this._champCountdownRemain <= 0) {
                clearInterval(this._champCountdownTimer);
                this._champCountdownTimer = null;
                try { this.audio.stopBGM(); } catch (_) {}
                this._doReset();
            }
        }, 1000);
    }

    // ── Draw ──────────────────────────────────────────────────────────────────

    draw() {
        const { ctx } = this;
        const bg = this.theme?.bg ?? "#050816";
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, this._lw, this._lh);
        // Space theme: update + draw stars/nebula/asteroids
        if (this.theme?.stars && this.gameState !== "START_SCREEN") {
            this.spaceTheme.update(
                this._lw, this._lh,
                this.flagManager,
                this.layout?.arenaX ?? this._lw / 2,
                this.layout?.arenaY ?? this._lh / 2,
                this.layout?.arenaRadius ?? 120,
                Matter,
                this.gameState,
                this.flagManager?.flags?.length ?? 0,
                this.totalCountries ?? 0
            );
            this._drawThemeStars(ctx);
        }

        if (this.gameState === "START_SCREEN") return;

        if (this.gameState === "GRAND_CHAMPION") {
            // Same premium winner design as 40-min qualifier / round screens
            const country = this._grandChampion;
            if (country) {
                const entry = this.winnerManager?._wins?.[country.code];
                const wins = country.wins ?? entry?.wins ?? 0;
                const winnerObj = {
                    country: {
                        code: country.code,
                        name: country.name,
                        image: country.image ?? entry?.imageSrc ?? null,
                    },
                    _isSegmentWinner: true,
                    _segmentWins: wins,
                };
                const animT = Math.min(1, (Date.now() - (this._champDisplayStart || Date.now())) / 600);
                this.winnerRender.draw(
                    ctx, winnerObj,
                    this._lw, this._lh,
                    false,
                    animT,
                    this.layout.arenaX, this.layout.arenaY, this.layout.arenaRadius,
                    true, 0,  // isFinalMode → shows 🏆 CHAMPION
                    null
                );
            } else {
                this._drawGrandChampionScreen(ctx);
            }
            this.confetti.draw(ctx);
            return;
        }

        if (this.gameState === "SUDDEN_DEATH_BANNER") {
            this._drawSuddenDeathBanner(ctx);
            this.confetti.draw(ctx);
            return;
        }

        this.leaderboardRenderer.draw(
            ctx,
            this.winnerManager.getLeaderboard(),
            this.layout.lbX, this.layout.lbY, this.layout.lbW,
            this.layout.lbRowH, this.layout.lbRowCount
        );

        // Long Battle: flash segment winners below leaderboard
        if (this.isLongBattleMode) {
            this._drawLongBattleSegmentStrip(ctx);
        }

        // Long Battle: scrolling news ticker (below segment strip, only in 5H mode)
        if (this.isLongBattleMode && !this.sessionMode?.inGrandFinal) {
            this._drawLongBattleNewsTicker(ctx);
        }

        // Asteroid eliminations strip — just below the leaderboard
        if (this.theme?.stars && this._asteroidElimMsg) {
            this._drawAsteroidElimStrip(ctx);
        }

        this.arenaRenderer.draw(ctx, this.arena, this.theme);
        this.flagManager.draw(ctx);
        this.trayLauncher.draw(ctx);

        // ── Asteroid foreground: drawn AFTER flags so rocks appear IN FRONT ──
        if (this.theme?.stars && this.gameState !== "START_SCREEN") {
            this.spaceTheme.drawForeground(ctx);
        }

        if (this.gameState === "PLAYING") {
            // Final mode: use finalist totals so the bar never goes negative
            // after simultaneous multi-exits / recovery.
            const elimList = this.isFinalMode
                ? this._finalEliminated
                : (this.eliminationManager?.eliminated ?? []);
            const totalN = this.isFinalMode
                ? (this._finalTotalCount || this.totalCountries)
                : this.totalCountries;
            this.progressBarRenderer.draw(
                ctx,
                elimList,
                totalN,
                this.layout.barCenterX, this.layout.barY,
                this.layout.barWidth,   this.layout.barHeight
            );
        }

        // Bottom tray
        if (this.isFinalMode) {
            const finalTrayH = Math.min(100, this._lh * 0.13);
            this.finalBottomRenderer.draw(
                ctx,
                this.flagManager.flags,
                this._finalEliminated,
                this._finalTotalCount,
                this._lw, this._lh, finalTrayH
            );
        } else if (this.gameState !== "NEXT_EVENT") {
            this.bottomTrayRenderer.draw(
                ctx, this.eliminationManager?.eliminated ?? [],
                this._lw, this._lh,
                undefined,
                this.theme?.stars ? (this._asteroidElimMsg ?? null) : null
            );
        } else {
            this.bottomTrayRenderer.draw(ctx, [], this._lw, this._lh);
        }

        this.fx.draw(ctx, this._lw, this._lh);
        this._drawCentralOverlay(ctx);
        // Space theme: flashing "ASTEROID INCOMING!" warning banner
        if (this.theme?.stars && this.gameState !== "START_SCREEN") {
            this.spaceTheme.drawWarning(ctx, this._lw, this._lh);
        }

        // Continuous final-mode elim flash (video-style, physics keeps running)
        if (this.isFinalMode && this._finalElimPhase === "elim" &&
            (this._finalElimActive || this._elimFlashQueue.length)) {
            this._drawElimFlashOverlay(ctx);
        }
        if (this.isFinalMode && this._finalElimPhase === "settle") {
            this._drawLastStandingSettle(ctx);
        }

        if (this.gameState === "ELIM_SHOW") {
            this._drawElimShowCard(ctx);
            this.confetti.draw(ctx);
            return;
        }

        if (this.gameState === "WINNER_SHOW" || this.gameState === "COUNTDOWN") {
            const elapsed = Date.now() - this.winnerDisplayTime;
            const animT   = this.gameState === "WINNER_SHOW"
                ? Math.min(1, elapsed / 450) : 1;

            // Compute seconds remaining until next round starts.
            // restartTimer is a setTimeout handle — we can't read it directly,
            // so we store the target time when we set the timer.
            // Show "NEXT ROUND IN Xs" only for long holds (40-min round winner ~60s).
            // Hide it on normal ~3.5s arena-win screens (esp. Highest Winner Wins).
            let secsRemain = null;
            if (this._winnerTimerEndsAt && this.gameState === "WINNER_SHOW") {
                const left = Math.max(0, (this._winnerTimerEndsAt - Date.now()) / 1000);
                if (left > 5) secsRemain = left;
            }

            this.winnerRender.draw(
                ctx, this.winnerManager.winner,
                this._lw, this._lh,
                this.gameState === "COUNTDOWN",
                animT,
                this.layout.arenaX, this.layout.arenaY, this.layout.arenaRadius,
                false, 0,
                secsRemain
            );
        }

        this.confetti.draw(ctx);

        if (this.gameState === "NEXT_EVENT")  this._drawNextEventOverlay(ctx);
        if (this.gameState === "COUNTDOWN")   this._drawCountdownOverlay(ctx);
    }

    // ── Overlays (unchanged from v5) ──────────────────────────────────────────

    // Delegates star/nebula/asteroid rendering to SpaceTheme
    _drawThemeStars(ctx) {
        this.spaceTheme.draw(ctx, this._lw, this._lh);
    }

    /**
     * Compact strip just under the leaderboard listing flags burned by asteroids.
     * Visible for ~6s after the last burn in a shower.
     */
    _drawAsteroidElimStrip(ctx) {
        const msg = this._asteroidElimMsg;
        if (!msg?.countries?.length) return;
        const age = Date.now() - msg.time;
        if (age > 6000) return;

        const fade = age > 5000 ? Math.max(0, 1 - (age - 5000) / 1000) : 1;
        const lbBottom = this.layout.lbY + this.layout.lbZoneH;
        const stripH = Math.max(22, Math.round(this.layout.lbRowH * 0.95));
        const y = lbBottom + 2;
        const x = this.layout.lbX;
        const w = this.layout.lbW;

        ctx.save();
        ctx.globalAlpha = fade;

        // Background
        ctx.fillStyle = "rgba(48, 16, 6, 0.92)";
        if (typeof ctx.roundRect === "function") {
            ctx.beginPath();
            ctx.roundRect(x, y, w, stripH, 6);
            ctx.fill();
        } else {
            ctx.fillRect(x, y, w, stripH);
        }
        ctx.strokeStyle = "rgba(255,136,68,0.55)";
        ctx.lineWidth = 1;
        if (typeof ctx.roundRect === "function") {
            ctx.beginPath();
            ctx.roundRect(x, y, w, stripH, 6);
            ctx.stroke();
        } else {
            ctx.strokeRect(x, y, w, stripH);
        }

        // Label
        const fs = Math.max(9, Math.round(stripH * 0.42));
        ctx.font = gf(700, fs);
        ctx.fillStyle = "#FF8844";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const label = "☄️ ASTEROID";
        ctx.fillText(label, x + 8, y + stripH / 2);
        let cursor = x + 8 + ctx.measureText(label).width + 10;

        // Flag thumbs + names
        const flagH = Math.max(10, stripH - 8);
        const flagW = Math.round(flagH * 1.5);
        const nameFs = Math.max(8, Math.round(flagH * 0.55));
        ctx.font = gf(600, nameFs);
        ctx.fillStyle = "#F4F7FF";

        const maxX = x + w - 8;
        for (const flag of msg.countries) {
            if (cursor + flagW + 4 > maxX) break;
            const img = flag.country?.image ?? flag.image;
            const nm  = flag.country?.name  ?? flag.name ?? "";
            const fy  = y + (stripH - flagH) / 2;

            if (img && img.complete && img.naturalWidth > 0) {
                ctx.save();
                ctx.beginPath();
                if (typeof ctx.roundRect === "function") {
                    ctx.roundRect(cursor, fy, flagW, flagH, 2);
                } else {
                    ctx.rect(cursor, fy, flagW, flagH);
                }
                ctx.clip();
                ctx.drawImage(img, cursor, fy, flagW, flagH);
                ctx.restore();
                ctx.strokeStyle = "rgba(255,136,68,0.7)";
                ctx.lineWidth = 1;
                ctx.strokeRect(cursor, fy, flagW, flagH);
            } else {
                ctx.fillStyle = "#2A1500";
                ctx.fillRect(cursor, fy, flagW, flagH);
                ctx.fillStyle = "#F4F7FF";
            }
            cursor += flagW + 4;

            const nmW = ctx.measureText(nm).width;
            if (cursor + nmW + 8 > maxX) {
                // skip name if no room
            } else {
                ctx.fillText(nm, cursor, y + stripH / 2);
                cursor += nmW + 10;
            }
        }

        ctx.restore();
    }

    /**
     * Flash strip below leaderboard for 5H segment winners.
     * Shows recent round winners with a soft pulse; rotates randomly.
     */
    _drawLongBattleSegmentStrip(ctx) {
        const mode = this.sessionMode;
        if (!mode) return;

        // Prune expired flash queue entries
        const now = Date.now();
        this._lbSegmentFlashQueue = (this._lbSegmentFlashQueue || []).filter(
            e => e.showUntil > now
        );

        const winners = mode.segmentWinners || [];
        if (!winners.length && !this._lbSegmentFlashQueue.length) return;

        // Random occasional re-flash of a past segment winner
        if (!this._lbSegFlashNextAt) this._lbSegFlashNextAt = now + 6000 + Math.random() * 10000;
        if (now >= this._lbSegFlashNextAt && winners.length) {
            const pick = winners[Math.floor(Math.random() * winners.length)];
            this._lbSegmentFlashQueue.push({
                ...pick,
                showUntil: now + 8000 + Math.random() * 5000,
            });
            this._lbSegFlashNextAt = now + 8000 + Math.random() * 15000;
        }

        // Prefer active flash queue; fall back to latest segment winner briefly
        let showList = this._lbSegmentFlashQueue.slice(-3);
        if (!showList.length && mode.lastSegmentWinner &&
            now - (mode.lastSegmentWinnerAt || 0) < 14000) {
            showList = [mode.lastSegmentWinner];
        }
        if (!showList.length) return;

        const lbBottom = this.layout.lbY + this.layout.lbZoneH;
        const stripH = Math.max(24, Math.round(this.layout.lbRowH * 1.05));
        const y = lbBottom + 3;
        const x = this.layout.lbX;
        const w = this.layout.lbW;

        // Pulse alpha
        const pulse = 0.75 + 0.25 * Math.sin(now / 280);

        ctx.save();
        ctx.globalAlpha = pulse;

        // Purple glass panel matching 5H theme
        const grad = ctx.createLinearGradient(x, y, x + w, y + stripH);
        grad.addColorStop(0, "rgba(40, 24, 72, 0.94)");
        grad.addColorStop(1, "rgba(22, 14, 48, 0.94)");
        ctx.fillStyle = grad;
        if (typeof ctx.roundRect === "function") {
            ctx.beginPath();
            ctx.roundRect(x, y, w, stripH, 7);
            ctx.fill();
        } else {
            ctx.fillRect(x, y, w, stripH);
        }
        ctx.strokeStyle = "rgba(167, 139, 250, 0.65)";
        ctx.lineWidth = 1.2;
        if (typeof ctx.roundRect === "function") {
            ctx.beginPath();
            ctx.roundRect(x, y, w, stripH, 7);
            ctx.stroke();
        } else {
            ctx.strokeRect(x, y, w, stripH);
        }

        const fs = Math.max(9, Math.round(stripH * 0.40));
        ctx.font = gf(700, fs);
        ctx.fillStyle = "#C4B5FD";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const label = "🏅 ROUND WINNERS";
        ctx.fillText(label, x + 8, y + stripH / 2);
        let cursor = x + 8 + ctx.measureText(label).width + 10;

        const flagH = Math.max(11, stripH - 8);
        const flagW = Math.round(flagH * 1.5);
        const nameFs = Math.max(8, Math.round(flagH * 0.52));
        ctx.font = gf(600, nameFs);
        ctx.fillStyle = "#F4F7FF";
        const maxX = x + w - 8;

        for (const entry of showList) {
            if (cursor + flagW + 4 > maxX) break;
            const img = entry.image;
            const nm = entry.name || "";
            const fy = y + (stripH - flagH) / 2;

            if (img && img.complete && img.naturalWidth > 0) {
                ctx.save();
                ctx.beginPath();
                if (typeof ctx.roundRect === "function") {
                    ctx.roundRect(cursor, fy, flagW, flagH, 2);
                } else {
                    ctx.rect(cursor, fy, flagW, flagH);
                }
                ctx.clip();
                ctx.drawImage(img, cursor, fy, flagW, flagH);
                ctx.restore();
                ctx.strokeStyle = "rgba(167,139,250,0.8)";
                ctx.lineWidth = 1;
                ctx.strokeRect(cursor, fy, flagW, flagH);
            } else {
                ctx.fillStyle = "#2A2040";
                ctx.fillRect(cursor, fy, flagW, flagH);
                ctx.fillStyle = "#F4F7FF";
            }
            cursor += flagW + 4;

            const tag = entry.segment ? `R${entry.segment}` : "";
            const text = tag ? `${tag} ${nm}` : nm;
            const nmW = ctx.measureText(text).width;
            if (cursor + nmW + 8 <= maxX) {
                ctx.fillText(text, cursor, y + stripH / 2);
                cursor += nmW + 12;
            }
        }

        ctx.restore();
    }


    // ── 5H Championship news ticker ───────────────────────────────────────────
    // Scrolling bottom-tray style text explaining the 5H Championship rules.
    // Appears below the segment-winner strip; uses random delays so it doesn't
    // fight with the round-winner flash. Readable pace left → right.
    _drawLongBattleNewsTicker(ctx) {
        const mode = this.sessionMode;
        if (!mode) return;
        const now = performance.now();

        // ── State init ────────────────────────────────────────────────────────
        if (!this._lbTicker) {
            this._lbTicker = {
                x           : null,    // null = not yet started
                speed       : 1.20,    // px/frame — readable at 60fps
                nextShowAt  : now + 90000 + Math.random() * 60000,  // first appearance: 1.5-2.5 min in
                active      : false,
                textWidth   : 0,
                alpha       : 0,
                fadeState   : 'in',    // 'in' | 'scroll' | 'out' | 'wait'
                fadeT       : 0,
            };
        }
        const tk = this._lbTicker;

        // ── Timing: only show during random windows, not continuously ─────────
        if (!tk.active) {
            if (now < tk.nextShowAt) return;
            // Don't show if round winner flash is visible (respect segment strip)
            const flashActive = this._lbSegmentFlashQueue?.length > 0;
            if (flashActive) {
                // Defer by 8-12s to avoid overlap
                tk.nextShowAt = now + 20000 + Math.random() * 10000;  // defer longer on conflict
                return;
            }
            tk.active    = true;
            tk.fadeState = 'in';
            tk.fadeT     = 0;
            tk.alpha     = 0;
        }

        // ── Layout ────────────────────────────────────────────────────────────
        const lbBottom = this.layout.lbY + this.layout.lbZoneH;
        // Segment strip height (same sizing as _drawLongBattleSegmentStrip)
        const segStripH = Math.max(24, Math.round(this.layout.lbRowH * 1.05));
        const segStripY = lbBottom + 3;
        // Ticker sits below the segment strip with a small gap
        const tickerH = Math.max(20, Math.round(this.layout.lbRowH * 0.88));
        const tickerY = segStripY + segStripH + 4;
        const lbX     = this.layout.lbX;
        const lbW     = this.layout.lbW;

        // ── Build message strings — rotate through content ────────────────────
        if (!this._lbTickerMsgIndex) this._lbTickerMsgIndex = 0;
        const seg     = mode.segmentIndex || 0;
        const maxSeg  = 8;  // always 8 rounds
        const rem     = mode.remainingSegmentMs ? mode.remainingSegmentMs() : 0;
        const rm = Math.floor(rem / 60000);
        const rs = Math.floor((rem % 60000) / 1000);
        const remStr  = rm > 0 ? `${rm}m ${rs.toString().padStart(2,'0')}s` : `${rs}s`;
        const winners = (mode.segmentWinners || []);
        const wNames  = winners.map(w => w.name).filter(Boolean).slice(-3).join('  ·  ');
        const MSGS = [
            `  🔴 LIVE  ·  5H CHAMPIONSHIP  ·  Each 40-minute round crowns a ROUND WINNER  ·  After 8 rounds, the winners clash in the GRAND FINAL  ·  Only ONE can be the Ultimate Champion  ·  `,
            `  🏆 HOW IT WORKS  ·  ROUND ${seg + 1} of 8  ·  Highest wins in 40 min advances to the Grand Final  ·  ${remStr} left in this round  ·  Round winners fight last — who survives?  ·  `,
            `  ⚡ 5-HOUR CHAMPIONSHIP  ·  8 rounds × 40 minutes = The longest battle in Flag Arena history  ·  Each round winner earns their spot in the Grand Final elimination  ·  `,
            wNames
                ? `  🎖 ROUND WINNERS SO FAR  ·  ${wNames}  ·  They will face each other in the GRAND FINAL  ·  Can they hold on to win it all?  ·  `
                : `  🎖 CHAMPIONSHIP IN PROGRESS  ·  Round ${seg + 1} of 8  ·  The highest-wins country after 40 minutes qualifies for the Grand Final  ·  Stay tuned!  ·  `,
            `  📺 GRAND FINAL RULES  ·  All 8 round winners enter Last Flag Standing elimination  ·  One by one they fall until only ONE FLAG REMAINS  ·  That flag is the 5H CHAMPION  ·  `,
        ];

        const msgCount = MSGS.length;
        const msgIdx   = this._lbTickerMsgIndex % msgCount;
        const text     = MSGS[msgIdx];

        // ── Measure text ──────────────────────────────────────────────────────
        const fs = Math.max(9, Math.round(tickerH * 0.52));
        ctx.save();
        ctx.font = `700 ${fs}px 'Orbitron', system-ui, sans-serif`;
        const fullW = ctx.measureText(text).width;

        // ── Initialize scroll x (only on fresh start, never while scrolling) ──
        if (tk.x === null) {
            tk.x = lbX + lbW;     // start just off the right edge
        }
        // Always update textWidth so the exit check uses the current measurement
        tk.textWidth = fullW;

        // ── Fade in ───────────────────────────────────────────────────────────
        if (tk.fadeState === 'in') {
            tk.fadeT = Math.min(1, tk.fadeT + 0.04);
            tk.alpha = tk.fadeT;
            if (tk.fadeT >= 1) tk.fadeState = 'scroll';
        }

        // ── Scroll ────────────────────────────────────────────────────────────
        if (tk.fadeState === 'scroll') {
            tk.x -= tk.speed;
            tk.alpha = 1;
            // When text fully scrolled off the left edge, fade out
            if (tk.x + fullW < lbX - 20) {
                tk.fadeState = 'out';
                tk.fadeT = 1;
                this._lbTickerMsgIndex = (this._lbTickerMsgIndex || 0) + 1;
            }
        }

        // ── Fade out ──────────────────────────────────────────────────────────
        if (tk.fadeState === 'out') {
            tk.fadeT = Math.max(0, tk.fadeT - 0.04);
            tk.alpha = tk.fadeT;
            if (tk.fadeT <= 0) {
                // Done — schedule next appearance after a random gap
                tk.active      = false;
                tk.x           = null;
                tk.nextShowAt  = now + 120000 + Math.random() * 120000;  // 2-4 min between appearances
                // ctx.restore() called below at end of function — don't early-return
                // or the panel/text drawing below will run with wrong alpha.
                // Just mark inactive and fall through — globalAlpha 0 hides it.
                tk.alpha = 0;
            }
        }

        // ── Draw ticker panel ─────────────────────────────────────────────────
        ctx.globalAlpha = Math.max(0, Math.min(1, tk.alpha));

        // Dark navy panel matching leaderboard design language
        const panelGrad = ctx.createLinearGradient(lbX, tickerY, lbX + lbW, tickerY + tickerH);
        panelGrad.addColorStop(0, 'rgba(10, 16, 38, 0.95)');
        panelGrad.addColorStop(1, 'rgba(16, 24, 54, 0.95)');
        ctx.fillStyle = panelGrad;
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath(); ctx.roundRect(lbX, tickerY, lbW, tickerH, 5); ctx.fill();
        } else {
            ctx.fillRect(lbX, tickerY, lbW, tickerH);
        }

        // Orange accent border for 5H Championship (matches event color)
        ctx.strokeStyle = 'rgba(255, 107, 53, 0.70)';
        ctx.lineWidth = 1.2;
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath(); ctx.roundRect(lbX, tickerY, lbW, tickerH, 5); ctx.stroke();
        } else {
            ctx.strokeRect(lbX, tickerY, lbW, tickerH);
        }

        // Left label badge: "5H" in orange
        const badgeW = Math.round(tickerH * 2.4);
        const badgeGrad = ctx.createLinearGradient(lbX, tickerY, lbX, tickerY + tickerH);
        badgeGrad.addColorStop(0, 'rgba(255, 107, 53, 0.90)');
        badgeGrad.addColorStop(1, 'rgba(200, 60, 20, 0.90)');
        ctx.fillStyle = badgeGrad;
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath(); ctx.roundRect(lbX, tickerY, badgeW, tickerH, [5, 0, 0, 5]); ctx.fill();
        } else {
            ctx.fillRect(lbX, tickerY, badgeW, tickerH);
        }
        const badgeFontSize = Math.max(8, Math.round(tickerH * 0.50));
        ctx.font = `800 ${badgeFontSize}px 'Orbitron', system-ui, sans-serif`;
        ctx.fillStyle    = '#FFFFFF';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        ctx.shadowBlur = 0;
        ctx.fillText('5H', lbX + badgeW / 2, tickerY + tickerH / 2);
        ctx.shadowBlur = 0;

        // Clip scrolling text to panel width (exclude badge)
        const textZoneX = lbX + badgeW + 4;
        const textZoneW = lbW - badgeW - 6;
        ctx.save();
        ctx.beginPath();
        ctx.rect(textZoneX, tickerY, textZoneW, tickerH);
        ctx.clip();

        // Scrolling text
        ctx.font = `700 ${fs}px 'Orbitron', system-ui, sans-serif`;
        ctx.fillStyle    = '#E0D0FF';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';

        ctx.shadowBlur = 0;
        ctx.fillText(text, tk.x, tickerY + tickerH / 2);
        ctx.shadowBlur = 0;

        ctx.restore(); // pop clip
        ctx.restore(); // pop globalAlpha
    }

    _drawCentralOverlay(ctx) {
        if (this.gameState === "START_SCREEN") return;

        const cx = this.layout.arenaX;
        // Keep label above the ring but never under the top chrome / off-screen
        const minY = Math.max(18, (this.layout.headerBottom ?? 0) + 14);
        let aboveY = this.layout.arenaY - this.layout.arenaRadius - 10;
        if (aboveY < minY) aboveY = minY;

        // Max width: stay inside the canvas with side margins (leaderboard / edges)
        const sidePad = Math.max(12, this._lw * 0.04);
        const maxW = Math.max(80, this._lw - sidePad * 2);

        const narrow = this._lw < 420;
        const medium = this._lw < 720;

        let line = "";
        if (this.isFinalMode) {
            const n = this._finalists?.length ?? 0;
            line = narrow
                ? `ELIM  ·  ${n} FLAGS`
                : (medium
                    ? `ELIMINATION  ·  EARTHQUAKE  ·  ${n} FLAGS`
                    : `ELIMINATION  ·  EARTHQUAKE  ·  ${n} FLAGS`);
        } else if (this.sessionStartTime > 0) {
            const elapsed   = Date.now() - this.sessionStartTime;
            const remaining = Math.max(0, this.QUALIFY_DURATION_MS - elapsed);
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            const clock = `${mins}:${secs.toString().padStart(2, "0")}`;

            if (this.isLongBattleMode) {
                const mode = this.sessionMode;
                const segRem = mode?.remainingSegmentMs?.() ?? remaining;
                const sm = Math.floor(segRem / 60000);
                const ss = Math.floor((segRem % 60000) / 1000);
                const segClock = `${sm}:${ss.toString().padStart(2, "0")}`;
                const sessRem = mode?.remainingSessionMs?.() ?? 0;
                const hm = Math.floor(sessRem / 3600000);
                const mm = Math.floor((sessRem % 3600000) / 60000);
                const top = this.winnerManager.getLeaderboard()[0];
                const topLabel = top
                    ? (narrow ? `${(top.name || "").slice(0, 10)} ${top.wins}W` : `${top.name} ${top.wins}W`)
                    : "—";
                const segLabel = mode?.getSegmentLabel?.() ?? "";
                if (mode?.inGrandFinal) {
                    const n = this._finalists?.length ?? 0;
                    line = narrow
                        ? `GRAND FINAL  ·  ${n}`
                        : `GRAND FINAL  ·  ${n} FLAGS  ·  EARTHQUAKE`;
                } else if (narrow) {
                    line = `${segLabel}  ${segClock}  ·  ${topLabel}`;
                } else if (medium) {
                    line = `5H ${segLabel}  ·  ${segClock}  ·  ${hm}h${String(mm).padStart(2, "0")}m  ·  ${topLabel}`;
                } else {
                    line = `5H  ·  ${segLabel}  ·  ROUND ${segClock}  ·  TOTAL ${hm}h${String(mm).padStart(2, "0")}m  ·  LEAD ${topLabel}`;
                }
            } else if (this.isHighestWinsMode) {
                const top = this.winnerManager.getLeaderboard()[0];
                const topLabel = top
                    ? (narrow ? `${(top.name || "").slice(0, 10)} ${top.wins}W` : `${top.name} ${top.wins}W`)
                    : "—";
                line = narrow
                    ? `HW  ·  ${clock}  ·  R${this.roundNumber}`
                    : (medium
                        ? `HIGHEST WINS  ·  ${clock}  ·  R${this.roundNumber}  ·  ${topLabel}`
                        : `HIGHEST WINNER WINS  ·  ${clock}  ·  R${this.roundNumber}  ·  LEAD ${topLabel}`);
            } else {
                const winnersCount = this._qualifyWinners?.length ?? 0;
                line = narrow
                    ? `${this.totalCountries} FLAGS  ·  ${clock}  ·  R${this.roundNumber}`
                    : (medium
                        ? `${this.totalCountries}-COUNTRY  ·  ${clock}  ·  R${this.roundNumber}  ·  ${winnersCount} Q`
                        : `${this.totalCountries}-COUNTRY FLAGS BATTLE  ·  ${clock}  ·  R${this.roundNumber}  ·  ${winnersCount} Q`);
            }
        }

        if (!line) return;

        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";

        ctx.shadowBlur = 0;
        ctx.fillStyle = "#91A7C9";

        // Fit font to available width
        let size = Math.min(this._lw * 0.032, 14);
        const minSize = Math.max(9, this._lw * 0.018);
        ctx.font = gf(700, size);
        while (size > minSize && ctx.measureText(line).width > maxW) {
            size -= 0.5;
            ctx.font = gf(700, size);
        }
        // If still too wide at min size, ellipsize
        if (ctx.measureText(line).width > maxW) {
            let s = line;
            while (s.length > 4 && ctx.measureText(s + "…").width > maxW) {
                s = s.slice(0, -1);
            }
            line = s + "…";
        }

        ctx.fillText(line, cx, aboveY);
        ctx.restore();
    }

    _drawNextEventOverlay(ctx) {
        const ev    = this.eventManager;
        const cx    = this._lw / 2;
        const cy    = this.layout.arenaY;
        const total = this.nextEventDuration;
        const timer = this.nextEventTimer;

        let alpha = 1;
        if (timer < 14)              alpha = this._easeOut(timer / 14);
        else if (timer > total - 18) alpha = this._easeOut((total - timer) / 18);
        const scale = 0.96 + 0.04 * Math.min(1, timer / 14);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = "rgba(5, 8, 22, 0.55)";
        ctx.fillRect(0, 0, this._lw, this._lh);
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);

        const cardW = Math.min(this._lw * 0.72, 420);
        const cardH = Math.min(this._lh * 0.28, 200);
        const cardX = cx - cardW / 2;
        const cardY = cy - cardH / 2;

        // Dark-blue broadcast panel
        ctx.fillStyle = "#101D38";
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(cardX, cardY, cardW, cardH, 12);
        else ctx.rect(cardX, cardY, cardW, cardH);
        ctx.fill();
        // Electric-blue border (event badge style)
        ctx.strokeStyle = "#2E62E8";
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";

        ctx.shadowBlur = 0;

        const titleSize = Math.min(this._lw * 0.028, 22);
        ctx.font = gf(800, titleSize);
        ctx.fillStyle = "#38D5FF";
        ctx.fillText(this.isFinalMode ? "ELIMINATION" : "NEXT BATTLE", cx, cy - cardH * 0.28);

        const pulse    = 1 + 0.04 * Math.sin(timer * 0.1);
        const iconSize = Math.min(this._lw * 0.08, 52) * pulse;
        ctx.font       = `${iconSize}px system-ui, Apple Color Emoji, sans-serif`;
        ctx.shadowBlur = 0;
        ctx.fillText(this.isFinalMode ? "🌋" : ev.icon, cx, cy - 4);

        // Event name badge strip
        const eventSize = Math.min(this._lw * 0.048, 36);
        ctx.font = gf(900, eventSize);
        ctx.fillStyle   = this.isFinalMode ? "#FFC83D" : "#F4F7FF";

        ctx.shadowBlur = 0;
        ctx.fillText(
            this.isFinalMode ? `EARTHQUAKE  ·  ${this._finalists.length} FLAGS` : ev.name,
            cx, cy + cardH * 0.28
        );
        ctx.restore();
    }

    _drawCountdownOverlay(ctx) {
        if (this.restartCountdown <= 0) return;
        const cx = this._lw / 2;
        const cy = this.layout.arenaY;
        const ev = this.eventManager;

        if (!this._countdownTickStart) this._countdownTickStart = performance.now();
        const tickT    = ((performance.now() - this._countdownTickStart) % 1000) / 1000;
        const numScale = tickT < 0.2 ? 1 + 0.16 * (1 - tickT / 0.2) : 1;

        ctx.save();
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";

        ctx.shadowBlur = 0;

        // Broadcast transition label
        const labelSize = Math.min(this._lw * 0.045, 28);
        ctx.font = gf(800, labelSize);
        ctx.fillStyle   = "#38D5FF";

        ctx.shadowBlur = 0;
        ctx.fillText("NEXT BATTLE", cx, cy - 100);

        // Event badge — dark-blue panel with electric-blue border
        const badgeW = Math.min(this._lw * 0.55, 280);
        const badgeH = Math.min(this._lh * 0.055, 36);
        const badgeX = cx - badgeW / 2;
        const badgeY = cy - 72;
        ctx.fillStyle = "#101D38";
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
        else ctx.rect(badgeX, badgeY, badgeW, badgeH);
        ctx.fill();
        ctx.strokeStyle = "#2E62E8";
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        const evNameSize = Math.min(this._lw * 0.038, 20);
        ctx.font = gf(700, evNameSize);
        ctx.fillStyle   = "#F4F7FF";
        ctx.shadowBlur = 0;
        ctx.fillText(
            this.isFinalMode
                ? `🌋  EARTHQUAKE  ·  ${this._finalists.length} FLAGS`
                : `${ev.icon}  ${ev.name}`,
            cx, badgeY + badgeH / 2
        );

        // Flag count metadata
        const countSize = Math.min(this._lw * 0.032, 18);
        ctx.font = gf(600, countSize);
        ctx.fillStyle   = "#91A7C9";

        ctx.shadowBlur = 0;
        ctx.fillText(
            this.isFinalMode
                ? "ELIMINATION ROUND"
                : this.isLongBattleMode
                    ? "5H CHAMPIONSHIP"
                : this.isHighestWinsMode
                    ? "HIGHEST WINNER WINS"
                    : `${this.totalCountries}-COUNTRY FLAGS BATTLE`,
            cx, cy - 22
        );

        // Countdown number — white + subtle blue glow + blue border ring
        ctx.save();
        ctx.translate(cx, cy + 55);
        ctx.scale(numScale, numScale);
        const numSize = Math.min(this._lw * 0.18, 110);

        // Soft blue ring behind number
        const ringR = numSize * 0.72;
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(46, 98, 232, 0.55)";
        ctx.lineWidth   = 2.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, ringR + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(61, 124, 255, 0.20)";
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        ctx.font = gf(900, numSize);
        ctx.fillStyle   = "#F4F7FF";

        ctx.shadowBlur = 0;
        ctx.fillText(String(this.restartCountdown), 0, 0);
        // Subtle blue glow pass

        ctx.shadowBlur = 0;
        ctx.fillText(String(this.restartCountdown), 0, 0);
        ctx.restore();

        ctx.restore();
    }

    /**
     * LAST FLAG STANDING elimination card — matches FlagsBattleOfficial video:
     * Center of arena: large flag image, "ELIMINATED" above (red),
     * country name below (white), "N FLAGS LEFT" in gold.
     * Other flags remain visible around the card.
     */
    _drawElimFlashOverlay(ctx) {
        const now = Date.now();
        const item = this._finalElimActive
            || this._elimFlashQueue.find(e => now >= e.start);
        if (!item) return;

        const elapsed = now - (item.start || now);
        const dur     = this._ELIM_FLASH_MS;
        if (elapsed < 0 || elapsed > dur) return;

        let alpha;
        if      (elapsed < 160)       alpha = elapsed / 160;
        else if (elapsed > dur - 280) alpha = (dur - elapsed) / 280;
        else                          alpha = 1;
        alpha = Math.max(0, Math.min(1, alpha));

        const bounce = this._easeOut(Math.min(1, elapsed / 240));
        const scale  = 0.85 + 0.15 * bounce;
        const cx     = this.layout.arenaX;
        const cy     = this.layout.arenaY;
        const R      = this.layout.arenaRadius;

        // Soft dark pad behind the card so text/flag read clearly
        ctx.save();
        ctx.globalAlpha = alpha * 0.45;
        ctx.fillStyle   = "#050816";
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.50, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);

        // Use TOP baseline so stacked elements never overlap
        ctx.textAlign    = "center";
        ctx.textBaseline = "top";

        ctx.shadowBlur = 0;

        // Vertical stack (clear separation, video match):
        //   ELIMINATED
        //   [ FLAG ]
        //   COUNTRY NAME
        //   N FLAGS LEFT
        const elimSize = Math.min(R * 0.12, 26);
        const flagH    = Math.min(R * 0.28, 80);
        const flagW    = Math.round(flagH * 1.5);  // standard 3:2 flag ratio
        const nameSize = Math.min(R * 0.10, 20);
        const remSize  = Math.min(R * 0.07, 15);
        const gap1     = Math.max(12, R * 0.05);  // ELIMINATED → flag
        const gap2     = Math.max(14, R * 0.055); // flag → name (clear gap)
        const gap3     = Math.max(8,  R * 0.035); // name → count

        const totalH = elimSize + gap1 + flagH + gap2 + nameSize + gap3 + remSize;
        let y = cy - totalH / 2;

        // ELIMINATED
        ctx.font      = gf(900, elimSize);
        ctx.fillStyle = "#FF5368";
        ctx.fillText("ELIMINATED", cx, y);
        y += elimSize + gap1;

        // Flag
        const flagX = cx - flagW / 2;
        const flagY = y;
        const img   = item.country?.image;

        if (img && img.complete && img.naturalWidth > 0) {
            ctx.save();

            ctx.shadowBlur = 0;
            ctx.beginPath();
            if (typeof ctx.roundRect === "function") {
                ctx.roundRect(flagX - 2, flagY - 2, flagW + 4, flagH + 4, 5);
            } else {
                ctx.rect(flagX - 2, flagY - 2, flagW + 4, flagH + 4);
            }
            ctx.fillStyle = "#101D38";
            ctx.fill();
            ctx.beginPath();
            if (typeof ctx.roundRect === "function") {
                ctx.roundRect(flagX, flagY, flagW, flagH, 4);
            } else {
                ctx.rect(flagX, flagY, flagW, flagH);
            }
            ctx.clip();
            ctx.drawImage(img, flagX, flagY, flagW, flagH);
            ctx.restore();
            ctx.strokeStyle = "rgba(255,255,255,0.65)";
            ctx.lineWidth   = 2.5;
            if (typeof ctx.roundRect === "function") {
                ctx.beginPath();
                ctx.roundRect(flagX, flagY, flagW, flagH, 4);
                ctx.stroke();
            } else {
                ctx.strokeRect(flagX, flagY, flagW, flagH);
            }
        } else {
            ctx.fillStyle = "#172B50";
            ctx.fillRect(flagX, flagY, flagW, flagH);
        }
        y += flagH + gap2;

        // Country name — clearly BELOW the flag
        ctx.font      = gf(800, nameSize);
        ctx.fillStyle = "#F4F7FF";
        ctx.shadowBlur = 0;
        let name = (item.country?.name ?? "").toUpperCase();
        while (name.length > 2 && ctx.measureText(name).width > R * 1.4) {
            name = name.slice(0, -1);
        }
        ctx.fillText(name, cx, y);
        y += nameSize + gap3;

        // Remaining count — below country name
        ctx.font      = gf(700, remSize);
        ctx.fillStyle = "#FFC83D";
        ctx.shadowBlur = 0;
        const left = item.remaining;
        ctx.fillText(
            `${left} FLAG${left === 1 ? "" : "S"} LEFT`,
            cx,
            y
        );

        ctx.restore();
    }

    /**
     * Settle phase after ELIMINATED card: gap still sealed, flags wobble
     * inside the ring, soft "LAST FLAG STANDING" title in the center
     * (video pacing between eliminations).
     */
    _drawLastStandingSettle(ctx) {
        const now = Date.now();
        const remaining = Math.max(0, this._finalElimFreezeUntil - now);
        const elapsed = this._SETTLE_MS - remaining;
        if (elapsed < 0) return;

        let alpha;
        if      (elapsed < 280)                  alpha = elapsed / 280;
        else if (remaining < 320)                alpha = remaining / 320;
        else                                     alpha = 1;
        alpha = Math.max(0, Math.min(1, alpha));

        const cx = this.layout.arenaX;
        const cy = this.layout.arenaY;
        const R  = this.layout.arenaRadius;
        const left = this._finalists.length;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.shadowBlur = 0;

        // Soft pad so text reads over busy flags
        ctx.globalAlpha = alpha * 0.35;
        ctx.fillStyle = "#050816";
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.36, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha;

        const titleSize = Math.min(R * 0.11, 24);
        ctx.font = gf(900, titleSize);
        ctx.fillStyle = "#F4F7FF";
        ctx.fillText("EARTHQUAKE", cx, cy - titleSize * 0.35);

        const subSize = Math.min(R * 0.075, 16);
        ctx.font = gf(700, subSize);
        ctx.fillStyle = "#FFC83D";
        ctx.shadowBlur = 0;
        ctx.fillText(
            `${left} FLAG${left === 1 ? "" : "S"} LEFT`,
            cx,
            cy + titleSize * 0.85
        );

        ctx.restore();
    }

    _drawElimShowCard(ctx) {
        const now     = Date.now();
        const elapsed = now - this._elimShowStart;
        const dur     = this._elimShowDuration;
        let alpha;
        if      (elapsed < 300)       alpha = elapsed / 300;
        else if (elapsed > dur - 400) alpha = (dur - elapsed) / 400;
        else                          alpha = 1;
        alpha = Math.max(0, Math.min(1, alpha));

        const bounce = this._easeOut(Math.min(1, elapsed / 360));
        const scale  = 0.62 + 0.38 * bounce;
        const cx     = this.layout.arenaX;
        const cy     = this.layout.arenaY;
        const R      = this.layout.arenaRadius;

        ctx.save();
        ctx.globalAlpha = alpha * 0.72;
        ctx.fillStyle   = "rgba(0,0,0,1)";
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.99, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        const cardW = Math.min(this._lw * 0.68, 370);
        const cardH = Math.min(R * 0.62, 158);
        const cardX = cx - cardW / 2;
        const cardY = cy - cardH / 2;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);


        ctx.shadowBlur = 0;
        ctx.fillStyle   = "#101D38";
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(cardX, cardY, cardW, cardH, 12);
        else ctx.rect(cardX, cardY, cardW, cardH);
        ctx.fill();
        ctx.strokeStyle = "#FF5368";
        ctx.lineWidth   = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;

        const bannerH = Math.round(cardH * 0.32);
        const grad    = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY);
        grad.addColorStop(0,   "rgba(255, 83, 104, 0.85)");
        grad.addColorStop(0.5, "rgba(255, 83, 104, 0.95)");
        grad.addColorStop(1,   "rgba(255, 83, 104, 0.85)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.rect(cardX + 2, cardY + 2, cardW - 4, bannerH - 2);
        ctx.fill();

        const elimSize = Math.min(cardW * 0.082, 20);
        ctx.font = gf(900, elimSize);
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle    = "#F4F7FF";

        ctx.shadowBlur = 0;
        ctx.fillText("ELIMINATED", cx, cardY + bannerH / 2);
        ctx.shadowBlur = 0;

        const bodyTop = cardY + bannerH + 8;
        const bodyH   = cardH - bannerH - 10;
        const flagH   = Math.round(bodyH * 0.80);
        const flagW   = Math.round(flagH * 1.50);
        const flagX   = cardX + 20;
        const flagY2  = bodyTop + (bodyH - flagH) / 2;

        const img = this._elimShowCountry?.image;
        if (img && img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(flagX, flagY2, flagW, flagH);
            ctx.clip();
            ctx.drawImage(img, flagX, flagY2, flagW, flagH);
            ctx.restore();
            ctx.strokeStyle = "rgba(255,255,255,0.45)";
            ctx.lineWidth   = 1.2;
            ctx.strokeRect(flagX, flagY2, flagW, flagH);
        } else {
            ctx.fillStyle = "rgba(60,20,20,0.8)";
            ctx.fillRect(flagX, flagY2, flagW, flagH);
        }

        const nameX    = flagX + flagW + 16;
        const maxNameW = cardX + cardW - nameX - 10;
        const nameSize = Math.min(cardW * 0.088, 19);
        ctx.font = gf(800, nameSize);
        ctx.textAlign    = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle    = "#FFFFFF";

        ctx.shadowBlur = 0;

        let name = this._elimShowCountry?.name ?? "";
        while (name.length > 2 && ctx.measureText(name).width > maxNameW) name = name.slice(0, -1);
        ctx.fillText(name, nameX, bodyTop + bodyH / 2);

        const remCount = this._finalists.length;
        const remText  = `${remCount} ${remCount === 1 ? "country" : "countries"} remaining`;
        const remSize  = Math.min(cardW * 0.060, 13);
        ctx.font = gf(600, remSize);
        ctx.fillStyle = "rgba(255,180,180,0.85)";
        ctx.shadowBlur = 0;
        ctx.fillText(remText, nameX, bodyTop + bodyH / 2 + nameSize * 1.5);

        ctx.restore();
    }

    _drawSuddenDeathBanner(ctx) {
        const cw = this._lw, ch = this._lh;
        const ax = this.layout?.arenaX    ?? cw / 2;
        const ay = this.layout?.arenaY    ?? ch * 0.42;
        const R  = this.layout?.arenaRadius ?? Math.min(cw, ch) * 0.38;

        const elapsed  = Date.now() - this._suddenDeathBannerStart;
        const dur      = this._suddenDeathBannerDuration;
        // Fade in over 350 ms, fade out over 450 ms at the end
        let alpha = 1;
        if (elapsed < 350)        alpha = elapsed / 350;
        else if (elapsed > dur - 450) alpha = Math.max(0, (dur - elapsed) / 450);
        alpha = Math.max(0, Math.min(1, alpha));

        const pulse = 0.5 + 0.5 * Math.sin((elapsed / 1000) * Math.PI * 2.2);

        // Full dark background
        ctx.fillStyle = "#050816";
        ctx.fillRect(0, 0, cw, ch);

        // Deep red radial glow behind arena
        const bgGrad = ctx.createRadialGradient(ax, ay, R * 0.1, ax, ay, R * 1.4);
        bgGrad.addColorStop(0,    `rgba(140, 10, 10, ${0.55 * alpha})`);
        bgGrad.addColorStop(0.5,  `rgba(60,  5,  5,  ${0.7  * alpha})`);
        bgGrad.addColorStop(1,    "rgba(5, 8, 22, 1)");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, cw, ch);

        // Arena ring — red-tinted for sudden death
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(ax, ay, R, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 60, 60, ${0.80 + pulse * 0.15})`;
        ctx.lineWidth   = 3;

        ctx.shadowBlur = 0;
        ctx.stroke();
        ctx.restore();

        // Content stack centred in the arena circle
        ctx.save();
        ctx.globalAlpha  = alpha;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";

        const iconSize  = Math.min(R * 0.18, 42);
        const headSize  = Math.min(R * 0.115, 26);
        const subSize   = Math.min(R * 0.072, 15);
        const nameSize  = Math.min(R * 0.068, 13);
        const gap       = Math.max(6, R * 0.05);

        const flags      = this._hwSuddenDeathFlags ?? [];
        const wins       = this._hwSuddenDeathWins  ?? 0;
        const nameLines  = flags.map(c => c.name);

        // Total stack height estimate
        const stackH =
            iconSize + gap * 0.4 +
            headSize + gap * 0.6 +
            subSize  + gap * 0.9 +
            nameLines.length * (nameSize + gap * 0.4);

        let y = ay - stackH / 2 + iconSize / 2;

        // ⚡ icon
        ctx.font        = `${iconSize}px system-ui, Apple Color Emoji, sans-serif`;
        ctx.fillStyle   = "#FF4040";

        ctx.shadowBlur = 0;
        ctx.fillText("⚡", ax, y);
        y += iconSize * 0.55 + gap * 0.4;

        // SUDDEN DEATH heading
        ctx.font        = gf(900, headSize);
        ctx.fillStyle   = "#FF4040";
        ctx.shadowBlur = 0;
        ctx.fillText("SUDDEN DEATH", ax, y);
        y += headSize + gap * 0.6;

        // "X countries tied on N wins"
        const winsLabel = `${flags.length} COUNTRIES TIED ON ${wins} WIN${wins === 1 ? "" : "S"}`;
        ctx.font      = gf(700, subSize);
        ctx.fillStyle = "#FFB0B0";
        ctx.shadowBlur = 0;
        ctx.fillText(winsLabel, ax, y);
        y += subSize + gap * 0.9;

        // Individual country names
        ctx.font      = gf(600, nameSize);
        ctx.fillStyle = "#F4F7FF";
        ctx.shadowBlur = 0;
        for (const name of nameLines) {
            ctx.fillText(name, ax, y);
            y += nameSize + gap * 0.4;
        }

        ctx.restore();

        // Flashing bottom strip
        const stripAlpha = alpha * (0.55 + 0.45 * Math.sin(elapsed / 220));
        ctx.save();
        ctx.globalAlpha = stripAlpha;
        const stripH  = Math.max(28, ch * 0.04);
        const stripY  = ay + R + Math.max(12, R * 0.12);
        const stripW  = Math.min(cw * 0.72, 380);
        const stripX  = ax - stripW / 2;
        const stripBg = ctx.createLinearGradient(stripX, 0, stripX + stripW, 0);
        stripBg.addColorStop(0,   "rgba(140,10,10,0)");
        stripBg.addColorStop(0.3, "rgba(200,20,20,0.90)");
        stripBg.addColorStop(0.7, "rgba(200,20,20,0.90)");
        stripBg.addColorStop(1,   "rgba(140,10,10,0)");
        ctx.fillStyle = stripBg;
        this._rrectSD(ctx, stripX, stripY - stripH / 2, stripW, stripH, stripH / 2);
        ctx.fill();

        const stripFontSize = Math.min(stripH * 0.52, 14);
        ctx.font        = gf(800, stripFontSize);
        ctx.fillStyle   = "#FFFFFF";
        ctx.textAlign   = "center";
        ctx.textBaseline = "middle";

        ctx.shadowBlur = 0;
        ctx.fillText("ONE ROUND · WINNER TAKES ALL", ax, stripY);
        ctx.restore();
    }

    /** Rounded rect helper used only by _drawSuddenDeathBanner */
    _rrectSD(ctx, x, y, w, h, r) {
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
            ctx.roundRect(x, y, w, h, r);
        } else {
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        }
    }

    _drawGrandChampionScreen(ctx) {
        const cw = this._lw, ch = this._lh;
        // Center everything inside the arena circle (reference stream layout)
        const ax = this.layout?.arenaX ?? cw / 2;
        const ay = this.layout?.arenaY ?? ch * 0.42;
        const R  = this.layout?.arenaRadius ?? Math.min(cw, ch) * 0.38;
        const t  = (Date.now() - this._champDisplayStart) / 1000;
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.1);
        const name = (this._grandChampion?.name ?? "").toUpperCase();

        // Midnight navy full background
        ctx.fillStyle = "#050816";
        ctx.fillRect(0, 0, cw, ch);

        // Soft radial glow behind the arena
        const bgGrad = ctx.createRadialGradient(ax, ay, R * 0.15, ax, ay, R * 1.35);
        bgGrad.addColorStop(0, "rgba(32, 59, 104, 0.55)");
        bgGrad.addColorStop(0.55, "rgba(10, 18, 38, 0.9)");
        bgGrad.addColorStop(1, "rgba(5, 8, 22, 1)");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, cw, ch);

        // Arena ring
        ctx.save();
        ctx.beginPath();
        ctx.arc(ax, ay, R, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(244, 247, 255, 0.85)";
        ctx.lineWidth = 3;

        ctx.shadowBlur = 0;
        ctx.stroke();
        ctx.restore();

        // Gold rays inside the circle (reference: TIME UP — CHAMPION screen)
        ctx.save();
        ctx.beginPath();
        ctx.arc(ax, ay, R * 0.98, 0, Math.PI * 2);
        ctx.clip();
        ctx.translate(ax, ay);
        ctx.rotate(t * 0.06);
        const rayR = R * 0.98;
        for (let i = 0; i < 18; i++) {
            const angle = (i / 18) * Math.PI * 2;
            const hw = i % 2 === 0 ? Math.PI / 18 * 0.85 : Math.PI / 18 * 0.35;
            const rayAlpha = (i % 2 === 0 ? 0.22 : 0.10) + pulse * 0.06;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle - hw) * R * 0.08, Math.sin(angle - hw) * R * 0.08);
            ctx.lineTo(Math.cos(angle) * rayR, Math.sin(angle) * rayR);
            ctx.lineTo(Math.cos(angle + hw) * R * 0.08, Math.sin(angle + hw) * R * 0.08);
            ctx.closePath();
            ctx.fillStyle = `rgba(255, 200, 61, ${rayAlpha})`;
            ctx.fill();
        }
        ctx.restore();

        // TOP 1 badge above the ring
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        ctx.shadowBlur = 0;
        const topSize = Math.min(R * 0.085, 17);
        ctx.font = gf(800, topSize);
        ctx.fillStyle = "#FFC83D";
        if (this._champHwRound) {
            ctx.fillText(`HIGHEST WINNER WINS  ·  ${name || "CHAMPION"}`, ax, ay - R - topSize * 2.2);
        } else {
            ctx.fillText(`TOP 1  ·  ${name || "CHAMPION"}`, ax, ay - R - topSize * 2.2);
        }

        // Vertical stack INSIDE the circle (reference stream):
        //   🏆
        //   TIME UP — CHAMPION
        //   [ FLAG ]
        //   COUNTRY
        //   1 WIN
        //   NEXT TOURNAMENT IN MM:SS
        const trophySize = Math.min(R * 0.15, 34);
        const titleSize  = Math.min(R * 0.09, 18);
        const flagH      = Math.min(R * 0.32, 90);
        const flagW      = Math.round(flagH * 1.5);  // standard 3:2 flag ratio
        const nameSize   = Math.min(R * 0.11, 24);
        const winSize    = Math.min(R * 0.075, 15);
        const cdSize     = Math.min(R * 0.06, 12);
        const gap        = Math.max(8, R * 0.03);

        const stackH =
            trophySize + gap * 0.5 +
            titleSize + gap +
            flagH + gap +
            nameSize + gap * 0.75 +
            winSize + gap * 0.9 +
            cdSize;

        let y = ay - stackH / 2;

        // Trophy emoji
        ctx.font = gf(900, trophySize);
        ctx.fillStyle = "#FFC83D";

        ctx.shadowBlur = 0;
        ctx.fillText("🏆", ax, y);
        y += trophySize + gap * 0.5;

        // Title: 5H Grand Final vs generic Time-Up champion
        ctx.font = gf(900, titleSize);
        ctx.fillStyle = "#FFC83D";
        ctx.shadowBlur = 0;
        let champTitle = "TIME UP  —  CHAMPION";
        if (this._champHwRound) {
            champTitle = "TIME UP  —  CHAMPION";
        } else if ((this.sessionMode && this.sessionMode.inGrandFinal) || this._currentEventId === "long_battle") {
            champTitle = "5H GRAND FINAL CHAMPION";
        }
        ctx.fillText(champTitle, ax, y);
        y += titleSize + gap;

        // Flag card
        const flagX = ax - flagW / 2;
        const flagY = y;
        const pad = Math.max(4, flagW * 0.04);

        ctx.shadowBlur = 0;
        ctx.fillStyle = "#101D38";
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
            ctx.roundRect(flagX - pad, flagY - pad, flagW + pad * 2, flagH + pad * 2, 8);
        } else {
            ctx.rect(flagX - pad, flagY - pad, flagW + pad * 2, flagH + pad * 2);
        }
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 200, 61, ${0.55 + pulse * 0.25})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        const img = this._grandChampion?.image;
        if (img && img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.beginPath();
            if (typeof ctx.roundRect === "function") {
                ctx.roundRect(flagX, flagY, flagW, flagH, 4);
            } else {
                ctx.rect(flagX, flagY, flagW, flagH);
            }
            ctx.clip();
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, flagX, flagY, flagW, flagH);
            ctx.restore();
        }
        y += flagH + gap;

        // Country name — clearly below the flag
        ctx.font = gf(800, nameSize);
        ctx.fillStyle = "#F4F7FF";

        ctx.shadowBlur = 0;
        let displayName = name;
        while (displayName.length > 2 && ctx.measureText(displayName).width > R * 1.5) {
            displayName = displayName.slice(0, -1);
        }
        ctx.fillText(displayName, ax, y);
        y += nameSize + gap * 0.75;

        // 1 WIN
        ctx.font = gf(800, winSize);
        ctx.fillStyle = "#FFC83D";
        ctx.shadowBlur = 0;
        const winN = this._grandChampion?.wins ?? 1;
        ctx.fillText(`${winN} WIN${winN === 1 ? "" : "S"}`, ax, y);
        y += winSize + gap * 0.9;

        // Countdown / permanent label
        ctx.font = gf(700, cdSize);
        ctx.fillStyle = "#91A7C9";
        ctx.shadowBlur = 0;
        if (this._champPermanent) {
            ctx.fillText("FINAL RESULT  ·  NO NEXT ROUND", ax, y);
        } else if (this._champHwRound) {
            const mins  = Math.floor(this._champCountdownRemain / 60);
            const secs  = this._champCountdownRemain % 60;
            const cdStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
            ctx.fillText(`NEXT ROUND IN  ${cdStr}`, ax, y);
        } else {
            const mins  = Math.floor(this._champCountdownRemain / 60);
            const secs  = this._champCountdownRemain % 60;
            const cdStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
            ctx.fillText(`NEXT TOURNAMENT IN  ${cdStr}`, ax, y);
        }

        ctx.restore();
    }

    _easeOut(t) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3); }

    _hexToRgba(color, alpha) {
        if (!color || color[0] !== "#") return `rgba(255,215,0,${alpha})`;
        const h    = color.slice(1);
        const full = h.length === 3 ? h[0]+h[0]+h[1]+h[1]+h[2]+h[2] : h;
        const r    = parseInt(full.slice(0, 2), 16);
        const g    = parseInt(full.slice(2, 4), 16);
        const b    = parseInt(full.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    loop = () => {};
}