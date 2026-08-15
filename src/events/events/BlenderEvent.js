import Matter from "matter-js";

/**
 * BLENDER
 * A powerful vortex at the centre spins all flags in a tight circle —
 * like clothes in a washing machine. Flags near the wall feel the full
 * centrifugal whip; flags near the centre are dragged inward first then
 * spun out. Direction flips once mid-event for extra chaos.
 */
export default class BlenderEvent {
    name  = "BLENDER";
    color = "#FF4488";
    icon  = "🌀";

    _frame       = 0;
    _direction   = 1;
    _FLIP_AT     = 240; // flip spin direction halfway through
    _SWIRL       = 0.00042;
    _INWARD      = 0.00010; // gentle pull toward centre so flags don't all hug the wall

    start({ arena, flagManager }) {
        this._frame     = 0;
        this._direction = Math.random() < 0.5 ? 1 : -1;

        // Give every flag an immediate tangential kick to bootstrap the spin
        for (const flag of flagManager.flags) {
            const b  = flag.body;
            Matter.Sleeping.set(b, false);
            const dx = b.position.x - arena.cx;
            const dy = b.position.y - arena.cy;
            const d  = Math.hypot(dx, dy) || 1;
            const tx = (-dy / d) * this._direction;
            const ty = ( dx / d) * this._direction;
            Matter.Body.setVelocity(b, {
                x: b.velocity.x + tx * 3.5,
                y: b.velocity.y + ty * 3.5,
            });
        }
    }

    update({ arena, flagManager }) {
        this._frame++;

        if (this._frame === this._FLIP_AT) this._direction = -this._direction;

        const cx     = arena.cx;
        const cy     = arena.cy;
        const flags  = flagManager.flags;
        const offset = this._frame & 1;

        for (let i = offset; i < flags.length; i += 2) {
            const body = flags[i].body;
            if (body.isSleeping) Matter.Sleeping.set(body, false);

            const dx   = body.position.x - cx;
            const dy   = body.position.y - cy;
            const dist = Math.hypot(dx, dy) || 1;

            // Tangential swirl
            const tx = -dy / dist;
            const ty =  dx / dist;
            Matter.Body.applyForce(body, body.position, {
                x: tx * this._SWIRL * this._direction,
                y: ty * this._SWIRL * this._direction,
            });

            // Gentle inward pull keeps flags spiralling rather than glued to wall
            Matter.Body.applyForce(body, body.position, {
                x: (-dx / dist) * this._INWARD,
                y: (-dy / dist) * this._INWARD,
            });

            // Speed cap — keep flags readable, not invisible blurs
            const spd = Math.hypot(body.velocity.x, body.velocity.y);
            if (spd > 7) {
                const s = 7 / spd;
                Matter.Body.setVelocity(body, { x: body.velocity.x * s, y: body.velocity.y * s });
            }
        }
    }

    end() {}
}
