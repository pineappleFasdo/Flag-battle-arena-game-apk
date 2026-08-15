import { gf, GAME_FONT } from '../GameFont.js';
// WinnerRenderer.js
// Premium champion presentation — blue/navy cinematic rays, gold for Champion/trophy/wins

export default class WinnerRender {

    constructor() {
        this._rayAngle  = 0;
        this._ringPhase = 0;
    }

    draw(ctx, winner, canvasWidth, canvasHeight, isCountdown = false, animT = 1,
         arenaX, arenaY, arenaRadius, isFinalMode = false, finalFlagsLeft = 0,
         nextRoundSecsRemain = null) {
        if (!winner) return;

        if (winner.isTie) {
            if (winner.isSilent) return;
            this._drawTie(ctx, winner, canvasWidth, canvasHeight, animT, nextRoundSecsRemain);
            return;
        }

        this._drawWinner(ctx, winner, canvasWidth, canvasHeight,
            isCountdown, animT, arenaX, arenaY, arenaRadius, isFinalMode, finalFlagsLeft,
            nextRoundSecsRemain);
    }

    _drawWinner(ctx, winner, cw, ch, isCountdown, animT, arenaX, arenaY, arenaR, isFinalMode, finalFlagsLeft, nextRoundSecsRemain = null) {
        const ease = this._easeOutBack(Math.min(1, animT));
        const fade = Math.min(1, animT * 1.6);

        const cx = (arenaX !== undefined) ? arenaX : cw / 2;
        const cy = (arenaY !== undefined) ? arenaY : ch * 0.45;
        const R  = (arenaR !== undefined) ? arenaR : Math.min(cw, ch) * 0.38;

        this._rayAngle  += 0.006;
        this._ringPhase  = (this._ringPhase + 0.018) % 1;

        // Always blue/navy cinematic (no brown/gold rays)
        const rayColor1 = 'rgba(61, 124, 255, 1)';
        const rayColor2 = 'rgba(16, 29, 56, 1)';
        const glowColor = '61,124,255';

        ctx.save();

        // Dim screen
        ctx.fillStyle = `rgba(5, 8, 22, ${0.62 * fade})`;
        ctx.fillRect(0, 0, cw, ch);

        // Clip to arena circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.98, 0, Math.PI * 2);
        ctx.clip();

        // Dark navy background inside arena
        const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        bgGrad.addColorStop(0,   `rgba(16, 29, 56, ${0.96 * fade})`);
        bgGrad.addColorStop(0.5, `rgba(10, 18, 38, ${0.94 * fade})`);
        bgGrad.addColorStop(1,   `rgba(5, 8, 22, ${0.90 * fade})`);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

        // Blue cinematic sun rays
        const rayCount = 12;
        const rayLen   = R * 0.96;
        const rayInner = R * 0.08;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this._rayAngle);

        for (let i = 0; i < rayCount; i++) {
            const angle     = (i / rayCount) * Math.PI * 2;
            const halfWidth = (i % 2 === 0)
                ? Math.PI / rayCount * 0.75
                : Math.PI / rayCount * 0.35;

            ctx.beginPath();
            ctx.moveTo(
                Math.cos(angle - halfWidth) * rayInner,
                Math.sin(angle - halfWidth) * rayInner
            );
            ctx.lineTo(
                Math.cos(angle) * rayLen * (i % 2 === 0 ? 1.0 : 0.85),
                Math.sin(angle) * rayLen * (i % 2 === 0 ? 1.0 : 0.85)
            );
            ctx.lineTo(
                Math.cos(angle + halfWidth) * rayInner,
                Math.sin(angle + halfWidth) * rayInner
            );
            ctx.closePath();

            ctx.globalAlpha = (i % 2 === 0 ? 0.42 : 0.22) * fade;
            ctx.fillStyle   = i % 2 === 0 ? rayColor1 : rayColor2;
            ctx.fill();
        }
        ctx.restore();

