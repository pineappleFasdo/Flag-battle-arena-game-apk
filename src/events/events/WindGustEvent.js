import Matter from "matter-js";

/**
 * WIND GUST
 * Periodic gusts blow all flags in a slowly rotating direction.
 * The escape-guard only fires when a flag has genuinely tunnelled
 * PAST the wall (radius + thickness), so flags that reach the gap
 * naturally can still exit. Flags that hit solid wall segments get
 * their outward velocity cancelled so they bounce back instead of
 * passing through the segment joints.
 */
export default class WindGustEvent {
    name  = "WIND GUST";
    color = "#55EEBB";
    icon  = "🌪️";

    _timer      = 0;
    _gustTimer  = 0;
    _gustLen    = 30;
    _interval   = 120;
    _gusting    = false;
    _gustAngle  = 0;
    _windAngle  = 0;

    start() {
        this._timer     = 0;
        this._gustTimer = 0;
        this._gusting   = false;
        this._windAngle = Math.random() * Math.PI * 2;
    }

    update({ flagManager, arena }) {
        this._timer++;
        this._windAngle += 0.003;

        if (!this._gusting && this._timer >= this._interval) {
            this._timer     = 0;
            this._gusting   = true;
            this._gustTimer = 0;
            this._gustAngle = this._windAngle;
            this._interval  = 90 + Math.floor(Math.random() * 90);
        }

        if (this._gusting) {
            this._gustTimer++;
            if (this._gustTimer >= this._gustLen) this._gusting = false;

            const t   = this._gustTimer / this._gustLen;
            const env = Math.sin(t * Math.PI);
            const strength = 0.0009 * env;

            const fx = Math.cos(this._gustAngle) * strength;
            const fy = Math.sin(this._gustAngle) * strength;

            for (const flag of flagManager.flags) {
                Matter.Body.applyForce(flag.body, flag.body.position, { x: fx, y: fy });
            }

            if (arena) {
                arena._swayX = Math.cos(this._gustAngle) * env * 18;
                arena._swayY = Math.sin(this._gustAngle) * env * 18;
            }
        } else {
            if (arena) {
                arena._swayX = (arena._swayX ?? 0) * 0.90;
                arena._swayY = (arena._swayY ?? 0) * 0.90;
            }
        }

        this._escapeGuard(flagManager.flags, arena);
    }

    /**
     * Only catches flags that have genuinely escaped past the wall
     * (beyond radius + segment thickness). Flags approaching the gap
     * are left alone so they can exit normally.
     */
    _escapeGuard(flags, arena) {
        const cx    = arena.cx;
        const cy    = arena.cy;
        // Wall segments are ~22px thick — only block flags that are past the wall
        const limit = arena.radius + 22;

        for (const flag of flags) {
            const body = flag.body;
            const dx   = body.position.x - cx;
            const dy   = body.position.y - cy;
            const dist = Math.hypot(dx, dy);

            if (dist <= limit) continue;

            // Push back to just inside the wall
            const scale = (arena.radius - 2) / dist;
            Matter.Body.setPosition(body, {
                x: cx + dx * scale,
                y: cy + dy * scale,
            });

            // Cancel only the outward velocity component
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

    end({ arena }) {
        if (arena) {
            arena._swayX = 0;
            arena._swayY = 0;
        }
    }
}
