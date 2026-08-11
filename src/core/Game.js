import PhysicsWorld        from "../physics/PhysicsWorld";
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
import Matter              from "matter-js";

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

        this.gameState             = "START_SCREEN";
        this.winnerDisplayTime     = 0;
        this.winnerDisplayDuration = 3500;

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
    startEvent(eventId) {
        this._currentEventId = eventId;

        // Attach isolated mode controller — classic uses null
        if (eventId === HighestWinsMode.ID) {
            this.sessionMode = new HighestWinsMode(this);
        } else {
            this.sessionMode = null; // classic 40-min qualifier
        }

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

    // ── Winner handling (qualifying) ──────────────────────────────────────────

    handleWinner(winner) {
        if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }

        // Final mode winner detection is handled in _handleFinalElimination()
        if (this.isFinalMode) return;

        this.gameState         = "WINNER_SHOW";
        this.winnerDisplayTime = Date.now();

        this.eventManager.end(this._eventCtx());

        const isTie = winner?.isTie === true;

        if (isTie && !winner.isSilent) {
            this.confetti.start(this._lw / 2, this._lh * 0.4, 130);
            this.audio.playWinner();
            const names = (winner.countries ?? []).map(c => c.name).join(" and ");
            if (names) this.audio.speak(`It's a tie between ${names}!`);
        } else if (!isTie) {
            this.confetti.start(this._lw / 2, this._lh * 0.36, 150);
            this.audio.playWinner();
            this.audio.speak(`${winner.country.name} wins!`);

            // Classic only: remove winner from pool so they sit out until recycle
            // Highest-Wins mode keeps everyone eligible (accumulate wins)
            if (!this.isHighestWinsMode) {
                this._removeWinnerFromPool(winner.country.code);
            }
        }

        // ── Mode-specific session end ─────────────────────────────────────
        if (this.isHighestWinsMode) {
            const result = this.sessionMode.onRoundComplete(winner);
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
        if (this.isFinalMode) this.eventManager.pickLastStanding();
        else this.eventManager.pick();

        const displayDuration = (isTie && winner.isSilent) ? 500 : this.winnerDisplayDuration;
        this.restartTimer = setTimeout(() => this._beginNextEvent(), displayDuration);
    }

    /** End Highest Winner Wins session — champion = most wins, no final. */
    _endHighestWinsSession() {
        const champ = this.sessionMode?.champion;
        if (!champ) {
            // No wins recorded — restart session
            this.restartTimer = setTimeout(() => this._beginNextEvent(), 800);
            return;
        }

        this.isFinalMode = false;
        this._grandChampion = champ.country;
        this._champDisplayStart = Date.now();
        this._champCountdownRemain = this._champCountdownSec;
        this.gameState = "GRAND_CHAMPION";

        this.audio.playPhase('champion');
        this.confetti.start(this._lw / 2, this._lh * 0.36, 90);
        this.audio.playWinner();
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

    // ── Final Mode ────────────────────────────────────────────────────────────

    _enterFinalMode() {
        this.isFinalMode       = true;
        this._finalRoundNumber = 0;
        this._finalEliminated  = [];
        this._grandChampion    = null;

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
        this.gameState      = "NEXT_EVENT";
        this.nextEventTimer = 0;
        this._elimFlashQueue = [];
        this._finalElimFreeze = false;
        this._finalElimActive = null;
        this._finalElimFreezeUntil = 0;
        this._finalElimPhase = null;

        if (this.isFinalMode) {
            // Classic Final only: LAST STANDING sequential exits
            this.activeCountries = this._finalists.map(f => f.country);
            this.eventManager.pickLastStanding();
        } else if (this.isHighestWinsMode) {
            // Highest Wins: everyone stays eligible; mode picks the batch
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
        // Cap flag size so final round (few countries) matches qualify size
        const rawW = Math.max(6, spacing * 0.82);
        const maxW = this.isFinalMode ? 14 : 22;
        this._nextFlagW = Math.min(rawW, maxW);
        this._nextFlagH = Math.max(4, this._nextFlagW * 0.70);

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

        // Mode-specific session init
        if (this.isHighestWinsMode) {
            this.sessionMode.onSessionStart();
        } else {
            // Classic: fresh qualifying pool — winners sit out after each win
            this._initQualifyPool();
        }

        // Qualification BGM — file set in src/audio/BgmConfig.js
        this.audio.playPhase('qualify');

        this.trayLauncher.cancel();
        this._clearAllFlags();
        this.confetti.particles = [];
        this.fx.reset();
        this.nextEventTimer = 0;

        // Pick first batch
        if (this.isHighestWinsMode) {
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
        this._nextFlagW = Math.max(6, spacing * 0.82);
        this._nextFlagH = Math.max(4, this._nextFlagW * 0.70);

        this.eventManager.pick();
        this._beginNextEvent();
    }

    // ── Countdown ─────────────────────────────────────────────────────────────

    _beginCountdown() {
        this.gameState           = "COUNTDOWN";
        this.restartCountdown    = 3;
        this._countdownTickStart = performance.now();
        this.roundNumber++;

        this.arena.radius        = this.layout.arenaRadius;
        this.arena.state         = "INTRO";
        this.arena.introTimer    = 0;
        this.arena.introDuration = 99999;
        this.arena.gapSize       = 0;
        // Lock gap fixed every round (never widens). Final = tiny gap for slow exits.
        if (this.isFinalMode) {
            this.arena.initialGapSize = 2;
            this.arena.maxGapSize     = 2;
        } else {
            this.arena.initialGapSize = 3;
            this.arena.maxGapSize     = 3;
        }
        this.arena.syncWalls();

        this.winnerManager.reset();
        this._finalStalemateSince = 0;

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
        this.arena.syncWalls();
        this.audio.playRoundStart();
        this.eventManager.start(this._eventCtx());
        if (this.isFinalMode) this._finalRoundNumber++;
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

        // Keep confetti alive + raining during champion screen
        if (this.gameState === "GRAND_CHAMPION") {
            this.confetti.update();
            this._champConfettiTick = (this._champConfettiTick || 0) + 1;
            // Soft sparse rain — slower interval, fewer smaller pieces
            if (this._champConfettiTick % 36 === 0) {
                this.confetti.rain(this._lw, 6, { alphaScale: 0.5 });
            }
            // Occasional clap/confetti burst for celebration feel
            if (this._champConfettiTick % 90 === 0) {
                this.audio.playConfetti();
            }
            if (this._champConfettiTick % 150 === 0) {
                this.audio.playClap();
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
                    if (evenFrame && !this._finalElimFreeze) this._checkFinalStalemate();
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

    // ── Final mode stalemate (few flags jammed, never exiting) ────────────────
    // Mirrors WinnerManager qualifying stalemate: after ~2.5s of near-stillness
    // with 2–8 flags left, treat as a full-tie and replay the final round.

    _checkFinalStalemate() {
        const flags = this.flagManager?.flags;
        if (!flags || flags.length < 2 || flags.length > 8) {
            this._finalStalemateSince = 0;
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
            return;
        }

        const now = performance.now();
        if (!this._finalStalemateSince) {
            this._finalStalemateSince = now;
            return;
        }
        if (now - this._finalStalemateSince < 2500) return;

        this._finalStalemateSince = 0;
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

        // ── One flag only ──────────────────────────────────────────────────
        const primary = batch[0];
        const extras  = batch.slice(1);

        // Push any extra simultaneous exits back inside the arena
        if (extras.length) {
            this._pushFlagsBackInside(extras);
        }

        // Officially eliminate only the primary flag
        const code = primary.country.code;
        this._finalists = this._finalists.filter(f => f.country.code !== code);
        this._finalEliminated.push({ country: primary.country });

        // Strip extras from eliminationManager.eliminated so they aren't counted
        if (extras.length) {
            const extraCodes = new Set(extras.map(f => f.country.code));
            this.eliminationManager.eliminated =
                this.eliminationManager.eliminated.filter(
                    f => !extraCodes.has(f.country.code)
                );
        }

        const remaining = this._finalists.length;

        if (remaining === 0) {
            // Shouldn't happen with one-at-a-time, but safety: treat as tie replay
            this._finalists = [{ country: primary.country }, ...extras.map(f => ({ country: f.country }))];
            this._finalEliminated = this._finalEliminated.filter(e => e.country.code !== code);
            this._elimFlashQueue = [];
            this._finalElimActive = null;
            this._finalElimPhase = null;
            this._finalElimFreeze = false;
            this._beginNextEvent();
            return;
        }

        if (remaining === 1) {
            this._elimFlashQueue = [];
            this._finalElimActive = null;
            this._finalElimPhase = null;
            this._finalElimFreeze = false;
            this._triggerGrandChampion(this._finalists[0].country);
            return;
        }

        // Seal the gap (arena rebuilds solid ring) while card shows
        this._startFinalElimFreeze(primary.country, remaining);

        this.arena.setRemainingFlags(this.flagManager.flags.length);
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

        // Fixed small gap in final — slow sequential exits, never grows
        this.arena.gapSize = 2;
        this.arena.initialGapSize = 2;
        this.arena.maxGapSize = 2;
        this.arena.state = "PLAYING";
        this.arena.syncWalls();
    }

    _afterElimShow() {
        // Legacy path retained if anything still enters ELIM_SHOW
        this._elimShowCountry = null;
        this._finalStalemateSince = 0;
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
        this._champCountdownRemain = this._champCountdownSec;
        this._champConfettiTick  = 0;

        this._clearAllFlags();
        this.eventManager.end(this._eventCtx());

        // Continuous rain of confetti from the top + celebration audio
        this.confetti.start(this._lw / 2, this._lh * 0.08, 220, { fromTop: true });
        this.audio.playPhase('champion');
        this.audio.playWinner();
        this.audio.playClap();
        this.audio.playConfetti();
        if (country?.name) this.audio.speak(`${country.name} is the Grand Final Champion!`);

        this._champCountdownTimer = setInterval(() => {
            this._champCountdownRemain--;
            if (this._champCountdownRemain <= 0) {
                clearInterval(this._champCountdownTimer);
                this._champCountdownTimer = null;
                this._doReset();
            }
        }, 1000);
    }

    // ── Draw ──────────────────────────────────────────────────────────────────

    draw() {
        const { ctx } = this;
        ctx.fillStyle = "#050816";
        ctx.fillRect(0, 0, this._lw, this._lh);

        if (this.gameState === "START_SCREEN") return;

        if (this.gameState === "GRAND_CHAMPION") {
            this._drawGrandChampionScreen(ctx);
            this.confetti.draw(ctx);
            return;
        }

        this.leaderboardRenderer.draw(
            ctx,
            this.winnerManager.getLeaderboard(),
            this.layout.lbX, this.layout.lbY, this.layout.lbW,
            this.layout.lbRowH, this.layout.lbRowCount
        );

        this.arenaRenderer.draw(ctx, this.arena);
        this.flagManager.draw(ctx);
        this.trayLauncher.draw(ctx);

        if (this.gameState === "PLAYING") {
            this.progressBarRenderer.draw(
                ctx,
                this.eliminationManager?.eliminated ?? [],
                this.totalCountries,
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
                this._lw, this._lh
            );
        } else {
            this.bottomTrayRenderer.draw(ctx, [], this._lw, this._lh);
        }

        this.fx.draw(ctx, this._lw, this._lh);
        this._drawCentralOverlay(ctx);

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
            this.winnerRender.draw(
                ctx, this.winnerManager.winner,
                this._lw, this._lh,
                this.gameState === "COUNTDOWN",
                animT,
                this.layout.arenaX, this.layout.arenaY, this.layout.arenaRadius,
                false, 0
            );
        }

        this.confetti.draw(ctx);

        if (this.gameState === "NEXT_EVENT")  this._drawNextEventOverlay(ctx);
        if (this.gameState === "COUNTDOWN")   this._drawCountdownOverlay(ctx);
    }

    // ── Overlays (unchanged from v5) ──────────────────────────────────────────

    _drawCentralOverlay(ctx) {
        if (this.gameState === "START_SCREEN") return;
        const cx     = this.layout.arenaX;
        const aboveY = this.layout.arenaY - this.layout.arenaRadius - 10;
        ctx.save();
        ctx.textAlign    = "center";
        ctx.textBaseline = "bottom";
        ctx.shadowColor  = "rgba(0,0,0,0.75)";
        ctx.shadowBlur   = 6;
        const labelSize = Math.min(this._lw * 0.030, 13);
        ctx.font = `700 ${labelSize}px system-ui, Arial, sans-serif`;

        if (this.isFinalMode) {
            // Match reference stream branding + dedicated event name
            ctx.fillStyle = "#91A7C9";
            ctx.fillText(
                `LAST FLAG STANDING  ·  LAST STANDING  ·  ${this._finalists.length} FLAGS`,
                cx, aboveY
            );
        } else if (this.sessionStartTime > 0) {
            const elapsed   = Date.now() - this.sessionStartTime;
            const remaining = Math.max(0, this.QUALIFY_DURATION_MS - elapsed);
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            ctx.fillStyle = "#91A7C9";
            if (this.isHighestWinsMode) {
                const top = this.winnerManager.getLeaderboard()[0];
                const topLabel = top ? `${top.name} ${top.wins}W` : "—";
                ctx.fillText(
                    `HIGHEST WINNER WINS  ·  ${mins}:${secs.toString().padStart(2,"0")}  ·  R${this.roundNumber}  ·  LEAD ${topLabel}`,
                    cx, aboveY
                );
            } else {
                const winnersCount = this._qualifyWinners.length;
                ctx.fillText(
                    `${this.totalCountries}-COUNTRY FLAGS BATTLE  ·  ${mins}:${secs.toString().padStart(2,"0")}  ·  R${this.roundNumber}  ·  ${winnersCount} Q`,
                    cx, aboveY
                );
            }
        }
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
        ctx.shadowColor  = "rgba(0,0,0,0.85)";
        ctx.shadowBlur   = 10;

        const titleSize = Math.min(this._lw * 0.028, 22);
        ctx.font = `800 ${titleSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "#38D5FF";
        ctx.fillText(this.isFinalMode ? "LAST FLAG STANDING" : "NEXT BATTLE", cx, cy - cardH * 0.28);

        const pulse    = 1 + 0.04 * Math.sin(timer * 0.1);
        const iconSize = Math.min(this._lw * 0.08, 52) * pulse;
        ctx.font       = `${iconSize}px system-ui, Arial, sans-serif`;
        ctx.shadowBlur = 14;
        ctx.fillText(this.isFinalMode ? "🏳️" : ev.icon, cx, cy - 4);

        // Event name badge strip
        const eventSize = Math.min(this._lw * 0.048, 36);
        ctx.font = `900 ${eventSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle   = this.isFinalMode ? "#FFC83D" : "#F4F7FF";
        ctx.shadowColor = "rgba(61, 124, 255, 0.35)";
        ctx.shadowBlur  = 12;
        ctx.fillText(
            this.isFinalMode ? `LAST STANDING  ·  ${this._finalists.length} FLAGS` : ev.name,
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
        ctx.shadowColor  = "rgba(0,0,0,0.90)";
        ctx.shadowBlur   = 10;

        // Broadcast transition label
        const labelSize = Math.min(this._lw * 0.045, 28);
        ctx.font = `800 ${labelSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle   = "#38D5FF";
        ctx.shadowColor = "rgba(61, 124, 255, 0.40)";
        ctx.shadowBlur  = 10;
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
        ctx.font = `700 ${evNameSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle   = "#F4F7FF";
        ctx.shadowBlur  = 0;
        ctx.fillText(
            this.isFinalMode
                ? `🏳️  LAST STANDING  ·  ${this._finalists.length} FLAGS`
                : `${ev.icon}  ${ev.name}`,
            cx, badgeY + badgeH / 2
        );

        // Flag count metadata
        const countSize = Math.min(this._lw * 0.032, 18);
        ctx.font = `600 ${countSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle   = "#91A7C9";
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur  = 6;
        ctx.fillText(
            this.isFinalMode
                ? "LAST FLAG STANDING"
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

        ctx.font = `900 ${numSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle   = "#F4F7FF";
        ctx.shadowColor = "rgba(0,0,0,0.85)";
        ctx.shadowBlur  = 16;
        ctx.fillText(String(this.restartCountdown), 0, 0);
        // Subtle blue glow pass
        ctx.shadowColor = "rgba(61, 124, 255, 0.40)";
        ctx.shadowBlur  = 28;
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
        ctx.shadowColor  = "rgba(0,0,0,0.9)";
        ctx.shadowBlur   = 12;

        // Vertical stack (clear separation, video match):
        //   ELIMINATED
        //   [ FLAG ]
        //   COUNTRY NAME
        //   N FLAGS LEFT
        const elimSize = Math.min(R * 0.12, 26);
        const flagH    = Math.min(R * 0.28, 80);
        const flagW    = Math.round(flagH * 1.55);
        const nameSize = Math.min(R * 0.10, 20);
        const remSize  = Math.min(R * 0.07, 15);
        const gap1     = Math.max(12, R * 0.05);  // ELIMINATED → flag
        const gap2     = Math.max(14, R * 0.055); // flag → name (clear gap)
        const gap3     = Math.max(8,  R * 0.035); // name → count

        const totalH = elimSize + gap1 + flagH + gap2 + nameSize + gap3 + remSize;
        let y = cy - totalH / 2;

        // ELIMINATED
        ctx.font      = `900 ${elimSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "#FF5368";
        ctx.fillText("ELIMINATED", cx, y);
        y += elimSize + gap1;

        // Flag
        const flagX = cx - flagW / 2;
        const flagY = y;
        const img   = item.country?.image;

        if (img && img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.shadowColor = "rgba(0,0,0,0.7)";
            ctx.shadowBlur  = 16;
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
        ctx.font      = `800 ${nameSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "#F4F7FF";
        ctx.shadowBlur = 10;
        let name = (item.country?.name ?? "").toUpperCase();
        while (name.length > 2 && ctx.measureText(name).width > R * 1.4) {
            name = name.slice(0, -1);
        }
        ctx.fillText(name, cx, y);
        y += nameSize + gap3;

        // Remaining count — below country name
        ctx.font      = `700 ${remSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "#FFC83D";
        ctx.shadowBlur = 8;
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
        ctx.shadowColor = "rgba(0,0,0,0.85)";
        ctx.shadowBlur = 14;

        // Soft pad so text reads over busy flags
        ctx.globalAlpha = alpha * 0.35;
        ctx.fillStyle = "#050816";
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.36, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha;

        const titleSize = Math.min(R * 0.11, 24);
        ctx.font = `900 ${titleSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "#F4F7FF";
        ctx.fillText("LAST FLAG STANDING", cx, cy - titleSize * 0.35);

        const subSize = Math.min(R * 0.075, 16);
        ctx.font = `700 ${subSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "#FFC83D";
        ctx.shadowBlur = 8;
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

        ctx.shadowColor = "rgba(255, 83, 104, 0.45)";
        ctx.shadowBlur  = 20;
        ctx.fillStyle   = "#101D38";
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(cardX, cardY, cardW, cardH, 12);
        else ctx.rect(cardX, cardY, cardW, cardH);
        ctx.fill();
        ctx.strokeStyle = "#FF5368";
        ctx.lineWidth   = 2;
        ctx.stroke();
        ctx.shadowBlur  = 0;

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
        ctx.font = `900 ${elimSize}px system-ui, Arial, sans-serif`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle    = "#F4F7FF";
        ctx.shadowColor  = "rgba(0,0,0,0.90)";
        ctx.shadowBlur   = 6;
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
        ctx.font = `800 ${nameSize}px system-ui, Arial, sans-serif`;
        ctx.textAlign    = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle    = "#FFFFFF";
        ctx.shadowColor  = "rgba(0,0,0,0.95)";
        ctx.shadowBlur   = 9;

        let name = this._elimShowCountry?.name ?? "";
        while (name.length > 2 && ctx.measureText(name).width > maxNameW) name = name.slice(0, -1);
        ctx.fillText(name, nameX, bodyTop + bodyH / 2);

        const remCount = this._finalists.length;
        const remText  = `${remCount} ${remCount === 1 ? "country" : "countries"} remaining`;
        const remSize  = Math.min(cardW * 0.060, 13);
        ctx.font = `600 ${remSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "rgba(255,180,180,0.85)";
        ctx.shadowBlur = 5;
        ctx.fillText(remText, nameX, bodyTop + bodyH / 2 + nameSize * 1.5);

        ctx.restore();
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
        ctx.shadowColor = "rgba(61, 124, 255, 0.45)";
        ctx.shadowBlur = 18;
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
        ctx.shadowColor = "rgba(0,0,0,0.85)";
        ctx.shadowBlur = 10;
        const topSize = Math.min(R * 0.085, 17);
        ctx.font = `800 ${topSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "#FFC83D";
        ctx.fillText(`TOP 1  ·  ${name || "CHAMPION"}`, ax, ay - R - topSize * 2.2);

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
        const flagW      = Math.round(flagH * 1.55);
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
        ctx.font = `900 ${trophySize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "#FFC83D";
        ctx.shadowColor = "rgba(255, 200, 61, 0.55)";
        ctx.shadowBlur = 16 + pulse * 8;
        ctx.fillText("🏆", ax, y);
        y += trophySize + gap * 0.5;

        // TIME UP — CHAMPION
        ctx.font = `900 ${titleSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "#FFC83D";
        ctx.shadowBlur = 12;
        ctx.fillText("TIME UP  —  CHAMPION", ax, y);
        y += titleSize + gap;

        // Flag card
        const flagX = ax - flagW / 2;
        const flagY = y;
        const pad = Math.max(4, flagW * 0.04);
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = 14;
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
        ctx.font = `800 ${nameSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "#F4F7FF";
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = 12;
        let displayName = name;
        while (displayName.length > 2 && ctx.measureText(displayName).width > R * 1.5) {
            displayName = displayName.slice(0, -1);
        }
        ctx.fillText(displayName, ax, y);
        y += nameSize + gap * 0.75;

        // 1 WIN
        ctx.font = `800 ${winSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "#FFC83D";
        ctx.shadowBlur = 10;
        ctx.fillText("1 WIN", ax, y);
        y += winSize + gap * 0.9;

        // NEXT TOURNAMENT IN MM:SS
        const mins  = Math.floor(this._champCountdownRemain / 60);
        const secs  = this._champCountdownRemain % 60;
        const cdStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
        ctx.font = `700 ${cdSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "#91A7C9";
        ctx.shadowBlur = 6;
        ctx.fillText(`NEXT TOURNAMENT IN  ${cdStr}`, ax, y);

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
