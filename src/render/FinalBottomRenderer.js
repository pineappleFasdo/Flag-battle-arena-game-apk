// FinalBottomRenderer.js
// Shows the remaining finalist flags in a prominent bottom strip during Final Mode.
// Also shows "GRAND FINAL · X flags left" header.
// Does NOT touch audio, physics, or elimination logic.

export default class FinalBottomRenderer {

    constructor() {
        this._pulse = 0;
    }

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {Flag[]} remainingFlags  - still-alive flags in the arena
     * @param {Flag[]} eliminatedFlags - eliminated flags this final session
     * @param {number} totalFinalists  - how many started the final
     * @param {number} canvasWidth
     * @param {number} canvasHeight
     * @param {number} trayHeight
     */
    draw(ctx, remainingFlags, eliminatedFlags, totalFinalists, canvasWidth, canvasHeight, trayHeight = 100) {
        this._pulse = (this._pulse + 0.04) % (Math.PI * 2);

        const trayTop = canvasHeight - trayHeight;
        const padding = 6;

        // ── Background ───────────────────────────────────────────────────────
        const bg = ctx.createLinearGradient(0, trayTop, 0, canvasHeight);
        bg.addColorStop(0, 'rgba(5, 18, 40, 0.98)');
        bg.addColorStop(1, 'rgba(2, 8, 20, 1)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, trayTop, canvasWidth, trayHeight);

        // Blue top border
        ctx.strokeStyle = 'rgba(40, 160, 255, 0.55)';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, trayTop);
        ctx.lineTo(canvasWidth, trayTop);
        ctx.stroke();

        // ── Header row ───────────────────────────────────────────────────────
        const headerH    = Math.min(22, trayHeight * 0.24);
        const headerY    = trayTop + headerH / 2 + 2;
        const left       = remainingFlags.length;
        const pulseAlpha = 0.80 + 0.20 * Math.sin(this._pulse);

        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = `700 ${Math.min(headerH * 0.72, 14)}px system-ui, Arial, sans-serif`;
        ctx.shadowColor  = 'rgba(40,160,255,0.7)';
        ctx.shadowBlur   = 8;
        ctx.fillStyle    = `rgba(40, 200, 255, ${pulseAlpha})`;
        ctx.fillText(`🏆  GRAND FINAL  ·  ${left} flag${left !== 1 ? 's' : ''} remaining`, canvasWidth / 2, headerY);
        ctx.restore();

        // ── Flags ────────────────────────────────────────────────────────────
        const flagsAreaTop = trayTop + headerH + padding;
        const flagsAreaH   = trayHeight - headerH - padding * 2;

        // Compute the best flag size that fits all remaining flags in one row
        const allFlags   = [...remainingFlags, ...eliminatedFlags];
        const count      = allFlags.length;
        if (count === 0) return;

        const aspect  = 1.43;
        const gapX    = 3;
        const maxFlagH = flagsAreaH;
        let flagH = maxFlagH;

        // Shrink until all fit in one row
        while (flagH > 4) {
            const fw   = Math.round(flagH * aspect);
            const totalW = count * fw + (count - 1) * gapX;
            if (totalW <= canvasWidth - padding * 2) break;
            flagH--;
        }

        const flagW   = Math.round(flagH * aspect);
        const totalW  = count * flagW + (count - 1) * gapX;
        const startX  = (canvasWidth - totalW) / 2;
        const flagY   = flagsAreaTop + (flagsAreaH - flagH) / 2;

        // Draw eliminated flags (greyed out) first, then remaining (bright)
        const drawFlag = (flag, x, alive) => {
            const img = flag.country?.image;
            ctx.save();

            if (alive) {
                // Glowing border pulse for alive flags
                const glow = 0.6 + 0.4 * Math.sin(this._pulse);
                ctx.shadowColor = `rgba(40,200,255,${glow})`;
                ctx.shadowBlur  = 8;
            } else {
                ctx.globalAlpha = 0.30;
            }

            if (img && img.complete && img.naturalWidth > 0) {
                if (flagH >= 8) {
                    ctx.beginPath();
                    ctx.roundRect(x, flagY, flagW, flagH, Math.max(1, flagH * 0.08));
                    ctx.clip();
                }
                ctx.drawImage(img, x, flagY, flagW, flagH);
            } else {
                ctx.fillStyle = alive ? '#1a3a6a' : '#222';
                ctx.fillRect(x, flagY, flagW, flagH);
            }

            ctx.restore();

            // Border
            ctx.strokeStyle = alive
                ? `rgba(40,200,255,0.70)`
                : 'rgba(255,255,255,0.08)';
            ctx.lineWidth = alive ? 1.2 : 0.5;
            ctx.strokeRect(x, flagY, flagW, flagH);

            // X mark over eliminated flags
            if (!alive && flagH >= 10) {
                ctx.save();
                ctx.globalAlpha  = 0.55;
                ctx.strokeStyle  = 'rgba(255,60,60,0.9)';
                ctx.lineWidth    = Math.max(1, flagH * 0.08);
                ctx.beginPath();
                ctx.moveTo(x + flagW * 0.2, flagY + flagH * 0.2);
                ctx.lineTo(x + flagW * 0.8, flagY + flagH * 0.8);
                ctx.moveTo(x + flagW * 0.8, flagY + flagH * 0.2);
                ctx.lineTo(x + flagW * 0.2, flagY + flagH * 0.8);
                ctx.stroke();
                ctx.restore();
            }
        };

        // Lay out: eliminated first (left), then remaining (right) OR just sequential
        // We keep original order: remaining are alive, eliminated are not
        let xi = 0;
        for (const flag of remainingFlags) {
            drawFlag(flag, startX + xi * (flagW + gapX), true);
            xi++;
        }
        for (const flag of eliminatedFlags) {
            drawFlag(flag, startX + xi * (flagW + gapX), false);
            xi++;
        }
    }
}
