import Matter from "matter-js";

/**
 * TIDAL WAVE
 * A wave front sweeps left→right across the arena pushing flags like a
 * flood, then reverses. The escape guard only fires when a flag has
 * genuinely tunnelled past the wall (radius + thickness), so flags
 * near the gap can still exit naturally through the opening.
 */
export default class TidalWaveEvent {
    name  = "TIDAL WAVE";
    color = "#0099FF";
    icon  = "🌊";

    _frame      = 0;
    _waveFront  = 0;
    _direction  = 1;
    _WAVE_SPEED = 2.4;
    _WAVE_WIDTH = 55;
    _STRENGTH   = 0.0020;
    _resetPause = 0;

    start({ arena }) {
        this._frame      = 0;
        this._direction  = 1;
        this._waveFront  = arena.cx - arena.radius - 20;
        this._resetPause = 0;
    }

    update({ arena, flagManager }) {
        this._frame++;

        if (this._resetPause > 0) {
            this._resetPause--;
            this._escapeGuard(flagManager.flags, arena);
            return;
        }

        this._waveFront += this._WAVE_SPEED * this._direction;

        const cx    = arena.cx;
        const limit = arena.radius + 20;

        if (this._direction === 1 && this._waveFront > cx + limit) {
            this._direction  = -1;
            this._waveFront  = cx + limit;
            this._resetPause = 40;
        } else if (this._direction === -1 && this._waveFront < cx - limit) {
            this._direction  = 1;
            this._waveFront  = cx - limit;
            this._resetPause = 40;
        }

        const wf     = this._waveFront;
        const half   = this._WAVE_WIDTH / 2;
        const flags  = flagManager.flags;
        const offset = this._frame & 1;

        for (let i = offset; i < flags.length; i += 2) {
            const body = flags[i].body;
            if (body.isSleeping) Matter.Sleeping.set(body, false);

            const relX = (body.position.x - wf) * this._direction;
            if (relX < -half || relX > half * 0.4) continue;

            const t        = 1 - Math.abs(relX) / half;
            const strength = this._STRENGTH * t * t;

            Matter.Body.applyForce(body, body.position, {
                x: this._direction * strength,
                y: 0,
            });
        }

        this._escapeGuard(flags, arena);
    }

    /**
     * Only catches flags that have genuinely tunnelled past the wall
     * (beyond radius + segment thickness ~22px). Flags at the gap
     * opening are left alone so they exit normally.
     */
    _escapeGuard(flags, arena) {
        const cx    = arena.cx;
        const cy    = arena.cy;
        const limit = arena.radius + 22;

        for (const flag of flags) {
            const body = flag.body;
            const dx   = body.position.x - cx;
            const dy   = body.position.y - cy;
            const dist = Math.hypot(dx, dy);

            if (dist <= limit) continue;

            const scale = (arena.radius - 2) / dist;
            Matter.Body.setPosition(body, {
                x: cx + dx * scale,
                y: cy + dy * scale,
            });

            const nx     = dx / dist;
            const ny     = dy / dist;
            const vx     = body.velocity.x;
            const vy     = body.velocity.y;
            const radial = vx * nx + vy * ny;
            if (radial > 0) {
                Matter.Body.setVelocity(body, {
                    x: vx - nx * radial,
                    y: vy - ny * radial,
                });
            }
        }
    }

    end() {}
}
