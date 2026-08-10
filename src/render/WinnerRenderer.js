// WinnerRenderer.js
// Winner splash drawn INSIDE the arena circle.
// - Sharp dark sun rays (matching reference image)
// - Concentric glowing rings emanating from flag
// - Final mode: blue color scheme

export default class WinnerRender {

    constructor() {
        this._rayAngle  = 0;
        this._ringPhase = 0;  // drives animated emanating rings
    }

    draw(ctx, winner, canvasWidth, canvasHeight, isCountdown = false, animT = 1,
         arenaX, arenaY, arenaRadius, isFinalMode = false, finalFlagsLeft = 0) {
        if (!winner) return;

        if (winner.isTie) {
            if (winner.isSilent) return;
            this._drawTie(ctx, winner, canvasWidth, canvasHeight, animT);
            return;
        }

        this._drawWinner(ctx, winner, canvasWidth, canvasHeight,
            isCountdown, animT, arenaX, arenaY, arenaRadius, isFinalMode, finalFlagsLeft);
    }

    _drawWinner(ctx, winner, cw, ch, isCountdown, animT, arenaX, arenaY, arenaR, isFinalMode, finalFlagsLeft) {
        const ease = this._easeOutBack(Math.min(1, animT));
        const fade = Math.min(1, animT * 1.6);

        const cx = (arenaX !== undefined) ? arenaX : cw / 2;
        const cy = (arenaY !== undefined) ? arenaY : ch * 0.45;
        const R  = (arenaR !== undefined) ? arenaR : Math.min(cw, ch) * 0.38;

        // Advance animation phases
        this._rayAngle  += 0.006;
        this._ringPhase  = (this._ringPhase + 0.018) % 1;

        const rayColor1 = isFinalMode ? 'rgba(60,180,255,1)'  : 'rgba(180,140,20,1)';
        const rayColor2 = isFinalMode ? 'rgba(20,100,200,1)'  : 'rgba(100,70,5,1)';
        const glowColor = isFinalMode ? '40,180,255'           : '255,190,30';

        ctx.save();

        // ── Dim screen ───────────────────────────────────────────────────────
        ctx.fillStyle = `rgba(0,0,0,${0.58 * fade})`;
        ctx.fillRect(0, 0, cw, ch);

        // ── Clip to arena circle ─────────────────────────────────────────────
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.98, 0, Math.PI * 2);
        ctx.clip();

        // ── Dark background inside arena ─────────────────────────────────────
        const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        bgGrad.addColorStop(0,   `rgba(18,12,2,${0.95 * fade})`);
        bgGrad.addColorStop(0.5, `rgba(10,8,2, ${0.92 * fade})`);
        bgGrad.addColorStop(1,   `rgba(4,3,0,  ${0.88 * fade})`);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

