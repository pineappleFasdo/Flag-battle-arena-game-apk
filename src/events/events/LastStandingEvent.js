import Matter from "matter-js";

/**
 * LAST STANDING — aggressive chaotic bounce physics:
 * flags slam into walls and each other, not rim-orbit snakes.
 * Small fixed gap, one exit at a time.
 */
export default class LastStandingEvent {
    name  = "LAST STANDING";
    color = "#FFC83D";
    icon  = "🏳️";

    _origRotation   = 0.024;
    _origInitialGap = 3;
    _origMaxGap     = 3;
    _frame          = 0;

    start({ arena, flagManager }) {
        if (arena) {
            this._origRotation   = arena.rotationSpeed ?? 0.024;
            this._origInitialGap = arena.initialGapSize ?? 3;
            this._origMaxGap     = arena.maxGapSize ?? 3;

            arena.rotationSpeed  = 0.026;
            arena.initialGapSize = 3;
            arena.maxGapSize     = 3;
            if (arena.state === "PLAYING") {
                arena.gapSize = 3;
            }
            arena._lastStandingActive = true;
        }

        const flags = flagManager?.flags ?? [];
        for (const flag of flags) {
            const b = flag.body;
            if (!b) continue;
            Matter.Sleeping.set(b, false);
            const ang = Math.random() * Math.PI * 2;
            const spd = 4.5 + Math.random() * 4;
            Matter.Body.setVelocity(b, {
                x: Math.cos(ang) * spd,
                y: Math.sin(ang) * spd,
            });
            Matter.Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.4);
        }

        this._frame = 0;
    }

    update({ arena, flagManager }) {
        if (!arena || arena.state !== "PLAYING") return;

        this._frame++;

        arena.rotationSpeed = 0.026;
        // Never reopen a sealed gap (elim-card freeze sets gapSize = 0)
        if (arena.gapSize === 0) return;
        if (arena.gapSize > 0) {
            arena.gapSize = 3;
        }

        const flags = flagManager?.flags ?? [];
        if (!flags.length) return;

        const cx = arena.cx;
        const cy = arena.cy;
        const R  = arena.radius;

        const seg        = arena.segmentCount || 48;
        const gapStart   = arena.gapStart || 0;
        const gapSize    = arena.gapSize || 3;
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

            const swirl = 0.00028;
            const tx = -Math.sin(ang);
            const ty =  Math.cos(ang);
            Matter.Body.applyForce(body, body.position, {
                x: tx * swirl * 2,
                y: ty * swirl * 2,
            });

            if ((this._frame + i) % 10 === 0) {
                Matter.Body.applyForce(body, body.position, {
                    x: (Math.random() - 0.5) * 0.0012,
                    y: (Math.random() - 0.5) * 0.0012,
                });
            }

            // Outward nudge so flags REACH the wall and bounce hard
            if (dist < R * 0.45 && (this._frame + i) % 14 === 0) {
                const nx = dx / dist;
                const ny = dy / dist;
                Matter.Body.applyForce(body, body.position, {
                    x: nx * 0.0008,
                    y: ny * 0.0008,
                });
            }

            const spd = Math.hypot(body.velocity.x, body.velocity.y);
            if (spd > 11) {
                const s = 11 / spd;
                Matter.Body.setVelocity(body, {
                    x: body.velocity.x * s,
                    y: body.velocity.y * s,
                });
            }

            if (arena.gapSize <= 0) continue;
            if (dist < R * 0.55) continue;

            let diff = ang - gapCenter;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));

            const funnelHalf = Math.max(gapHalf * 2.6, 0.24);
            if (Math.abs(diff) > funnelHalf) continue;

            const closeness = 1 - Math.abs(diff) / funnelHalf;
            const tangential = 0.0007 * closeness * 2;
            const dir = diff > 0 ? -1 : 1;

            Matter.Body.applyForce(body, body.position, {
                x: tx * tangential * dir,
                y: ty * tangential * dir,
            });

            if (Math.abs(diff) < gapHalf * 1.1 && dist > R * 0.76) {
                const nx = dx / dist;
                const ny = dy / dist;
                Matter.Body.applyForce(body, body.position, {
                    x: nx * 0.0030,
                    y: ny * 0.0030,
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
