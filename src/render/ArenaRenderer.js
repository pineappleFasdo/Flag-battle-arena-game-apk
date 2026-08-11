// ArenaRenderer.js — white main ring + subtle electric-blue glow (premium broadcast)

export default class ArenaRenderer {

    draw(ctx, arena) {

        ctx.save();

        ctx.translate(
            arena.cx + (arena._shakeX ?? 0) + (arena._swayX ?? 0),
            arena.cy + (arena._shakeY ?? 0) + (arena._swayY ?? 0)
        );
        ctx.rotate(arena.angle);

        const gapAngle = (arena.gapSize / arena.segmentCount) * Math.PI * 2;

        // Soft outer electric-blue glow (under the ring — kept subtle)
        ctx.save();
        ctx.shadowColor = "rgba(61, 124, 255, 0.40)";
        ctx.shadowBlur  = 14;
        ctx.strokeStyle = "rgba(56, 213, 255, 0.22)";
        ctx.lineWidth   = 7;
        ctx.lineCap     = "round";
        this._strokeRing(ctx, arena, gapAngle);
        ctx.restore();

        // Main white ring
        ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
        ctx.lineWidth   = 3;
        ctx.lineCap     = "round";
        ctx.shadowColor = "rgba(61, 124, 255, 0.28)";
        ctx.shadowBlur  = 6;
        this._strokeRing(ctx, arena, gapAngle);

        // Subtle blue inner ring
        ctx.shadowBlur  = 0;
        ctx.strokeStyle = "rgba(61, 124, 255, 0.22)";
        ctx.lineWidth   = 1.4;
        this._strokeRing(ctx, arena, gapAngle, -2.2);

        // Very thin outer cyan hint
        ctx.strokeStyle = "rgba(56, 213, 255, 0.14)";
        ctx.lineWidth   = 1;
        this._strokeRing(ctx, arena, gapAngle, 2.5);

        ctx.restore();
    }

    _strokeRing(ctx, arena, gapAngle, radiusOffset = 0) {
        const r = arena.radius + radiusOffset;

        if (arena._doubleHole) {
            ctx.beginPath();
            ctx.arc(0, 0, r, gapAngle, Math.PI, false);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(0, 0, r, Math.PI + gapAngle, Math.PI * 2, false);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.arc(0, 0, r, gapAngle, Math.PI * 2, false);
            ctx.stroke();
        }
    }
}
