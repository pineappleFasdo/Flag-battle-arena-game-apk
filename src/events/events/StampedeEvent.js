import Matter from "matter-js";

/**
 * STAMPEDE
 * All flags receive a sudden shared burst of velocity in the same random
 * direction — then 1.5 seconds later, a burst in a new random direction.
 * Like a herd of animals panicking and changing direction. Each burst is
 * a single sharp impulse (setVelocity), not a sustained force, so the
 * physics settle naturally between bursts. Creates dramatic mass-movement
 * waves that are completely different each round.
 */
export default class StampedeEvent {
    name  = "STAMPEDE";
    color = "#DD7722";
    icon  = "🐂";

    _frame       = 0;
    _burstTimer  = 0;
    _BURST_EVERY = 90; // frames between stampedes (~1.5 s at 60fps)
    _SPEED       = 7.5;
    _burstAngle  = 0;

    start({ flagManager }) {
        this._frame      = 0;
        this._burstTimer = 30; // first burst after 0.5 s
        this._burstAngle = Math.random() * Math.PI * 2;

        // Wake all flags
        for (const flag of flagManager.flags) {
            Matter.Sleeping.set(flag.body, false);
        }
    }

    update({ flagManager }) {
        this._frame++;
        this._burstTimer++;

        if (this._burstTimer < this._BURST_EVERY) return;
        this._burstTimer = 0;

        // New direction — never exactly the same as last burst (min 45° change)
        let newAngle;
        do {
            newAngle = Math.random() * Math.PI * 2;
        } while (Math.abs(newAngle - this._burstAngle) < Math.PI / 4);
        this._burstAngle = newAngle;

        const vx   = Math.cos(this._burstAngle) * this._SPEED;
        const vy   = Math.sin(this._burstAngle) * this._SPEED;
        const flags = flagManager.flags;

        for (const flag of flags) {
            const body = flag.body;
            Matter.Sleeping.set(body, false);
            // Add to existing velocity rather than replace — flags that were
            // already moving get an extra kick, preserving physical momentum
            Matter.Body.setVelocity(body, {
                x: body.velocity.x * 0.3 + vx,
                y: body.velocity.y * 0.3 + vy,
            });
            // Small random spread so not every flag moves identically
            Matter.Body.applyForce(body, body.position, {
                x: (Math.random() - 0.5) * 0.008,
                y: (Math.random() - 0.5) * 0.008,
            });
        }
    }

    end() {}
}
