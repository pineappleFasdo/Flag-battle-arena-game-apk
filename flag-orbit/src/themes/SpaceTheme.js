/**
 * SpaceTheme.js
 * Self-contained visual layer for the Space theme.
 * Handles:
 *   - Static + twinkling star field (drawn once per resize, updated softly)
 *   - Nebula wash (subtle, non-prominent)
 *   - Asteroid shower (pure canvas draw — zero physics, zero game-logic touch)
 *
 * Used by Game.js via two calls only:
 *   spaceTheme.update(lw, lh, flagManager, arenaX, arenaY, arenaRadius)
 *   spaceTheme.draw(ctx, lw, lh)
 *
 * Asteroids are purely visual. They streak across the canvas and produce a
 * brief impact flash when they geometrically overlap a flag position.
 * No Matter.js bodies are created or modified.
 */
export default class SpaceTheme {

    constructor() {
        this._stars        = [];
        this._nebula       = [];
        this._asteroids    = [];
        this._impacts      = [];       // brief flash sparks on "hit"
        this._frame        = 0;
        this._lw           = 0;
        this._lh           = 0;
        this._spawnTimer   = 0;
        this._SPAWN_EVERY  = 90;       // frames between asteroid spawns (~1.5 s)
        this._MAX_ASTEROIDS = 6;
        this._built        = false;
    }

    // ── Called once (or on resize) to rebuild the static star field ──────────
    build(lw, lh) {
        this._lw = lw;
        this._lh = lh;
        this._built = true;
        this._buildStars(lw, lh);
        this._buildNebula(lw, lh);
    }

    _buildStars(lw, lh) {
        this._stars = [];
        const count = Math.round((lw * lh) / 4200);  // density scales with screen
        for (let i = 0; i < count; i++) {
            const size = Math.random();  // 0-1, mapped to visual size below
            this._stars.push({
                x      : Math.random() * lw,
                y      : Math.random() * lh,
                r      : 0.4 + size * 1.1,
                base   : 0.18 + size * 0.55,   // base alpha
                alpha  : 0,
                phase  : Math.random() * Math.PI * 2,
                speed  : 0.012 + Math.random() * 0.022,
                color  : this._starColor(),
            });
        }
        // Initialise alpha from phase so first frame isn't a flash-in
        for (const s of this._stars) s.alpha = s.base + Math.sin(s.phase) * s.base * 0.45;
    }

    _starColor() {
        const r = Math.random();
        if (r < 0.55) return '#FFFFFF';
        if (r < 0.72) return '#B8D4FF';   // cool blue-white
        if (r < 0.84) return '#FFE8C0';   // warm yellow-white
        if (r < 0.92) return '#C8B0FF';   // soft purple
        return '#80CFFF';                  // icy blue
    }

    _buildNebula(lw, lh) {
        this._nebula = [];
        // 3–4 large soft blobs, kept subtle (low alpha)
        const count = 3 + Math.floor(Math.random() * 2);
        const palette = [
            [100, 60, 200],
            [40, 100, 200],
            [160, 40, 180],
            [20, 80, 160],
        ];
        for (let i = 0; i < count; i++) {
            const [r, g, b] = palette[i % palette.length];
            this._nebula.push({
                x  : 0.15 * lw + Math.random() * 0.70 * lw,
                y  : 0.15 * lh + Math.random() * 0.70 * lh,
                rx : lw * (0.18 + Math.random() * 0.22),
                ry : lh * (0.14 + Math.random() * 0.18),
                r, g, b,
                a  : 0.028 + Math.random() * 0.030,
            });
        }
    }

