// WinnerRenderer.js
// Phase 5 — clean winner splash & tie screen (no competing circles).

export default class WinnerRender {

    draw(ctx, winner, canvasWidth, canvasHeight, isCountdown = false, animT = 1) {
        if (!winner) return;

        if (winner.isTie) {
            if (winner.isSilent) return;
            this._drawTie(ctx, winner, canvasWidth, canvasHeight, animT);
            return;
        }

        this._drawWinner(ctx, winner, canvasWidth, canvasHeight, isCountdown, animT);
    }

    // ── Single winner ─────────────────────────────────────────────────────────

    _drawWinner(ctx, winner, canvasWidth, canvasHeight, isCountdown, animT) {
        const ease = this._easeOutBack(Math.min(1, animT));
        const fade = Math.min(1, animT * 1.6);

        const overlayAlpha = (isCountdown ? 0.70 : 0.55) * fade;
        ctx.save();

        // Full-screen dim only — no circular disc/ring (arena is already a circle)
        ctx.fillStyle = `rgba(0,0,0,${overlayAlpha})`;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        const cx = canvasWidth / 2;
        const cy = canvasHeight * 0.36;

        const img = winner.country.image;
        if (img && img.complete) {
            const flagWidth  = Math.min(canvasWidth * 0.26, 250) * ease;
            const flagHeight = flagWidth * 0.70;
            const flagX      = cx - flagWidth / 2;
            const flagY      = cy - flagHeight / 2;

            // Soft multi-pass gold glow (no geometric disc)
            ctx.shadowColor = `rgba(255,215,0,${0.55 * fade})`;
            ctx.shadowBlur  = 56 * ease;
            ctx.drawImage(img, flagX, flagY, flagWidth, flagHeight);
            ctx.shadowColor = `rgba(255,160,40,${0.35 * fade})`;
            ctx.shadowBlur  = 28 * ease;
            ctx.drawImage(img, flagX, flagY, flagWidth, flagHeight);
            ctx.shadowBlur  = 0;

            // Thin bright border
            ctx.strokeStyle = `rgba(255,255,255,${0.55 * fade})`;
            ctx.lineWidth = 2.5;
            ctx.strokeRect(flagX, flagY, flagWidth, flagHeight);
        }

        ctx.globalAlpha = fade;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor  = "rgba(0,0,0,0.90)";
        ctx.shadowBlur   = 16;

        // Country name
        const nameSize = Math.min(canvasWidth * 0.068, 64) * (0.88 + 0.12 * ease);
        const gradient = ctx.createLinearGradient(cx - 160, 0, cx + 160, 0);
        gradient.addColorStop(0,   "#FFE566");
        gradient.addColorStop(0.5, "#FFD700");
        gradient.addColorStop(1,   "#FFA500");
        ctx.fillStyle = gradient;
        ctx.font = `900 ${nameSize}px system-ui, Arial, sans-serif`;
        ctx.fillText(
            winner.country.name.toUpperCase(),
            cx,
            canvasHeight * 0.56
        );

        // Champion line
        const badgeY = canvasHeight * 0.56 + nameSize * 0.95;
        ctx.font = `bold ${Math.min(canvasWidth * 0.040, 36)}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "#FFD700";
        ctx.shadowBlur = 20;
        ctx.fillText("🏆  CHAMPION  🏆", cx, badgeY);

        // Subtitle
        ctx.font = `600 ${Math.min(canvasWidth * 0.022, 17)}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.shadowBlur = 8;
        ctx.fillText("LAST FLAG STANDING", cx, badgeY + Math.min(canvasWidth * 0.038, 30));

        ctx.restore();
    }

    // ── Tie screen ────────────────────────────────────────────────────────────

    _drawTie(ctx, winner, canvasWidth, canvasHeight, animT) {
        const ease = this._easeOutBack(Math.min(1, animT));
        const fade = Math.min(1, animT * 1.6);

        ctx.save();
        ctx.globalAlpha = fade;

        ctx.fillStyle = "rgba(0,0,0,0.60)";
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        const cx = canvasWidth / 2;

        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor  = "rgba(0,0,0,0.90)";
        ctx.shadowBlur   = 18;

        // Heading
        const headingSize = Math.min(canvasWidth * 0.068, 56) * (0.9 + 0.1 * ease);
        ctx.font      = `900 ${headingSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "#FF6B6B";
        ctx.fillText("🤝  IT'S A TIE!  🤝", cx, canvasHeight * 0.26);

        // Flags side-by-side (no circular frames)
        const countries  = winner.countries ?? [];
        const maxShow    = Math.min(countries.length, 4);
        const flagW      = Math.min(canvasWidth * 0.15, 130) * ease;
        const flagH      = flagW * 0.70;
        const gap        = Math.max(12, canvasWidth * 0.02);
        const totalW     = maxShow * flagW + (maxShow - 1) * gap;
        const startX     = (canvasWidth - totalW) / 2;
        const flagY      = canvasHeight * 0.40;

        for (let i = 0; i < maxShow; i++) {
            const img = countries[i].image;
            const x   = startX + i * (flagW + gap);

            if (img && img.complete) {
                ctx.shadowColor = "rgba(255,100,100,0.35)";
                ctx.shadowBlur  = 24;
                ctx.drawImage(img, x, flagY, flagW, flagH);
                ctx.shadowBlur  = 0;
                ctx.strokeStyle = "rgba(255,255,255,0.35)";
                ctx.lineWidth = 1.5;
                ctx.strokeRect(x, flagY, flagW, flagH);
            }

            const nameSize = Math.min(canvasWidth * 0.024, 17);
            ctx.font      = `bold ${nameSize}px system-ui, Arial, sans-serif`;
            ctx.fillStyle = "#ffffff";
            ctx.shadowBlur = 8;
            ctx.fillText(
                countries[i].name.toUpperCase(),
                x + flagW / 2,
                flagY + flagH + 16
            );
        }

        ctx.font      = `600 ${Math.min(canvasWidth * 0.028, 20)}px system-ui, Arial, sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.shadowBlur = 10;
        ctx.fillText(
            "exited the arena simultaneously",
            cx,
            canvasHeight * 0.72
        );

        ctx.restore();
    }

    _easeOutBack(t) {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
}