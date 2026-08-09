// LeaderboardRenderer.js
// FIX 5: _truncate results cached by (text, maxWidth, font) — avoids a
//         character-by-character measureText loop every frame for long names.

export default class LeaderboardRenderer {

    constructor() {
        this._stableRows  = [];
        this._pendingRows = null;
        this._dirty       = false;
        this._bumps       = new Map();
        this._shimmerPhase = 0;

        // FIX 5: Truncation cache: key → truncated string
        this._truncCache  = new Map();
        this._truncCacheFont = "";   // invalidate when font changes
    }

    reset() {
        this._stableRows  = [];
        this._pendingRows = null;
        this._dirty       = false;
        this._bumps       = new Map();
        this._truncCache  = new Map();
    }

    markDirty(rows, winCode) {
        this._pendingRows = rows;
        this._dirty       = true;

        if (winCode) {
            const existing = this._stableRows.find(r => r.code === winCode);
            const fromVal  = existing ? existing.wins : 0;
            const toVal    = (rows.find(r => r.code === winCode)?.wins) ?? fromVal + 1;

            this._bumps.set(winCode, {
                startTime : performance.now(),
                duration  : 600,
                fromValue : fromVal,
                toValue   : toVal,
            });
        }

        setTimeout(() => {
            if (this._pendingRows) {
                this._stableRows  = this._pendingRows;
                this._pendingRows = null;
                // Invalidate truncation cache when rows change
                this._truncCache.clear();
            }
            this._dirty = false;
        }, 420);
    }

    draw(ctx, rows, x, y, w, rowH = 28, maxRows = 5) {

        this._shimmerPhase = (performance.now() / 1200) % 1;

        if (this._stableRows.length === 0 && rows.length > 0) {
            this._stableRows = rows.slice(0, maxRows);
        }

        const visible = Array.from({ length: maxRows }, (_, i) =>
            this._stableRows[i] ?? null
        );

        const totalH  = rowH * maxRows;

        const padL    = Math.max(6,  Math.round(rowH * 0.30));
        const padR    = Math.max(6,  Math.round(rowH * 0.30));
        const flagW   = Math.round(rowH * 1.55);
        const flagH   = Math.round(rowH * 0.72);
        const rankW   = Math.round(rowH * 0.95);
        const fontSize = Math.max(10, Math.round(rowH * 0.44));
        const winsW   = Math.round(w * 0.22);

        ctx.save();

        ctx.fillStyle = "rgba(8,10,24,0.90)";
        this._rrect(ctx, x, y, w, totalH, 7);
        ctx.fill();

        const headerH = Math.max(14, Math.round(rowH * 0.48));
        ctx.fillStyle = "rgba(30,100,200,0.18)";
        this._rrect(ctx, x, y, w, headerH, [7, 7, 0, 0]);
        ctx.fill();

        ctx.fillStyle    = "rgba(80,160,255,0.90)";
        ctx.font         = `bold ${Math.max(8, Math.round(headerH * 0.58))}px Arial`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.letterSpacing = "1.5px";
        ctx.fillText("🏆  LEADERBOARD", x + w / 2, y + headerH / 2);
        ctx.letterSpacing = "0px";

        const rowsY = y + headerH;

        visible.forEach((entry, i) => {
            this._drawRow(
                ctx, entry, i,
                x, rowsY + i * rowH, w, rowH,
                padL, padR, flagW, flagH, rankW, fontSize, winsW,
                maxRows
            );
        });

        ctx.strokeStyle = "rgba(80,160,255,0.35)";
        ctx.lineWidth   = 1.2;
        this._rrect(ctx, x, y, w, totalH + headerH, 7);
        ctx.stroke();

        ctx.restore();
    }

