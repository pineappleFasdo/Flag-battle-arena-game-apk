export default class ProgressBarRenderer {

    draw(ctx, eliminatedFlags, total, centerX, y, width, barHeight = 18) {

        const eliminated = eliminatedFlags.length;
        const alive      = total - eliminated;
        const fraction   = total > 0 ? alive / total : 0;

        const barX = centerX - width / 2;
        const barY = y;
        const r    = Math.max(3, Math.round(barHeight * 0.28));

        ctx.save();

        // Track — secondary BG
        ctx.fillStyle = '#0A1226';
        ctx.beginPath();
        ctx.roundRect(barX, barY, width, barHeight, r);
        ctx.fill();

        // Fill — electric blue → cyan, shift toward danger when low
        if (fraction > 0) {
            let fillColor;
            if      (fraction > 0.65) fillColor = '#3D7CFF';
            else if (fraction > 0.35) fillColor = '#38D5FF';
            else                      fillColor = '#FF5368';

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(barX, barY, width, barHeight, r);
            ctx.clip();
            ctx.fillStyle = fillColor;
            ctx.fillRect(barX, barY, width * fraction, barHeight);
            ctx.restore();
        }

        // Border
        ctx.strokeStyle = 'rgba(46, 98, 232, 0.45)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.roundRect(barX, barY, width, barHeight, r);
        ctx.stroke();

        // Centre text
        const textSize = Math.max(9, Math.round(barHeight * 0.58));
        ctx.fillStyle    = '#F4F7FF';
        ctx.font         = `700 ${textSize}px system-ui, Arial, sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = 'rgba(0,0,0,0.55)';
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

                ctx.strokeStyle = 'rgba(244, 247, 255, 0.30)';
                ctx.lineWidth   = 1;
                ctx.beginPath();
                ctx.roundRect(fX, fY, fW, fH, 2);
                ctx.stroke();
            }
        }

        ctx.restore();

        // Broadcast-style caption
        ctx.save();
        ctx.fillStyle    = '#38D5FF';
        ctx.font         = `700 ${Math.max(9, Math.round(barHeight * 0.55))}px system-ui, Arial, sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('ELIMINATED', centerX, barY + barHeight + 4);
        ctx.restore();
    }
}
