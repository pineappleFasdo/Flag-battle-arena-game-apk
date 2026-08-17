import { gf, GAME_FONT } from '../GameFont.js';
// FinalBottomRenderer.js
// Remaining finalist flags strip — theme-aware (space / classic / …)

export default class FinalBottomRenderer {

    constructor() {
        this._pulse = 0;
        this._themeId = 'classic';
    }

    setTheme(theme) {
        this._themeId = theme?.id || 'classic';
    }

    draw(ctx, remainingFlags, eliminatedFlags, totalFinalists, canvasWidth, canvasHeight, trayHeight = 100) {
        this._pulse = (this._pulse + 0.04) % (Math.PI * 2);

        const trayTop = canvasHeight - trayHeight;
        const padding = 6;
        const isSpace = this._themeId === 'space';
        const isLava  = this._themeId === 'lava';
        const isSea   = this._themeId === 'deepsea';

        // Theme tray background
        const bg = ctx.createLinearGradient(0, trayTop, 0, canvasHeight);
        if (isSpace) {
            bg.addColorStop(0, 'rgba(18, 10, 40, 0.98)');
            bg.addColorStop(1, 'rgba(4, 2, 12, 1)');
        } else if (isLava) {
            bg.addColorStop(0, 'rgba(42, 16, 8, 0.98)');
            bg.addColorStop(1, 'rgba(18, 4, 4, 1)');
        } else if (isSea) {
            bg.addColorStop(0, 'rgba(10, 36, 48, 0.98)');
            bg.addColorStop(1, 'rgba(2, 16, 24, 1)');
        } else {
            bg.addColorStop(0, 'rgba(16, 29, 56, 0.98)');
            bg.addColorStop(1, 'rgba(5, 8, 22, 1)');
        }
        ctx.fillStyle = bg;
        ctx.fillRect(0, trayTop, canvasWidth, trayHeight);

        // Top border
        const border = isSpace ? 'rgba(160, 120, 255, 0.55)'
            : isLava ? 'rgba(255, 90, 30, 0.55)'
            : isSea ? 'rgba(30, 200, 180, 0.55)'
            : 'rgba(61, 124, 255, 0.55)';
        ctx.strokeStyle = border;
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, trayTop);
        ctx.lineTo(canvasWidth, trayTop);
        ctx.stroke();

        // Header row
        const headerH    = Math.min(22, trayHeight * 0.24);
        const headerY    = trayTop + headerH / 2 + 2;
        const left       = remainingFlags.length;
        const pulseAlpha = 0.85 + 0.15 * Math.sin(this._pulse);
        const titleCol = isSpace ? `rgba(184, 160, 255, ${pulseAlpha})`
            : isLava ? `rgba(255, 176, 112, ${pulseAlpha})`
            : isSea ? `rgba(94, 232, 212, ${pulseAlpha})`
            : `rgba(56, 213, 255, ${pulseAlpha})`;

        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = gf(800, Math.min(headerH * 0.72, 14));
        ctx.shadowBlur = 0;
        ctx.fillStyle    = titleCol;
        ctx.fillText(`ELIMINATION ROUND  ·  ${left} FLAG${left !== 1 ? 'S' : ''} LEFT`, canvasWidth / 2, headerY);
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

        const aliveBorder = isSpace ? 'rgba(160, 120, 255, 0.75)'
            : isLava ? 'rgba(255, 90, 30, 0.75)'
            : isSea ? 'rgba(30, 200, 180, 0.75)'
            : 'rgba(61, 124, 255, 0.70)';
        const deadFill = isSpace ? '#120A28' : isLava ? '#2A1008' : isSea ? '#0A2430' : '#0A1226';
        const aliveFill = isSpace ? '#1A1040' : isLava ? '#3A1810' : isSea ? '#0E3040' : '#203B68';

        const drawFlag = (flag, x, alive) => {
            const img = flag.country?.image;
            ctx.save();

            if (!alive) {
                ctx.globalAlpha = 0.30;
            }

            if (img && img.complete && img.naturalWidth > 0) {
                if (flagH >= 8) {
                    ctx.beginPath();
                    if (typeof ctx.roundRect === 'function') {
                        ctx.roundRect(x, flagY, flagW, flagH, Math.max(1, flagH * 0.08));
                    } else {
                        ctx.rect(x, flagY, flagW, flagH);
                    }
                    ctx.clip();
                }
                ctx.drawImage(img, x, flagY, flagW, flagH);
            } else {
                ctx.fillStyle = alive ? aliveFill : deadFill;
                ctx.fillRect(x, flagY, flagW, flagH);
            }

            ctx.restore();

            ctx.strokeStyle = alive ? aliveBorder : 'rgba(244, 247, 255, 0.08)';
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
        for (const f of remainingFlags) {
            drawFlag(f, startX + xi * (flagW + gapX), true);
            xi++;
        }
        for (const f of eliminatedFlags) {
            drawFlag(f, startX + xi * (flagW + gapX), false);
            xi++;
        }
    }
}
