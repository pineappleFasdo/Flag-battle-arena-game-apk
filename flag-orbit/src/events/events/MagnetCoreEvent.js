import Matter from "matter-js";

export default class MagnetCoreEvent {
    name  = "MAGNET CORE";
    color = "#FF88FF";
    icon  = "🧲";

    _timer      = 0;
    _phase      = "pull";
    _pullFrames = 90;
    _restFrames = 60;

    start() {
        this._timer = 0;
        this._phase = "pull";
    }

    update({ arena, flagManager }) {
        this._timer++;

        const limit = this._phase === "pull" ? this._pullFrames : this._restFrames;
        if (this._timer >= limit) {
            this._timer = 0;
            this._phase = this._phase === "pull" ? "release" : "pull";
        }

        const cx = arena.cx;
        const cy = arena.cy;

        for (const flag of flagManager.flags) {
            const dx   = cx - flag.body.position.x;
            const dy   = cy - flag.body.position.y;
            const dist = Math.hypot(dx, dy) || 1;

            if (this._phase === "pull") {
                const strength = 0.0005 * Math.min(1, dist / (arena.radius * 0.5));
                Matter.Body.applyForce(flag.body, flag.body.position, {
                    x:  (dx / dist) * strength,
                    y:  (dy / dist) * strength,
                });
            } else {
                const strength = 0.0003;
                Matter.Body.applyForce(flag.body, flag.body.position, {
                    x: -(dx / dist) * strength,
                    y: -(dy / dist) * strength,
                });
            }
        }
    }

    end() {}
}