import Matter from "matter-js";

/**
 * ORBIT DRAIN
 * Flags orbit the wall slowly and exit through the gap naturally.
 * No aggressive ejection — flags leave only when they organically
 * drift into the gap opening. Drain rate is slow and readable.
 */
export default class OrbitDrainEvent {
    name  = "ORBIT DRAIN";
    color = "#4FC3F7";
    icon  = "🌀";

    _origRotation   = 0.020;
    _origInitialGap = 2;
    _origMaxGap     = 5;
    _frame          = 0;
    _direction      = 1;

    // Gap kept narrow — flags must naturally drift to the opening
    static GAP = 2;

    start({ arena, flagManager }) {
        if (arena) {
            this._origRotation   = arena.rotationSpeed ?? 0.020;
            this._origInitialGap = arena.initialGapSize ?? 2;
            this._origMaxGap     = arena.maxGapSize ?? 5;

            const g = OrbitDrainEvent.GAP;
            arena.rotationSpeed  = 0.012; // slow rotation — gap is easy to track
            arena.initialGapSize = g;
            arena.maxGapSize     = g;
            if (arena.state === "PLAYING") arena.gapSize = g;
        }

        this._direction = Math.random() < 0.5 ? 1 : -1;
        this._frame     = 0;

        const flags = flagManager?.flags ?? [];
        const cx    = arena?.cx ?? 0;
        const cy    = arena?.cy ?? 0;

        for (const flag of flags) {
            const b = flag.body;
            if (!b) continue;
            Matter.Sleeping.set(b, false);

            const dx   = b.position.x - cx;
            const dy   = b.position.y - cy;
            const dist = Math.hypot(dx, dy) || 1;
            const tx   = -dy / dist;
            const ty   =  dx / dist;
            // Gentle tangential nudge — let flags find their own orbit speed
            const spd  = 0.8 + Math.random() * 0.6; // was 1.6–3.0
            Matter.Body.setVelocity(b, {
                x: tx * this._direction * spd,
                y: ty * this._direction * spd,
            });
            Matter.Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.12);
        }
    }

    update({ arena, flagManager }) {
        if (!arena || arena.state !== "PLAYING") return;

        this._frame++;
        const g = OrbitDrainEvent.GAP;

        arena.rotationSpeed  = 0.012;
        if (arena.gapSize > 0) {
            arena.gapSize        = g;
            arena.initialGapSize = g;
            arena.maxGapSize     = g;
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

        // Narrow funnel — only flags very close to gap opening get guided
        const funnelHalf = Math.max(gapHalf * 1.4, 0.10);

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

            // Very light swirl — just enough to maintain loose orbit
            const swirl = 0.00010; // was 0.00022
            Matter.Body.applyForce(body, body.position, {
                x: tx * swirl * this._direction,
                y: ty * swirl * this._direction,
            });

            // No outward pressure — flags at centre stay there naturally

            // Near-gap only: very gentle funnel (rim flags only)
            if (dist < R * 0.60) continue;

            let diff = ang - gapCenter;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            if (Math.abs(diff) > funnelHalf) continue;

            const closeness  = 1 - Math.abs(diff) / funnelHalf;
            const tangential = 0.00008 * closeness; // was 0.00018 — barely a nudge
            const dir        = diff > 0 ? -1 : 1;

            Matter.Body.applyForce(body, body.position, {
                x: tx * tangential * dir,
                y: ty * tangential * dir,
            });

            // No active eject burst — flags exit only by natural momentum
            // through the gap, same as all other events.

            // Speed brake — slow flags down at the wall so they don't tunnel
            const spd = Math.hypot(body.velocity.x, body.velocity.y);
            if (spd > 3.0) { // was 6.0 — much lower ceiling
                const s = 3.0 / spd;
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
