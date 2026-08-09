// VisualFX.js — collision sparks only (no full-screen shake / flash)
// FIX 3: Shadow is set ONCE per draw call instead of per-particle.
// This eliminates 180 shadow state changes per frame at peak.

export default class VisualFX {

    constructor() {
        this.sparks = [];
        this.shakeX = 0;
        this.shakeY = 0;
    }

    /** no-op — full-screen shake removed */
    shake(_magnitude = 8) {}

    /** no-op — full-screen flash removed */
    flash(_alpha = 0.35, _rgb = "255,255,255") {}

    /**
     * Burst of sparks at a point.
     * @param {number} x
     * @param {number} y
     * @param {number} [count=8]
     * @param {string} [color="#FFD700"]
     */
    spark(x, y, count = 8, color = "#FFD700") {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 4.5;
            this.sparks.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                fade: 0.04 + Math.random() * 0.05,
                size: 1.5 + Math.random() * 2.5,
                color,
            });
        }
        if (this.sparks.length > 180) {
            this.sparks.splice(0, this.sparks.length - 180);
        }
    }

    update() {
        for (const s of this.sparks) {
            s.x += s.vx;
            s.y += s.vy;
            s.vx *= 0.94;
            s.vy *= 0.94;
            s.life -= s.fade;
        }
        this.sparks = this.sparks.filter(s => s.life > 0);
    }

    draw(ctx, _canvasW, _canvasH) {
        if (this.sparks.length === 0) return;

        // FIX 3: Set shadow state ONCE before the loop, not per-particle.
        // Grouping by color and setting shadow once saves ~180 GPU state changes/frame.
        ctx.save();
        ctx.shadowBlur = 2;

        // Group sparks by color to minimize state switches
        const byColor = new Map();
        for (const s of this.sparks) {
            if (!byColor.has(s.color)) byColor.set(s.color, []);
            byColor.get(s.color).push(s);
        }

        for (const [color, group] of byColor) {
            ctx.fillStyle   = color;
            ctx.shadowColor = color;
            for (const s of group) {
                ctx.globalAlpha = Math.max(0, s.life);
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.size * s.life, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    reset() {
        this.sparks = [];
        this.shakeX = 0;
        this.shakeY = 0;
    }
}
