import Matter from "matter-js";

/**
 * TURBO
 * The arena ring spins faster AND flags are continuously tangentially
 * accelerated in the ring's rotation direction.  This makes flags orbit
 * the centre at higher speed — they fling outward and slam the wall harder,
 * creating a clearly different feel from Classic (which has no tangential
 * force at all).
 *
 * Physics:  tangential force proportional to distance from centre so flags
 * near the wall feel the full turbo whip, while flags already at the centre
 * aren't over-accelerated.
 * Arena:    rotation speed bumped to 0.040 (classic ≈ 0.022).
 * Gap:      kept at ≤3 so drain is not dramatically faster.
 */
export default class TurboEvent {
    name  = "TURBO";
    color = "#FF6B00";
    icon  = "⚡";

    _originalSpeed = 0.022;
    _origInitialGap = 2;
    _origMaxGap = 5;
    _frame = 0;

    // Tangential force per unit of (dist / radius)
    _TANGENTIAL_FORCE = 0.00028;

    start({ arena, flagManager }) {
        this._originalSpeed  = arena.rotationSpeed;
        this._origInitialGap = arena.initialGapSize;
        this._origMaxGap     = arena.maxGapSize;
        this._frame          = 0;

        arena._turboActive  = true;
        arena.rotationSpeed = 0.040;                               // clearly faster than classic
        arena.gapSize       = Math.min(arena.gapSize || 2, 3);

        // Wake all flags so the spin-up effect is visible immediately
        for (const flag of flagManager.flags) {
            Matter.Sleeping.set(flag.body, false);
        }
    }

    update({ arena, flagManager }) {
        this._frame++;

        if (arena.state === "PLAYING") {
            arena.rotationSpeed = 0.040;
            if (arena.gapSize > 3) arena.gapSize = 3;
        }

        const cx     = arena.cx;
        const cy     = arena.cy;
        const radius = arena.radius || 1;
        const flags  = flagManager.flags;
        const offset = this._frame & 1;          // alternate frames

        for (let i = offset; i < flags.length; i += 2) {
            const body = flags[i].body;
            if (body.isSleeping) Matter.Sleeping.set(body, false);

            const dx   = body.position.x - cx;
            const dy   = body.position.y - cy;
            const dist = Math.hypot(dx, dy) || 1;

            // Tangent direction = perpendicular to radial, in the ring's spin direction
            // arena rotationSpeed > 0 means counter-clockwise from canvas perspective
            // tangent for CCW = (-dy, dx) normalised
            const tx = -dy / dist;
            const ty =  dx / dist;

            // Scale force by proximity to wall (more force = more spectacular near rim)
            const normDist = Math.min(1, dist / radius);
            const strength = this._TANGENTIAL_FORCE * normDist;

            Matter.Body.applyForce(body, body.position, {
                x: tx * strength,
                y: ty * strength,
            });
        }
    }

    end({ arena }) {
        arena._turboActive   = false;
        arena.rotationSpeed  = this._originalSpeed;
        arena.initialGapSize = this._origInitialGap;
        arena.maxGapSize     = this._origMaxGap;
    }
}
