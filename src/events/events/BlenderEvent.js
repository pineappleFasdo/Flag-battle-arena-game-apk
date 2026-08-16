import Matter from "matter-js";

/**
 * BLENDER
 * Three overlapping phases cycle to create churning chaos:
 *   Phase A: inward SUCK — flags yanked to the centre
 *   Phase B: outward BURST — flags flung to the wall
 *   Phase C: tangential SPIN — alternating direction
 *
 * Phase durations and forces tuned for a slower, more readable churn.
 */
export default class BlenderEvent {
    name  = "BLENDER";
    color = "#FF4488";
    icon  = "🌀";

    _frame    = 0;
    _phase    = 0;
    _phaseT   = 0;
    _spinDir  = 1;

    // Slower: ~2s suck, ~1s burst, ~1.4s spin  (was 1.2s / 0.6s / 0.8s)
    _PHASE_DUR = [120, 60, 85];

    // Gentler forces (roughly 60% of previous)
    _SUCK_FORCE  = 0.0022;
    _BURST_FORCE = 0.0032;
    _SPIN_FORCE  = 0.00048;

    start({ flagManager }) {
        this._frame  = 0;
        this._phase  = 0;
        this._phaseT = 0;
        this._spinDir = Math.random() < 0.5 ? 1 : -1;

        for (const flag of flagManager.flags) {
            Matter.Sleeping.set(flag.body, false);
        }
    }

    update({ arena, flagManager }) {
        this._frame++;
        this._phaseT++;

        if (this._phaseT >= this._PHASE_DUR[this._phase]) {
            this._phaseT = 0;
            this._phase  = (this._phase + 1) % 3;
            if (this._phase === 2) this._spinDir = -this._spinDir;
        }

        const cx     = arena.cx;
        const cy     = arena.cy;
        const flags  = flagManager.flags;
        const phase  = this._phase;
        const t      = this._phaseT / this._PHASE_DUR[phase];
        const offset = this._frame & 1;

        for (let i = offset; i < flags.length; i += 2) {
            const body = flags[i].body;
            if (body.isSleeping) Matter.Sleeping.set(body, false);

            const dx   = body.position.x - cx;
            const dy   = body.position.y - cy;
            const dist = Math.hypot(dx, dy) || 1;
            const nx   = dx / dist;
            const ny   = dy / dist;

            if (phase === 0) {
                // SUCK — ramp up inward pull
                const strength = this._SUCK_FORCE * (0.4 + 0.6 * t);
                Matter.Body.applyForce(body, body.position, {
                    x: -nx * strength,
                    y: -ny * strength,
                });

            } else if (phase === 1) {
                // BURST — sharp outward fling, fades
                const strength = this._BURST_FORCE * (1 - t * 0.6);
                Matter.Body.applyForce(body, body.position, {
                    x: nx * strength,
                    y: ny * strength,
                });

            } else {
                // SPIN — tangential churn
                const tx = -ny * this._spinDir;
                const ty =  nx * this._spinDir;
                Matter.Body.applyForce(body, body.position, {
                    x: tx * this._SPIN_FORCE,
                    y: ty * this._SPIN_FORCE,
                });
                // Gentle inward during spin so flags don't park at wall
                Matter.Body.applyForce(body, body.position, {
                    x: -nx * 0.00008,
                    y: -ny * 0.00008,
                });
            }

            // Speed cap — lower than before to match slower feel
            const spd = Math.hypot(body.velocity.x, body.velocity.y);
            if (spd > 8) {
                const s = 8 / spd;
                Matter.Body.setVelocity(body, { x: body.velocity.x * s, y: body.velocity.y * s });
            }
        }
    }

    end() {}
}
