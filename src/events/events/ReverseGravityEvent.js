import Matter from "matter-js";

/**
 * REVERSE GRAVITY
 * Gravity flips upward for the duration, making flags float to the top
 * of the arena and cluster there before draining from an elevated gap.
 * Gradually eases in and out to avoid a jarring snap.
 */
export default class ReverseGravityEvent {
    name  = "REVERSE GRAVITY";
    color = "#AA44FF";
    icon  = "🙃";

    _frame = 0;
    _EASE_IN  = 90;   // frames to ramp gravity from 0 → -peak (was 60 — slower build-up)
    _EASE_OUT = 60;   // frames at end to ramp back to 0
    _PEAK     = -0.12; // was -0.35 — gentler float, flags spread instead of slamming top

    start({ physics }) {
        this._frame = 0;
        physics.engine.world.gravity.x = 0;
        physics.engine.world.gravity.y = 0;
    }

    update({ physics, flagManager }) {
        this._frame++;

        // Wake sleeping flags so they respond immediately
        if (this._frame === 1) {
            for (const flag of flagManager.flags) {
                Matter.Sleeping.set(flag.body, false);
            }
        }

        // Ease-in ramp
        const t = Math.min(1, this._frame / this._EASE_IN);
        const eased = t < 0.5
            ? 2 * t * t
            : 1 - Math.pow(-2 * t + 2, 2) / 2;

        physics.engine.world.gravity.y = this._PEAK * eased;
    }

    end({ physics }) {
        physics.engine.world.gravity.x = 0;
        physics.engine.world.gravity.y = 0;
    }
}
