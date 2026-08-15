import { gf } from '../GameFont.js';
/**
 * SpaceTheme.js — Space visual layer + Asteroid Shower mechanic
 *
 * ASTEROID SHOWER RULES:
 *  - Only fires during PLAYING state (Game.js calls notifyPlaying() on round start)
 *  - Arena must be FULL/NEAR-FULL (≥ SHOWER_MIN_FILL_RATIO of total flags still alive)
 *    so showers hit dense crowds, not the last few survivors
 *  - Arena must NOT be near the end (< SHOWER_LOW_FILL_RATIO of total flags = no shower)
 *  - Blocked during COUNTDOWN and NEXT_EVENT states (event-start flash / transition card)
 *  - Random delay before each shower; timing is NOT predictable — fill ratio is checked
 *    at the moment a shower would fire, so the player can't game it
 *  - 6-10 asteroids per shower, spread over ~4 s
 *  - Asteroids pass STRAIGHT THROUGH arena walls (no wall collision at all)
 *  - On flag hit: immediately eliminated via onFlagBurned callback
 *  - "☄️ ASTEROID SHOWER!" banner appears ONCE at shower start, gone after ~2 s
 *  - Banner never shows during NEXT_EVENT / COUNTDOWN / any non-PLAYING state
 *
 * Game.js calls:
 *   spaceTheme.notifyPlaying()          ← call in _startPlaying() to reset shower clock
 *   spaceTheme.update(lw,lh,flagManager,arenaX,arenaY,arenaRadius,Matter,gameState,currentFlags,totalFlags)
 *   spaceTheme.draw(ctx, lw, lh)
 *   spaceTheme.drawWarning(ctx, lw, lh)
 */
// Asteroid showers only trigger when the arena fill ratio is within this band.
// Rounds are fast (30-40 s, 249 flags), so the "full arena" window closes quickly.
// We use a wide high-end band and a small low-end cutoff to protect survivors only.
//
// SHOWER_MIN_FILL_RATIO: arena must have at least this fraction of flags to allow a shower.
//   Set low (0.35) so the window stays open for most of the round.
// SHOWER_LOW_FILL_RATIO: below this fraction the event is basically over — block showers.
//   Set to 0.10 (last ~25 of 249) so the final few survivors aren't wiped by asteroids.
const SHOWER_MIN_FILL_RATIO = 0.35;  // arena must have ≥ 35 % of total flags alive
const SHOWER_LOW_FILL_RATIO = 0.10;  // below 10 % = near end, always blocked

// States that block new showers (transition screens / event-start flashes)
const BLOCKED_STATES = new Set(["COUNTDOWN", "NEXT_EVENT", "WINNER_SHOW", "ELIM_SHOW"]);

export default class SpaceTheme {

    constructor() {
        this._stars     = [];
        this._nebula    = [];
        this._planets   = [];
        this._shooters  = [];   // occasional distant shooting stars
        this._asteroids = [];
        /** When true: no showers, no burns (elimination / final rounds). */
        this._asteroidsDisabled = false;
        this._impacts   = [];
        this._frame     = 0;
        this._lw        = 0;
        this._lh        = 0;
        this._built     = false;

        // ── Shower state ─────────────────────────────────────────────────────
        this._showerState         = "WAITING";  // "WAITING" | "ACTIVE"
        this._playingFrames       = 0;           // frames elapsed since round started
        this._framesUntilShower   = this._randDelay(true);  // first shower delay
        this._showerBatchLeft     = 0;
        this._showerBatchInterval = 0;
        this._showerActiveFrames  = 0;
        this._isPlaying           = false;       // only true when game is PLAYING

        // Flag count info — updated each frame from Game.js
        this._currentFlags = 0;
        this._totalFlags   = 0;

        // Warning banner
        this._warningLife = 0;
        this._WARNING_DUR = 120;  // 2 s at 60fps

        // Burn effects — flags incinerated by asteroids
        this._burnEffects = [];

        // Callback: set from Game.js to handle immediate flag elimination
        // Signature: (flag, x, y) => void
        this.onFlagBurned = null;

        // Audio reference — set by Game.js so SpaceTheme can trigger sounds
        this.audio = null;
    }

    /**
     * Returns true when the arena currently qualifies for an asteroid shower:
     *  • fill ratio is high (arena is packed with flags)
     *  • fill ratio is not dangerously low (event isn't almost over)
     * This check is intentionally probabilistic — it is evaluated only at the
     * moment a shower would fire, so the player cannot predict it by counting.
     */
    _arenaIsFull() {
        const total = this._totalFlags;
        if (total <= 0) return false;
        const ratio = this._currentFlags / total;
        return ratio >= SHOWER_MIN_FILL_RATIO;
    }

    /** Returns true when the event is near its end — showers are always blocked. */
    _arenaIsNearEnd() {
        const total = this._totalFlags;
        if (total <= 0) return true;
        const ratio = this._currentFlags / total;
        return ratio < SHOWER_LOW_FILL_RATIO;
    }

