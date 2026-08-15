import Matter from "matter-js";

/**
 * SPIN CYCLE
 * Flags are spun around the arena centre in a vortex.
 * Direction flips every ~6s — washing-machine effect.
 * Deliberately slow so viewers can follow individual flags.
 */
export default class SpinCycleEvent {
    name  = "SPIN CYCLE";
    color = "#00DDFF";
    icon  = "🌀";

    _frame         = 0;
    _flipTimer     = 0;
    _FLIP_EVERY    = 360;   // was 240 — flip every 6 s instead of 4 s
    _direction     = 1;
    _origRotation  = 0.020;
    _SWIRL         = 0.00025; // was 0.0004 — gentler continuous swirl

    start({ arena, flagManager }) {
        this._frame        = 0;
        this._flipTimer    = 0;
        this._direction    = Math.random() < 0.5 ? 1 : -1;
        this._origRotation = arena.rotationSpeed;

        arena.rotationSpeed = 0.022; // was 0.028 — barely faster than base 0.020

        // Gentle initial kick — not a full velocity set, just a nudge
        for (const flag of flagManager.flags) {
            Matter.Sleeping.set(flag.body, false);
            const b   = flag.body;
            const dx  = b.position.x - arena.cx;
            const dy  = b.position.y - arena.cy;
            const tx  = -dy / (Math.hypot(dx, dy) || 1);
            const ty  =  dx / (Math.hypot(dx, dy) || 1);
            // Add rather than set — preserves existing momentum, just nudges into orbit
            Matter.Body.setVelocity(b, {
                x: b.velocity.x + tx * this._direction * 1.2, // was 3.0
                y: b.velocity.y + ty * this._direction * 1.2,
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

        const offset = this._frame & 1;

        for (let i = offset; i < len; i += 2) {
            const body = flags[i].body;
            if (body.isSleeping) Matter.Sleeping.set(body, false);

            const dx   = body.position.x - cx;
            const dy   = body.position.y - cy;
            const dist = Math.hypot(dx, dy) || 1;

            const tx = -dy / dist;
            const ty =  dx / dist;

            Matter.Body.applyForce(body, body.position, {
                x: tx * this._SWIRL * this._direction,
                y: ty * this._SWIRL * this._direction,
            });

            // Hard speed cap — flags must stay readable
            const spd = Math.hypot(body.velocity.x, body.velocity.y);
            if (spd > 3.5) { // was 5 → 3.5
                const s = 3.5 / spd;
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