    _drawRow(ctx, entry, i, x, ry, w, rowH, padL, padR, flagW, flagH, rankW, fontSize, winsW, maxRows) {

        const midY = ry + rowH / 2;

        const rowBg = i === 0 ? "rgba(255,215,0,0.22)"
                    : i === 1 ? "rgba(192,192,192,0.20)"
                    : i === 2 ? "rgba(176,100,40,0.22)"
                    :           "rgba(255,255,255,0.03)";

        ctx.fillStyle = rowBg;
        ctx.beginPath();
        ctx.rect(x, ry, w, rowH - 1);
        ctx.fill();

        const rankColor = i === 0 ? "#D4A017"
                        : i === 1 ? "#A8A8A8"
                        : i === 2 ? "#C46228"
                        :           "rgba(255,255,255,0.40)";

        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;

        ctx.fillStyle    = rankColor;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";

        if (medal) {
            ctx.font = `${Math.round(fontSize * 1.1)}px Arial`;
            ctx.fillText(medal, x + padL + rankW / 2, midY);
        } else {
            ctx.font = `bold ${fontSize}px Arial`;
            ctx.fillText(`${i + 1}`, x + padL + rankW / 2, midY);
        }

        if (!entry) {
            this._drawPlaceholder(ctx, x, ry, w, rowH, midY, padL, padR, rankW, flagW, flagH, fontSize, winsW, i, maxRows);
            return;
        }

        const flagX = x + padL + rankW + 6;
        const flagY = ry + (rowH - flagH) / 2;

        this._drawFlag(ctx, entry.image, flagX, flagY, flagW, flagH);

        const nameX    = flagX + flagW + 8;
        const nameMaxW = w - (nameX - x) - winsW - padR - 4;

        const nameFont = `bold ${fontSize}px Arial`;
        ctx.fillStyle    = "rgba(100,180,255,0.95)";
        ctx.font         = nameFont;
        ctx.textAlign    = "left";
        ctx.textBaseline = "middle";

        // FIX 5: Use cached truncation result
        const truncated = this._truncateCached(ctx, entry.name, nameMaxW, nameFont);
        ctx.fillText(truncated, nameX, midY);

        this._drawWins(ctx, entry, x + w - padR, midY, fontSize, winsW);

        if (i < maxRows - 1) {
            ctx.strokeStyle = "rgba(255,255,255,0.07)";
            ctx.lineWidth   = 0.8;
            ctx.beginPath();
            ctx.moveTo(x + padL,     ry + rowH);
            ctx.lineTo(x + w - padR, ry + rowH);
            ctx.stroke();
        }
    }

    _drawFlag(ctx, img, fx, fy, fw, fh) {

        const ready = img && img.complete && img.naturalWidth > 0;

        ctx.save();
        this._rrect(ctx, fx, fy, fw, fh, 2);
        ctx.clip();

        if (ready) {
            ctx.drawImage(img, fx, fy, fw, fh);
        } else {
            const shimX = fx + (this._shimmerPhase * 2 - 0.5) * fw * 2;
            const grad  = ctx.createLinearGradient(shimX - fw * 0.5, 0, shimX + fw * 0.5, 0);
            grad.addColorStop(0,    "rgba(40,44,68,0.9)");
            grad.addColorStop(0.45, "rgba(70,76,110,0.9)");
            grad.addColorStop(0.55, "rgba(100,108,160,0.95)");
            grad.addColorStop(1,    "rgba(40,44,68,0.9)");
            ctx.fillStyle = grad;
            ctx.fillRect(fx, fy, fw, fh);
        }

        ctx.restore();

        ctx.strokeStyle = ready
            ? "rgba(255,255,255,0.22)"
            : "rgba(255,255,255,0.08)";
        ctx.lineWidth = 0.8;
        this._rrect(ctx, fx, fy, fw, fh, 2);
        ctx.stroke();
    }