    /** Call this from Game._startPlaying() every round */
    notifyPlaying() {
        this._isPlaying           = true;
        this._playingFrames       = 0;
        this._showerState         = "WAITING";
        this._showerBatchLeft     = 0;
        this._asteroids           = [];  // clear any lingering asteroids
        this._impacts             = [];
        this._warningLife         = 0;
        this._framesUntilShower   = this._randDelay(true);
        this._burnEffects         = [];
        this._currentFlags        = 0;
        this._totalFlags          = 0;
    }

    /**
     * Call when entering elimination / Last Standing / Grand Final.
     * Asteroids are fully off for that round (prevents empty-arena softlock).
     */
    setAsteroidsDisabled(disabled) {
        this._asteroidsDisabled = !!disabled;
        if (disabled) {
            this._asteroids       = [];
            this._impacts         = [];
            this._burnEffects     = [];
            this._showerState     = "WAITING";
            this._showerBatchLeft = 0;
            this._warningLife     = 0;
            this.onFlagBurned     = null;
        }
    }

    /** Call when game leaves PLAYING (winner, next-event, etc.) */
    notifyNotPlaying() {
        this._isPlaying   = false;
        this._warningLife = 0;
        this._burnEffects = [];
    }

    /**
     * Random delay before next shower check.
     * Rounds are fast (30-40 s for 249 flags), so delays must be short
     * enough to guarantee multiple showers per round while staying unpredictable.
     * First shower: 4–9 s; subsequent: 5–14 s (wide enough variance to feel random).
     * Even if a delay elapses, the shower only fires if the arena passes the fill check.
     */
    _randDelay(first) {
        if (first) {
            // 4–9 s before the first shower — hits while the arena is still packed
            const base = 4 + Math.random() * 5;
            return (base * 60) | 0;
        }
        // 5–14 s between showers — fast enough for 2-4 showers per round,
        // wide enough that players can't predict the next one by counting
        const base = 5 + Math.random() * 9;
        return (base * 60) | 0;
    }

    // ── build ─────────────────────────────────────────────────────────────────
    build(lw, lh) {
        this._lw = lw; this._lh = lh; this._built = true;
        this._buildStars(lw, lh);
        this._buildNebula(lw, lh);
        this._buildPlanets(lw, lh);
        this._shooters = [];
    }

    _buildStars(lw, lh) {
        this._stars = [];
        // Three parallax layers — denser, but still soft background
        const layers = [
            { density: 2800, rMin: 0.35, rMax: 0.9,  aMin: 0.12, aMax: 0.35, drift: 0.015 }, // far
            { density: 3800, rMin: 0.5,  rMax: 1.3,  aMin: 0.18, aMax: 0.50, drift: 0.035 }, // mid
            { density: 5200, rMin: 0.7,  rMax: 1.8,  aMin: 0.22, aMax: 0.65, drift: 0.06  }, // near
        ];
        for (const layer of layers) {
            const count = Math.round((lw * lh) / layer.density);
            for (let i = 0; i < count; i++) {
                const t = Math.random();
                const r = layer.rMin + t * (layer.rMax - layer.rMin);
                const base = layer.aMin + t * (layer.aMax - layer.aMin);
                this._stars.push({
                    x: Math.random() * lw,
                    y: Math.random() * lh,
                    r,
                    base,
                    alpha: base,
                    phase: Math.random() * Math.PI * 2,
                    speed: 0.008 + Math.random() * 0.018,
                    color: this._starColor(),
                    driftX: (Math.random() - 0.5) * layer.drift,
                    driftY: (Math.random() - 0.5) * layer.drift * 0.6,
                });
            }
        }
    }

    _starColor() {
        const r = Math.random();
        if (r < 0.50) return '#FFFFFF';
        if (r < 0.68) return '#C8DCFF';
        if (r < 0.80) return '#FFE9C8';
        if (r < 0.90) return '#D0B8FF';
        return '#90D8FF';
    }