    // ── Asteroid spawner ──────────────────────────────────────────────────────
    _spawnAsteroid(lw, lh) {
        // Pick an edge to enter from (0=top, 1=right, 2=bottom, 3=left)
        const edge = Math.floor(Math.random() * 4);
        let x, y, vx, vy;
        const speed = 2.8 + Math.random() * 3.2;
        const spread = 0.55;   // cone width around opposite side

        if (edge === 0) {          // from top
            x  = Math.random() * lw;
            y  = -30;
            vx = (Math.random() - 0.5) * speed * spread;
            vy = speed * (0.6 + Math.random() * 0.4);
        } else if (edge === 1) {   // from right
            x  = lw + 30;
            y  = Math.random() * lh;
            vx = -speed * (0.6 + Math.random() * 0.4);
            vy = (Math.random() - 0.5) * speed * spread;
        } else if (edge === 2) {   // from bottom
            x  = Math.random() * lw;
            y  = lh + 30;
            vx = (Math.random() - 0.5) * speed * spread;
            vy = -speed * (0.6 + Math.random() * 0.4);
        } else {                   // from left
            x  = -30;
            y  = Math.random() * lh;
            vx = speed * (0.6 + Math.random() * 0.4);
            vy = (Math.random() - 0.5) * speed * spread;
        }

        const angle  = Math.atan2(vy, vx);
        const size   = 7 + Math.random() * 11;    // flat irregular rock, 7-18 px long
        const spin   = (Math.random() - 0.5) * 0.06;
        const rot    = Math.random() * Math.PI * 2;

        // Pre-generate polygon points for the rock silhouette (flat, irregular)
        const sides  = 6 + Math.floor(Math.random() * 4);   // 6-9 sides
        const pts    = [];
        for (let i = 0; i < sides; i++) {
            const a   = (i / sides) * Math.PI * 2;
            const jit = 0.55 + Math.random() * 0.45;
            // Flatten along travel axis: squish Y by 0.45 so it looks like
            // a disc/flat rock zooming through space rather than a sphere
            pts.push({
                x: Math.cos(a) * size * jit,
                y: Math.sin(a) * size * jit * 0.45,
            });
        }

        // Trail length: proportional to speed for a streaking look
        const trailLen = Math.round(8 + speed * 3);

        this._asteroids.push({ x, y, vx, vy, rot, spin, size, pts, trailLen,
            trail: [],   // will accumulate position history
            hit  : false,
        });
    }

    // ── Update ────────────────────────────────────────────────────────────────
    update(lw, lh, flagManager, arenaX, arenaY, arenaRadius) {
        if (!this._built || lw !== this._lw || lh !== this._lh) {
            this.build(lw, lh);
        }

        this._frame++;

        // Twinkle stars
        for (const s of this._stars) {
            s.phase += s.speed;
            s.alpha  = s.base + Math.sin(s.phase) * s.base * 0.45;
        }

        // Spawn new asteroids
        this._spawnTimer++;
        if (this._spawnTimer >= this._SPAWN_EVERY &&
            this._asteroids.length < this._MAX_ASTEROIDS) {
            this._spawnTimer = 0;
            this._spawnAsteroid(lw, lh);
        }

        // Move asteroids + collision with flags (visual only)
        const flags = flagManager?.flags ?? [];
        const toRemove = [];

        for (let ai = 0; ai < this._asteroids.length; ai++) {
            const a = this._asteroids[ai];

            // Save trail
            a.trail.push({ x: a.x, y: a.y });
            if (a.trail.length > a.trailLen) a.trail.shift();

            a.x   += a.vx;
            a.y   += a.vy;
            a.rot += a.spin;

            // Out of bounds → remove
            const margin = 60;
            if (a.x < -margin || a.x > lw + margin ||
                a.y < -margin || a.y > lh + margin) {
                toRemove.push(ai);
                continue;
            }

            // Visual-only "hit" detection: asteroid centre within flag bounding radius
            if (!a.hit) {
                for (const flag of flags) {
                    const bp  = flag.body.position;
                    const dx  = a.x - bp.x;
                    const dy  = a.y - bp.y;
                    const r   = (flag.width + flag.height) * 0.28;
                    if (dx * dx + dy * dy < r * r) {
                        a.hit = true;
                        this._spawnImpact(a.x, a.y);
                        break;
                    }
                }
            }
        }

        // Remove dead asteroids (reverse to preserve indices)
        for (let i = toRemove.length - 1; i >= 0; i--) {
            this._asteroids.splice(toRemove[i], 1);
        }

        // Update impact sparks
        for (let i = this._impacts.length - 1; i >= 0; i--) {
            const imp = this._impacts[i];
            imp.life--;
            for (const p of imp.sparks) {
                p.x  += p.vx;
                p.y  += p.vy;
                p.vx *= 0.88;
                p.vy *= 0.88;
                p.a  *= 0.88;
            }
            if (imp.life <= 0) this._impacts.splice(i, 1);
        }
    }

    _spawnImpact(x, y) {
        const count  = 6 + Math.floor(Math.random() * 6);
        const sparks = [];
        for (let i = 0; i < count; i++) {
            const ang   = Math.random() * Math.PI * 2;
            const speed = 1.2 + Math.random() * 2.8;
            sparks.push({
                x, y,
                vx: Math.cos(ang) * speed,
                vy: Math.sin(ang) * speed,
                a : 0.85,
            });
        }
        this._impacts.push({ sparks, life: 28 });
    }

