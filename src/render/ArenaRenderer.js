// ArenaRenderer.js — orange barrier arc (opposite, faster, same size as gap)

export default class ArenaRenderer {

    draw(ctx, arena, theme = null) {
        const ring      = theme?.ring      ?? "rgba(200, 180, 255, 0.95)";
        const ringGlow  = theme?.ringGlow  ?? "rgba(160, 140, 255, 0.25)";

        const ax = arena.cx + (arena._shakeX ?? 0) + (arena._swayX ?? 0);
        const ay = arena.cy + (arena._shakeY ?? 0) + (arena._swayY ?? 0);

        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(arena.angle);

        const gapAngle = (arena.gapSize / arena.segmentCount) * Math.PI * 2;

        ctx.strokeStyle = ringGlow;
        ctx.lineWidth   = 7;
        ctx.lineCap     = "round";
        this._strokeRing(ctx, arena, gapAngle);

        ctx.strokeStyle = ring;
        ctx.lineWidth   = 3.5;
        this._strokeRing(ctx, arena, gapAngle);

        ctx.restore();

        if (arena.rimEnabled) {
            this._drawOrangeArc(ctx, arena);
        }
    }

    /** Orange physics arc — opposite, faster; span == gap. No shadow/blur. */
    _drawOrangeArc(ctx, arena) {
        const ax = arena.cx + (arena._shakeX ?? 0) + (arena._swayX ?? 0);
        const ay = arena.cy + (arena._shakeY ?? 0) + (arena._swayY ?? 0);
        const r  = arena.rimRadius || (arena.radius + 4);
        const span = Math.max(
            0.12,
            arena.rimArcSpan ?? ((arena.gapSize || 2) / Math.max(1, arena.segmentCount)) * Math.PI * 2
        );

        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(arena.rimAngle || 0);
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        ctx.lineCap = "round";

        ctx.strokeStyle = "rgba(255, 140, 40, 0.35)";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, span, false);
        ctx.stroke();

        ctx.strokeStyle = "#FF8C28";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, span, false);
        ctx.stroke();

        ctx.strokeStyle = "#FFC070";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, span, false);
        ctx.stroke();

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