    _buildNebula(lw, lh) {
        this._nebula = [];
        // Soft galactic dust — very low alpha so it never competes with the arena
        const palette = [
            [70,  40, 160],
            [30,  70, 150],
            [120, 30, 140],
            [20,  90, 130],
            [90,  50, 110],
        ];
        const count = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            const [r, g, b] = palette[i % palette.length];
            this._nebula.push({
                x: 0.05 * lw + Math.random() * 0.90 * lw,
                y: 0.05 * lh + Math.random() * 0.90 * lh,
                rx: lw * (0.20 + Math.random() * 0.28),
                ry: lh * (0.14 + Math.random() * 0.22),
                r, g, b,
                a: 0.018 + Math.random() * 0.022,
                driftX: (Math.random() - 0.5) * 0.08,
                driftY: (Math.random() - 0.5) * 0.05,
            });
        }
    }

    _buildPlanets(lw, lh) {
        this._planets = [];
        // Soft stylized orbs — match game neon/space look, never compete with arena
        // 2–3 only, edge-biased, low alpha
        const kinds = [
            { name: 'warm',  glow: [160, 120, 255], body: [90, 70, 140],  accent: [200, 160, 255] }, // soft violet
            { name: 'cool',  glow: [80, 180, 255],  body: [40, 90, 150],   accent: [140, 210, 255] }, // ice blue
            { name: 'gold',  glow: [255, 190, 120], body: [140, 100, 50],  accent: [255, 220, 170] }, // distant sun-tint
            { name: 'teal',  glow: [80, 220, 200],  body: [30, 110, 100],  accent: [140, 240, 220] },
        ];
        // Shuffle and take 2–3
        for (let i = kinds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
        }
        const count = 2 + (Math.random() < 0.45 ? 1 : 0);
        const picked = kinds.slice(0, count);

        for (let i = 0; i < picked.length; i++) {
            const k = picked[i];
            const side = Math.floor(Math.random() * 4);
            let x, y;
            if (side === 0) { x = Math.random() * lw * 0.28; y = 0.1 * lh + Math.random() * lh * 0.8; }
            else if (side === 1) { x = lw * 0.72 + Math.random() * lw * 0.28; y = 0.1 * lh + Math.random() * lh * 0.8; }
            else if (side === 2) { x = Math.random() * lw; y = Math.random() * lh * 0.22; }
            else { x = Math.random() * lw; y = lh * 0.78 + Math.random() * lh * 0.22; }

            const minDim = Math.min(lw, lh);
            this._planets.push({
                x, y,
                r: minDim * (0.028 + Math.random() * 0.022),
                glow: k.glow,
                body: k.body,
                accent: k.accent,
                alpha: 0.20 + Math.random() * 0.12,  // keep very soft
                driftX: (Math.random() - 0.5) * 0.03,
                driftY: (Math.random() - 0.5) * 0.02,
                phase: Math.random() * Math.PI * 2,
                hasRing: Math.random() < 0.4,
                ringTilt: -0.5 + Math.random() * 0.3,
            });
        }
    }

    // ── Spawn one asteroid aimed through the arena ────────────────────────────
    _spawnAsteroid(lw, lh, arenaX, arenaY) {
        const edge = Math.floor(Math.random()*4);
        let x, y;
        if      (edge===0){ x=Math.random()*lw; y=-40; }
        else if (edge===1){ x=lw+40; y=Math.random()*lh; }
        else if (edge===2){ x=Math.random()*lw; y=lh+40; }
        else              { x=-40; y=Math.random()*lh; }

        // Aim straight through arena with modest spread (±20°)
        const baseAngle = Math.atan2(arenaY-y, arenaX-x);
        const angle     = baseAngle + (Math.random()-0.5)*0.70;

        const speed = 7 + Math.random()*5;   // fast — crosses screen in ~1-1.5 s
        const vx = Math.cos(angle)*speed;
        const vy = Math.sin(angle)*speed;

        const size  = 12 + Math.random()*16;  // 12-28px — chunky rocks
        const spin  = (Math.random()-0.5)*0.10;
        const rot   = Math.random()*Math.PI*2;
        const sides = 6 + Math.floor(Math.random()*4);
        const pts   = [];
        for (let i=0;i<sides;i++){
            const a = (i/sides)*Math.PI*2;
            const j = 0.55+Math.random()*0.45;
            pts.push({ x:Math.cos(a)*size*j, y:Math.sin(a)*size*j*0.5 });
        }
        this._asteroids.push({
            x,y,vx,vy,rot,spin,size,pts,
            trail:[],
            trailLen: Math.round(12+speed*2),
            hitCooldown:0,
            hit:false,
        });
    }

    // ── Start a shower burst ──────────────────────────────────────────────────
    _startShower(lw, lh, arenaX, arenaY) {
        if (this._asteroidsDisabled) return;
        this._showerState         = "ACTIVE";
        this._showerActiveFrames  = 0;
        const count = 8 + Math.floor(Math.random()*7);   // 8-14 asteroids per shower
        this._showerBatchLeft     = count;
        // Spread over 3 s (was 4 s) so the shower feels intense and focused
        this._showerBatchInterval = Math.max(1, Math.floor((3*60)/count));
        this._warningLife         = this._WARNING_DUR;

        // 🔊 Swoosh — deep space whoosh as the shower begins
        try { this.audio?.playAsteroidSwoosh?.(); } catch(e) {}
    }

    // ── Main update ───────────────────────────────────────────────────────────
    update(lw, lh, flagManager, arenaX, arenaY, arenaRadius, Matter, gameState,
           currentFlags = 0, totalFlags = 0) {
        if (this._asteroidsDisabled) {
            this._asteroids = [];
            this._impacts = [];
            this._showerState = 'WAITING';
            this._showerBatchLeft = 0;
            this._warningLife = 0;
            // still allow starfield to run below — fall through without showers
        }

        if (!this._built || lw!==this._lw || lh!==this._lh) this.build(lw,lh);

        this._frame++;

        // Track flag counts so shower eligibility checks can use them
        this._currentFlags = currentFlags;
        this._totalFlags   = totalFlags;

        // Sync playing state from gameState string (fallback if notifyPlaying not called)
        const playing = this._isPlaying && gameState === "PLAYING";

        // Blocked states: event-start flash (COUNTDOWN), transition card (NEXT_EVENT), etc.
        const stateBlocked = BLOCKED_STATES.has(gameState);

        // ── Background motion (always, subtle) ───────────────────────────────────
        // Stars: twinkle + slow drift with wrap
        for (const s of this._stars) {
            s.phase += s.speed;
            s.alpha  = s.base + Math.sin(s.phase) * s.base * 0.45;
            s.x += s.driftX;
            s.y += s.driftY;
            if (s.x < -2) s.x = lw + 2;
            else if (s.x > lw + 2) s.x = -2;
            if (s.y < -2) s.y = lh + 2;
            else if (s.y > lh + 2) s.y = -2;
        }

        // Nebula clouds drift very slowly
        for (const n of this._nebula) {
            n.x += n.driftX;
            n.y += n.driftY;
            if (n.x < -n.rx) n.x = lw + n.rx;
            else if (n.x > lw + n.rx) n.x = -n.rx;
            if (n.y < -n.ry) n.y = lh + n.ry;
            else if (n.y > lh + n.ry) n.y = -n.ry;
        }

        // Planets drift extremely slowly + soft breathing alpha
        for (const p of this._planets) {
            p.x += p.driftX;
            p.y += p.driftY;
            p.phase += 0.004;
            if (p.x < -p.r * 2) p.x = lw + p.r * 2;
            else if (p.x > lw + p.r * 2) p.x = -p.r * 2;
            if (p.y < -p.r * 2) p.y = lh + p.r * 2;
            else if (p.y > lh + p.r * 2) p.y = -p.r * 2;
        }

        // Occasional distant shooting star
        if (Math.random() < 0.008 && this._shooters.length < 2) {
            const fromTop = Math.random() < 0.5;
            this._shooters.push({
                x: Math.random() * lw,
                y: fromTop ? -10 : Math.random() * lh * 0.4,
                vx: 3 + Math.random() * 5,
                vy: 1.5 + Math.random() * 3,
                life: 40 + Math.floor(Math.random() * 30),
                maxLife: 50,
                len: 18 + Math.random() * 28,
            });
            this._shooters[this._shooters.length - 1].maxLife =
                this._shooters[this._shooters.length - 1].life;
        }
        for (let i = this._shooters.length - 1; i >= 0; i--) {
            const s = this._shooters[i];
            s.x += s.vx;
            s.y += s.vy;
            s.life--;
            if (s.life <= 0 || s.x > lw + 40 || s.y > lh + 40) {
                this._shooters.splice(i, 1);
            }
        }

        // Warning countdown
        if (this._warningLife > 0) this._warningLife--;

        // ── Shower state machine (only while PLAYING and not in a blocked state) ──
        if (playing && !stateBlocked) {
            this._playingFrames++;

            if (this._showerState === "WAITING") {
                if (this._playingFrames >= this._framesUntilShower) {
                    // Timer elapsed — check arena eligibility.
                    if (this._arenaIsNearEnd()) {
                        // Very few flags left (< 10%) — skip and reschedule short
                        // so we're primed for the next round start.
                        this._playingFrames     = 0;
                        this._framesUntilShower = this._randDelay(false);
                    } else if (this._arenaIsFull()) {
                        // Arena has >= 35% flags alive — fire the shower!
                        if (!this._asteroidsDisabled) this._startShower(lw, lh, arenaX, arenaY);
                    } else {
                        // Mid-density (10-35%): tail of the round, reschedule
                        // for next round rather than hanging in an indefinite stall.
                        this._playingFrames     = 0;
                        this._framesUntilShower = this._randDelay(false);
                    }
                }
            } else if (this._showerState === "ACTIVE") {
                this._showerActiveFrames++;

                // Spawn asteroids at evenly-spaced intervals
                if (this._showerBatchLeft > 0 &&
                    this._showerActiveFrames % this._showerBatchInterval === 0) {
                    this._spawnAsteroid(lw, lh, arenaX, arenaY);
                    this._showerBatchLeft--;
                }

                // Shower done when all spawned and all cleared screen
                if (this._showerBatchLeft <= 0 && this._asteroids.length === 0) {
                    this._showerState       = "WAITING";
                    this._playingFrames     = 0;  // reset so next interval is fresh
                    this._framesUntilShower = this._randDelay(false);
                }
            }
        } else if (!playing) {
            // Not playing — keep asteroids moving until they exit, don't spawn new
        }
        // stateBlocked + playing: timer pauses (playingFrames doesn't tick) so
        // showers don't fire during event-start flash or transition cards

        // ── Move asteroids (always update existing ones so they exit cleanly) ─
        const flags    = flagManager?.flags ?? [];
        const toRemove = [];

        for (let ai=0; ai<this._asteroids.length; ai++) {
            const a = this._asteroids[ai];

            a.trail.push({x:a.x, y:a.y});
            if (a.trail.length > a.trailLen) a.trail.shift();

            a.x += a.vx;
            a.y += a.vy;
            a.rot += a.spin;
            if (a.hitCooldown>0) a.hitCooldown--;

            // Remove once fully off-screen (generous margin)
            const margin = 100;
            if (a.x<-margin || a.x>lw+margin || a.y<-margin || a.y>lh+margin) {
                toRemove.push(ai);
                continue;
            }

            // ── NO arena wall collision — asteroids fly straight through ──────
            // (Removed entirely. Asteroids are unstoppable cosmic forces.)

            // ── Flag collision — knock flag OUT of arena ──────────────────────
            if (a.hitCooldown===0 && Matter) {
                for (const flag of flags) {
                    const bp = flag.body.position;
                    const dx = a.x - bp.x;
                    const dy = a.y - bp.y;
                    const hitR = a.size*0.9 + (flag.width+flag.height)*0.30;

                    if (dx*dx+dy*dy < hitR*hitR) {
                        // ── BURN: immediately eliminate the flag ──────────────
                        // Spawn burn visual at the flag's position
                        this._spawnBurnEffect(bp.x, bp.y);
                        // Also spawn asteroid impact at collision point
                        this._spawnImpact(a.x, a.y);

                        // 🔊 Impact crack — meteor strike sound
                        try { this.audio?.playAsteroidHit?.(); } catch(e) {}

                        // Notify Game.js to remove this flag from physics + lists
                        if (this.onFlagBurned) {
                            this.onFlagBurned(flag, bp.x, bp.y);
                        }

                        // Asteroid continues straight — no deflection
                        a.hitCooldown = 45;
                        a.hit = true;
                        // don't break — one asteroid can burn multiple flags if aligned
                    }
                }
            }
        }

        for (let i=toRemove.length-1; i>=0; i--)
            this._asteroids.splice(toRemove[i],1);

        // Burn effects update — fire particles where flags were incinerated
        for (let i = this._burnEffects.length - 1; i >= 0; i--) {
            const b = this._burnEffects[i];
            b.life--;
            for (const p of b.particles) {
                p.x  += p.vx;
                p.y  += p.vy;
                p.vy += 0.07;  // slight gravity pulls sparks down
                p.vx *= 0.93;
                p.vy *= 0.93;
                p.a  *= 0.91;
                p.r  *= 0.96;
            }
            if (b.life <= 0) this._burnEffects.splice(i, 1);
        }

        // Impact sparks update
        for (let i=this._impacts.length-1; i>=0; i--) {
            const imp = this._impacts[i];
            imp.life--;
            if (imp.ring){ if (imp.life<=0) this._impacts.splice(i,1); continue; }
            for (const p of imp.sparks){
                p.x+=p.vx; p.y+=p.vy;
                p.vy+=0.04; // slight gravity
                p.vx*=0.89; p.vy*=0.89;
                p.a*=0.91;
                p.r*=0.97;
            }
            if (imp.life<=0) this._impacts.splice(i,1);
        }
    }

    // ── Burn effect — dramatic flag explosion: orange fireball + debris ──────
    _spawnBurnEffect(x, y) {
        // Pure orange palette: white-orange core → vivid orange → deep red-orange
        const colours = [
            '255,240,160', '255,200,60', '255,160,20',
            '255,110,5',   '230,70,0',   '200,40,0',
        ];
        const count   = 45 + Math.floor(Math.random() * 20);
        const particles = [];
        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 1.5 + Math.random() * 7.0;
            // Choose color biased toward bright orange
            const ci = Math.floor(Math.random() * colours.length);
            particles.push({
                x, y,
                vx: Math.cos(ang) * spd,
                // bias upward so flames rise naturally
                vy: Math.sin(ang) * spd - 2.5 - Math.random() * 3.5,
                a : 1.0,
                r : 3.5 + Math.random() * 6.0,
                color: colours[ci],
            });
        }
        // Extra large core flash particles
        for (let i = 0; i < 8; i++) {
            const ang = Math.random() * Math.PI * 2;
            particles.push({
                x, y,
                vx: Math.cos(ang) * (0.5 + Math.random() * 2.0),
                vy: Math.sin(ang) * (0.5 + Math.random() * 2.0) - 1.0,
                a : 1.0,
                r : 9 + Math.random() * 7,
                color: '255,220,100',
            });
        }
        this._burnEffects.push({ x, y, particles, life: 130, maxLife: 130 });
    }

    _spawnImpact(x, y) {
        // Pure orange/amber sparks radiating from impact
        const colours = ['255,210,60','255,150,20','255,240,180','255,90,5','230,60,0'];
        // Primary large sparks
        const count   = 22 + Math.floor(Math.random() * 12);
        const sparks  = [];
        for (let i=0;i<count;i++){
            const ang = Math.random()*Math.PI*2;
            const spd = 3.5 + Math.random() * 8.5;
            sparks.push({
                x, y,
                vx: Math.cos(ang)*spd,
                vy: Math.sin(ang)*spd,
                a:  1.0,
                color: colours[Math.floor(Math.random()*colours.length)],
                r:  1.8 + Math.random() * 4.5,
            });
        }
        this._impacts.push({ sparks, life: 70 });
        // Expanding shock ring — double ring for drama
        this._impacts.push({ ring:{x, y, maxR:55, color:'255,150,20'}, life:22 });
        this._impacts.push({ ring:{x, y, maxR:30, color:'255,230,80'}, life:14 });
    }

    // ── Draw (background only — stars, nebula, planets) ──────────────────────
    // Call this BEFORE flags. Then call drawForeground() AFTER flags
    // so asteroids always render in front of flags.
    draw(ctx, lw, lh) {
        if (!this._built) return;
        this._drawSpaceGradient(ctx, lw, lh);
        this._drawNebula(ctx);
        this._drawPlanets(ctx);
        this._drawStars(ctx);
        this._drawShooters(ctx);
    }

    // ── Foreground draw (asteroids over flags) ────────────────────────────────
    drawForeground(ctx) {
        if (!this._built) return;
        this._drawAsteroids(ctx);
        this._drawImpacts(ctx);
        this._drawBurnEffects(ctx);
    }

    _drawSpaceGradient(ctx, lw, lh) {
        // Subtle radial vignette — deep space feel without washing the arena
        const cx = lw * 0.5, cy = lh * 0.45;
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(lw, lh) * 0.75);
        grd.addColorStop(0,   'rgba(12, 8, 28, 0)');
        grd.addColorStop(0.55,'rgba(6, 4, 18, 0.25)');
        grd.addColorStop(1,   'rgba(2, 1, 10, 0.55)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, lw, lh);

        // Faint galactic band (diagonal soft glow)
        ctx.save();
        ctx.translate(lw * 0.5, lh * 0.5);
        ctx.rotate(-0.35);
        const band = ctx.createLinearGradient(0, -lh * 0.08, 0, lh * 0.08);
        band.addColorStop(0,   'rgba(80, 50, 140, 0)');
        band.addColorStop(0.5, 'rgba(90, 60, 160, 0.045)');
        band.addColorStop(1,   'rgba(80, 50, 140, 0)');
        ctx.fillStyle = band;
        ctx.fillRect(-lw, -lh * 0.12, lw * 2, lh * 0.24);
        ctx.restore();
    }

    _drawPlanets(ctx) {
        ctx.save();
        for (const p of this._planets) {
            const breath = 0.94 + 0.06 * Math.sin(p.phase);
            const a = p.alpha * breath;
            const [gr, gg, gb] = p.glow;
            const [br, bg, bb] = p.body;
            const [ar, ag, ab] = p.accent;

            // Outer haze — very soft bloom
            const haze = ctx.createRadialGradient(p.x, p.y, p.r * 0.2, p.x, p.y, p.r * 2.6);
            haze.addColorStop(0,   `rgba(${gr},${gg},${gb},${a * 0.22})`);
            haze.addColorStop(0.45,`rgba(${gr},${gg},${gb},${a * 0.08})`);
            haze.addColorStop(1,   `rgba(${gr},${gg},${gb},0)`);
            ctx.fillStyle = haze;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * 2.6, 0, Math.PI * 2);
            ctx.fill();

            // Ring behind body (if any)
            if (p.hasRing) {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.ringTilt);
                ctx.beginPath();
                ctx.ellipse(0, 0, p.r * 1.75, p.r * 0.32, 0, Math.PI, Math.PI * 2);
                ctx.strokeStyle = `rgba(${ar},${ag},${ab},${a * 0.28})`;
                ctx.lineWidth = Math.max(1, p.r * 0.1);
                ctx.stroke();
                ctx.restore();
            }

            // Sphere — simple clean gradient (game-style, not photo-real)
            const sphere = ctx.createRadialGradient(
                p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.08,
                p.x, p.y, p.r
            );
            sphere.addColorStop(0,   `rgba(${ar},${ag},${ab},${a * 0.95})`);
            sphere.addColorStop(0.45,`rgba(${gr},${gg},${gb},${a * 0.75})`);
            sphere.addColorStop(1,   `rgba(${br},${bg},${bb},${a * 0.85})`);
            ctx.fillStyle = sphere;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();

            // Tiny specular highlight
            ctx.fillStyle = `rgba(255,255,255,${a * 0.22})`;
            ctx.beginPath();
            ctx.arc(p.x - p.r * 0.28, p.y - p.r * 0.28, p.r * 0.18, 0, Math.PI * 2);
            ctx.fill();

            // Ring in front
            if (p.hasRing) {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.ringTilt);
                ctx.beginPath();
                ctx.ellipse(0, 0, p.r * 1.75, p.r * 0.32, 0, 0, Math.PI);
                ctx.strokeStyle = `rgba(${ar},${ag},${ab},${a * 0.32})`;
                ctx.lineWidth = Math.max(1, p.r * 0.1);
                ctx.stroke();
                ctx.restore();
            }
        }
        ctx.restore();
    }

    _drawShooters(ctx) {
        if (!this._shooters.length) return;
        ctx.save();
        ctx.lineCap = 'round';
        for (const s of this._shooters) {
            const t = s.life / s.maxLife;
            const ang = Math.atan2(s.vy, s.vx);
            const tx = s.x - Math.cos(ang) * s.len;
            const ty = s.y - Math.sin(ang) * s.len;
            const grd = ctx.createLinearGradient(tx, ty, s.x, s.y);
            grd.addColorStop(0, 'rgba(200,220,255,0)');
            grd.addColorStop(0.6, `rgba(220,235,255,${0.25 * t})`);
            grd.addColorStop(1, `rgba(255,255,255,${0.55 * t})`);
            ctx.strokeStyle = grd;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(s.x, s.y);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ── Warning banner — only during shower, only if PLAYING ─────────────────
    drawWarning(ctx, lw, lh) {
        if (this._warningLife<=0) return;
        if (!this._isPlaying) return;

        const t       = this._warningLife/this._WARNING_DUR;
        const flashOn = Math.floor(this._frame/6)%2===0;
        if (!flashOn) return;

        let alpha;
        if (t > 0.85)      alpha = (1-t)/0.15;
        else if (t < 0.18) alpha = t/0.18;
        else               alpha = 1;
        alpha = Math.max(0, Math.min(1, alpha));

        const cx    = lw/2;
        const cy    = lh/2;
        const fsize = Math.max(16, Math.min(lw*0.062, 40));
        const text  = '☄️  ASTEROID SHOWER!';

        ctx.save();
        ctx.font = gf(900, fsize);
        const tw   = ctx.measureText(text).width;
        const pad  = fsize*0.55;
        const boxW = tw+pad*2.4;
        const boxH = fsize*1.7;
        const boxX = cx-boxW/2;
        const boxY = cy-boxH/2;
        const br   = boxH*0.5;

        ctx.globalAlpha = alpha*0.28;
        ctx.shadowColor = '#FF5500';
        ctx.shadowBlur  = 34;
        ctx.fillStyle   = 'rgba(255,70,0,0.14)';
        _pill(ctx,boxX-14,boxY-14,boxW+28,boxH+28,br+12); ctx.fill();

        ctx.globalAlpha = alpha*0.93;
        ctx.shadowBlur  = 16;
        ctx.shadowColor = '#FF3300';
        const bg = ctx.createLinearGradient(boxX,boxY,boxX,boxY+boxH);
        bg.addColorStop(0,  'rgba(150,25,0,0.94)');
        bg.addColorStop(0.5,'rgba(215,55,0,0.97)');
        bg.addColorStop(1,  'rgba(110,18,0,0.94)');
        ctx.fillStyle = bg;
        _pill(ctx,boxX,boxY,boxW,boxH,br); ctx.fill();

        ctx.strokeStyle='rgba(255,150,40,0.92)';
        ctx.lineWidth=2.0;
        ctx.shadowBlur=8; ctx.shadowColor='#FFAA30';
        _pill(ctx,boxX,boxY,boxW,boxH,br); ctx.stroke();

        ctx.globalAlpha=alpha;
        ctx.shadowBlur=12; ctx.shadowColor='#FFD700';
        ctx.fillStyle='#FFE980';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(text,cx,cy);
        ctx.restore();
    }

    // ── Internal renderers ────────────────────────────────────────────────────
    _drawNebula(ctx) {
        ctx.save();
        for (const n of this._nebula) {
            const grd=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,Math.max(n.rx,n.ry));
            grd.addColorStop(0,  `rgba(${n.r},${n.g},${n.b},${n.a})`);
            grd.addColorStop(0.5,`rgba(${n.r},${n.g},${n.b},${n.a*0.4})`);
            grd.addColorStop(1,  `rgba(${n.r},${n.g},${n.b},0)`);
            ctx.save();
            ctx.translate(n.x,n.y);
            ctx.scale(n.rx/Math.max(n.rx,n.ry),n.ry/Math.max(n.rx,n.ry));
            ctx.translate(-n.x,-n.y);
            ctx.fillStyle=grd;
            ctx.beginPath(); ctx.arc(n.x,n.y,Math.max(n.rx,n.ry),0,Math.PI*2); ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    _drawStars(ctx) {
        ctx.save();
        for (const s of this._stars) {
            ctx.globalAlpha=Math.max(0,Math.min(1,s.alpha));
            ctx.fillStyle=s.color;
            ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha=1; ctx.restore();
    }

    _drawAsteroids(ctx) {
        ctx.save();
        for (const a of this._asteroids) {
            // Fire trail — vivid orange/amber, fully orange-themed
            if (a.trail.length>=2) {
                ctx.save();
                const tLen=a.trail.length;
                for (let i=1;i<tLen;i++){
                    const t=i/tLen;
                    const p0=a.trail[i-1], p1=a.trail[i];
                    ctx.beginPath(); ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y);
                    // Pure orange trail: bright orange-white core fading to deep orange-red
                    if (t > 0.75) {
                        ctx.strokeStyle=`rgba(255,200,50,${t*0.90})`;  // bright orange-amber at tip
                    } else if (t > 0.45) {
                        ctx.strokeStyle=`rgba(255,130,10,${t*0.82})`;  // vivid orange mid
                    } else {
                        ctx.strokeStyle=`rgba(220,60,0,${t*0.65})`;    // deep orange-red tail
                    }
                    ctx.lineWidth=a.size*0.38*t;
                    ctx.lineCap='round';
                    ctx.shadowColor='rgba(255,120,0,0.55)';
                    ctx.shadowBlur=a.size*0.25*t;
                    ctx.stroke();
                }
                ctx.shadowBlur=0;
                ctx.restore();
            }

            // Rock body
            ctx.save();
            ctx.translate(a.x,a.y); ctx.rotate(a.rot);

            ctx.beginPath();
            ctx.moveTo(a.pts[0].x,a.pts[0].y);
            for (let i=1;i<a.pts.length;i++) ctx.lineTo(a.pts[i].x,a.pts[i].y);
            ctx.closePath();

            // Glowing hot rock — vivid orange lava-core
            const grad=ctx.createRadialGradient(-a.size*0.2,-a.size*0.15,0,0,0,a.size);
            grad.addColorStop(0,  'rgba(255,240,180,1.00)');  // white-orange hot core
            grad.addColorStop(0.2,'rgba(255,180,40,0.98)');   // bright orange
            grad.addColorStop(0.5,'rgba(220,80,5,0.95)');     // vivid orange-red
            grad.addColorStop(0.8,'rgba(100,30,5,0.92)');     // dark orange-brown
            grad.addColorStop(1,  'rgba(30,10,2,0.88)');
            ctx.fillStyle=grad; ctx.fill();

            // Outer orange glow halo
            ctx.shadowColor='rgba(255,120,0,1.0)';
            ctx.shadowBlur=a.size*1.1;
            ctx.strokeStyle='rgba(255,160,20,0.92)';
            ctx.lineWidth=1.8; ctx.stroke();
            ctx.shadowBlur=0;

            // Inner highlight streak
            ctx.save();
            ctx.globalAlpha=0.55;
            ctx.strokeStyle='rgba(255,230,120,0.80)';
            ctx.lineWidth=1.0;
            ctx.beginPath();
            ctx.moveTo(-a.size*0.35,-a.size*0.18);
            ctx.quadraticCurveTo(-a.size*0.1,-a.size*0.10,a.size*0.15,-a.size*0.05);
            ctx.stroke();
            ctx.restore();

            // Craters
            const cr=a.size*0.12;
            ctx.fillStyle='rgba(15,8,2,0.65)';
            ctx.beginPath(); ctx.arc(-a.size*0.18,-a.size*0.06,cr,0,Math.PI*2); ctx.fill();
            if (a.pts.length>=8){
                ctx.beginPath(); ctx.arc(a.size*0.20,a.size*0.05,cr*0.7,0,Math.PI*2); ctx.fill();
            }
            ctx.restore();
        }
        ctx.restore();
    }

    _drawBurnEffects(ctx) {
        if (this._burnEffects.length === 0) return;
        ctx.save();
        for (const b of this._burnEffects) {
            for (const p of b.particles) {
                if (p.r < 0.3 || p.a < 0.02) continue;
                ctx.globalAlpha = Math.max(0, Math.min(1, p.a));
                ctx.shadowColor = `rgba(${p.color},0.90)`;
                ctx.shadowBlur  = p.r > 6 ? 14 : 8;
                ctx.fillStyle   = `rgba(${p.color},1)`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(0.3, p.r), 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur  = 0;
        ctx.restore();
    }

    _drawImpacts(ctx) {
        ctx.save();
        for (const imp of this._impacts) {
            if (imp.ring) {
                const maxLife = imp.ring.maxR === 55 ? 22 : 14;
                const p = 1 - imp.life / maxLife;
                const rr = 4 + p * imp.ring.maxR;
                const ra = (1 - p) * 0.90;
                const col = imp.ring.color || '255,180,40';
                ctx.globalAlpha = Math.max(0, ra);
                ctx.strokeStyle = `rgba(${col},1)`;
                ctx.lineWidth = (3.5 * (1 - p) + 0.5);
                ctx.shadowBlur = 18; ctx.shadowColor = `rgba(${col},0.85)`;
                ctx.beginPath(); ctx.arc(imp.ring.x, imp.ring.y, rr, 0, Math.PI*2); ctx.stroke();
                ctx.shadowBlur = 0;
                continue;
            }
            const lifeRatio = imp.life / 70;
            for (const p of imp.sparks) {
                if (p.a < 0.02 || p.r < 0.3) continue;
                ctx.globalAlpha = Math.max(0, p.a);
                ctx.fillStyle = `rgba(${p.color},1)`;
                ctx.shadowBlur = 8; ctx.shadowColor = `rgba(${p.color},0.85)`;
                ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.3, p.r), 0, Math.PI*2); ctx.fill();
            }
        }
        ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.restore();
    }
}

function _pill(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
    ctx.quadraticCurveTo(x+w,y,    x+w,y+r);
    ctx.lineTo(x+w,y+h-r);
    ctx.quadraticCurveTo(x+w,y+h,  x+w-r,y+h);
    ctx.lineTo(x+r,y+h);
    ctx.quadraticCurveTo(x,y+h,    x,y+h-r);
    ctx.lineTo(x,y+r);
    ctx.quadraticCurveTo(x,y,      x+r,y);
    ctx.closePath();
}