    _drawWins(ctx, entry, rightEdge, midY, fontSize, colW) {

        const now   = performance.now();
        const bump  = this._bumps.get(entry.code);

        let displayWins = entry.wins;
        let scale       = 1;
        let color       = "#FFC44D";

        if (bump) {
            const elapsed  = now - bump.startTime;
            const progress = Math.min(1, elapsed / bump.duration);

            if (progress < 1) {
                displayWins = bump.toValue;

                const peakT = 0.30;
                if (progress < peakT) {
                    const t = progress / peakT;
                    scale   = 1 + 0.40 * t;
                } else {
                    const t = (progress - peakT) / (1 - peakT);
                    scale   = 1.40 - 0.40 * this._easeOut(t);
                }

                const flashFade = Math.max(0, 1 - progress * 2.5);
                const r = Math.round(255);
                const g = Math.round(196 + 59 * flashFade);
                const b = Math.round(77  * (1 - flashFade));
                color = `rgb(${r},${g},${b})`;
            } else {
                this._bumps.delete(entry.code);
            }
        }

        const label    = `${displayWins} WIN${displayWins !== 1 ? "S" : ""}`;
        const textSize = Math.round(fontSize * scale);

        ctx.save();
        ctx.font         = `bold ${textSize}px Arial`;
        ctx.fillStyle    = color;
        ctx.textAlign    = "right";
        ctx.textBaseline = "middle";

        if (scale > 1) {
            ctx.shadowColor = "rgba(255,220,80,0.60)";
            ctx.shadowBlur  = 8;
        }

        ctx.fillText(label, rightEdge, midY);
        ctx.restore();
    }

    _drawPlaceholder(ctx, x, ry, w, rowH, midY, padL, padR, rankW, flagW, flagH, fontSize, winsW, i, maxRows) {

        const dashColor = "rgba(255,255,255,0.18)";
        const flagX     = x + padL + rankW + 6;
        const flagY     = ry + (rowH - flagH) / 2;

        const shimX = flagX + (this._shimmerPhase * 2 - 0.5) * flagW * 1.5;
        const grad  = ctx.createLinearGradient(shimX - flagW * 0.4, 0, shimX + flagW * 0.4, 0);
        grad.addColorStop(0,    "rgba(30,34,54,0.6)");
        grad.addColorStop(0.5,  "rgba(55,60,88,0.6)");
        grad.addColorStop(1,    "rgba(30,34,54,0.6)");

        ctx.save();
        this._rrect(ctx, flagX, flagY, flagW, flagH, 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = dashColor;
        ctx.lineWidth   = 0.8;
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle    = dashColor;
        ctx.font         = `bold ${fontSize}px Arial`;
        ctx.textAlign    = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("—", flagX + flagW + 8, midY);

        ctx.textAlign = "right";
        ctx.fillText("—", x + w - padR, midY);

        if (i < maxRows - 1) {
            ctx.strokeStyle = "rgba(255,255,255,0.05)";
            ctx.lineWidth   = 0.8;
            ctx.beginPath();
            ctx.moveTo(x + padL,     ry + rowH);
            ctx.lineTo(x + w - padR, ry + rowH);
            ctx.stroke();
        }
    }

    // FIX 5: Cached truncation — only measures text if not seen before with this font.
    _truncateCached(ctx, text, maxWidth, font) {
        // Round maxWidth to avoid near-identical keys
        const key = `${font}|${Math.round(maxWidth)}|${text}`;

        if (this._truncCache.has(key)) return this._truncCache.get(key);

        let result;
        if (ctx.measureText(text).width <= maxWidth) {
            result = text;
        } else {
            let t = text;
            while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) {
                t = t.slice(0, -1);
            }
            result = t + "…";
        }

        // Limit cache size to avoid memory leak for huge country lists
        if (this._truncCache.size > 500) this._truncCache.clear();
        this._truncCache.set(key, result);
        return result;
    }

    /** Truncate text with ellipsis to fit within maxWidth pixels (uncached). */
    _truncate(ctx, text, maxWidth) {
        if (ctx.measureText(text).width <= maxWidth) return text;
        let t = text;
        while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) {
            t = t.slice(0, -1);
        }
        return t + "…";
    }

    _rrect(ctx, x, y, w, h, r) {
        if (typeof ctx.roundRect === "function") {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, r);
        } else {
            const [tl = r, tr = r, br = r, bl = r] = Array.isArray(r)
                ? r : [r, r, r, r];
            ctx.beginPath();
            ctx.moveTo(x + tl, y);
            ctx.lineTo(x + w - tr, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
            ctx.lineTo(x + w, y + h - br);
            ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
            ctx.lineTo(x + bl, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
            ctx.lineTo(x, y + tl);
            ctx.quadraticCurveTo(x, y, x + tl, y);
            ctx.closePath();
        }
    }

    _easeOut(t) {
        return 1 - Math.pow(1 - t, 3);
    }
}
