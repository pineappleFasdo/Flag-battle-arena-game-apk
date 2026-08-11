import Matter from "matter-js";

/**
 * PULSAR
 * The arena centre pulses: a rhythmic radial shockwave alternately
 * expands (pushing flags outward) then collapses (pulling them inward).
 * Creates a breathing effect — flags cluster at the wall, then get
 * sucked back to the middle, then blasted out again.
 * Period: ~2 s (120 frames).
 */
export default class PulsarEvent {
    name  = "PULSAR";
    color = "#FF3399";
    icon  = "💫";

    _frame = 0;
    _PERIOD = 120; // frames per full pulse cycle

    start({ flagManager }) {
        this._frame = 0;
        // Wake everything
        for (const flag of flagManager.flags) {
            Matter.Sleeping.set(flag.body, false);
        }
    }

    update({ arena, flagManager }) {
        this._frame++;

        // Sine wave: positive → push out, negative → pull in
        const phase    = (this._frame / this._PERIOD) * Math.PI * 2;
        const envelope = Math.sin(phase);           // -1 … +1
        const strength = envelope * 0.0014;         // signed force magnitude

        const cx   = arena.cx;
        const cy   = arena.cy;
        const flags = flagManager.flags;
        const len   = flags.length;

        // Alternate frames for performance
        const offset = this._frame & 1;

        for (let i = offset; i < len; i += 2) {
            const body = flags[i].body;
            if (body.isSleeping) Matter.Sleeping.set(body, false);

            const dx   = body.position.x - cx;
            const dy   = body.position.y - cy;
            const dist = Math.hypot(dx, dy) || 1;

            // Radial direction (outward = positive)
            Matter.Body.applyForce(body, body.position, {
                x: (dx / dist) * strength,
                y: (dy / dist) * strength,
            });
        }
    }

    end() {}
}