        // ── Sun rays — sharp dark wedges like reference image ────────────────
        const rayCount = 12;
        const rayLen   = R * 0.96;
        const rayInner = R * 0.08;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this._rayAngle);

        for (let i = 0; i < rayCount; i++) {
            const angle     = (i / rayCount) * Math.PI * 2;
            // Alternate wider/narrower rays like in the reference
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

            ctx.globalAlpha = (i % 2 === 0 ? 0.55 : 0.30) * fade;
            ctx.fillStyle   = i % 2 === 0 ? rayColor1 : rayColor2;
            ctx.fill();
        }
        ctx.restore();

        // ── Concentric emanating rings ────────────────────────────────────────
        // 3 rings, each offset in phase so they ripple outward continuously
        const ringCount = 4;
        for (let r = 0; r < ringCount; r++) {
            const phase  = (this._ringPhase + r / ringCount) % 1;
            const radius = R * 0.12 + (R * 0.82) * phase;
            const alpha  = (1 - phase) * 0.45 * fade;

            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${glowColor},${alpha})`;
            ctx.lineWidth   = Math.max(0.5, (1 - phase) * 3.5);
            ctx.stroke();
        }

        // ── Central glow behind flag ──────────────────────────────────────────
        const glowR  = R * 0.35 * ease;
        const glowGr = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
        glowGr.addColorStop(0,   `rgba(${glowColor},${0.70 * fade})`);
        glowGr.addColorStop(0.5, `rgba(${glowColor},${0.35 * fade})`);
        glowGr.addColorStop(1,   `rgba(${glowColor},0)`);
        ctx.fillStyle = glowGr;
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore(); // end arena clip

        // ── "ROUND WINNER" / "GRAND FINAL WINNER" label ──────────────────────
        const labelSize = Math.min(R * 0.155, cw * 0.052, 26);
        ctx.save();
        ctx.globalAlpha  = fade;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = `900 ${labelSize}px system-ui, Arial, sans-serif`;
        ctx.shadowBlur   = 16;

        if (isFinalMode) {
            ctx.shadowColor = 'rgba(40,180,255,0.9)';
            ctx.fillStyle   = '#00CFFF';
            ctx.fillText('🏆  GRAND FINAL WINNER  🏆', cx, cy - R * 0.40);
        } else {
            ctx.shadowColor = `rgba(${glowColor},0.9)`;
            ctx.fillStyle   = '#FFD700';
            ctx.fillText('ROUND WINNER', cx, cy - R * 0.40);
        }
        ctx.restore();

        // ── Flag centered in arena ────────────────────────────────────────────
        const img = winner.country?.image;
        if (img && img.complete && img.naturalWidth > 0) {
            const flagW = R * 0.58 * ease;
            const flagH = flagW * 0.65;
            const flagX = cx - flagW / 2;
            const flagY = cy - flagH / 2;

            ctx.save();
            ctx.globalAlpha = fade;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // Double shadow pass for stronger glow
            ctx.shadowColor = `rgba(${glowColor},${0.90 * fade})`;
            ctx.shadowBlur  = 36 * ease;
            ctx.drawImage(img, flagX, flagY, flagW, flagH);
            ctx.shadowBlur  = 0;

            ctx.strokeStyle = `rgba(255,255,255,${0.75 * fade})`;
            ctx.lineWidth   = 2;
            ctx.strokeRect(flagX, flagY, flagW, flagH);
            ctx.restore();
        }

        // ── Country name ──────────────────────────────────────────────────────
        const nameSize = Math.min(R * 0.18, cw * 0.062, 32) * (0.85 + 0.15 * ease);
        ctx.save();
        ctx.globalAlpha  = fade;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = `900 ${nameSize}px system-ui, Arial, sans-serif`;
        ctx.shadowColor  = 'rgba(0,0,0,0.95)';
        ctx.shadowBlur   = 14;
        ctx.fillStyle    = '#FFFFFF';
        ctx.fillText(winner.country.name, cx, cy + R * 0.36);
        ctx.restore();

        // ── Final mode: flags remaining badge ────────────────────────────────
        if (isFinalMode && finalFlagsLeft > 1) {
            ctx.save();
            ctx.globalAlpha  = fade;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            const badgeSize  = Math.min(R * 0.13, 18);
            ctx.font         = `700 ${badgeSize}px system-ui, Arial, sans-serif`;
            ctx.shadowColor  = 'rgba(0,0,0,0.9)';
            ctx.shadowBlur   = 10;
            ctx.fillStyle    = 'rgba(40,200,255,0.90)';
            ctx.fillText(`${finalFlagsLeft} FLAG${finalFlagsLeft !== 1 ? 'S' : ''} REMAINING`, cx, cy + R * 0.60);
            ctx.restore();
        }

        ctx.restore();
    }

    // ── Tie screen (unchanged) ────────────────────────────────────────────────

    _drawTie(ctx, winner, canvasWidth, canvasHeight, animT) {
        const ease = this._easeOutBack(Math.min(1, animT));
        const fade = Math.min(1, animT * 1.6);

        ctx.save();
        ctx.globalAlpha = fade;

        ctx.fillStyle = 'rgba(0,0,0,0.60)';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        const cx = canvasWidth / 2;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = 'rgba(0,0,0,0.90)';
        ctx.shadowBlur   = 18;

        const headingSize = Math.min(canvasWidth * 0.068, 56) * (0.9 + 0.1 * ease);
        ctx.font      = `900 ${headingSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = '#FF6B6B';
        ctx.fillText("🤝  IT'S A TIE!  🤝", cx, canvasHeight * 0.26);

        const countries = winner.countries ?? [];
        const maxShow   = Math.min(countries.length, 4);
        const flagW     = Math.min(canvasWidth * 0.15, 130) * ease;
        const flagH     = flagW * 0.70;
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
                ctx.shadowColor = 'rgba(255,100,100,0.35)';
                ctx.shadowBlur  = 24;
                ctx.drawImage(img, x, flagY, flagW, flagH);
                ctx.shadowBlur  = 0;
                ctx.strokeStyle = 'rgba(255,255,255,0.35)';
                ctx.lineWidth   = 1.5;
                ctx.strokeRect(x, flagY, flagW, flagH);
            }
            const nameSize = Math.min(canvasWidth * 0.024, 17);
            ctx.font      = `bold ${nameSize}px system-ui, Arial, sans-serif`;
            ctx.fillStyle = '#ffffff';
            ctx.shadowBlur = 8;
            ctx.fillText(countries[i].name.toUpperCase(), x + flagW / 2, flagY + flagH + 16);
        }

        ctx.font      = `600 ${Math.min(canvasWidth * 0.028, 20)}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.shadowBlur = 10;
        ctx.fillText('exited the arena simultaneously', cx, canvasHeight * 0.72);

        ctx.restore();
    }

    _easeOutBack(t) {
        const c1 = 1.70158, c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
}
