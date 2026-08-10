// WinnerRenderer.js
// Winner splash drawn INSIDE the arena circle — sun rays behind flag, centered.
// Now also handles FINAL MODE winner display.

export default class WinnerRender {

    constructor() {
        this._rayAngle = 0;   // rotates continuously
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

    // ── Single winner ─────────────────────────────────────────────────────────

    _drawWinner(ctx, winner, cw, ch, isCountdown, animT, arenaX, arenaY, arenaR, isFinalMode, finalFlagsLeft) {
        const ease = this._easeOutBack(Math.min(1, animT));
        const fade = Math.min(1, animT * 1.6);

        // Use arena centre if provided, otherwise fallback to screen centre
        const cx = (arenaX !== undefined) ? arenaX : cw / 2;
        const cy = (arenaY !== undefined) ? arenaY : ch * 0.45;
        const R  = (arenaR !== undefined) ? arenaR : Math.min(cw, ch) * 0.38;

        ctx.save();

        // ── Dim entire screen slightly ──────────────────────────────────────
        ctx.fillStyle = `rgba(0,0,0,${0.52 * fade})`;
        ctx.fillRect(0, 0, cw, ch);

        // ── Clip everything inside the arena circle ─────────────────────────
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.98, 0, Math.PI * 2);
        ctx.clip();

        // ── Dark radial background inside circle ────────────────────────────
        const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        bgGrad.addColorStop(0,   `rgba(30, 20, 5, ${0.88 * fade})`);
        bgGrad.addColorStop(0.6, `rgba(15, 10, 2, ${0.82 * fade})`);
        bgGrad.addColorStop(1,   `rgba(5,  3,  0, ${0.70 * fade})`);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

        // ── Rotating sun rays ────────────────────────────────────────────────
        this._rayAngle += 0.004;
        const rayCount  = 16;
        const rayLen    = R * 0.95;
        const rayInner  = R * 0.18;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this._rayAngle);
        ctx.globalAlpha = 0.22 * fade;

        for (let i = 0; i < rayCount; i++) {
            const angle     = (i / rayCount) * Math.PI * 2;
            const halfWidth = Math.PI / rayCount * 0.55;

            ctx.beginPath();
            ctx.moveTo(
                Math.cos(angle - halfWidth) * rayInner,
                Math.sin(angle - halfWidth) * rayInner
            );
            ctx.lineTo(
                Math.cos(angle - halfWidth * 0.1) * rayLen,
                Math.sin(angle - halfWidth * 0.1) * rayLen
            );
            ctx.lineTo(
                Math.cos(angle + halfWidth * 0.1) * rayLen,
                Math.sin(angle + halfWidth * 0.1) * rayLen
            );
            ctx.lineTo(
                Math.cos(angle + halfWidth) * rayInner,
                Math.sin(angle + halfWidth) * rayInner
            );
            ctx.closePath();

            ctx.fillStyle = i % 2 === 0
                ? (isFinalMode ? 'rgba(80, 220, 255, 1)' : 'rgba(255, 210, 60, 1)')
                : (isFinalMode ? 'rgba(40, 160, 255, 1)' : 'rgba(255, 160, 20, 1)');
            ctx.fill();
        }
        ctx.restore();

        // ── Gold/blue glow pulse behind flag ─────────────────────────────────
        const glowR  = R * 0.32 * ease;
        const glowGr = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
        if (isFinalMode) {
            glowGr.addColorStop(0,   `rgba(40,180,255,${0.55 * fade})`);
            glowGr.addColorStop(0.5, `rgba(20,100,255,${0.30 * fade})`);
            glowGr.addColorStop(1,   `rgba(0, 60, 200, 0)`);
        } else {
            glowGr.addColorStop(0,   `rgba(255,200,40,${0.55 * fade})`);
            glowGr.addColorStop(0.5, `rgba(255,140,0, ${0.30 * fade})`);
            glowGr.addColorStop(1,   `rgba(255,80, 0, 0)`);
        }
        ctx.fillStyle = glowGr;
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();   // remove arena clip

        // ── Label above flag ─────────────────────────────────────────────────
        const labelSize = Math.min(R * 0.16, cw * 0.055, 28);
        const labelY    = cy - R * 0.38;

        ctx.save();
        ctx.globalAlpha  = fade;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = `900 ${labelSize}px system-ui, Arial, sans-serif`;
        ctx.shadowBlur   = 14;

        if (isFinalMode) {
            ctx.shadowColor = 'rgba(40,180,255,0.8)';
            ctx.fillStyle   = '#00CFFF';
            ctx.fillText('🏆  GRAND FINAL WINNER  🏆', cx, labelY);
        } else {
            ctx.shadowColor = 'rgba(255,180,0,0.8)';
            ctx.fillStyle   = '#FFD700';
            ctx.fillText('ROUND WINNER', cx, labelY);
        }
        ctx.restore();

        // ── Flag — centered in arena ─────────────────────────────────────────
        const img = winner.country?.image;
        if (img && img.complete && img.naturalWidth > 0) {
            const flagW = R * 0.60 * ease;
            const flagH = flagW * 0.65;
            const flagX = cx - flagW / 2;
            const flagY = cy - flagH / 2;

            ctx.save();
            ctx.globalAlpha = fade;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            ctx.shadowColor = isFinalMode
                ? `rgba(40,200,255,${0.80 * fade})`
                : `rgba(255,200,40,${0.80 * fade})`;
            ctx.shadowBlur  = 28 * ease;
            ctx.drawImage(img, flagX, flagY, flagW, flagH);
            ctx.shadowBlur  = 0;

            ctx.strokeStyle = `rgba(255,255,255,${0.70 * fade})`;
            ctx.lineWidth   = 2;
            ctx.strokeRect(flagX, flagY, flagW, flagH);
            ctx.restore();
        }

        // ── Country name below flag ──────────────────────────────────────────
        ctx.save();
        ctx.globalAlpha  = fade;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        const nameSize = Math.min(R * 0.18, cw * 0.062, 32) * (0.85 + 0.15 * ease);
        ctx.font        = `900 ${nameSize}px system-ui, Arial, sans-serif`;
        ctx.shadowColor = 'rgba(0,0,0,0.95)';
        ctx.shadowBlur  = 14;
        ctx.fillStyle   = '#FFFFFF';
        ctx.fillText(winner.country.name, cx, cy + R * 0.36);

        ctx.restore();

        // ── Final mode: "FLAGS REMAINING" counter at bottom of arena ────────
        if (isFinalMode && finalFlagsLeft > 1) {
            const badgeY = cy + R * 0.60;
            ctx.save();
            ctx.globalAlpha  = fade;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            const badgeSize = Math.min(R * 0.13, 18);
            ctx.font         = `700 ${badgeSize}px system-ui, Arial, sans-serif`;
            ctx.shadowColor  = 'rgba(0,0,0,0.9)';
            ctx.shadowBlur   = 10;
            ctx.fillStyle    = 'rgba(40,200,255,0.90)';
            ctx.fillText(`${finalFlagsLeft} FLAG${finalFlagsLeft !== 1 ? 'S' : ''} REMAINING`, cx, badgeY);
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
            ctx.fillText(
                countries[i].name.toUpperCase(),
                x + flagW / 2,
                flagY + flagH + 16
            );
        }

        ctx.font      = `600 ${Math.min(canvasWidth * 0.028, 20)}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.shadowBlur = 10;
        ctx.fillText('exited the arena simultaneously', cx, canvasHeight * 0.72);

        ctx.restore();
    }

    _easeOutBack(t) {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
}