    // ── Draw ──────────────────────────────────────────────────────────────────
    draw(ctx, lw, lh) {
        if (!this._built) return;

        // 1. Nebula wash — very subtle radial blobs
        this._drawNebula(ctx);

        // 2. Stars
        this._drawStars(ctx);

        // 3. Asteroids + trails
        this._drawAsteroids(ctx);

        // 4. Impact sparks
        this._drawImpacts(ctx);
    }

    _drawNebula(ctx) {
        ctx.save();
        for (const n of this._nebula) {
            const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y,
                Math.max(n.rx, n.ry));
            grd.addColorStop(0,   `rgba(${n.r},${n.g},${n.b},${n.a})`);
            grd.addColorStop(0.5, `rgba(${n.r},${n.g},${n.b},${n.a * 0.4})`);
            grd.addColorStop(1,   `rgba(${n.r},${n.g},${n.b},0)`);
            ctx.save();
            ctx.translate(n.x, n.y);
            ctx.scale(n.rx / Math.max(n.rx, n.ry), n.ry / Math.max(n.rx, n.ry));
            ctx.translate(-n.x, -n.y);
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(n.x, n.y, Math.max(n.rx, n.ry), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    _drawStars(ctx) {
        ctx.save();
        for (const s of this._stars) {
            ctx.globalAlpha = Math.max(0, Math.min(1, s.alpha));
            ctx.fillStyle   = s.color;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    _drawAsteroids(ctx) {
        ctx.save();

        for (const a of this._asteroids) {
            // ── Trail ───────────────────────────────────────────────────
            if (a.trail.length >= 2) {
                ctx.save();
                const tLen = a.trail.length;
                for (let i = 1; i < tLen; i++) {
                    const t   = i / tLen;
                    const p0  = a.trail[i - 1];
                    const p1  = a.trail[i];
                    ctx.beginPath();
                    ctx.moveTo(p0.x, p0.y);
                    ctx.lineTo(p1.x, p1.y);
                    // Trail fades from transparent to semi-opaque silver-blue
                    ctx.strokeStyle = `rgba(160, 200, 255, ${t * 0.38})`;
                    ctx.lineWidth   = a.size * 0.22 * t;
                    ctx.lineCap     = 'round';
                    ctx.stroke();
                }
                ctx.restore();
            }

            // ── Rock body ───────────────────────────────────────────────
            ctx.save();
            ctx.translate(a.x, a.y);
            ctx.rotate(a.rot);

            // Draw flat rock polygon
            ctx.beginPath();
            ctx.moveTo(a.pts[0].x, a.pts[0].y);
            for (let i = 1; i < a.pts.length; i++) {
                ctx.lineTo(a.pts[i].x, a.pts[i].y);
            }
            ctx.closePath();

            // Rock fill: dark grey with subtle blue tint to match space palette
            const grad = ctx.createRadialGradient(-a.size * 0.2, -a.size * 0.15, 0,
                0, 0, a.size * 0.9);
            grad.addColorStop(0, 'rgba(130, 140, 160, 0.95)');
            grad.addColorStop(0.5,'rgba(70, 80, 100, 0.90)');
            grad.addColorStop(1, 'rgba(30, 35, 50, 0.85)');
            ctx.fillStyle = grad;
            ctx.fill();

            // Thin rim highlight — gives it that lit-from-front look
            ctx.strokeStyle = 'rgba(180, 200, 230, 0.50)';
            ctx.lineWidth   = 0.8;
            ctx.stroke();

            // Crater dots — 1-2 small circles for texture
            const craterR = a.size * 0.14;
            ctx.fillStyle  = 'rgba(20, 25, 40, 0.55)';
            ctx.beginPath();
            ctx.arc(-a.size * 0.18, -a.size * 0.06, craterR, 0, Math.PI * 2);
            ctx.fill();
            if (a.pts.length >= 8) {
                ctx.beginPath();
                ctx.arc(a.size * 0.22, a.size * 0.04, craterR * 0.7, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }

        ctx.restore();
    }

    _drawImpacts(ctx) {
        ctx.save();
        for (const imp of this._impacts) {
            for (const p of imp.sparks) {
                ctx.globalAlpha = Math.max(0, p.a);
                ctx.fillStyle   = `rgba(200, 220, 255, 1)`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }
}
