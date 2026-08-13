// ArenaRenderer.js — ring colors driven by active theme

export default class ArenaRenderer {

    draw(ctx, arena, theme = null) {
        const ring      = theme?.ring      ?? "rgba(255, 255, 255, 0.95)";
        const ringGlow  = theme?.ringGlow  ?? "rgba(56, 213, 255, 0.22)";
        const ringOuter = theme?.ringOuter ?? "rgba(61, 124, 255, 0.22)";
        const accent    = theme?.accent    ?? "#3D7CFF";

        ctx.save();

        ctx.translate(
            arena.cx + (arena._shakeX ?? 0) + (arena._swayX ?? 0),
            arena.cy + (arena._shakeY ?? 0) + (arena._swayY ?? 0)
        );
        ctx.rotate(arena.angle);

        const gapAngle = (arena.gapSize / arena.segmentCount) * Math.PI * 2;

        // Soft outer glow
        ctx.save();
        ctx.shadowColor = ringGlow;
        ctx.shadowBlur  = 14;
        ctx.strokeStyle = ringGlow;
        ctx.lineWidth   = 7;
        ctx.lineCap     = "round";
        this._strokeRing(ctx, arena, gapAngle);
        ctx.restore();

        // Main ring
        ctx.strokeStyle = ring;
        ctx.lineWidth   = 3;
        ctx.lineCap     = "round";
        ctx.shadowColor = ringGlow;
        ctx.shadowBlur  = 6;
        this._strokeRing(ctx, arena, gapAngle);

        // Subtle inner ring
        ctx.shadowBlur  = 0;
        ctx.strokeStyle = ringOuter;
        ctx.lineWidth   = 1.4;
        this._strokeRing(ctx, arena, gapAngle, -2.2);

        // Thin outer hint
        ctx.strokeStyle = ringGlow;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth   = 1;
        this._strokeRing(ctx, arena, gapAngle, 2.5);
        ctx.globalAlpha = 1;

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
