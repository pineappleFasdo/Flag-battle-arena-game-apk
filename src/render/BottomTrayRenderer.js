import { gf, GAME_FONT } from '../GameFont.js';
// Bottom tray — eliminated flags strip (broadcast navy panel)
// Supports an optional asteroidMessage: { countries: [flag,...], time: ms }
// When present and recent (<= 5 s), shows the "Eliminated by Asteroid Shower"
// overlay with flag images + country names; flag grid still runs beneath it.

export default class BottomTrayRenderer {

    constructor() {
        this._layoutCache = null;
    }

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {Array}  eliminated      - all eliminated flag objects
     * @param {number} canvasWidth
     * @param {number} canvasHeight
     * @param {number} trayHeight
     * @param {object|null} asteroidMessage  - { countries:[flag,...], time:ms }
     */
    draw(ctx, eliminated, canvasWidth, canvasHeight, trayHeight = 80, asteroidMessage = null) {

        const padding = 5;
        const trayTop = canvasHeight - trayHeight;

        // Background — secondary / panels
        const gradient = ctx.createLinearGradient(0, trayTop, 0, canvasHeight);
        gradient.addColorStop(0, 'rgba(16, 29, 56, 0.97)');
        gradient.addColorStop(1, 'rgba(5, 8, 22, 1)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, trayTop, canvasWidth, trayHeight);

        ctx.strokeStyle = 'rgba(46, 98, 232, 0.40)';
        ctx.lineWidth   = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, trayTop);
        ctx.lineTo(canvasWidth, trayTop);
        ctx.stroke();

        // ── Asteroid shower message (compact banner at top of tray) ──────────
        // Does NOT replace the eliminated-flag grid — both stay visible.
        const msgActive = asteroidMessage &&
            asteroidMessage.countries?.length > 0 &&
            Date.now() - asteroidMessage.time < 5000;

        let gridTop = trayTop;
        let gridH   = trayHeight;
        if (msgActive) {
            const bannerH = Math.min(22, Math.round(trayHeight * 0.28));
            this._drawAsteroidBanner(ctx, asteroidMessage, canvasWidth, trayTop, bannerH);
            gridTop = trayTop + bannerH;
            gridH   = Math.max(0, trayHeight - bannerH);
        }

        // ── Normal flag grid (always shows eliminated flags) ─────────────────
        if (eliminated.length === 0) {
            this._layoutCache = null;
            return;
        }

        const availW = canvasWidth - padding * 2;
        const availH = Math.max(4, gridH - padding * 2);

        const aspect = 1.5;   // standard flag ratio (width:height = 3:2)
        const gapX   = 2;
        const gapY   = 2;

        const cacheKey = `${eliminated.length}|${canvasWidth}|${gridH}|${msgActive ? 1 : 0}`;
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
            const usedH  = rows * (flagH + gapY) - gapY;
            const startY = gridTop + padding + Math.max(0, (availH - usedH) / 2);

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
            const byAsteroid = !!flag._eliminatedByAsteroid;

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
                    ctx.strokeStyle = byAsteroid
                        ? 'rgba(255,136,68,0.70)'
                        : 'rgba(244, 247, 255, 0.10)';
                    ctx.lineWidth   = byAsteroid ? 1 : 0.5;
                    ctx.strokeRect(fx, fy, flagW, flagH);
                }

            } else {
                ctx.fillStyle = byAsteroid ? '#2A1500' : '#172B50';
                ctx.fillRect(fx, fy, flagW, flagH);
            }
        }
    }

    /** Compact asteroid banner (top of bottom tray) — does not replace flag grid. */
    _drawAsteroidBanner(ctx, msg, cw, trayTop, bannerH) {
        const age = Date.now() - msg.time;
        const fadeAlpha = age > 4000 ? Math.max(0, 1 - (age - 4000) / 1000) : 1;
        const n = msg.countries?.length ?? 0;

        ctx.save();
        ctx.globalAlpha = fadeAlpha;
        ctx.fillStyle = 'rgba(60, 22, 8, 0.92)';
        ctx.fillRect(0, trayTop, cw, bannerH);
        ctx.strokeStyle = 'rgba(255,136,68,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, trayTop + bannerH);
        ctx.lineTo(cw, trayTop + bannerH);
        ctx.stroke();

        const labelSize = Math.max(9, Math.round(bannerH * 0.55));
        ctx.fillStyle    = '#FF8844';
        ctx.font         = gf(700, labelSize);
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = 'rgba(255,80,0,0.45)';
        ctx.shadowBlur   = 5;
        ctx.fillText(
            n > 0
                ? `☄️  Asteroid: ${n} eliminated`
                : '☄️  Eliminated by Asteroid Shower',
            cw / 2,
            trayTop + bannerH / 2
        );
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    // ── Asteroid shower message ───────────────────────────────────────────────
    _drawAsteroidMessage(ctx, msg, cw, ch, trayH, trayTop) {
        const countries = msg.countries;
        const age       = Date.now() - msg.time;
        // Fade out in last second
        const fadeAlpha = age > 4000 ? Math.max(0, 1 - (age - 4000) / 1000) : 1;

        ctx.save();
        ctx.globalAlpha = fadeAlpha;

        // ── Header line ───────────────────────────────────────────────────────
        const headerH   = Math.round(trayH * 0.38);
        const labelSize = Math.max(9, Math.round(headerH * 0.52));

        ctx.fillStyle    = '#FF8844';
        ctx.font         = gf(700, labelSize);
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = 'rgba(255,80,0,0.55)';
        ctx.shadowBlur   = 6;
        ctx.fillText('☄️  Eliminated by Asteroid Shower', cw / 2, trayTop + headerH / 2);
        ctx.shadowBlur = 0;

        // ── Flag + name row ───────────────────────────────────────────────────
        const rowY   = trayTop + headerH;
        const rowH   = trayH - headerH;
        const flagH  = Math.min(Math.round(rowH * 0.72), 36);
        const flagW  = Math.round(flagH * 1.5);  // standard 3:2 flag ratio
        const nameFs = Math.max(8, Math.round(flagH * 0.42));
        const gap    = 10;

        // Measure total width
        ctx.font = gf(600, nameFs);
        let totalW = 0;
        for (const flag of countries) {
            const nm = flag.country?.name ?? flag.name ?? '';
            totalW += flagW + 5 + ctx.measureText(nm).width + gap;
        }
        totalW = Math.max(0, totalW - gap);

        // Clamp to canvas width with padding
        const maxW  = cw - 20;
        const scale = totalW > maxW ? maxW / totalW : 1;
        const effFlagW  = Math.round(flagW  * scale);
        const effFlagH  = Math.round(flagH  * scale);
        const effNameFs = Math.max(7, Math.round(nameFs * scale));
        const effGap    = Math.round(gap * scale);

        ctx.font = gf(600, effNameFs);

        // Recompute width with effective sizes
        let scaledTotalW = 0;
        for (const flag of countries) {
            const nm = flag.country?.name ?? flag.name ?? '';
            scaledTotalW += effFlagW + 5 + ctx.measureText(nm).width + effGap;
        }
        scaledTotalW = Math.max(0, scaledTotalW - effGap);

        let x = (cw - scaledTotalW) / 2;
        const fy = rowY + (rowH - effFlagH) / 2;

        for (const flag of countries) {
            const img = flag.country?.image ?? flag.image;
            const nm  = flag.country?.name  ?? flag.name ?? '';

            // Flag thumbnail
            if (img && img.complete && img.naturalWidth > 0) {
                ctx.save();
                ctx.beginPath();
                if (typeof ctx.roundRect === 'function') {
                    ctx.roundRect(x, fy, effFlagW, effFlagH, 2);
                } else {
                    ctx.rect(x, fy, effFlagW, effFlagH);
                }
                ctx.clip();
                ctx.drawImage(img, x, fy, effFlagW, effFlagH);
                ctx.restore();

                // Orange tint border to indicate asteroid kill
                ctx.strokeStyle = 'rgba(255,136,68,0.55)';
                ctx.lineWidth   = 1;
                ctx.beginPath();
                if (typeof ctx.roundRect === 'function') ctx.roundRect(x, fy, effFlagW, effFlagH, 2);
                else ctx.rect(x, fy, effFlagW, effFlagH);
                ctx.stroke();
            } else {
                ctx.fillStyle = '#2A1500';
                ctx.fillRect(x, fy, effFlagW, effFlagH);
            }
            x += effFlagW + 5;

            // Country name
            const nmW = ctx.measureText(nm).width;
            ctx.fillStyle    = '#F4F7FF';
            ctx.textAlign    = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(nm, x, fy + effFlagH / 2);
            x += nmW + effGap;
        }

        ctx.restore();
    }
}
