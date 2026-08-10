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
import Matter              from "matter-js";

export default class Game {

    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext("2d");

        this.flagLoader = new FlagLoader();

        // ── Country rotation ───────────────────────────────────────────────
        this.allCountries   = countries;
        this.roundSize      = 249;
        this._recentBatches = [];

        this.activeCountries = this._pickNextBatch();
        this.totalCountries  = this.activeCountries.length;

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

        // ── Qualifying session (40 minutes) ───────────────────────────────
        this.QUALIFY_DURATION_MS = 40 * 60 * 1000;
        this.sessionStartTime    = 0;
        this.roundNumber         = 0;
        this.isFinalMode         = false;

        // ── Final mode state ───────────────────────────────────────────────
        this._finalists          = [];
        this._finalEliminated    = [];
        this._finalRoundNumber   = 0;
        this._finalTotalCount    = 0;

        // ── Grand champion (game over) state ───────────────────────────────
        this._grandChampion         = null;   // set when one finalist remains
        this._champDisplayStart     = 0;
        this._champCountdownSec     = 120;    // 2-minute restart countdown
        this._champCountdownTimer   = null;
        this._champCountdownRemain  = 120;

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

        // ── Final-mode elimination: one-at-a-time pause cycle ─────────────
        // When a flag exits in final mode:
        //   1. gameState → "ELIM_SHOW"  (show card, audio plays)
        //   2. After card duration → gameState → "NEXT_EVENT" (arena rebuilds)
        //   3. If ≥2 flags left → COUNTDOWN → PLAYING again
        //   4. If 1 flag left   → show GRAND_CHAMPION screen forever
        this._elimShowCountry  = null;   // country being shown on ELIM_SHOW
        this._elimShowStart    = 0;      // timestamp when ELIM_SHOW began
        this._elimShowDuration = 2800;   // ms to hold the card before rebuild
    }

    get _lw() { return this._logicalW || this.canvas.width; }
    get _lh() { return this._logicalH || this.canvas.height; }

    // ── Random batch with less-repeat ──────────────────────────────────────

    _pickNextBatch() {
        const pool = this.allCountries;
        const size = Math.min(this.roundSize, pool.length);

        const recent = new Set(this._recentBatches.flat());
        const fresh = [], used = [];
        for (const c of pool) {
            if (recent.has(c.code)) used.push(c); else fresh.push(c);
        }

        const shuffle = (arr) => {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        };

        shuffle(fresh); shuffle(used);
        const batch = fresh.slice(0, size);
        if (batch.length < size) batch.push(...used.slice(0, size - batch.length));

        batch.forEach(c => { if (!c.image) c.image = this.flagLoader.load(c.code); });

        const codes = batch.map(c => c.code);
        this._recentBatches.push(codes);
        if (this._recentBatches.length > 2) this._recentBatches.shift();

        return batch;
    }

    // ── Resize ─────────────────────────────────────────────────────────────

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

        const spawnRadius = this.layout.arenaRadius - 20;
        const { positions, spacing } = SpawnManager.generate(
            this.layout.arenaX, this.layout.arenaY, spawnRadius, this.totalCountries
        );

        this._nextSpawnPositions = positions;
        this._nextFlagW = Math.max(6, spacing * 0.82);
        this._nextFlagH = Math.max(4, this._nextFlagW * 0.70);

        this.eventManager.pick();

        this.winnerManager.onWin = (winner) => this.handleWinner(winner);
        this.winnerManager.leaderboardRenderer = this.leaderboardRenderer;

        if (this.gameState !== "START_SCREEN") {
            this._beginCountdown();
        }
    }

    // ── Winner handling (qualifying rounds) ───────────────────────────────

    handleWinner(winner) {
        if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }

        // In final mode, winner detection is handled per-elimination in update().
        // This callback only fires for qualifying rounds.
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
        }

        // Check if qualifying time is up → switch to final mode
        if (this.sessionStartTime > 0) {
            const elapsed = Date.now() - this.sessionStartTime;
            if (elapsed >= this.QUALIFY_DURATION_MS) {
                this._enterFinalMode();
            }
        }

        this.eventManager.pick();

        const displayDuration = (isTie && winner.isSilent) ? 500 : this.winnerDisplayDuration;
        this.restartTimer = setTimeout(() => this._beginNextEvent(), displayDuration);
    }

    // ── Enter Final Mode ───────────────────────────────────────────────────

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
        this.audio.speak(`Qualifying is over! Grand Final begins with ${this._finalists.length} countries!`);
    }

    // ── Begin next event (NEXT_EVENT → tray animation) ────────────────────

    _beginNextEvent() {
        this.gameState      = "NEXT_EVENT";
        this.nextEventTimer = 0;

        if (this.isFinalMode) {
            this.activeCountries = this._finalists.map(f => f.country);
            this.activeCountries.forEach(c => {
                if (!c.image) c.image = this.flagLoader.load(c.code);
            });
        } else {
            this.activeCountries = this._pickNextBatch();
        }

        this.totalCountries = this.activeCountries.length;

        const spawnRadius = this.layout.arenaRadius - 20;
        const { positions, spacing } = SpawnManager.generate(
            this.layout.arenaX, this.layout.arenaY, spawnRadius, this.totalCountries
        );
        this._nextSpawnPositions = positions;
        this._nextFlagW = Math.max(6, spacing * 0.82);
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

    // ── Start game / reset ─────────────────────────────────────────────────

    startGame() { this._doReset(); }

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

        this.winnerManager.clearWins();
        this.winnerManager.winner = null;
        this.leaderboardRenderer.reset();

        this.sessionStartTime  = Date.now();
        this.roundNumber       = 0;
        this.isFinalMode       = false;
        this._finalists        = [];
        this._finalEliminated  = [];
        this._finalRoundNumber = 0;
        this._finalTotalCount  = 0;
        this._grandChampion    = null;
        this._champCountdownRemain = this._champCountdownSec;

        this._elimShowCountry = null;

        this.trayLauncher.cancel();
        this._clearAllFlags();

        this.confetti.particles = [];
        this.fx.reset();
        this.nextEventTimer = 0;

        this.activeCountries = this._pickNextBatch();
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

    // ── Countdown ─────────────────────────────────────────────────────────

    _beginCountdown() {
        this.gameState           = "COUNTDOWN";
        this.restartCountdown    = 3;
        this._countdownTickStart = performance.now();
        this.roundNumber++;

        this.arena.radius     = this.layout.arenaRadius;
        this.arena.state      = "INTRO";
        this.arena.introTimer = 0;
        this.arena.introDuration = 99999;
        this.arena.gapSize    = 0;
        this.arena.syncWalls();

        this.winnerManager.reset();

        this._spawnPositions = this._nextSpawnPositions;
        this._spawnFlagW     = this._nextFlagW;
        this._spawnFlagH     = this._nextFlagH;
        this._spawnIndex     = 0;
        this._spawnTotal     = Math.min(this.totalCountries, this._spawnPositions?.length ?? 0);
        this._spawnPerFrame  = 12;

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

    // ── Update ─────────────────────────────────────────────────────────────

    update() {
        if (this.gameState === "START_SCREEN")    return;
        if (this.gameState === "GRAND_CHAMPION")  return;  // frozen — confetti only
        if (this.gameState === "ELIM_SHOW") {
            // Wait for the card duration then trigger arena rebuild
            const elapsed = Date.now() - this._elimShowStart;
            if (elapsed >= this._elimShowDuration) {
                this._afterElimShow();
            }
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
                const countBefore = this.flagManager.flags.length;
                this.eliminationManager.update(this.flagManager);
                const countAfter  = this.flagManager.flags.length;

                if (countAfter < countBefore) {
                    this.audio.playElimination();
                    this.audio.playMilestone(countAfter, this.totalCountries);
                }

                this.arena.setRemainingFlags(countAfter);

                if (evenFrame) {
                    this.drain.update();
                    this.drain.applyDrainForce(this.flagManager.flags);
                }

                // ── Final mode: handle eliminations one at a time ─────────────
                if (this.isFinalMode && countAfter < countBefore) {
                    this._handleFinalElimination();
                    return; // stop further updates this frame
                }
            }

            // Qualifying mode: normal winner detection
            if (!this.isFinalMode && evenFrame) {
                this.winnerManager.update(this.flagManager, this.eliminationManager);
            }
        }

        // ── WINNER_SHOW: just confetti + fx ───────────────────────────────
        this.confetti.update();
        this.fx.update();
    }

    // ── Final-mode: triggered the moment a flag exits ─────────────────────

    _handleFinalElimination() {
        // Immediately close the arena (stop physics action)
        this.eventManager.end(this._eventCtx());

        // Find who was just eliminated (last entry in eliminated list)
        const eliminated = this.eliminationManager.eliminated;
        const justElim   = eliminated[eliminated.length - 1];

        if (justElim) {
            // Remove from _finalists
            this._finalists = this._finalists.filter(
                f => f.country.code !== justElim.country.code
            );
            // Record in permanent final-eliminated list
            this._finalEliminated.push({ country: justElim.country });
        }

        const remaining = this._finalists.length;

        if (remaining <= 1) {
            // ── GRAND CHAMPION ─────────────────────────────────────────────
            const champ = remaining === 1
                ? this._finalists[0].country
                : (justElim?.country ?? null);  // edge: everyone exited together

            this._triggerGrandChampion(champ);
        } else {
            // ── Show elimination card, then rebuild ────────────────────────
            this._elimShowCountry = justElim?.country ?? null;
            this._elimShowStart   = Date.now();
            this.gameState        = "ELIM_SHOW";

            // Pause physics by not updating it during ELIM_SHOW
            // Clear all remaining flags from physics world so arena is empty
            this._clearAllFlags();

            if (this._elimShowCountry?.name) {
                this.audio.speak(`${this._elimShowCountry.name} has been eliminated!`);
            }
        }
    }

    _afterElimShow() {
        // Card done — trigger arena rebuild with remaining finalists
        this._elimShowCountry = null;
        this._beginNextEvent();
    }

    // ── Grand Champion ─────────────────────────────────────────────────────

    _triggerGrandChampion(country) {
        this._grandChampion    = country;
        this.gameState         = "GRAND_CHAMPION";
        this._champDisplayStart = Date.now();
        this._champCountdownRemain = this._champCountdownSec;

        // Clear everything from arena
        this._clearAllFlags();
        this.eventManager.end(this._eventCtx());

        // Big celebration
        this.confetti.start(this._lw / 2, this._lh * 0.36, 300);
        this.audio.playWinner();
        if (country?.name) {
            this.audio.speak(`${country.name} is the Grand Final Champion!`);
        }

        // 2-minute countdown then auto-restart
        this._champCountdownTimer = setInterval(() => {
            this._champCountdownRemain--;
            if (this._champCountdownRemain <= 0) {
                clearInterval(this._champCountdownTimer);
                this._champCountdownTimer = null;
                this._doReset();
            }
        }, 1000);
    }

    // ── Countdown ─────────────────────────────────────────────────────────

    _beginCountdownForFinal() {
        // After ELIM_SHOW, rebuild for remaining finalists
        this._beginNextEvent();
    }

    // ── Draw ───────────────────────────────────────────────────────────────

    draw() {
        const { ctx } = this;
        const layout  = this.layout;

        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, this._lw, this._lh);

        if (this.gameState === "START_SCREEN") return;

        // Grand Champion screen — full-screen celebration, no game UI
        if (this.gameState === "GRAND_CHAMPION") {
            this._drawGrandChampionScreen(ctx);
            this.confetti.draw(ctx);
            return;
        }

        // Leaderboard — always drawn
        this.leaderboardRenderer.draw(
            ctx,
            this.winnerManager.getLeaderboard(),
            layout.lbX, layout.lbY, layout.lbW, layout.lbRowH, layout.lbRowCount
        );

        this.arenaRenderer.draw(ctx, this.arena);
        this.flagManager.draw(ctx);
        this.trayLauncher.draw(ctx);

        if (this.gameState === "PLAYING") {
            this.progressBarRenderer.draw(
                ctx,
                this.eliminationManager?.eliminated ?? [],
                this.totalCountries,
                layout.barCenterX, layout.barY, layout.barWidth, layout.barHeight
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
                this._lw, this._lh,
                finalTrayH
            );
        } else if (this.gameState !== "NEXT_EVENT") {
            this.bottomTrayRenderer.draw(
                ctx,
                this.eliminationManager?.eliminated ?? [],
                this._lw, this._lh
            );
        } else {
            this.bottomTrayRenderer.draw(ctx, [], this._lw, this._lh);
        }

        this.fx.draw(ctx, this._lw, this._lh);
        this._drawCentralOverlay(ctx);

        // ── ELIM_SHOW: draw card over the arena ───────────────────────────
        if (this.gameState === "ELIM_SHOW") {
            this._drawElimShowCard(ctx);
            this.confetti.draw(ctx);
            return;
        }

        // Winner splash (qualifying rounds)
        if (this.gameState === "WINNER_SHOW" || this.gameState === "COUNTDOWN") {
            const elapsed = Date.now() - this.winnerDisplayTime;
            const animT   = this.gameState === "WINNER_SHOW"
                ? Math.min(1, elapsed / 450)
                : 1;
            this.winnerRender.draw(
                ctx, this.winnerManager.winner,
                this._lw, this._lh,
                this.gameState === "COUNTDOWN",
                animT,
                layout.arenaX, layout.arenaY, layout.arenaRadius,
                false,  // never isFinalMode for qualifying winner
                0
            );
        }

        this.confetti.draw(ctx);

        if (this.gameState === "NEXT_EVENT") {
            this._drawNextEventOverlay(ctx);
        }

        if (this.gameState === "COUNTDOWN") {
            this._drawCountdownOverlay(ctx);
        }
    }

    // ── ELIM_SHOW card ────────────────────────────────────────────────────

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

        const cx = this.layout.arenaX;
        const cy = this.layout.arenaY;
        const R  = this.layout.arenaRadius;

        // ── Full arena dark overlay ────────────────────────────────────────
        ctx.save();
        ctx.globalAlpha = alpha * 0.72;
        ctx.fillStyle   = "rgba(0,0,0,1)";
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.99, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // ── Card ──────────────────────────────────────────────────────────
        const cardW = Math.min(this._lw * 0.68, 370);
        const cardH = Math.min(R * 0.62, 158);
        const cardX = cx - cardW / 2;
        const cardY = cy - cardH / 2;

        const pivotX = cx;
        const pivotY = cy;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(pivotX, pivotY);
        ctx.scale(scale, scale);
        ctx.translate(-pivotX, -pivotY);

        // Card shadow / glow
        ctx.shadowColor = "rgba(210, 35, 35, 0.70)";
        ctx.shadowBlur  = 32;

        // Card background
        ctx.fillStyle = "rgba(14, 3, 3, 0.98)";
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
            ctx.roundRect(cardX, cardY, cardW, cardH, 16);
        } else {
            ctx.rect(cardX, cardY, cardW, cardH);
        }
        ctx.fill();

        // Red border
        ctx.strokeStyle = "rgba(220, 40, 40, 0.92)";
        ctx.lineWidth   = 2.5;
        ctx.stroke();
        ctx.shadowBlur  = 0;

        // "ELIMINATED" banner strip
        const bannerH = Math.round(cardH * 0.32);
        const grad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY);
        grad.addColorStop(0,   "rgba(155, 18, 18, 0.97)");
        grad.addColorStop(0.5, "rgba(215, 38, 38, 0.97)");
        grad.addColorStop(1,   "rgba(155, 18, 18, 0.97)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.rect(cardX + 2.5, cardY + 2.5, cardW - 5, bannerH - 2.5);
        ctx.fill();

        // "ELIMINATED" text
        const elimSize = Math.min(cardW * 0.082, 20);
        ctx.font         = `900 ${elimSize}px system-ui, Arial, sans-serif`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle    = "#FFFFFF";
        ctx.shadowColor  = "rgba(0,0,0,0.95)";
        ctx.shadowBlur   = 7;
        ctx.fillText("💀  ELIMINATED  💀", cx, cardY + bannerH / 2);
        ctx.shadowBlur = 0;

        // Flag image
        const bodyTop = cardY + bannerH + 8;
        const bodyH   = cardH - bannerH - 10;
        const flagH   = Math.round(bodyH * 0.80);
        const flagW   = Math.round(flagH * 1.50);
        const flagX   = cardX + 20;
        const flagY   = bodyTop + (bodyH - flagH) / 2;

        const img = this._elimShowCountry?.image;
        if (img && img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(flagX, flagY, flagW, flagH);
            ctx.clip();
            ctx.drawImage(img, flagX, flagY, flagW, flagH);
            ctx.restore();
            ctx.strokeStyle = "rgba(255,255,255,0.45)";
            ctx.lineWidth   = 1.2;
            ctx.strokeRect(flagX, flagY, flagW, flagH);
        } else {
            ctx.fillStyle = "rgba(60,20,20,0.8)";
            ctx.fillRect(flagX, flagY, flagW, flagH);
        }

        // Country name
        const nameX    = flagX + flagW + 16;
        const maxNameW = cardX + cardW - nameX - 10;
        const nameSize = Math.min(cardW * 0.088, 19);
        ctx.font         = `800 ${nameSize}px system-ui, Arial, sans-serif`;
        ctx.textAlign    = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle    = "#FFFFFF";
        ctx.shadowColor  = "rgba(0,0,0,0.95)";
        ctx.shadowBlur   = 9;

        let name = this._elimShowCountry?.name ?? "";
        while (name.length > 2 && ctx.measureText(name).width > maxNameW) {
            name = name.slice(0, -1);
        }
        ctx.fillText(name, nameX, bodyTop + bodyH / 2);

        // "X countries remaining" sub-line
        const remCount  = this._finalists.length;
        const remText   = `${remCount} ${remCount === 1 ? "country" : "countries"} remaining`;
        const remSize   = Math.min(cardW * 0.060, 13);
        ctx.font         = `600 ${remSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle    = "rgba(255,180,180,0.85)";
        ctx.shadowBlur   = 5;
        ctx.fillText(remText, nameX, bodyTop + bodyH / 2 + nameSize * 1.5);

        ctx.restore();
    }

    // ── Grand Champion full-screen ─────────────────────────────────────────

    _drawGrandChampionScreen(ctx) {
        const cw = this._lw;
        const ch = this._lh;
        const cx = cw / 2;

        // Animated pulsing dark background
        const t       = (Date.now() - this._champDisplayStart) / 1000;
        const pulse   = 0.5 + 0.5 * Math.sin(t * 1.1);

        const bgGrad = ctx.createRadialGradient(cx, ch * 0.42, 0, cx, ch * 0.42, Math.max(cw, ch));
        bgGrad.addColorStop(0,   `rgba(10, 6, 0, 1)`);
        bgGrad.addColorStop(0.5, `rgba(6, 4, 0, 1)`);
        bgGrad.addColorStop(1,   `rgba(2, 2, 2, 1)`);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, cw, ch);

        // Rotating gold rays
        ctx.save();
        ctx.translate(cx, ch * 0.38);
        ctx.rotate(t * 0.04);
        const rayR = Math.min(cw, ch) * 0.55;
        for (let i = 0; i < 14; i++) {
            const angle    = (i / 14) * Math.PI * 2;
            const hw       = (i % 2 === 0) ? Math.PI / 14 * 0.7 : Math.PI / 14 * 0.3;
            const rayAlpha = (i % 2 === 0 ? 0.18 : 0.10) + pulse * 0.06;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle - hw) * 30, Math.sin(angle - hw) * 30);
            ctx.lineTo(Math.cos(angle) * rayR, Math.sin(angle) * rayR);
            ctx.lineTo(Math.cos(angle + hw) * 30, Math.sin(angle + hw) * 30);
            ctx.closePath();
            ctx.fillStyle = `rgba(255, 200, 0, ${rayAlpha})`;
            ctx.fill();
        }
        ctx.restore();

        ctx.save();
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";

        // ── "TIME'S UP" top badge ──────────────────────────────────────────
        const badgeSize = Math.min(cw * 0.042, 22);
        ctx.font         = `700 ${badgeSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle    = "rgba(255,215,0,0.75)";
        ctx.shadowColor  = "rgba(0,0,0,0.9)";
        ctx.shadowBlur   = 10;
        ctx.fillText("⏱  TIME'S UP  ·  GRAND FINAL OVER", cx, ch * 0.10);

        // ── "CHAMPION" heading ─────────────────────────────────────────────
        const champSize = Math.min(cw * 0.13, 80);
        ctx.font         = `900 ${champSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle    = "#FFD700";
        ctx.shadowColor  = "rgba(255,190,0,0.80)";
        ctx.shadowBlur   = 36 + pulse * 20;
        ctx.fillText("🏆  CHAMPION  🏆", cx, ch * 0.20);

        // ── Winner flag ────────────────────────────────────────────────────
        const img    = this._grandChampion?.image;
        const flagW  = Math.min(cw * 0.44, 300);
        const flagH  = flagW * 0.65;
        const flagX  = cx - flagW / 2;
        const flagY  = ch * 0.27;

        if (img && img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.shadowColor = "rgba(255,215,0,0.80)";
            ctx.shadowBlur  = 40 + pulse * 20;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, flagX, flagY, flagW, flagH);
            ctx.restore();
            ctx.strokeStyle = `rgba(255,215,0,${0.6 + pulse * 0.3})`;
            ctx.lineWidth   = 3;
            ctx.strokeRect(flagX, flagY, flagW, flagH);
        }

        // ── Country name ───────────────────────────────────────────────────
        const nameSize = Math.min(cw * 0.085, 54);
        ctx.font         = `900 ${nameSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle    = "#FFFFFF";
        ctx.shadowColor  = "rgba(0,0,0,0.95)";
        ctx.shadowBlur   = 18;
        ctx.fillText(this._grandChampion?.name ?? "", cx, flagY + flagH + nameSize * 0.9);

        // ── "CONGRATULATIONS" ─────────────────────────────────────────────
        const congrSize = Math.min(cw * 0.042, 24);
        ctx.font         = `700 ${congrSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle    = "rgba(255,215,0,0.85)";
        ctx.shadowBlur   = 14;
        ctx.fillText("🎊  CONGRATULATIONS  🎊", cx, flagY + flagH + nameSize * 2.1);

        // ── "Next round starting in X:XX" countdown ────────────────────────
        const mins  = Math.floor(this._champCountdownRemain / 60);
        const secs  = this._champCountdownRemain % 60;
        const cdStr = `${mins}:${String(secs).padStart(2, "0")}`;

        const cdSize = Math.min(cw * 0.035, 19);
        ctx.font      = `600 ${cdSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "rgba(180,210,255,0.70)";
        ctx.shadowBlur = 8;
        ctx.fillText(`Next round starting in  ${cdStr}`, cx, ch * 0.88);

        ctx.restore();
    }

    // ── Overlays ───────────────────────────────────────────────────────────

    _drawCentralOverlay(ctx) {
        if (this.gameState === "START_SCREEN") return;

        const cx     = this.layout.arenaX;
        const aboveY = this.layout.arenaY - this.layout.arenaRadius - 10;

        ctx.save();
        ctx.textAlign    = "center";
        ctx.textBaseline = "bottom";
        ctx.shadowColor  = "rgba(0,0,0,0.8)";
        ctx.shadowBlur   = 8;

        const labelSize = Math.min(this._lw * 0.030, 13);
        ctx.font      = `600 ${labelSize}px system-ui, Arial, sans-serif`;

        if (this.isFinalMode) {
            ctx.fillStyle = "rgba(40,200,255,0.90)";
            ctx.fillText(`🏆 GRAND FINAL · Round ${this._finalRoundNumber} · ${this._finalists.length} remaining`, cx, aboveY);
        } else if (this.sessionStartTime > 0) {
            const elapsed   = Date.now() - this.sessionStartTime;
            const remaining = Math.max(0, this.QUALIFY_DURATION_MS - elapsed);
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;
            ctx.fillStyle = "rgba(180,210,255,0.70)";
            ctx.fillText(`QUALIFYING · ${timeStr} · Round ${this.roundNumber}`, cx, aboveY);
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
        ctx.fillStyle   = "rgba(0,0,0,0.42)";
        ctx.fillRect(0, 0, this._lw, this._lh);

        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);

        const cardW = Math.min(this._lw * 0.72, 420);
        const cardH = Math.min(this._lh * 0.28, 200);
        const cardX = cx - cardW / 2;
        const cardY = cy - cardH / 2;

        ctx.fillStyle = "rgba(8, 10, 22, 0.92)";
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(cardX, cardY, cardW, cardH, 16);
        else ctx.rect(cardX, cardY, cardW, cardH);
        ctx.fill();

        ctx.strokeStyle = this._hexToRgba(ev.color, 0.55);
        ctx.lineWidth   = 2;
        ctx.stroke();

        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor  = "rgba(0,0,0,0.95)";
        ctx.shadowBlur   = 12;

        const titleSize = Math.min(this._lw * 0.028, 22);
        ctx.font      = `700 ${titleSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = this.isFinalMode ? "rgba(40,200,255,0.95)" : "rgba(255,215,0,0.95)";
        ctx.fillText(this.isFinalMode ? "🏆 GRAND FINAL" : "NEXT EVENT", cx, cy - cardH * 0.28);

        const pulse    = 1 + 0.04 * Math.sin(timer * 0.1);
        const iconSize = Math.min(this._lw * 0.08, 52) * pulse;
        ctx.font       = `${iconSize}px system-ui, Arial, sans-serif`;
        ctx.shadowBlur = 20;
        ctx.fillText(this.isFinalMode ? "🏆" : ev.icon, cx, cy - 4);

        const eventSize = Math.min(this._lw * 0.055, 42);
        ctx.font        = `900 ${eventSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle   = this.isFinalMode ? "#00CFFF" : ev.color;
        ctx.shadowColor = this.isFinalMode ? "rgba(40,180,255,0.5)" : this._hexToRgba(ev.color, 0.5);
        ctx.shadowBlur  = 22;
        ctx.fillText(this.isFinalMode
            ? `${this._finalists.length} Countries Remain`
            : ev.name, cx, cy + cardH * 0.28);

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
        ctx.shadowColor  = "rgba(0,0,0,0.95)";
        ctx.shadowBlur   = 14;

        const roundSize = Math.min(this._lw * 0.11, 72);
        ctx.font      = `900 ${roundSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = this.isFinalMode ? "#00CFFF" : "#FFD700";
        ctx.shadowColor = this.isFinalMode ? "rgba(40,200,255,0.7)" : "rgba(255,200,0,0.7)";
        ctx.shadowBlur  = 20;
        const roundLabel = this.isFinalMode
            ? `🏆 FINAL ${this._finalRoundNumber}`
            : `ROUND ${this.roundNumber}`;
        ctx.fillText(roundLabel, cx, cy - 95);

        const evNameSize = Math.min(this._lw * 0.065, 44);
        ctx.font      = `900 ${evNameSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = this.isFinalMode ? "rgba(140,220,255,0.95)" : ev.color;
        ctx.shadowColor = this.isFinalMode ? "rgba(40,180,255,0.6)" : this._hexToRgba(ev.color, 0.6);
        ctx.shadowBlur = 18;
        const evLabel = this.isFinalMode
            ? `${this._finalists.length} Countries`
            : `${ev.icon}  ${ev.name}`;
        ctx.fillText(evLabel, cx, cy - 38);

        const countSize = Math.min(this._lw * 0.038, 24);
        ctx.font      = `700 ${countSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.70)";
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur  = 8;
        ctx.fillText(`${this.totalCountries} FLAGS`, cx, cy + 10);

        ctx.save();
        ctx.translate(cx, cy + 75);
        ctx.scale(numScale, numScale);
        const numSize = Math.min(this._lw * 0.20, 120);
        ctx.font      = `900 ${numSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = this.isFinalMode ? "#00CFFF" : "#FFD700";
        ctx.shadowColor = "rgba(0,0,0,0.90)";
        ctx.shadowBlur  = 24;
        ctx.fillText(String(this.restartCountdown), 0, 0);
        ctx.shadowColor = this.isFinalMode ? "rgba(40,200,255,0.45)" : "rgba(255,215,0,0.45)";
        ctx.shadowBlur  = 44;
        ctx.fillText(String(this.restartCountdown), 0, 0);
        ctx.restore();

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
