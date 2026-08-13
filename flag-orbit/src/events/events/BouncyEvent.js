import Matter from "matter-js";

export default class BouncyEvent {
    name  = "BOUNCY";
    color = "#AAFF44";
    icon  = "🏀";

    _origRestitution = [];
    _kickTimer       = 0;
    _kickInterval    = 120;

    start({ flagManager }) {
        this._origRestitution = [];
        for (const flag of flagManager.flags) {
            this._origRestitution.push(flag.body.restitution);
            flag.body.restitution = 1.10;
            flag.body.friction    = 0;
        }
        this._kickTimer = 0;
    }

    update({ flagManager }) {
        for (const flag of flagManager.flags) {
            if (flag.body.restitution < 1.05) flag.body.restitution = 1.10;
        }

        this._kickTimer++;
        if (this._kickTimer >= this._kickInterval) {
            this._kickTimer    = 0;
            this._kickInterval = 90 + Math.floor(Math.random() * 90);

            if (flagManager.flags.length > 0) {
                const target = flagManager.flags[
                    Math.floor(Math.random() * flagManager.flags.length)
                ];
                const angle = Math.random() * Math.PI * 2;
                const speed = 6 + Math.random() * 6;
                Matter.Body.setVelocity(target.body, {
                    x: Math.cos(angle) * speed,
                    y: Math.sin(angle) * speed,
                });
            }
        }
    }

    end({ flagManager }) {
        flagManager.flags.forEach((flag, i) => {
            flag.body.restitution = this._origRestitution[i] ?? 0.98;
        });
    }
}