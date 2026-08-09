// LeaderboardRenderer.js
// Redesigned to match "Qualified for Final" style from reference video:
//  • Dark navy panel with glowing blue border
//  • "QUALIFIED FOR FINAL" header with trophy icon
//  • Shows 5 rows at a time: #rank | flag | country name | X win
//  • Auto-pages through ALL winners every PAGE_INTERVAL ms so every
//    country gets shown regardless of how long the leaderboard grows
//  • Smooth slide-up transition between pages
//  • Win count bumps with a gold flash animation
//  • Truncation results cached to avoid per-frame measureText loops

export default class LeaderboardRenderer {

    constructor() {
        this._allRows     = [];   // full sorted leaderboard
        this._bumps       = new Map();   // code → bump state
        this._shimmerPhase = 0;

        // Paging state
        this._pageIndex      = 0;   // which page is currently displayed
        this._pageTotal      = 1;   // total number of pages
        this._slideStart     = 0;   // performance.now() when current slide began
        this._sliding        = false;
        this._slideFrom      = 0;   // page index we're sliding away from
        this._slideTo        = 0;   // page index we're sliding toward
        this._lastPageSwitch = 0;   // performance.now() of last auto-page

        // Truncation cache: key → truncated string
        this._truncCache = new Map();
    }

    reset() {
        this._allRows        = [];
        this._bumps          = new Map();
        this._pageIndex      = 0;
        this._pageTotal      = 1;
        this._sliding        = false;
        this._lastPageSwitch = 0;
        this._truncCache.clear();
    }

    /** Called by WinnerManager after every win. rows = full sorted list, winCode = winner's code. */
    markDirty(rows, winCode) {
        // Record bump for the winning country
        if (winCode) {
            const existing = this._allRows.find(r => r.code === winCode);
            const fromVal  = existing ? existing.wins : 0;
            const toVal    = rows.find(r => r.code === winCode)?.wins ?? fromVal + 1;
            this._bumps.set(winCode, {
                startTime : performance.now(),
                duration  : 700,
                fromValue : fromVal,
                toValue   : toVal,
            });
        }

        // Update the full list
        this._allRows   = rows;
        this._pageTotal = Math.max(1, Math.ceil(rows.length / 5));
        // Clamp page index in case list shrank
        if (this._pageIndex >= this._pageTotal) this._pageIndex = 0;

        this._truncCache.clear();
    }

    // ── Main draw entry point ─────────────────────────────────────────────────

