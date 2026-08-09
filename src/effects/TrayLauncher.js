// TrayLauncher.js
// Flags swarm from the bottom tray into the arena during NEXT EVENT.
// End size matches the in-arena flag size exactly.

export default class TrayLauncher {

    constructor() {
        this.particles = [];
        this.isDone    = true;
        this._elapsed  = 0;
    }

    cancel() {
        this.particles = [];
        this.isDone    = true;
        this._elapsed  = 0;
    }

    /**
     * @param {Array}  flags   - [{ country }] or flag objects
     * @param {number} trayTop
     * @param {number} canvasW
     * @param {number} arenaX, arenaY, arenaR
     * @param {Array}  targets - [{x,y}, ...] spawn positions
     * @param {number} [flagW] - arena flag width
     * @param {number} [flagH] - arena flag height
     */
    startLaunch(flags, trayTop, canvasW, arenaX, arenaY, arenaR, targets, flagW = 0, flagH = 0) {
        this.particles = [];
        this.isDone    = false;
        this._elapsed  = 0;

        const total = flags?.length ?? 0;
        if (total === 0) {
            this.isDone = true;
            return;
        }

        const endW = flagW > 0 ? flagW : 18;
        const endH = flagH > 0 ? flagH : endW * 0.70;

        const spacing     = 2;
        const aspectRatio = 1.45;
        const maxFlagH    = 12;

        const availW = canvasW - 12;
        const fH     = maxFlagH;
        const fW     = fH * aspectRatio;
        const cols   = Math.max(1, Math.floor(availW / (fW + spacing)));
        const rows   = Math.ceil(total / cols);
        const gridH  = rows * (fH + spacing) - spacing;
        const startY = trayTop + 6 + Math.max(0, (80 - 12 - gridH) / 2);

        for (let idx = 0; idx < total; idx++) {
            const flag = flags[idx];
            const col  = idx % cols;
            const row  = Math.floor(idx / cols);
            const sx   = 6 + col * (fW + spacing) + fW / 2;
            const sy   = startY + row * (fH + spacing) + fH / 2;

            const target = targets?.[idx] ?? {
                x: arenaX + (Math.random() - 0.5) * arenaR * 1.05,
                y: arenaY + (Math.random() - 0.5) * arenaR * 1.05,
            };

            const midX  = (sx + target.x) * 0.5;
            const peakY = Math.min(sy, target.y) - arenaR * (0.25 + Math.random() * 0.2);
            const fan   = (sx - canvasW / 2) * 0.08;

            // Stagger more so fewer particles move at once
            const delay = Math.floor(
                (row / Math.max(1, rows - 1)) * 28 +
                (col / Math.max(1, cols - 1)) * 16 +
                Math.random() * 8
            );

            this.particles.push({
                img   : flag?.country?.image ?? flag?.image ?? null,
                sx, sy,
                tx    : target.x,
                ty    : target.y,
                delay,
                t     : 0,
                speed : 0.028 + Math.random() * 0.012, // slightly faster → shorter overall
                w     : fW,
                h     : fH,
                endW,
                endH,
                done  : false,
                cpx   : midX + fan,
                cpy   : peakY,
                rot   : 0,
                rotSpd: (Math.random() - 0.5) * 0.025,
            });
        }
    }

    update() {
        if (this.isDone) return;

        this._elapsed++;
        let allDone = true;

        for (const p of this.particles) {
            if (p.done) continue;

            if (p.delay > 0) {
                p.delay--;
                allDone = false;
                continue;
            }

            p.t += p.speed;
            p.rot += p.rotSpd * (1 - p.t);

            if (p.t >= 1) {
                p.t    = 1;
                p.done = true;
            } else {
                allDone = false;
            }
        }

        if (allDone) this.isDone = true;
    }

    get finished() {
        return this.isDone;
    }

    draw(ctx) {
        if (this.isDone && this.particles.length === 0) return;

        for (const p of this.particles) {
            if (p.delay > 0 || p.done) continue;

            const raw = p.t;
            const t   = raw * raw * (3 - 2 * raw); // smoothstep
            const mt  = 1 - t;

            const bx = mt * mt * p.sx + 2 * mt * t * p.cpx + t * t * p.tx;
            const by = mt * mt * p.sy + 2 * mt * t * p.cpy + t * t * p.ty;

            const drawW = p.w + (p.endW - p.w) * t;
            const drawH = p.h + (p.endH - p.h) * t;

            const alpha = t > 0.88 ? 1 - (t - 0.88) / 0.12 : 1;

            ctx.save();
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.translate(bx, by);
            ctx.rotate(p.rot);

            // PERFORMANCE: no clip/roundRect during flight — big saving
            if (p.img && p.img.complete && p.img.naturalWidth > 0) {
                ctx.drawImage(p.img, -drawW / 2, -drawH / 2, drawW, drawH);
            } else {
                ctx.fillStyle = "#334466";
                ctx.fillRect(-drawW / 2, -drawH / 2, drawW, drawH);
            }

            ctx.restore();
        }
    }
}