import Matter from "matter-js";

/**
 * LAST STANDING — slow sequential exits.
 * Fixed gap 2, mild motion, moderate funnel so flags can leave but not rush out.
 */
export default class LastStandingEvent {
    name  = "LAST STANDING";
    color = "#FFC83D";
    icon  = "🏳️";

    _origRotation   = 0.024;
    _origInitialGap = 3;
    _origMaxGap     = 3;
    _frame          = 0;

    // Single source for final gap size
    static GAP = 2;

    start({ arena, flagManager }) {
        if (arena) {
            this._origRotation   = arena.rotationSpeed ?? 0.024;
            this._origInitialGap = arena.initialGapSize ?? 3;
            this._origMaxGap     = arena.maxGapSize ?? 3;

            const g = LastStandingEvent.GAP;
            arena.rotationSpeed  = 0.016;
            arena.initialGapSize = g;
            arena.maxGapSize     = g;
            if (arena.state === "PLAYING") {
                arena.gapSize = g;
            }
            arena._lastStandingActive = true;
        }

        const flags = flagManager?.flags ?? [];
        for (const flag of flags) {
            const b = flag.body;
            if (!b) continue;
            Matter.Sleeping.set(b, false);
            const ang = Math.random() * Math.PI * 2;
            const spd = 1.6 + Math.random() * 1.4;
            Matter.Body.setVelocity(b, {
                x: Math.cos(ang) * spd,
                y: Math.sin(ang) * spd,
            });
            Matter.Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.15);
        }

        this._frame = 0;
    }

    update({ arena, flagManager }) {
        if (!arena || arena.state !== "PLAYING") return;

        this._frame++;
        const g = LastStandingEvent.GAP;

        arena.rotationSpeed = 0.016;
        if (arena.gapSize === 0) return;
        if (arena.gapSize > 0) {
            arena.gapSize = g;
        }

        const flags = flagManager?.flags ?? [];
        if (!flags.length) return;

        const cx = arena.cx;
        const cy = arena.cy;
        const R  = arena.radius;

        const seg        = arena.segmentCount || 48;
        const gapStart   = arena.gapStart || 0;
        const gapSize    = arena.gapSize || g;
        const gapCenterI = gapStart + gapSize / 2;
        const gapCenter  = (gapCenterI / seg) * Math.PI * 2;
        const gapHalf    = (gapSize / seg) * Math.PI;

        const offset = this._frame & 1;

        for (let i = offset; i < flags.length; i += 2) {
            const body = flags[i].body;
            if (!body) continue;

            if (body.isSleeping) Matter.Sleeping.set(body, false);

            const dx   = body.position.x - cx;
            const dy   = body.position.y - cy;
            const dist = Math.hypot(dx, dy) || 0.001;
            const ang  = Math.atan2(dy, dx);

            const swirl = 0.00014;
            const tx = -Math.sin(ang);
            const ty =  Math.cos(ang);
            Matter.Body.applyForce(body, body.position, {
                x: tx * swirl,
                y: ty * swirl,
            });

            if ((this._frame + i) % 18 === 0) {
                Matter.Body.applyForce(body, body.position, {
                    x: (Math.random() - 0.5) * 0.00045,
                    y: (Math.random() - 0.5) * 0.00045,
                });
            }

            if (dist < R * 0.42 && (this._frame + i) % 16 === 0) {
                const nx = dx / dist;
                const ny = dy / dist;
                Matter.Body.applyForce(body, body.position, {
                    x: nx * 0.00035,
                    y: ny * 0.00035,
                });
            }

            const spd = Math.hypot(body.velocity.x, body.velocity.y);
            if (spd > 5.5) {
                const s = 5.5 / spd;
                Matter.Body.setVelocity(body, {
                    x: body.velocity.x * s,
                    y: body.velocity.y * s,
                });
            }

            if (arena.gapSize <= 0) continue;
            if (dist < R * 0.58) continue;

            let diff = ang - gapCenter;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));

            const funnelHalf = Math.max(gapHalf * 1.8, 0.12);
            if (Math.abs(diff) > funnelHalf) continue;

            const closeness = 1 - Math.abs(diff) / funnelHalf;
            const tangential = 0.00035 * closeness;
            const dir = diff > 0 ? -1 : 1;

            Matter.Body.applyForce(body, body.position, {
                x: tx * tangential * dir,
                y: ty * tangential * dir,
            });

            if (Math.abs(diff) < gapHalf * 1.05 && dist > R * 0.78) {
                const nx = dx / dist;
                const ny = dy / dist;
                Matter.Body.applyForce(body, body.position, {
                    x: nx * 0.0014,
                    y: ny * 0.0014,
                });
            }
        }
    }

    end({ arena }) {
        if (!arena) return;
        arena.rotationSpeed       = this._origRotation;
        arena.initialGapSize      = this._origInitialGap;
        arena.maxGapSize          = this._origMaxGap;
        arena._lastStandingActive = false;
    }
}
