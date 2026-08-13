import Matter from "matter-js";

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
        this._timer++;        this._windAngle += 0.003;

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
            const strength = 0.0014 * env;

            const fx = Math.cos(this._gustAngle) * strength;
            const fy = Math.sin(this._gustAngle) * strength;

            for (const flag of flagManager.flags) {
                Matter.Body.applyForce(flag.body, flag.body.position, { x: fx, y: fy });
            }

            // Arena sways in wind direction — same envelope, max ±18px offset
            if (arena) {
                arena._swayX = Math.cos(this._gustAngle) * env * 18;
                arena._swayY = Math.sin(this._gustAngle) * env * 18;
            }
        } else {
            // Smoothly settle back to centre after gust ends
            if (arena) {
                arena._swayX = (arena._swayX ?? 0) * 0.90;
                arena._swayY = (arena._swayY ?? 0) * 0.90;
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