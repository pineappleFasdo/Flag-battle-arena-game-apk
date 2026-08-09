import PhysicsWorld        from "../physics/PhysicsWorld";
import ArenaPhysics        from "../physics/ArenaPhysics";
import ArenaRenderer       from "../render/ArenaRenderer";
import BottomTrayRenderer  from "../render/BottomTrayRenderer";
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

        // Create flagLoader FIRST (required by _pickNextBatch)
        this.flagLoader = new FlagLoader();

        // ── Country rotation (all countries over time, 100 per round) ──
        this.allCountries   = countries;
        this.roundSize      = 100;          // change to 60 for lower CPU
        this._recentBatches = [];           // last 2 batches (less-repeat)

        this.activeCountries = this._pickNextBatch();
        this.totalCountries  = this.activeCountries.length;

        this.physics            = null;
        this.arena              = null;
        this.drain              = null;
        this.flagManager        = null;
        this.eliminationManager = null;

        this.arenaRenderer       = new ArenaRenderer();
        this.bottomTrayRenderer  = new BottomTrayRenderer();
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

        this.nextEventTimer    = 0;
        this.nextEventDuration = 150;

        this.restartCountdown = 0;
        this.restartTimer     = null;

        this._nextSpawnPositions = null;
        this._nextFlagW          = 0;
        this._nextFlagH          = 0;

        this._frame = 0;

        // Staggered spawn
        this._spawnPositions = null;
        this._spawnFlagW     = 0;
        this._spawnFlagH     = 0;
        this._spawnIndex     = 0;
        this._spawnTotal     = 0;
        this._spawnPerFrame  = 12;
    }

    // ── Random batch with less-repeat ─────────────────────────────────────────

    _pickNextBatch() {
        const pool = this.allCountries;
        const size = Math.min(this.roundSize, pool.length);

        const recent = new Set(this._recentBatches.flat());

        const fresh = [];
        const used  = [];
        for (const c of pool) {
            if (recent.has(c.code)) used.push(c);
            else fresh.push(c);
        }

        const shuffle = (arr) => {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        };

        shuffle(fresh);
        shuffle(used);

        const batch = fresh.slice(0, size);
        if (batch.length < size) {
            batch.push(...used.slice(0, size - batch.length));
        }

        batch.forEach(c => {
            if (!c.image) c.image = this.flagLoader.load(c.code);
        });

        const codes = batch.map(c => c.code);
        this._recentBatches.push(codes);
        if (this._recentBatches.length > 2) this._recentBatches.shift();

        return batch;
    }

    // ── Resize ────────────────────────────────────────────────────────────────

    resize(width, height) {
        this.canvas.width  = width;
        this.canvas.height = height;

        this.layout.update(width, height);

        this.physics = new PhysicsWorld(width, height);
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

    // ── State transitions ────────────────────────────────────────────────────

    handleWinner(winner) {
        if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }

        this.gameState         = "WINNER_SHOW";
        this.winnerDisplayTime = Date.now();

        this.eventManager.end(this._eventCtx());

        const isTie = winner?.isTie === true;

        if (isTie && !winner.isSilent) {
            this.confetti.start(this.canvas.width / 2, this.canvas.height * 0.4, 130);
            this.audio.playWinner();
            const names = (winner.countries ?? []).map(c => c.name).join(" and ");
            if (names) this.audio.speak(`It's a tie between ${names}!`);
        } else if (!isTie) {
            this.confetti.start(this.canvas.width / 2, this.canvas.height * 0.36, 150);
            this.audio.playWinner();
            this.audio.speak(`${winner.country.name} wins!`);
        }

        this.eventManager.pick();

        const displayDuration = (isTie && winner.isSilent)
            ? 500
            : this.winnerDisplayDuration;

        this.restartTimer = setTimeout(() => this._beginNextEvent(), displayDuration);
    }

    _beginNextEvent() {
        this.gameState      = "NEXT_EVENT";
        this.nextEventTimer = 0;

        // New random batch (less-repeat)
        this.activeCountries = this._pickNextBatch();
        this.totalCountries  = this.activeCountries.length;

        const spawnRadius = this.layout.arenaRadius - 20;
        const { positions, spacing } = SpawnManager.generate(
            this.layout.arenaX, this.layout.arenaY, spawnRadius, this.totalCountries
        );
        this._nextSpawnPositions = positions;
        this._nextFlagW = Math.max(6, spacing * 0.82);
        this._nextFlagH = Math.max(4, this._nextFlagW * 0.70);

        this._launchEliminated = this.eliminationManager
            ? [...this.eliminationManager.eliminated]
            : [];

        this._clearAllFlags();

        const launchFlags = this.activeCountries.map(c => ({ country: c }));
        this.trayLauncher.startLaunch(
            launchFlags,
            this.layout.trayTop,
            this.canvas.width,
            this.layout.arenaX,
            this.layout.arenaY,
            this.layout.arenaRadius,
            this._nextSpawnPositions,
            this._nextFlagW,
            this._nextFlagH
        );

        this.nextEventDuration = 130;
    }

    startGame() {
        this._doReset();
    }

    _doReset() {
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            clearInterval(this.restartTimer);
            this.restartTimer = null;
        }

        if (this.gameState === "PLAYING" && this.arena) {
            this.eventManager.end(this._eventCtx());
        }

        this.winnerManager.clearWins();
        this.winnerManager.winner = null;
        this.leaderboardRenderer.reset();

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

    _beginCountdown() {
        this.gameState           = "COUNTDOWN";
        this.restartCountdown    = 3;
        this._countdownTickStart = performance.now();

        this.arena.radius        = this.layout.arenaRadius;
        this.arena.state          = ArenaPhysics.STATE_INTRO;
        this.arena.introTimer    = 0;
        this.arena.introDuration = 99999;
        this.arena.gapSize       = 0;
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
        this.arena.state    = ArenaPhysics.STATE_PLAYING;
        this.arena.gapSize = this.arena.initialGapSize;
        this.arena.syncWalls();
        this.audio.playRoundStart();
        this.eventManager.start(this._eventCtx());
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
        if (this.gameState === "START_SCREEN") return;

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
            }

            // Winner check ONLY while playing
            if (evenFrame) {
                this.winnerManager.update(this.flagManager, this.eliminationManager);
            }
        }

        this.confetti.update();
        this.fx.update();
    }

    // ── Draw ──────────────────────────────────────────────────────────────────

    draw() {
        const { ctx } = this;
        const layout  = this.layout;

        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.gameState === "START_SCREEN") return;

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

        if (this.gameState !== "NEXT_EVENT") {
            this.bottomTrayRenderer.draw(
                ctx,
                this.eliminationManager?.eliminated ?? [],
                this.canvas.width, this.canvas.height
            );
        } else {
            this.bottomTrayRenderer.draw(
                ctx,
                [],
                this.canvas.width, this.canvas.height
            );
        }

        this.fx.draw(ctx, this.canvas.width, this.canvas.height);

        this._drawCentralOverlay(ctx);

        if (this.gameState === "WINNER_SHOW" || this.gameState === "COUNTDOWN") {
            const elapsed = Date.now() - this.winnerDisplayTime;
            const animT   = this.gameState === "WINNER_SHOW"
                ? Math.min(1, elapsed / 450)
                : 1;
            this.winnerRender.draw(
                ctx, this.winnerManager.winner,
                this.canvas.width, this.canvas.height,
                this.gameState === "COUNTDOWN",
                animT
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

    _drawCentralOverlay(ctx) {}

    _drawNextEventOverlay(ctx) {
        const ev    = this.eventManager;
        const cx    = this.canvas.width  / 2;
        const cy    = this.layout.arenaY;
        const total = this.nextEventDuration;
        const timer = this.nextEventTimer;

        let alpha = 1;
        if (timer < 14) {
            alpha = this._easeOut(timer / 14);
        } else if (timer > total - 18) {
            alpha = this._easeOut((total - timer) / 18);
        }
        const scale = 0.96 + 0.04 * Math.min(1, timer / 14);

        ctx.save();
        ctx.globalAlpha = alpha;

        ctx.fillStyle = "rgba(0,0,0,0.42)";
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);

        const cardW = Math.min(this.canvas.width * 0.72, 420);
        const cardH = Math.min(this.canvas.height * 0.28, 200);
        const cardX = cx - cardW / 2;
        const cardY = cy - cardH / 2;

        ctx.fillStyle = "rgba(8, 10, 22, 0.92)";
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
            ctx.roundRect(cardX, cardY, cardW, cardH, 16);
        } else {
            ctx.rect(cardX, cardY, cardW, cardH);
        }
        ctx.fill();

        ctx.strokeStyle = this._hexToRgba(ev.color, 0.55);
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor  = "rgba(0,0,0,0.95)";
        ctx.shadowBlur   = 12;

        const titleSize = Math.min(this.canvas.width * 0.028, 22);
        ctx.font = `700 ${titleSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "rgba(255,215,0,0.95)";
        ctx.fillText("NEXT EVENT", cx, cy - cardH * 0.28);

        const pulse = 1 + 0.04 * Math.sin(timer * 0.1);
        const iconSize = Math.min(this.canvas.width * 0.08, 52) * pulse;
        ctx.font = `${iconSize}px system-ui, Arial, sans-serif`;
        ctx.shadowBlur = 20;
        ctx.fillText(ev.icon, cx, cy - 4);

        const eventSize = Math.min(this.canvas.width * 0.055, 42);
        ctx.font = `900 ${eventSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = ev.color;
        ctx.shadowColor = this._hexToRgba(ev.color, 0.5);
        ctx.shadowBlur  = 22;
        ctx.fillText(ev.name, cx, cy + cardH * 0.28);

        ctx.restore();
    }

    _drawCountdownOverlay(ctx) {
        if (this.restartCountdown <= 0) return;

        const cx = this.canvas.width  / 2;
        const cy = this.layout.arenaY;
        const ev = this.eventManager;

        if (!this._countdownTickStart) this._countdownTickStart = performance.now();
        const tickT = ((performance.now() - this._countdownTickStart) % 1000) / 1000;
        const numScale = tickT < 0.2
            ? 1 + 0.16 * (1 - tickT / 0.2)
            : 1;

        ctx.save();
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor  = "rgba(0,0,0,0.95)";
        ctx.shadowBlur   = 14;

        const evSize = Math.min(this.canvas.width * 0.030, 24);
        ctx.font = `700 ${evSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = ev.color;
        ctx.fillText(`${ev.icon}  ${ev.name}`, cx, cy - 110);

        const labelSize = Math.min(this.canvas.width * 0.028, 22);
        ctx.font = `600 ${labelSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.shadowBlur = 12;
        ctx.fillText("STARTS IN", cx, cy - 72);

        ctx.save();
        ctx.translate(cx, cy + 20);
        ctx.scale(numScale, numScale);
        const numSize = Math.min(this.canvas.width * 0.17, 140);
        ctx.font = `900 ${numSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "#FFD700";
        ctx.shadowColor = "rgba(0,0,0,0.90)";
        ctx.shadowBlur  = 24;
        ctx.fillText(String(this.restartCountdown), 0, 0);
        ctx.shadowColor = "rgba(255,215,0,0.40)";
        ctx.shadowBlur  = 36;
        ctx.fillText(String(this.restartCountdown), 0, 0);
        ctx.restore();

        ctx.restore();
    }

    _easeOut(t) {
        return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
    }

    _hexToRgba(color, alpha) {
        if (!color || color[0] !== "#") return `rgba(255,215,0,${alpha})`;
        const h = color.slice(1);
        const full = h.length === 3
            ? h[0]+h[0]+h[1]+h[1]+h[2]+h[2]
            : h;
        const r = parseInt(full.slice(0, 2), 16);
        const g = parseInt(full.slice(2, 4), 16);
        const b = parseInt(full.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    loop = () => {
        this.update();
        this.draw();
        requestAnimationFrame(this.loop);
    };
}
