import Matter from "matter-js";

/**
 * DRIFT
 * A slow constant force pulls all flags in one direction — like wind
 * pushing leaves across a field. The drift direction rotates gradually
 * (one full revolution in ~12 seconds), so the crowd of flags slowly
 * shifts and clusters, then shifts again as the "wind" turns.
 * Subtle but creates a clear group migration pattern.
 */
export default class DriftEvent {
    name  = "DRIFT";
    color = "#88DDAA";
    icon  = "🍃";

    _frame      = 0;
    _driftAngle = 0;
    _DRIFT_SPEED = 0.009; // rad/frame → full rotation in ~700 frames (~11.6s)
    _STRENGTH    = 0.00055;

    start() {
        this._frame      = 0;
        this._driftAngle = Math.random() * Math.PI * 2;
    }

    update({ flagManager }) {
        this._frame++;
        this._driftAngle += this._DRIFT_SPEED;

        const fx     = Math.cos(this._driftAngle) * this._STRENGTH;
        const fy     = Math.sin(this._driftAngle) * this._STRENGTH;
        const flags  = flagManager.flags;
        const offset = this._frame & 1;

        for (let i = offset; i < flags.length; i += 2) {
            const body = flags[i].body;
            if (body.isSleeping) Matter.Sleeping.set(body, false);
            Matter.Body.applyForce(body, body.position, { x: fx, y: fy });
        }
    }

    end() {}
}
