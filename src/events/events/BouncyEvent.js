import Matter from "matter-js";

/**
 * BOUNCY
 * Flags periodically launch off the arena WALL — not random positions,
 * but flags that are actually near the perimeter get a sharp inward kick,
 * like a pinball being fired off the bumper.  Flags in the middle are
 * left alone.  The result is constant wall-to-wall chaos that looks like
 * real bouncing rather than a random teleport.
 *
 * Physics note: restitution is not touched — this is purely velocity-based
 * so there's zero conflict with Matter.js collision resolution.
 */
export default class BouncyEvent {
    name  = "BOUNCY";
    color = "#AAFF44";
    icon  = "🏀";

    _frame         = 0;
    _kickTimer     = 0;
    _KICK_INTERVAL = 18;   // frames between wall-sweep scans (every ~0.3s at 60fps)
    _WALL_RATIO    = 0.72; // flags within this fraction of arena radius are "near wall"
    _KICK_SPEED    = 9;    // inward kick speed (px/frame)

    start({ flagManager }) {
        this._frame     = 0;
        this._kickTimer = 0;
        // Give everyone a small random nudge to break any sleeping clusters
        for (const flag of flagManager.flags) {
            Matter.Sleeping.set(flag.body, false);
            const angle = Math.random() * Math.PI * 2;
            Matter.Body.applyForce(flag.body, flag.body.position, {
                x: Math.cos(angle) * 0.0006,
                y: Math.sin(angle) * 0.0006,
            });
        }
    }

    update({ arena, flagManager }) {
        this._frame++;
        this._kickTimer++;

        if (this._kickTimer < this._KICK_INTERVAL) return;
        this._kickTimer = 0;

        const cx     = arena.cx;
        const cy     = arena.cy;
        const limit  = arena.radius * this._WALL_RATIO;
        const flags  = flagManager.flags;

        // Kick every flag that is near the wall inward toward centre
        for (const flag of flags) {
            const body = flag.body;
            const dx   = body.position.x - cx;
            const dy   = body.position.y - cy;
            const dist = Math.hypot(dx, dy) || 1;

            if (dist < limit) continue;  // not near wall — leave alone

            // Direction: inward (toward centre) + slight random spread
            const spread    = (Math.random() - 0.5) * 0.9;      // ±~26°
            const inAngle   = Math.atan2(-dy, -dx) + spread;
            const speed     = this._KICK_SPEED * (0.75 + Math.random() * 0.5);

            Matter.Body.setVelocity(body, {
                x: Math.cos(inAngle) * speed,
                y: Math.sin(inAngle) * speed,
            });
            Matter.Sleeping.set(body, false);
        }
    }

    end() {}
}