    draw(ctx, rows, x, y, w, rowH = 28, maxRows = 5) {
        this._shimmerPhase = (performance.now() / 1200) % 1;
        const n = 5;

        // Sync allRows from external source if markDirty hasn't been called yet
        if (this._allRows.length === 0 && rows.length > 0) {
            this._allRows   = rows;
            this._pageTotal = Math.max(1, Math.ceil(rows.length / n));
        }

        // ── Auto-paging ────────────────────────────────────────────────────
        const now = performance.now();
        if (!this._sliding && this._pageTotal > 1) {
            const elapsed = now - this._lastPageSwitch;
            if (this._lastPageSwitch === 0) {
                // First frame — initialise
                this._lastPageSwitch = now;
            } else if (elapsed > 3500) {
                const nextPage = (this._pageIndex + 1) % this._pageTotal;
                this._startSlide(this._pageIndex, nextPage, now);
            }
        }

        // ── Compute slide offset ───────────────────────────────────────────
        let slideT      = 1;  // 0 = fully old page, 1 = fully new page
        let displayPage = this._pageIndex;

        if (this._sliding) {
            slideT = Math.min(1, (now - this._slideStart) / 400);
            slideT = this._easeOut(slideT);
            if (slideT >= 1) {
                this._pageIndex      = this._slideTo;
                displayPage          = this._pageIndex;
                this._sliding        = false;
                this._lastPageSwitch = now;
                slideT               = 1;
            } else {
                displayPage = this._slideFrom;
            }
        }

        // ── Dimensions ────────────────────────────────────────────────────
        const headerH  = Math.max(18, Math.round(rowH * 0.70));
        const totalH   = headerH + n * rowH;

        const padL   = Math.max(6,  Math.round(rowH * 0.28));
        const padR   = Math.max(6,  Math.round(rowH * 0.28));
        const flagW  = Math.round(rowH * 1.55);
        const flagH  = Math.round(rowH * 0.72);
        const rankW  = Math.round(rowH * 1.10);   // wider to fit 3-digit ranks (#249)
        const fSize  = Math.max(10, Math.round(rowH * 0.44));
        const winsW  = Math.round(w * 0.20);

        ctx.save();

        // ── Background panel ──────────────────────────────────────────────
        // Dark navy, matching reference video
        ctx.fillStyle = 'rgba(4, 8, 28, 0.94)';
        this._rrect(ctx, x, y, w, totalH, 8);
        ctx.fill();

        // Blue glowing border (double stroke = glow effect)
        ctx.shadowColor = 'rgba(60,140,255,0.70)';
        ctx.shadowBlur  = 10;
        ctx.strokeStyle = 'rgba(60,140,255,0.90)';
        ctx.lineWidth   = 1.8;
        this._rrect(ctx, x, y, w, totalH, 8);
        ctx.stroke();
        ctx.shadowBlur  = 0;

        // ── Header ────────────────────────────────────────────────────────
        // Subtle dark blue gradient header band
        const hGrad = ctx.createLinearGradient(x, y, x, y + headerH);
        hGrad.addColorStop(0, 'rgba(20, 50, 130, 0.85)');
        hGrad.addColorStop(1, 'rgba(10, 25,  80, 0.85)');
        ctx.fillStyle = hGrad;
        this._rrect(ctx, x, y, w, headerH, [8, 8, 0, 0]);
        ctx.fill();

        // Thin separator line below header
        ctx.strokeStyle = 'rgba(60,140,255,0.45)';
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(x + 8, y + headerH);
        ctx.lineTo(x + w - 8, y + headerH);
        ctx.stroke();

        // Header text
        ctx.fillStyle    = 'rgba(210, 230, 255, 0.95)';
        ctx.font         = `800 ${Math.max(9, Math.round(headerH * 0.52))}px system-ui, Arial, sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🏆  QUALIFIED FOR FINAL', x + w / 2, y + headerH / 2);

        // ── Rows with optional slide clip ─────────────────────────────────
        const rowsY = y + headerH;
        const rowsH = n * rowH;

        // Clip rows area so slide animation doesn't bleed outside the panel
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, rowsY, w, rowsH);
        ctx.clip();

        if (this._sliding && slideT < 1) {
            // Slide current page out (upward) and new page in (from below)
            const offset = rowsH * (1 - slideT);   // slides from bottom to 0

            // Old page sliding up and fading
            ctx.save();
            ctx.globalAlpha = 1 - slideT;
            ctx.translate(0, -offset);
            this._drawPage(ctx, displayPage, x, rowsY, w, rowH, n, padL, padR, flagW, flagH, rankW, fSize, winsW, rowsH);
            ctx.restore();

            // New page sliding in from below
            ctx.save();
            ctx.globalAlpha = slideT;
            ctx.translate(0, rowsH - offset);
            this._drawPage(ctx, this._slideTo, x, rowsY, w, rowH, n, padL, padR, flagW, flagH, rankW, fSize, winsW, rowsH);
            ctx.restore();
        } else {
            this._drawPage(ctx, this._pageIndex, x, rowsY, w, rowH, n, padL, padR, flagW, flagH, rankW, fSize, winsW, rowsH);
        }

        ctx.restore(); // remove clip

        // ── Page dots ─────────────────────────────────────────────────────
        // Small dots at the bottom right to show current page position
        if (this._pageTotal > 1 && this._pageTotal <= 12) {
            const dotR  = Math.max(2, Math.round(rowH * 0.09));
            const dotGap = dotR * 3;
            const dotsW  = (this._pageTotal - 1) * dotGap + dotR * 2;
            let dotX = x + w - padR - dotsW;
            const dotY = rowsY + rowsH - dotR - 3;

            for (let p = 0; p < this._pageTotal; p++) {
                ctx.beginPath();
                ctx.arc(dotX + dotR, dotY, dotR, 0, Math.PI * 2);
                ctx.fillStyle = p === this._pageIndex
                    ? 'rgba(100,180,255,0.95)'
                    : 'rgba(100,180,255,0.28)';
                ctx.fill();
                dotX += dotGap;
            }
        }

        ctx.restore();
    }

    // ── Draw one page of rows ─────────────────────────────────────────────────

    _drawPage(ctx, pageIdx, x, rowsY, w, rowH, n, padL, padR, flagW, flagH, rankW, fSize, winsW, rowsH) {
        const start = pageIdx * n;
        for (let i = 0; i < n; i++) {
            const globalRank = start + i;   // 0-based rank across all entries
            const entry = this._allRows[globalRank] ?? null;
            this._drawRow(ctx, entry, globalRank, i, x, rowsY + i * rowH, w, rowH,
                padL, padR, flagW, flagH, rankW, fSize, winsW, n);
        }
    }

    // ── Draw one row ──────────────────────────────────────────────────────────

    _drawRow(ctx, entry, globalRank, rowI, x, ry, w, rowH,
             padL, padR, flagW, flagH, rankW, fSize, winsW, n) {

        const midY = ry + rowH / 2;

        // Row background — alternating very subtle stripe, all dark
        const isEven = (globalRank % 2) === 0;
        ctx.fillStyle = isEven
            ? 'rgba(255,255,255,0.04)'
            : 'rgba(0,0,0,0.0)';
        ctx.fillRect(x, ry, w, rowH);

        // Rank number — bold white, e.g. "#1", "#249"
        const rankLabel = `#${globalRank + 1}`;
        ctx.fillStyle    = 'rgba(180,210,255,0.85)';
        ctx.font         = `700 ${fSize}px system-ui, Arial, sans-serif`;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(rankLabel, x + padL + rankW, midY);

        if (!entry) {
            // Empty slot placeholder
            const dashColor = 'rgba(255,255,255,0.15)';
            const flagX = x + padL + rankW + 8;
            const flagY = ry + (rowH - flagH) / 2;

            ctx.save();
            this._rrect(ctx, flagX, flagY, flagW, flagH, 2);
            ctx.fillStyle = 'rgba(30,40,70,0.5)';
            ctx.fill();
            ctx.restore();

            ctx.fillStyle    = dashColor;
            ctx.font         = `${fSize}px system-ui, Arial, sans-serif`;
            ctx.textAlign    = 'left';
            ctx.fillText('—', flagX + flagW + 8, midY);

            if (rowI < n - 1) this._divider(ctx, x, ry, w, rowH, padL, padR);
            return;
        }

        // Flag
        const flagX = x + padL + rankW + 8;
        const flagY = ry + (rowH - flagH) / 2;
        this._drawFlag(ctx, entry.image, flagX, flagY, flagW, flagH);

        // Country name
        const nameX    = flagX + flagW + 8;
        const nameMaxW = w - (nameX - x) - winsW - padR - 4;
        const nameFont = `600 ${fSize}px system-ui, Arial, sans-serif`;

        ctx.fillStyle    = 'rgba(220, 235, 255, 0.95)';
        ctx.font         = nameFont;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(this._truncateCached(ctx, entry.name, nameMaxW, nameFont), nameX, midY);

        // Wins count
        this._drawWins(ctx, entry, x + w - padR, midY, fSize);

        // Row divider
        if (rowI < n - 1) this._divider(ctx, x, ry, w, rowH, padL, padR);
    }

