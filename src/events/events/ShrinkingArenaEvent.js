import Matter from "matter-js";

export default class ShrinkingArenaEvent {
    name  = "SHRINKING ARENA";
    color = "#CC44FF";
    icon  = "🔵";

    _originalRadius     = 0;
    _targetRadius       = 0;
    _originalInitialGap = 0;
    _originalMaxGap     = 0;
    // Faster shrink (~7.5 s) so pressure ramps before the match drags
    _duration           = 450;
    _timer              = 0;

    start({ arena, drain }) {
        this._originalRadius     = arena.radius;
        // Shrink to ~55% — tight but still playable
        this._targetRadius       = arena.radius * 0.55;
        this._originalInitialGap = arena.initialGapSize;
        this._originalMaxGap     = arena.maxGapSize;

        // Wider gap so escapes remain possible as the circle tightens
        arena.initialGapSize = 12;
        arena.maxGapSize     = 26;
        arena.gapSize        = Math.max(arena.gapSize, 12);

        this._timer = 0;

        if (drain) drain.shrinkMode = true;
    }

    update({ arena, drain }) {
        if (arena.state !== "PLAYING") return;

        this._timer++;

        // Ease-in-out with a slightly steeper mid section for visible pressure
        const t     = Math.min(1, this._timer / this._duration);
        const eased = t < 0.5
            ? 2 * t * t
            : 1 - Math.pow(-2 * t + 2, 2) / 2;

        arena.radius = this._originalRadius
            - (this._originalRadius - this._targetRadius) * eased;

        // Push flags inward when the contracting wall reaches them
        for (const flag of (arena._flagsRef ?? [])) {
            const dx   = flag.body.position.x - arena.cx;
            const dy   = flag.body.position.y - arena.cy;
            const dist = Math.hypot(dx, dy);
            if (dist === 0) continue;

            if (dist > arena.radius - 6) {
                const push = 0.014 + eased * 0.008;
                Matter.Body.applyForce(flag.body, flag.body.position, {
                    x: -(dx / dist) * push,
                    y: -(dy / dist) * push,
                });
                Matter.Body.setVelocity(flag.body, {
                    x: flag.body.velocity.x * 0.82,
                    y: flag.body.velocity.y * 0.82,
                });
            }
        }
    }

    end({ arena, drain }) {
        arena.radius         = this._originalRadius;
        arena.initialGapSize = this._originalInitialGap;
        arena.maxGapSize     = this._originalMaxGap;

        if (drain) drain.shrinkMode = false;
    }
}