        // Concentric emanating rings — electric blue
        const ringCount = 4;
        for (let r = 0; r < ringCount; r++) {
            const phase  = (this._ringPhase + r / ringCount) % 1;
            const radius = R * 0.12 + (R * 0.82) * phase;
            const alpha  = (1 - phase) * 0.38 * fade;

            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${glowColor},${alpha})`;
            ctx.lineWidth   = Math.max(0.5, (1 - phase) * 3.0);
            ctx.stroke();
        }

        // Central glow behind flag
        const glowR  = R * 0.35 * ease;
        const glowGr = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
        glowGr.addColorStop(0,   `rgba(${glowColor},${0.55 * fade})`);
        glowGr.addColorStop(0.5, `rgba(${glowColor},${0.25 * fade})`);
        glowGr.addColorStop(1,   `rgba(${glowColor},0)`);
        ctx.fillStyle = glowGr;
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore(); // end arena clip

        // CHAMPION / ROUND WINNER label — gold for champion wording
        const labelSize = Math.min(R * 0.095, cw * 0.032, 16);
        ctx.save();
        ctx.globalAlpha  = fade;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = gf(900, labelSize);
        ctx.shadowBlur = 0;

        if (isFinalMode) {
            ctx.fillStyle = '#FFC83D';
            ctx.fillText('🏆  CHAMPION  🏆', cx, cy - R * 0.40);
        } else if (winner._isSegmentWinner) {
            ctx.fillStyle = '#FFC83D';
            ctx.fillText(`🏅  ROUND ${winner._segmentNumber} WINNER  🏅`, cx, cy - R * 0.40);
        } else {
            ctx.fillStyle = '#38D5FF';
            ctx.fillText('ROUND WINNER', cx, cy - R * 0.40);
        }
        ctx.restore();

        // Flag in premium blue/gold card frame
        const img = winner.country?.image;
        if (img && img.complete && img.naturalWidth > 0) {
            const flagW = R * 0.58 * ease;
            const flagH = flagW * 0.667;  // standard 3:2 flag ratio
            const flagX = cx - flagW / 2;
            const flagY = cy - flagH / 2;
            const pad   = Math.max(4, flagW * 0.06);
            const cardX = flagX - pad;
            const cardY = flagY - pad;
            const cardW = flagW + pad * 2;
            const cardH = flagH + pad * 2;
            const cardR = 8;

            ctx.save();
            ctx.globalAlpha = fade;

            // Card background
            ctx.fillStyle = '#101D38';
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') ctx.roundRect(cardX, cardY, cardW, cardH, cardR);
            else ctx.rect(cardX, cardY, cardW, cardH);
            ctx.fill();

            // Electric-blue + gold dual border
            ctx.strokeStyle = '#2E62E8';
            ctx.lineWidth   = 1.5;
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 200, 61, 0.55)';
            ctx.lineWidth   = 1;
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') ctx.roundRect(cardX + 2, cardY + 2, cardW - 4, cardH - 4, cardR - 1);
            else ctx.rect(cardX + 2, cardY + 2, cardW - 4, cardH - 4);
            ctx.stroke();

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            ctx.shadowBlur = 0;
            ctx.drawImage(img, flagX, flagY, flagW, flagH);
            ctx.shadowBlur = 0;

            ctx.restore();
        }

        // Country name — main text white
        const nameSize = Math.min(R * 0.15, cw * 0.052, 26) * (0.85 + 0.15 * ease);
        ctx.save();
        ctx.globalAlpha  = fade;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = gf(800, nameSize);

        ctx.shadowBlur = 0;
        ctx.fillStyle    = '#F4F7FF';
        ctx.fillText(winner.country.name, cx, cy + R * 0.36);
        ctx.restore();

        // Win count / remaining — gold for win info
        if (isFinalMode && finalFlagsLeft > 1) {
            ctx.save();
            ctx.globalAlpha  = fade;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            const badgeSize  = Math.min(R * 0.13, 18);
            ctx.font         = gf(700, badgeSize);
            ctx.shadowBlur   = 0;
            ctx.fillStyle    = '#38D5FF';
            ctx.fillText(`${finalFlagsLeft} FLAGS REMAINING`, cx, cy + R * 0.60);
            ctx.restore();
        }

        // Segment winner: show win count + live countdown timer
        if (winner._isSegmentWinner) {
            ctx.save();
            ctx.globalAlpha  = fade;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            const subSize    = Math.min(R * 0.055, 9);
            ctx.font         = gf(700, subSize);
            ctx.shadowBlur   = 0;
            ctx.fillStyle    = '#FFC83D';
            const wins       = winner._segmentWins ?? 0;
            ctx.fillText(
                `${wins} WIN${wins === 1 ? '' : 'S'} THIS ROUND`,
                cx, cy + R * 0.54
            );
            ctx.restore();
        }

        // ── Next-round countdown timer pill ──────────────────────────────────
        // Shown for ALL winner types (segment winner, regular, tie recovery)
        // when nextRoundSecsRemain is provided. Disappears when isCountdown=true.
        if (nextRoundSecsRemain !== null && !isCountdown) {
            const secs     = Math.max(0, Math.ceil(nextRoundSecsRemain));
            const pillH    = Math.max(20, R * 0.10);
            const pillW    = Math.max(130, R * 0.80);
            const pillX    = cx - pillW / 2;
            const pillY    = cy + R * 0.72 - pillH / 2;
            const pillR    = pillH / 2;
            const fSize    = Math.min(pillH * 0.48, 11);

            // Pill background — pulsing border when < 10 s
            const pulse    = secs < 10
                ? 0.6 + 0.4 * Math.abs(Math.sin(Date.now() / 300))
                : 1;

            ctx.save();
            ctx.globalAlpha = fade * 0.92;

            // Pill bg
            ctx.fillStyle = 'rgba(10, 18, 40, 0.88)';
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(pillX, pillY, pillW, pillH, pillR);
            } else {
                ctx.arc(pillX + pillR, pillY + pillH / 2, pillR, Math.PI / 2, Math.PI * 1.5);
                ctx.lineTo(pillX + pillW - pillR, pillY);
                ctx.arc(pillX + pillW - pillR, pillY + pillH / 2, pillR, Math.PI * 1.5, Math.PI / 2);
                ctx.closePath();
            }
            ctx.fill();

            // Pill border
            ctx.strokeStyle = secs < 10 ? `rgba(255, 100, 80, ${pulse})` : 'rgba(56, 213, 255, 0.65)';
            ctx.lineWidth   = 1.5;
            ctx.stroke();

            ctx.globalAlpha = fade;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur   = 0;

            const pillCY = pillY + pillH / 2;

            if (secs <= 0) {
                ctx.font      = gf(700, fSize);
                ctx.fillStyle = '#38D5FF';
                ctx.fillText('STARTING NOW…', cx, pillCY);
            } else {
                // Render as one centered string to avoid collision at small sizes
                ctx.font      = gf(700, fSize);
                ctx.fillStyle = secs < 10 ? '#FF8060' : '#FFC83D';
                ctx.fillText(`NEXT ROUND IN  ${secs}s`, cx, pillCY);
            }

            ctx.restore();
        }

        ctx.restore();
    }

    _drawTie(ctx, winner, canvasWidth, canvasHeight, animT, nextRoundSecsRemain = null) {
        const ease = this._easeOutBack(Math.min(1, animT));
        const fade = Math.min(1, animT * 1.6);

        ctx.save();
        ctx.globalAlpha = fade;

        ctx.fillStyle = 'rgba(5, 8, 22, 0.72)';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        const cx = canvasWidth / 2;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        ctx.shadowBlur = 0;

        const headingSize = Math.min(canvasWidth * 0.068, 56) * (0.9 + 0.1 * ease);
        ctx.font      = gf(900, headingSize);
        ctx.fillStyle = '#FF5368';
        ctx.fillText("IT'S A TIE!", cx, canvasHeight * 0.26);

        const countries = winner.countries ?? [];
        const maxShow   = Math.min(countries.length, 4);
        const flagW     = Math.min(canvasWidth * 0.15, 130) * ease;
        const flagH     = flagW * 0.667;  // standard 3:2 flag ratio
        const gap       = Math.max(12, canvasWidth * 0.02);
        const totalW    = maxShow * flagW + (maxShow - 1) * gap;
        const startX    = (canvasWidth - totalW) / 2;
        const flagY     = canvasHeight * 0.40;

        for (let i = 0; i < maxShow; i++) {
            const img = countries[i].image;
            const x   = startX + i * (flagW + gap);
            if (img && img.complete) {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                ctx.shadowBlur = 0;
                ctx.drawImage(img, x, flagY, flagW, flagH);
                ctx.shadowBlur = 0;
                ctx.strokeStyle = 'rgba(244, 247, 255, 0.35)';
                ctx.lineWidth   = 1.5;
                ctx.strokeRect(x, flagY, flagW, flagH);
            }
            const nameSize = Math.min(canvasWidth * 0.024, 17);
            ctx.font      = gf(700, nameSize);
            ctx.fillStyle = '#F4F7FF';
            ctx.shadowBlur = 0;
            ctx.fillText(countries[i].name.toUpperCase(), x + flagW / 2, flagY + flagH + 16);
        }

        ctx.font      = gf(600, Math.min(canvasWidth * 0.028, 20));
        ctx.fillStyle = '#91A7C9';
        ctx.shadowBlur = 0;
        ctx.fillText('exited the arena simultaneously', cx, canvasHeight * 0.72);

        // Countdown pill for tie screen too
        if (nextRoundSecsRemain !== null) {
            const secs  = Math.max(0, Math.ceil(nextRoundSecsRemain));
            const fSize = Math.min(canvasWidth * 0.024, 10);
            const pillH = fSize * 2;
            const pillW = Math.min(canvasWidth * 0.60, 220);
            const pillX = cx - pillW / 2;
            const pillY = canvasHeight * 0.80 - pillH / 2;
            const pillR = pillH / 2;

            ctx.fillStyle = 'rgba(10,18,40,0.88)';
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') ctx.roundRect(pillX, pillY, pillW, pillH, pillR);
            else ctx.rect(pillX, pillY, pillW, pillH);
            ctx.fill();
            ctx.strokeStyle = 'rgba(56,213,255,0.65)';
            ctx.lineWidth   = 1.5;
            ctx.stroke();

            ctx.font      = gf(700, fSize);
            ctx.fillStyle = secs < 10 ? '#FF8060' : '#FFC83D';
            ctx.fillText(`NEXT ROUND IN  ${secs}s`, cx, pillY + pillH / 2);
        }

        ctx.restore();
    }

    _easeOutBack(t) {
        const c1 = 1.70158, c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
}