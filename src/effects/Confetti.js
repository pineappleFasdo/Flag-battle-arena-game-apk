// Confetti.js — richer burst: ribbons, squares, circles, glitter + fade

export default class Confetti {

    constructor() {
        this.particles = [];
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {number} [count=140]
     * @param {object} [opts]
     */
    start(x, y, count = 140, opts = {}) {
        this.particles = [];

        const colors = opts.colors ?? [
            "#ff3b30", "#ff9500", "#ffcc00", "#34c759",
            "#00c7ff", "#007aff", "#5856d6", "#af52de",
            "#ff2d55", "#ffffff", "#FFE566", "#FFD700",
        ];
        const fromTop = !!opts.fromTop;

        for (let i = 0; i < count; i++) {
            const roll = Math.random();
            let shape = "square";
            if (roll > 0.55) shape = "ribbon";
            else if (roll > 0.30) shape = "circle";
            else if (roll > 0.15) shape = "glitter";

            const angle = Math.random() * Math.PI * 2;
            const speed = 4 + Math.random() * 14;

            this.particles.push({
                x: fromTop ? (x + (Math.random() - 0.5) * (opts.spread ?? 360)) : x,
                y: fromTop ? (y - Math.random() * 40) : y,
                vx: fromTop
                    ? (Math.random() - 0.5) * 3.5
                    : Math.cos(angle) * speed * (0.6 + Math.random() * 0.8),
                vy: fromTop
                    ? (1.5 + Math.random() * 3.5)
                    : Math.sin(angle) * speed * 0.5 - (6 + Math.random() * 10),
                gravity: fromTop
                    ? 0.08 + Math.random() * 0.06
                    : 0.16 + Math.random() * 0.10,
                drag: 0.988 + Math.random() * 0.008,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.4,
                wobble: Math.random() * Math.PI * 2,
                wobbleSpeed: 0.04 + Math.random() * 0.06,
                color: colors[Math.floor(Math.random() * colors.length)],
                shape,
                width: shape === "ribbon"
                    ? 3 + Math.random() * 5
                    : shape === "glitter"
                        ? 2 + Math.random() * 2
                        : 4 + Math.random() * 5,
                height: shape === "ribbon"
                    ? 10 + Math.random() * 12
                    : shape === "glitter"
                        ? 2 + Math.random() * 2
                        : 4 + Math.random() * 5,
                life: 1,
                fade: fromTop
                    ? 0.0025 + Math.random() * 0.003
                    : 0.004 + Math.random() * 0.006,
                sparkle: Math.random() * Math.PI * 2,
            });
        }
    }

    /**
     * Continuous top-down confetti rain (champion screen).
     * Appends particles; does not clear existing ones.
     */
    /**
     * Soft champion rain — smaller, slower, lower opacity so UI stays readable.
     * @param {number} canvasWidth
     * @param {number} [count=8]
     * @param {object} [opts]
     */
    rain(canvasWidth, count = 8, opts = {}) {
        const colors = [
            "#ff3b30", "#ff9500", "#ffcc00", "#34c759",
            "#00c7ff", "#007aff", "#5856d6", "#af52de",
            "#ff2d55", "#ffffff", "#FFE566", "#FFD700",
        ];
        const w = canvasWidth || 400;
        const alphaScale = opts.alphaScale ?? 0.55; // fade overall

        for (let i = 0; i < count; i++) {
            const roll = Math.random();
            let shape = "square";
            if (roll > 0.55) shape = "ribbon";
            else if (roll > 0.30) shape = "circle";
            else if (roll > 0.15) shape = "glitter";

            this.particles.push({
                x: Math.random() * w,
                y: -8 - Math.random() * 24,
                // slower drift + fall
                vx: (Math.random() - 0.5) * 1.2,
                vy: 0.45 + Math.random() * 1.1,
                gravity: 0.025 + Math.random() * 0.02,
                drag: 0.992 + Math.random() * 0.005,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.18,
                wobble: Math.random() * Math.PI * 2,
                wobbleSpeed: 0.02 + Math.random() * 0.03,
                color: colors[Math.floor(Math.random() * colors.length)],
                shape,
                // smaller pieces
                width: shape === "ribbon"
                    ? 1.5 + Math.random() * 2.5
                    : shape === "glitter"
                        ? 1 + Math.random() * 1.5
                        : 2 + Math.random() * 2.5,
                height: shape === "ribbon"
                    ? 5 + Math.random() * 6
                    : shape === "glitter"
                        ? 1 + Math.random() * 1.5
                        : 2 + Math.random() * 2.5,
                life: alphaScale * (0.75 + Math.random() * 0.25),
                fade: 0.0015 + Math.random() * 0.0018,
                sparkle: Math.random() * Math.PI * 2,
                alphaScale,
            });
        }

        // Lower cap so champion screen never floods
        if (this.particles.length > 180) {
            this.particles = this.particles.slice(-180);
        }
    }

    update() {
        for (const p of this.particles) {
            p.vx *= p.drag;
            p.vy += p.gravity;
            p.x  += p.vx + Math.sin(p.wobble) * 0.7;
            p.y  += p.vy;
            p.rotation += p.rotationSpeed;
            p.wobble   += p.wobbleSpeed;
            p.sparkle  += 0.15;
            p.life     -= p.fade;
        }

        this.particles = this.particles.filter(
            p => p.life > 0 && p.y < (typeof window !== "undefined" ? window.innerHeight : 2000) + 80
        );
    }

    draw(ctx) {
        for (const p of this.particles) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);

            if (p.shape === "glitter") {
                const twinkle = 0.5 + 0.5 * Math.sin(p.sparkle);
                ctx.globalAlpha = Math.max(0, p.life * twinkle);
                ctx.fillStyle = p.color;

                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.arc(0, 0, p.width / 2, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.shape === "ribbon") {
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
            } else if (p.shape === "circle") {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(0, 0, p.width / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
            }

            ctx.restore();
        }
    }
}