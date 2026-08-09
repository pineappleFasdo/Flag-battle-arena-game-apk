export default class ProgressBarRenderer {

    draw(ctx, eliminatedFlags, total, centerX, y, width, barHeight = 18) {

        const eliminated = eliminatedFlags.length;
        const alive      = total - eliminated;
        const fraction   = total > 0 ? alive / total : 0;

        const barX = centerX - width / 2;
        const barY = y;
        const r    = Math.max(3, Math.round(barHeight * 0.28));

        ctx.save();

        // Track
        ctx.fillStyle = "#111A36";
        ctx.beginPath();
        ctx.roundRect(barX, barY, width, barHeight, r);
        ctx.fill();

        // Fill
        if (fraction > 0) {
            let fillColor;
            if      (fraction > 0.65) fillColor = "#62B6FF";
            else if (fraction > 0.35) fillColor = "#B38BC2";
            else                      fillColor = "#D96E98";

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(barX, barY, width, barHeight, r);
            ctx.clip();
            ctx.fillStyle = fillColor;
            ctx.fillRect(barX, barY, width * fraction, barHeight);
            ctx.restore();
        }

        // Border
        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.roundRect(barX, barY, width, barHeight, r);
        ctx.stroke();

        // Centre text
        const textSize = Math.max(9, Math.round(barHeight * 0.58));
        ctx.fillStyle    = "#FFFFFF";
        ctx.font         = `bold ${textSize}px system-ui, Arial, sans-serif`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor  = "rgba(0,0,0,0.6)";
        ctx.shadowBlur   = 3;
        ctx.fillText(`${alive} / ${total} COUNTRIES`, centerX, barY + barHeight / 2);
        ctx.shadowBlur = 0;

        // Last-eliminated flag chip
        if (eliminated > 0) {
            const img = eliminatedFlags[eliminated - 1]?.country?.image;
            if (img && img.complete && img.naturalWidth > 0) {
                const fH = Math.round(barHeight * 0.72);
                const fW = Math.round(fH * 1.45);
                const fX = barX + width - fW - 5;
                const fY = barY + (barHeight - fH) / 2;

                ctx.save();
                ctx.beginPath();
                ctx.roundRect(fX, fY, fW, fH, 2);
                ctx.clip();
                ctx.drawImage(img, fX, fY, fW, fH);
                ctx.restore();

                ctx.strokeStyle = "rgba(255,255,255,0.30)";
                ctx.lineWidth   = 1;
                ctx.beginPath();
                ctx.roundRect(fX, fY, fW, fH, 2);
                ctx.stroke();
            }
        }

        ctx.restore();

        // "ELIMINATED" caption
        ctx.save();
        ctx.fillStyle    = "#00CFEA";
        ctx.font         = `bold ${Math.max(9, Math.round(barHeight * 0.55))}px system-ui, Arial, sans-serif`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "top";
        ctx.fillText("ELIMINATED", centerX, barY + barHeight + 4);
        ctx.restore();
    }
}
