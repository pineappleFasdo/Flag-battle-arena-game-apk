// FIX 8: Layout (flagH, flagW, cols, rows) is cached and only recomputed when
// the eliminated count changes. Saves a for-loop of up to ~70 iterations every frame.

export default class BottomTrayRenderer {

    constructor() {
        // Cache for the expensive flagH-fitting loop
        this._layoutCache = null;
    }

    draw(ctx, eliminated, canvasWidth, canvasHeight, trayHeight = 80) {

        const padding = 5;
        const trayTop = canvasHeight - trayHeight;

        // Background gradient
        const gradient = ctx.createLinearGradient(0, trayTop, 0, canvasHeight);
        gradient.addColorStop(0, "rgba(18,18,28,0.97)");
        gradient.addColorStop(1, "rgba(8,8,14,1)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, trayTop, canvasWidth, trayHeight);

        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(0, trayTop);
        ctx.lineTo(canvasWidth, trayTop);
        ctx.stroke();

        if (eliminated.length === 0) {
            this._layoutCache = null;   // reset cache when tray is cleared
            return;
        }

        const availW = canvasWidth - padding * 2;
        const availH = trayHeight  - padding * 2;

        const aspect = 1.43;
        const gapX   = 2;
        const gapY   = 2;

        // FIX 8: Only recompute layout when eliminated count or canvas width changes
        const cacheKey = `${eliminated.length}|${canvasWidth}|${trayHeight}`;
        let layout = this._layoutCache;

        if (!layout || layout.key !== cacheKey) {
            let flagH = 6;
            for (let h = 6; h <= availH; h++) {
                const w    = Math.round(h * aspect);
                const cols = Math.floor((availW + gapX) / (w + gapX));
                if (cols < 1) break;
                const rows   = Math.ceil(eliminated.length / cols);
                const totalH = rows * (h + gapY) - gapY;
                if (totalH <= availH) {
                    flagH = h;
                } else {
                    break;
                }
            }

            const flagW  = Math.round(flagH * aspect);
            const cols   = Math.max(1, Math.floor((availW + gapX) / (flagW + gapX)));
            const rows   = Math.ceil(eliminated.length / cols);
            const gridH  = rows * (flagH + gapY) - gapY;
            const startY = trayTop + padding + Math.max(0, (availH - gridH) / 2);

            layout = { key: cacheKey, flagH, flagW, cols, rows, startY };
            this._layoutCache = layout;
        }

        const { flagH, flagW, cols, startY } = layout;

        for (let i = 0; i < eliminated.length; i++) {

            const flag = eliminated[i];
            const col  = i % cols;
            const row  = Math.floor(i / cols);

            const fx = padding + col * (flagW + gapX);
            const fy = startY  + row * (flagH + gapY);

            const img = flag.country?.image;

            if (img && img.complete && img.naturalWidth > 0) {
                ctx.save();
                if (flagH >= 10) {
                    ctx.beginPath();
                    ctx.roundRect(fx, fy, flagW, flagH, Math.max(1, flagH * 0.08));
                    ctx.clip();
                }
                ctx.drawImage(img, fx, fy, flagW, flagH);
                ctx.restore();

                if (flagH >= 8) {
                    ctx.strokeStyle = "rgba(255,255,255,0.08)";
                    ctx.lineWidth   = 0.5;
                    ctx.strokeRect(fx, fy, flagW, flagH);
                }

            } else {
                ctx.fillStyle = "#223";
                ctx.fillRect(fx, fy, flagW, flagH);
            }
        }
    }
}