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
        this._asteroids = [];
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
    }

    _buildStars(lw, lh) {
        this._stars = [];
        const count = Math.round((lw * lh) / 4200);
        for (let i = 0; i < count; i++) {
            const sz = Math.random();
            this._stars.push({
                x: Math.random()*lw, y: Math.random()*lh,
                r: 0.4+sz*1.1, base: 0.18+sz*0.55, alpha: 0,
                phase: Math.random()*Math.PI*2,
                speed: 0.012+Math.random()*0.022,
                color: this._starColor(),
            });
        }
        for (const s of this._stars)
            s.alpha = s.base + Math.sin(s.phase)*s.base*0.45;
    }

    _starColor() {
        const r = Math.random();
        if (r < 0.55) return '#FFFFFF';
        if (r < 0.72) return '#B8D4FF';
        if (r < 0.84) return '#FFE8C0';
        if (r < 0.92) return '#C8B0FF';
        return '#80CFFF';
    }

    _buildNebula(lw, lh) {
        this._nebula = [];
        const palette = [[100,60,200],[40,100,200],[160,40,180],[20,80,160]];
        const count   = 3 + Math.floor(Math.random()*2);
        for (let i = 0; i < count; i++) {
            const [r,g,b] = palette[i%palette.length];
            this._nebula.push({
                x: 0.15*lw+Math.random()*0.70*lw,
                y: 0.15*lh+Math.random()*0.70*lh,
                rx: lw*(0.18+Math.random()*0.22),
                ry: lh*(0.14+Math.random()*0.18),
                r,g,b, a: 0.028+Math.random()*0.030,
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
        if (!this._built || lw!==this._lw || lh!==this._lh) this.build(lw,lh);

        this._frame++;

        // Track flag counts so shower eligibility checks can use them
        this._currentFlags = currentFlags;
        this._totalFlags   = totalFlags;

        // Sync playing state from gameState string (fallback if notifyPlaying not called)
        const playing = this._isPlaying && gameState === "PLAYING";

        // Blocked states: event-start flash (COUNTDOWN), transition card (NEXT_EVENT), etc.
        const stateBlocked = BLOCKED_STATES.has(gameState);

        // Twinkle stars always
        for (const s of this._stars){
            s.phase += s.speed;
            s.alpha  = s.base + Math.sin(s.phase)*s.base*0.45;
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
                        this._startShower(lw, lh, arenaX, arenaY);
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
                p.vx*=0.87; p.vy*=0.87;
                p.a*=0.87;
            }
            if (imp.life<=0) this._impacts.splice(i,1);
        }
    }

    // ── Burn effect — fire & ember particles at flag position ───────────────
    _spawnBurnEffect(x, y) {
        const colours = ['255,90,10', '255,160,20', '255,220,80', '220,50,0', '255,40,0'];
        const count   = 28 + Math.floor(Math.random() * 12);
        const particles = [];
        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 1.2 + Math.random() * 4.5;
            particles.push({
                x, y,
                vx: Math.cos(ang) * spd,
                // bias upward so flames rise
                vy: Math.sin(ang) * spd - 1.8 - Math.random() * 2.0,
                a : 1.0,
                r : 2.5 + Math.random() * 4.5,
                color: colours[Math.floor(Math.random() * colours.length)],
            });
        }
        this._burnEffects.push({ x, y, particles, life: 100, maxLife: 100 });
    }

    _spawnImpact(x, y) {
        const colours = ['255,200,80','255,130,20','255,255,160','255,80,0'];
        const count   = 14+Math.floor(Math.random()*10);
        const sparks  = [];
        for (let i=0;i<count;i++){
            const ang = Math.random()*Math.PI*2;
            const spd = 2.5+Math.random()*5.5;
            sparks.push({
                x,y,
                vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd,
                a:1.0,
                color:colours[Math.floor(Math.random()*colours.length)],
                r:1.2+Math.random()*3.0,
            });
        }
        this._impacts.push({ sparks, life:50 });
        this._impacts.push({ ring:{x,y,maxR:40}, life:18 });
    }

    // ── Draw ──────────────────────────────────────────────────────────────────
    draw(ctx, lw, lh) {
        if (!this._built) return;
        this._drawNebula(ctx);
        this._drawStars(ctx);
        this._drawAsteroids(ctx);
        this._drawImpacts(ctx);
        this._drawBurnEffects(ctx);
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
            // Fire trail — always orange/red since these are lethal rocks
            if (a.trail.length>=2) {
                ctx.save();
                const tLen=a.trail.length;
                for (let i=1;i<tLen;i++){
                    const t=i/tLen;
                    const p0=a.trail[i-1], p1=a.trail[i];
                    ctx.beginPath(); ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y);
                    // Inner core: bright yellow-white; outer: deep orange
                    ctx.strokeStyle=t>0.6
                        ? `rgba(255,220,80,${t*0.75})`
                        : `rgba(255,100,10,${t*0.50})`;
                    ctx.lineWidth=a.size*0.30*t;
                    ctx.lineCap='round';
                    ctx.stroke();
                }
                ctx.restore();
            }

            // Rock body
            ctx.save();
            ctx.translate(a.x,a.y); ctx.rotate(a.rot);

            ctx.beginPath();
            ctx.moveTo(a.pts[0].x,a.pts[0].y);
            for (let i=1;i<a.pts.length;i++) ctx.lineTo(a.pts[i].x,a.pts[i].y);
            ctx.closePath();

            // Glowing hot rock
            const grad=ctx.createRadialGradient(-a.size*0.2,-a.size*0.15,0,0,0,a.size);
            grad.addColorStop(0,  'rgba(255,230,160,0.98)');
            grad.addColorStop(0.3,'rgba(180,100,30,0.95)');
            grad.addColorStop(0.7,'rgba(90,50,20,0.92)');
            grad.addColorStop(1,  'rgba(30,15,5,0.88)');
            ctx.fillStyle=grad; ctx.fill();

            // Glowing rim
            ctx.shadowColor='rgba(255,140,20,0.9)';
            ctx.shadowBlur=a.size*0.6;
            ctx.strokeStyle='rgba(255,180,50,0.80)';
            ctx.lineWidth=1.2; ctx.stroke();
            ctx.shadowBlur=0;

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
                ctx.shadowColor = `rgba(${p.color},0.85)`;
                ctx.shadowBlur  = 7;
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
                const p=1-imp.life/18;
                const rr=4+p*imp.ring.maxR;
                const ra=(1-p)*0.80;
                ctx.globalAlpha=Math.max(0,ra);
                ctx.strokeStyle='rgba(255,180,40,1)';
                ctx.lineWidth=3.5*(1-p)+0.5;
                ctx.shadowBlur=12; ctx.shadowColor='#FF7700';
                ctx.beginPath(); ctx.arc(imp.ring.x,imp.ring.y,rr,0,Math.PI*2); ctx.stroke();
                ctx.shadowBlur=0;
                continue;
            }
            for (const p of imp.sparks) {
                ctx.globalAlpha=Math.max(0,p.a);
                ctx.fillStyle=`rgba(${p.color},1)`;
                ctx.shadowBlur=6; ctx.shadowColor=`rgba(${p.color},0.9)`;
                ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
            }
        }
        ctx.globalAlpha=1; ctx.shadowBlur=0; ctx.restore();
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
