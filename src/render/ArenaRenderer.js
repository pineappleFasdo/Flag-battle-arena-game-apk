// ArenaRenderer.js — ring + soft outer glow

export default class ArenaRenderer {

    draw(ctx, arena) {

        ctx.save();

        ctx.translate(
            arena.cx + (arena._shakeX ?? 0) + (arena._swayX ?? 0),
            arena.cy + (arena._shakeY ?? 0) + (arena._swayY ?? 0)
        );
        ctx.rotate(arena.angle);

        const gapAngle = (arena.gapSize / arena.segmentCount) * Math.PI * 2;

        // Soft outer glow (drawn first, under the ring)
        ctx.save();
        ctx.shadowColor = "rgba(120, 180, 255, 0.55)";
        ctx.shadowBlur  = 18;
        ctx.strokeStyle = "rgba(180, 210, 255, 0.35)";
        ctx.lineWidth   = 8;
        ctx.lineCap     = "round";
        this._strokeRing(ctx, arena, gapAngle);
        ctx.restore();

        // Main white ring
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth   = 3;
        ctx.lineCap     = "round";
        ctx.shadowColor = "rgba(255,255,255,0.40)";
        ctx.shadowBlur  = 8;
        this._strokeRing(ctx, arena, gapAngle);

        // Inner thin highlight
        ctx.shadowBlur  = 0;
        ctx.strokeStyle = "rgba(200, 230, 255, 0.25)";
        ctx.lineWidth   = 1.5;
        this._strokeRing(ctx, arena, gapAngle, -1.5);

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