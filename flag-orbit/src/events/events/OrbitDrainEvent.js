import Matter from "matter-js";

/**
 * ORBIT DRAIN — competitor-style physics (FlagsBattleOfficial feel):
 * dense rim orbit, continuous swirl, steady mass exit through a medium gap.
 * Flags pack against the wall, stream toward the rotating gap, and drain out.
 */
export default class OrbitDrainEvent {
    name  = "ORBIT DRAIN";
    color = "#4FC3F7";
    icon  = "🌀";

    _origRotation   = 0.024;
    _origInitialGap = 3;
    _origMaxGap     = 3;
    _frame          = 0;
    _direction      = 1;

    // Tuned to match video: visible gap + continuous stream exits
    static GAP = 3;

    start({ arena, flagManager }) {
        if (arena) {
            this._origRotation   = arena.rotationSpeed ?? 0.024;
            this._origInitialGap = arena.initialGapSize ?? 3;
            this._origMaxGap     = arena.maxGapSize ?? 3;

            const g = OrbitDrainEvent.GAP;
            arena.rotationSpeed  = 0.018;
            arena.initialGapSize = g;
            arena.maxGapSize     = g;
            if (arena.state === "PLAYING") {
                arena.gapSize = g;
            }
        }

        this._direction = Math.random() < 0.5 ? 1 : -1;
        this._frame = 0;

        const flags = flagManager?.flags ?? [];
        const cx = arena?.cx ?? 0;
        const cy = arena?.cy ?? 0;

        for (const flag of flags) {
            const b = flag.body;
            if (!b) continue;
            Matter.Sleeping.set(b, false);

            const dx = b.position.x - cx;
            const dy = b.position.y - cy;
            const dist = Math.hypot(dx, dy) || 1;
            // Tangential kick → immediate orbit
            const tx = -dy / dist;
            const ty =  dx / dist;
            const spd = 1.6 + Math.random() * 1.4;
            Matter.Body.setVelocity(b, {
                x: tx * this._direction * spd,
                y: ty * this._direction * spd,
            });
            Matter.Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.25);
        }
    }

    update({ arena, flagManager }) {
        if (!arena || arena.state !== "PLAYING") return;

        this._frame++;
        const g = OrbitDrainEvent.GAP;

        arena.rotationSpeed = 0.018;
        if (arena.gapSize > 0) {
            arena.gapSize = g;
            arena.initialGapSize = g;
            arena.maxGapSize = g;
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

        // Wide funnel so mass stream exits like the video
        const funnelHalf = Math.max(gapHalf * 2.4, 0.20);

        const offset = this._frame & 1;

        for (let i = offset; i < flags.length; i += 2) {
            const body = flags[i].body;
            if (!body) continue;
            if (body.isSleeping) Matter.Sleeping.set(body, false);

            const dx   = body.position.x - cx;
            const dy   = body.position.y - cy;
            const dist = Math.hypot(dx, dy) || 0.001;
            const ang  = Math.atan2(dy, dx);

            const tx = -Math.sin(ang);
            const ty =  Math.cos(ang);
            const nx = dx / dist;
            const ny = dy / dist;

            // Strong continuous swirl — rim orbit (core of competitor feel)
            const swirl = 0.00022;
            Matter.Body.applyForce(body, body.position, {
                x: tx * swirl * this._direction,
                y: ty * swirl * this._direction,
            });

            // Soft outward pressure → pack against wall
            if (dist < R * 0.72) {
                Matter.Body.applyForce(body, body.position, {
                    x: nx * 0.00016,
                    y: ny * 0.00016,
                });
            }

            // Near-rim only: funnel toward gap
            if (dist < R * 0.50) continue;

            let diff = ang - gapCenter;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            if (Math.abs(diff) > funnelHalf) continue;

            const closeness = 1 - Math.abs(diff) / funnelHalf;
            const tangential = 0.00045 * closeness;
            const dir = diff > 0 ? -1 : 1;

            Matter.Body.applyForce(body, body.position, {
                x: tx * tangential * dir,
                y: ty * tangential * dir,
            });

            // Eject through gap when aligned
            if (Math.abs(diff) < gapHalf * 1.25 && dist > R * 0.68) {
                Matter.Body.applyForce(body, body.position, {
                    x: nx * 0.0016,
                    y: ny * 0.0016,
                });
            }

            // Speed cap — keep motion readable, not chaotic
            const spd = Math.hypot(body.velocity.x, body.velocity.y);
            if (spd > 6.0) {
                const s = 6.0 / spd;
                Matter.Body.setVelocity(body, {
                    x: body.velocity.x * s,
                    y: body.velocity.y * s,
                });
            }
        }
    }

    end({ arena }) {
        if (!arena) return;
        arena.rotationSpeed  = this._origRotation;
        arena.initialGapSize = this._origInitialGap;
        arena.maxGapSize     = this._origMaxGap;
    }
}
