import { gf, GAME_FONT } from '../GameFont.js';
// FinalBottomRenderer.js
// Remaining finalist flags strip — professional sports broadcast graphic

export default class FinalBottomRenderer {

    constructor() {
        this._pulse = 0;
    }

    draw(ctx, remainingFlags, eliminatedFlags, totalFinalists, canvasWidth, canvasHeight, trayHeight = 100) {
        this._pulse = (this._pulse + 0.04) % (Math.PI * 2);

        const trayTop = canvasHeight - trayHeight;
        const padding = 6;

        // Background
        const bg = ctx.createLinearGradient(0, trayTop, 0, canvasHeight);
        bg.addColorStop(0, 'rgba(16, 29, 56, 0.98)');
        bg.addColorStop(1, 'rgba(5, 8, 22, 1)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, trayTop, canvasWidth, trayHeight);

        // Electric-blue top border
        ctx.strokeStyle = 'rgba(61, 124, 255, 0.55)';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, trayTop);
        ctx.lineTo(canvasWidth, trayTop);
        ctx.stroke();

        // Header row — broadcast label
        const headerH    = Math.min(22, trayHeight * 0.24);
        const headerY    = trayTop + headerH / 2 + 2;
        const left       = remainingFlags.length;
        const pulseAlpha = 0.85 + 0.15 * Math.sin(this._pulse);

        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = gf(800, Math.min(headerH * 0.72, 14));
        ctx.shadowColor  = 'rgba(61, 124, 255, 0.45)';
        ctx.shadowBlur   = 6;
        ctx.fillStyle    = `rgba(56, 213, 255, ${pulseAlpha})`;
        ctx.fillText(`EARTHQUAKE  ·  ${left} FLAG${left !== 1 ? 'S' : ''} LEFT`, canvasWidth / 2, headerY);
        ctx.restore();

        // Flags
        const flagsAreaTop = trayTop + headerH + padding;
        const flagsAreaH   = trayHeight - headerH - padding * 2;

        const allFlags   = [...remainingFlags, ...eliminatedFlags];
        const count      = allFlags.length;
        if (count === 0) return;

        const aspect  = 1.43;
        const gapX    = 3;
        const maxFlagH = flagsAreaH;
        let flagH = maxFlagH;

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

        const drawFlag = (flag, x, alive) => {
            const img = flag.country?.image;
            ctx.save();

            if (alive) {
                const glow = 0.55 + 0.35 * Math.sin(this._pulse);
                ctx.shadowColor = `rgba(61, 124, 255, ${glow})`;
                ctx.shadowBlur  = 7;
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
                ctx.fillStyle = alive ? '#203B68' : '#0A1226';
                ctx.fillRect(x, flagY, flagW, flagH);
            }

            ctx.restore();

            ctx.strokeStyle = alive
                ? 'rgba(61, 124, 255, 0.70)'
                : 'rgba(244, 247, 255, 0.08)';
            ctx.lineWidth = alive ? 1.2 : 0.5;
            ctx.strokeRect(x, flagY, flagW, flagH);

            if (!alive && flagH >= 10) {
                ctx.save();
                ctx.globalAlpha  = 0.55;
                ctx.strokeStyle  = 'rgba(255, 83, 104, 0.90)';
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
