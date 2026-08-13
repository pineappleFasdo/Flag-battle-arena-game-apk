import Matter from "matter-js";

export default class EarthquakeEvent {
    name  = "EARTHQUAKE";
    color = "#FF4444";
    icon  = "🌋";

    _timer     = 0;
    _interval  = 90;
    _shaking   = false;
    _shakeLeft = 0;

    start({ physics }) {
        physics.engine.world.gravity.y = 0;
        this._timer = 0;
    }

    update({ flagManager, physics, arena }) {
        this._timer++;

        if (this._timer >= this._interval) {
            this._timer     = 0;
            this._shaking   = true;
            this._shakeLeft = 18;
            this._interval  = 70 + Math.floor(Math.random() * 60);
        }

        if (this._shaking) {
            this._shakeLeft--;
            if (this._shakeLeft <= 0) this._shaking = false;

            // Visual shake only (cheap)
            const intensity = this._shakeLeft / 18;
            arena._shakeX = (Math.random() - 0.5) * 18 * intensity;
            arena._shakeY = (Math.random() - 0.5) * 18 * intensity;

            physics.engine.world.gravity.x = (Math.random() - 0.5) * 0.04;
            physics.engine.world.gravity.y = (Math.random() - 0.5) * 0.04;

            // PERFORMANCE: only shake 1/3 of flags each frame
            const flags = flagManager.flags;
            const len   = flags.length;
            const start = this._shakeLeft % 3;
            const force = 0.0054; // 3× stronger so total energy stays similar

            for (let i = start; i < len; i += 3) {
                Matter.Body.applyForce(flags[i].body, flags[i].body.position, {
                    x: (Math.random() - 0.5) * force,
                    y: (Math.random() - 0.5) * force,
                });
            }
        } else {
            arena._shakeX = 0;
            arena._shakeY = 0;

            physics.engine.world.gravity.x *= 0.85;
            physics.engine.world.gravity.y *= 0.85;
        }
    }

    end({ physics, arena }) {
        physics.engine.world.gravity.x = 0;
        physics.engine.world.gravity.y = 0;
        arena._shakeX = 0;
        arena._shakeY = 0;
    }
}