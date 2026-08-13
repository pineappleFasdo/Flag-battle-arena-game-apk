import Matter from "matter-js";

/**
 * BILLIARD BREAK
 * Every ~3 s one random flag becomes a "cue ball" — it's fired at high
 * speed in a random direction, smashing through the pack and scattering
 * everything. High restitution keeps the chaos alive between shots.
 */
export default class BilliardBreakEvent {
    name  = "BILLIARD BREAK";
    color = "#F5E642";
    icon  = "🎱";

    _shotTimer    = 0;
    _SHOT_EVERY   = 180; // frames between shots (~3 s)
    _origRestitution = [];

    start({ flagManager }) {
        this._shotTimer      = 90; // first shot fires after 1.5 s
        this._origRestitution = [];

        for (const flag of flagManager.flags) {
            this._origRestitution.push(flag.body.restitution);
            // Slightly bouncier baseline so collisions carry energy longer
            flag.body.restitution = 0.98;
            flag.body.friction    = 0.001;
        }
    }

    update({ flagManager }) {
        this._shotTimer++;

        if (this._shotTimer < this._SHOT_EVERY) return;
        this._shotTimer = 0;

        const flags = flagManager.flags;
        if (flags.length === 0) return;

        // Pick cue flag
        const cue = flags[Math.floor(Math.random() * flags.length)];
        const angle = Math.random() * Math.PI * 2;
        // Very high speed — the "break" shot
        const speed = 14 + Math.random() * 6;

        Matter.Sleeping.set(cue.body, false);
        Matter.Body.setVelocity(cue.body, {
            x: Math.cos(angle) * speed,
            y: Math.sin(angle) * speed,
        });
        Matter.Body.setAngularVelocity(cue.body, (Math.random() - 0.5) * 0.8);
    }

    end({ flagManager }) {
        flagManager.flags.forEach((flag, i) => {
            flag.body.restitution = this._origRestitution[i] ?? 0.95;
            flag.body.friction    = 0.005;
        });
    }
}
