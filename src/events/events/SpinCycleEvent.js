import Matter from "matter-js";

/**
 * SPIN CYCLE
 * All flags are spun around the arena centre in a tight vortex.
 * The rotation direction flips every ~4 s, creating a washing-machine
 * effect that sends flags tumbling toward the gap in bursts.
 * Arena itself also spins faster to match the chaos.
 */
export default class SpinCycleEvent {
    name  = "SPIN CYCLE";
    color = "#00DDFF";
    icon  = "🌀";

    _frame         = 0;
    _flipTimer     = 0;
    _FLIP_EVERY    = 240;
    _direction     = 1;
    _origRotation  = 0.024;
    _SWIRL         = 0.0010;

    start({ arena, flagManager }) {
        this._frame        = 0;
        this._flipTimer    = 0;
        this._direction    = Math.random() < 0.5 ? 1 : -1;
        this._origRotation = arena.rotationSpeed;

        arena.rotationSpeed = 0.040;

        // Give every flag an initial angular kick
        for (const flag of flagManager.flags) {
            Matter.Sleeping.set(flag.body, false);
            const b   = flag.body;
            const dx  = b.position.x - arena.cx;
            const dy  = b.position.y - arena.cy;
            const tx  = -dy / (Math.hypot(dx, dy) || 1);
            const ty  =  dx / (Math.hypot(dx, dy) || 1);
            Matter.Body.setVelocity(b, {
                x: b.velocity.x + tx * this._direction * 3.0,
                y: b.velocity.y + ty * this._direction * 3.0,
            });
        }
    }

    update({ arena, flagManager }) {
        this._frame++;
        this._flipTimer++;

        if (this._flipTimer >= this._FLIP_EVERY) {
            this._flipTimer = 0;
            this._direction = -this._direction;
        }

        const flags = flagManager.flags;
        const len   = flags.length;
        const cx    = arena.cx;
        const cy    = arena.cy;

        // Apply every-other frame to save CPU
        const offset = this._frame & 1;

        for (let i = offset; i < len; i += 2) {
            const body = flags[i].body;
            if (body.isSleeping) Matter.Sleeping.set(body, false);

            const dx   = body.position.x - cx;
            const dy   = body.position.y - cy;
            const dist = Math.hypot(dx, dy) || 1;

            // Tangential (swirl) force
            const tx = -dy / dist;
            const ty =  dx / dist;

            Matter.Body.applyForce(body, body.position, {
                x: tx * this._SWIRL * this._direction,
                y: ty * this._SWIRL * this._direction,
            });

            // Cap speed to prevent runaway
            const spd = Math.hypot(body.velocity.x, body.velocity.y);
            if (spd > 8) {
                const s = 8 / spd;
                Matter.Body.setVelocity(body, {
                    x: body.velocity.x * s,
                    y: body.velocity.y * s,
                });
            }
        }
    }

    end({ arena }) {
        arena.rotationSpeed = this._origRotation;
    }
}