    // ── Win count cell ────────────────────────────────────────────────────────

    _drawWins(ctx, entry, rightEdge, midY, fSize) {
        const now  = performance.now();
        const bump = this._bumps.get(entry.code);

        let displayWins = entry.wins;
        let scale       = 1;
        let color       = '#FFC933';  // gold — matches reference video

        if (bump) {
            const elapsed  = now - bump.startTime;
            const progress = Math.min(1, elapsed / bump.duration);
            displayWins = bump.toValue;

            if (progress < 1) {
                const peakT = 0.28;
                scale = progress < peakT
                    ? 1 + 0.38 * (progress / peakT)
                    : 1.38 - 0.38 * this._easeOut((progress - peakT) / (1 - peakT));
                const flash = Math.max(0, 1 - progress * 2.2);
                color = `rgb(255, ${Math.round(200 + 55 * flash)}, ${Math.round(51 * (1 - flash))})`;
            } else {
                this._bumps.delete(entry.code);
            }
        }

        // "1 win" / "5 wins" — same format as reference video
        const label    = `${displayWins} ${displayWins === 1 ? 'win' : 'wins'}`;
        const textSize = Math.round(fSize * scale);

        ctx.save();
        ctx.font         = `800 ${textSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle    = color;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
        if (scale > 1.05) {
            ctx.shadowColor = 'rgba(255,210,60,0.55)';
            ctx.shadowBlur  = 8;
        }
        ctx.fillText(label, rightEdge, midY);
        ctx.restore();
    }

    // ── Flag drawing ──────────────────────────────────────────────────────────

    _drawFlag(ctx, img, fx, fy, fw, fh) {
        const ready = img && img.complete && img.naturalWidth > 0;

        ctx.save();
        this._rrect(ctx, fx, fy, fw, fh, 2);
        ctx.clip();

        if (ready) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, fx, fy, fw, fh);
        } else {
            // Shimmer placeholder while image loads
            const shimX = fx + (this._shimmerPhase * 2 - 0.5) * fw * 2;
            const grad  = ctx.createLinearGradient(shimX - fw * 0.5, 0, shimX + fw * 0.5, 0);
            grad.addColorStop(0,    'rgba(25, 35, 70, 0.9)');
            grad.addColorStop(0.48, 'rgba(55, 72, 130, 0.9)');
            grad.addColorStop(0.52, 'rgba(75, 95, 160, 0.95)');
            grad.addColorStop(1,    'rgba(25, 35, 70, 0.9)');
            ctx.fillStyle = grad;
            ctx.fillRect(fx, fy, fw, fh);
        }
        ctx.restore();

        // Thin border on flag
        ctx.strokeStyle = ready ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)';
        ctx.lineWidth   = 0.7;
        this._rrect(ctx, fx, fy, fw, fh, 2);
        ctx.stroke();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _startSlide(fromPage, toPage, now) {
        this._sliding    = true;
        this._slideFrom  = fromPage;
        this._slideTo    = toPage;
        this._slideStart = now;
    }

    _divider(ctx, x, ry, w, rowH, padL, padR) {
        ctx.strokeStyle = 'rgba(60,140,255,0.12)';
        ctx.lineWidth   = 0.7;
        ctx.beginPath();
        ctx.moveTo(x + padL,     ry + rowH);
        ctx.lineTo(x + w - padR, ry + rowH);
        ctx.stroke();
    }

    _truncateCached(ctx, text, maxWidth, font) {
        const key = `${font}|${Math.round(maxWidth)}|${text}`;
        if (this._truncCache.has(key)) return this._truncCache.get(key);

        let result;
        if (ctx.measureText(text).width <= maxWidth) {
            result = text;
        } else {
            let t = text;
            while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
                t = t.slice(0, -1);
            }
            result = t + '…';
        }
        if (this._truncCache.size > 600) this._truncCache.clear();
        this._truncCache.set(key, result);
        return result;
    }

    _rrect(ctx, x, y, w, h, r) {
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, r);
        } else {
            const [tl = r, tr = r, br = r, bl = r] = Array.isArray(r)
                ? r : [r, r, r, r];
            ctx.beginPath();
            ctx.moveTo(x + tl, y);
            ctx.lineTo(x + w - tr, y);
            ctx.quadraticCurveTo(x + w, y,     x + w, y + tr);
            ctx.lineTo(x + w, y + h - br);
            ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
            ctx.lineTo(x + bl, y + h);
            ctx.quadraticCurveTo(x, y + h,     x, y + h - bl);
            ctx.lineTo(x, y + tl);
            ctx.quadraticCurveTo(x, y,         x + tl, y);
            ctx.closePath();
        }
    }

    _easeOut(t) {
        return 1 - Math.pow(1 - t, 3);
    }
}
