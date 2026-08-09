import Matter from "matter-js";

export default class DoubleHoleEvent {
    name  = "DOUBLE HOLE";
    color = "#FF44AA";
    icon  = "🕳️";

    _gapSynced = false;

    start({ arena }) {
        arena._doubleHole = true;
        this._gapSynced = false;
    }

    update({ arena, flagManager }) {
        if (arena.state !== "PLAYING") return;

        const seg  = arena.segmentCount;
        const half = Math.floor(seg / 2);
        const secondGapStart = (arena.gapStart + half) % seg;

        // PERFORMANCE: only re-open second gap every 2 frames
        // (ArenaPhysics already updates walls on even frames)
        this._gapSynced = !this._gapSynced;
        if (this._gapSynced) {
            for (let i = 0; i < seg; i++) {
                const inSecondGap = ((i - secondGapStart + seg) % seg) < arena.gapSize;
                if (inSecondGap) {
                    arena.segments[i].collisionFilter.mask = 0;
                }
            }
        }

        // ── Mirror drain funnel for second gap ──────────────────────────
        const gapCenterIndex  = secondGapStart + arena.gapSize / 2;
        const secondGapAngle  = (gapCenterIndex / seg) * Math.PI * 2;
        const gapHalfAngle    = (arena.gapSize / seg) * Math.PI;
        const funnelHalfAngle = gapHalfAngle * 3.5;

        const cx = arena.cx;
        const cy = arena.cy;
        const flags = flagManager?.flags ?? [];
        const len   = flags.length;

        // PERFORMANCE: process 1/3 of flags per frame
        const start = (this._gapSynced ? 0 : 1) % 3;
        const forceScale = 3; // compensate for processing 1/3

        for (let i = start; i < len; i += 3) {
            const body = flags[i].body;
            const dx   = body.position.x - cx;
            const dy   = body.position.y - cy;
            const dist = Math.hypot(dx, dy);
            if (dist === 0) continue;

            // Only near the wall
            if (dist < arena.radius * 0.55) continue;

            const flagAngle = Math.atan2(dy, dx);
            let diff = flagAngle - secondGapAngle;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));

            if (Math.abs(diff) > funnelHalfAngle) continue;

            const closeness = 1 - Math.abs(diff) / funnelHalfAngle;
            const tx  = -Math.sin(flagAngle);
            const ty  =  Math.cos(flagAngle);
            const dir = diff > 0 ? -1 : 1;

            Matter.Body.applyForce(body, body.position, {
                x: tx * 0.0006 * closeness * dir * forceScale,
                y: ty * 0.0006 * closeness * dir * forceScale,
            });

            // Radial eject once inside the gap window
            if (Math.abs(diff) < gapHalfAngle && dist > arena.radius * 0.75) {
                Matter.Body.applyForce(body, body.position, {
                    x: (dx / dist) * 0.003 * forceScale,
                    y: (dy / dist) * 0.003 * forceScale,
                });
                Matter.Body.setAngularVelocity(
                    body,
                    body.angularVelocity + (Math.random() - 0.5) * 0.15
                );
            }
        }
    }

    end({ arena }) {
        arena._doubleHole = false;
        for (const seg of arena.segments) {
            seg.collisionFilter.mask = 0xFFFFFFFF;
        }
    }
}