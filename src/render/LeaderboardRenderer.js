// LeaderboardRenderer.js
// "Qualified for Final" style leaderboard:
//  • Dark navy panel, blue glow border
//  • 5 rows per page, smooth cross-fade between pages (no jarring slide)
//  • Staggered row fade-in when page changes — each row appears 80ms apart
//  • New winner row flashes gold briefly then settles
//  • Win count bumps with a clean scale+glow animation
//  • Page switches every 6 seconds (was 3.5 — felt rushed)
//  • Cross-fade takes 500ms (smooth, not instant)

export default class LeaderboardRenderer {

    constructor() {
        this._isFinalMode  = false;   // switches header to "LAST FLAG STANDING"
        this._allRows      = [];
        this._bumps        = new Map();   // code → bump state {startTime, duration, toValue}
        this._newRows      = new Set();   // codes that just got their first win (flash gold)
        this._shimmerPhase = 0;

        // Paging
        this._pageIndex      = 0;
        this._pageTotal      = 1;
        this._lastPageSwitch = 0;

        // Cross-fade state
        this._fading     = false;
        this._fadeStart  = 0;
        this._fadeDur    = 500;    // ms for cross-fade
        this._fromPage   = 0;
        this._toPage     = 0;

        // Row stagger: when a new page fades in, each row staggers its opacity
        this._staggerStart = 0;
        this._staggerDur   = 80;   // ms between each row appearing

        this._truncCache = new Map();
    }

    reset() {
        this._allRows        = [];
        this._bumps          = new Map();
        this._newRows        = new Set();
        this._pageIndex      = 0;
        this._pageTotal      = 1;
        this._fading         = false;
        this._lastPageSwitch = 0;
        this._truncCache.clear();
    }

    setFinalMode(enabled) {
        this._isFinalMode = enabled;
    }

    markDirty(rows, winCode) {
        if (winCode) {
            const existing = this._allRows.find(r => r.code === winCode);
            if (!existing) {
                // Brand new entry — will flash gold on first appearance
                this._newRows.add(winCode);
            }
            this._bumps.set(winCode, {
                startTime : performance.now(),
                duration  : 900,
                toValue   : rows.find(r => r.code === winCode)?.wins ?? 1,
            });

            // Jump to the page that shows this winner
            const idx = rows.findIndex(r => r.code === winCode);
            if (idx >= 0) {
                const winnerPage = Math.floor(idx / 5);
                if (winnerPage !== this._pageIndex && !this._fading) {
                    this._startFade(this._pageIndex, winnerPage, performance.now());
                }
            }
        }

        this._allRows   = rows;
        this._pageTotal = Math.max(1, Math.ceil(rows.length / 5));
        if (this._pageIndex >= this._pageTotal) this._pageIndex = 0;
        this._truncCache.clear();
    }

    // ── Main draw ─────────────────────────────────────────────────────────────

    draw(ctx, rows, x, y, w, rowH = 28) {
        this._shimmerPhase = (performance.now() / 1400) % 1;
        const now = performance.now();
        const n   = 5;

        if (this._allRows.length === 0 && rows.length > 0) {
            this._allRows   = rows;
            this._pageTotal = Math.max(1, Math.ceil(rows.length / n));
        }

        // ── Auto-page every 6 seconds ──────────────────────────────────────
        if (!this._fading && this._pageTotal > 1) {
            if (this._lastPageSwitch === 0) {
                this._lastPageSwitch = now;
            } else if (now - this._lastPageSwitch > 6000) {
                const next = (this._pageIndex + 1) % this._pageTotal;
                this._startFade(this._pageIndex, next, now);
            }
        }

        // ── Resolve cross-fade ─────────────────────────────────────────────
        let fadeT = 1;
        if (this._fading) {
            fadeT = Math.min(1, (now - this._fadeStart) / this._fadeDur);
            fadeT = this._easeInOut(fadeT);
            if (fadeT >= 1) {
                this._pageIndex      = this._toPage;
                this._fading         = false;
                this._lastPageSwitch = now;
                this._staggerStart   = now;
                fadeT                = 1;
            }
        }

        // ── Dimensions ────────────────────────────────────────────────────
        const headerH = Math.round(rowH * 0.75);
        const totalH  = headerH + n * rowH;
        const padL    = Math.round(rowH * 0.30);
        const padR    = Math.round(rowH * 0.30);
        const flagW   = Math.round(rowH * 1.60);
        const flagH   = Math.round(rowH * 0.74);
        const rankW   = Math.round(rowH * 1.15);
        const fSize   = Math.max(10, Math.round(rowH * 0.44));
        const winsW   = Math.round(w * 0.22);

        ctx.save();

        // ── Panel background ───────────────────────────────────────────────
        ctx.fillStyle = 'rgba(3, 6, 24, 0.96)';
        this._rrect(ctx, x, y, w, totalH, 10);
        ctx.fill();

        // Outer glow border
        ctx.shadowColor = 'rgba(40,120,255,0.55)';
        ctx.shadowBlur  = 14;
        ctx.strokeStyle = 'rgba(50,130,255,0.85)';
        ctx.lineWidth   = 1.5;
        this._rrect(ctx, x, y, w, totalH, 10);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // ── Header band ───────────────────────────────────────────────────
        const hg = ctx.createLinearGradient(x, y, x, y + headerH);
        hg.addColorStop(0, 'rgba(15, 42, 120, 0.92)');
        hg.addColorStop(1, 'rgba(8,  22,  70, 0.92)');
        ctx.fillStyle = hg;
        this._rrect(ctx, x, y, w, headerH, [10, 10, 0, 0]);
        ctx.fill();

        // Header separator
        ctx.strokeStyle = 'rgba(60,140,255,0.35)';
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(x + 10, y + headerH);
        ctx.lineTo(x + w - 10, y + headerH);
        ctx.stroke();

        // Header text
        const hFontSize = Math.max(9, Math.round(headerH * 0.50));
        ctx.fillStyle    = 'rgba(200, 225, 255, 0.95)';
        ctx.font         = `800 ${hFontSize}px system-ui, Arial, sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this._isFinalMode ? '🏆  LAST FLAG STANDING' : '🏆  QUALIFIED FOR FINAL', x + w / 2, y + headerH / 2);

        // ── Rows area ─────────────────────────────────────────────────────
        const rowsY = y + headerH;
        const rowsH = n * rowH;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, rowsY, w, rowsH);
        ctx.clip();

        if (this._fading && fadeT < 1) {
            // Cross-fade: old page fades out, new page fades in simultaneously
            ctx.save();
            ctx.globalAlpha = 1 - fadeT;
            this._drawPage(ctx, this._fromPage, x, rowsY, w, rowH, n,
                padL, padR, flagW, flagH, rankW, fSize, winsW, 1, now);
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = fadeT;
            this._drawPage(ctx, this._toPage, x, rowsY, w, rowH, n,
                padL, padR, flagW, flagH, rankW, fSize, winsW, 1, now);
            ctx.restore();
        } else {
            // Staggered row reveal after page settles
            const staggerElapsed = now - this._staggerStart;
            this._drawPage(ctx, this._pageIndex, x, rowsY, w, rowH, n,
                padL, padR, flagW, flagH, rankW, fSize, winsW,
                staggerElapsed, now);
        }

        ctx.restore(); // clip

        // ── Page indicator dots ────────────────────────────────────────────
        if (this._pageTotal > 1 && this._pageTotal <= 15) {
            const dotR   = Math.max(2.5, Math.round(rowH * 0.10));
            const dotGap = dotR * 2.8;
            const totalDotsW = (this._pageTotal - 1) * dotGap + dotR * 2;
            let dotX = x + (w - totalDotsW) / 2;   // centred
            const dotY = rowsY + rowsH - dotR - 4;

            for (let p = 0; p < this._pageTotal; p++) {
                const active = p === (this._fading ? this._toPage : this._pageIndex);
                ctx.beginPath();
                ctx.arc(dotX + dotR, dotY, active ? dotR * 1.3 : dotR, 0, Math.PI * 2);
                ctx.fillStyle = active
                    ? 'rgba(100,180,255,1.0)'
                    : 'rgba(100,180,255,0.25)';
                ctx.fill();
                dotX += dotGap;
            }
        }

        ctx.restore();
    }

    // ── Draw one full page of rows ────────────────────────────────────────────

    _drawPage(ctx, pageIdx, x, rowsY, w, rowH, n,
              padL, padR, flagW, flagH, rankW, fSize, winsW,
              staggerElapsed, now) {

        const start = pageIdx * n;
        for (let i = 0; i < n; i++) {
            const globalRank = start + i;
            const entry      = this._allRows[globalRank] ?? null;

            // Staggered opacity: each row appears 80ms after the previous
            const rowStaggerMs = i * 80;
            const rowAlpha = staggerElapsed >= 99999
                ? 1   // fully visible (passed 1 = no stagger active)
                : Math.min(1, Math.max(0, (staggerElapsed - rowStaggerMs) / 160));

            ctx.save();
            ctx.globalAlpha *= rowAlpha;
            this._drawRow(ctx, entry, globalRank, i, x, rowsY + i * rowH, w, rowH,
                padL, padR, flagW, flagH, rankW, fSize, winsW, n, now);
            ctx.restore();
        }
    }

    // ── Draw one row ──────────────────────────────────────────────────────────

    _drawRow(ctx, entry, globalRank, rowI, x, ry, w, rowH,
             padL, padR, flagW, flagH, rankW, fSize, winsW, n, now) {

        const midY = ry + rowH / 2;

        // Alternating row stripe
        ctx.fillStyle = (globalRank % 2 === 0)
            ? 'rgba(255,255,255,0.03)'
            : 'rgba(0,0,0,0)';
        ctx.fillRect(x, ry, w, rowH);

        // New-winner gold flash on the row background
        if (entry && this._newRows.has(entry.code)) {
            const bump = this._bumps.get(entry.code);
            if (bump) {
                const t = Math.min(1, (now - bump.startTime) / bump.duration);
                if (t < 1) {
                    // Bright gold flash that fades out
                    const flashAlpha = Math.max(0, 0.22 * (1 - t));
                    ctx.fillStyle = `rgba(255,210,50,${flashAlpha})`;
                    ctx.fillRect(x, ry, w, rowH);
                } else {
                    this._newRows.delete(entry.code);
                }
            }
        }

        // Rank label
        const rankLabel = entry ? `#${globalRank + 1}` : `#${globalRank + 1}`;
        ctx.fillStyle    = 'rgba(160,200,255,0.75)';
        ctx.font         = `700 ${fSize}px system-ui, Arial, sans-serif`;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(rankLabel, x + padL + rankW, midY);

        const flagX = x + padL + rankW + 7;
        const flagY = ry + (rowH - flagH) / 2;

        if (!entry) {
            // Empty slot
            ctx.save();
            this._rrect(ctx, flagX, flagY, flagW, flagH, 2);
            ctx.fillStyle = 'rgba(20,30,60,0.5)';
            ctx.fill();
            ctx.restore();
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.font      = `${fSize}px system-ui, Arial, sans-serif`;
            ctx.textAlign = 'left';
            ctx.fillText('—', flagX + flagW + 8, midY);
            if (rowI < n - 1) this._divider(ctx, x, ry, w, rowH, padL, padR);
            return;
        }

        // Flag
        this._drawFlag(ctx, entry.image, flagX, flagY, flagW, flagH);

        // Country name
        const nameX    = flagX + flagW + 8;
        const nameMaxW = w - (nameX - x) - winsW - padR - 4;
        const nameFont = `600 ${fSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle    = 'rgba(220,235,255,0.95)';
        ctx.font         = nameFont;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            this._truncateCached(ctx, entry.name, nameMaxW, nameFont),
            nameX, midY
        );

        // Wins
        this._drawWins(ctx, entry, x + w - padR, midY, fSize, now);

        if (rowI < n - 1) this._divider(ctx, x, ry, w, rowH, padL, padR);
    }

    // ── Win count cell ────────────────────────────────────────────────────────

    _drawWins(ctx, entry, rightEdge, midY, fSize, now) {
        const bump = this._bumps.get(entry.code);

        let wins  = entry.wins;
        let scale = 1;
        let color = '#FFB800';   // warm gold

        if (bump) {
            const t = Math.min(1, (now - bump.startTime) / bump.duration);
            wins    = bump.toValue;

            if (t < 1) {
                // Scale up sharply then ease back down — peak at t=0.2
                const peak = 0.20;
                scale = t < peak
                    ? 1 + 0.55 * (t / peak)
                    : 1 + 0.55 * this._easeOut(1 - (t - peak) / (1 - peak));
                scale = Math.max(1, scale);

                // Orange-white flash that cools to gold
                const flash = Math.max(0, 1 - t * 1.8);
                const r     = 255;
                const g     = Math.round(184 + 71 * flash);
                const b     = Math.round(0   + 255 * flash * 0.5);
                color       = `rgb(${r},${g},${b})`;
            } else {
                this._bumps.delete(entry.code);
            }
        }

        const label = `${wins} ${wins === 1 ? 'win' : 'wins'}`;

        ctx.save();
        ctx.font         = `800 ${Math.round(fSize * scale)}px system-ui, Arial, sans-serif`;
        ctx.fillStyle    = color;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';

        if (scale > 1.1) {
            ctx.shadowColor = 'rgba(255,190,0,0.70)';
            ctx.shadowBlur  = 10;
        }
        ctx.fillText(label, rightEdge, midY);
        ctx.restore();
    }

    // ── Flag ──────────────────────────────────────────────────────────────────

    _drawFlag(ctx, img, fx, fy, fw, fh) {
        const ready = img && img.complete && img.naturalWidth > 0;

        ctx.save();
        this._rrect(ctx, fx, fy, fw, fh, 3);
        ctx.clip();

        if (ready) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, fx, fy, fw, fh);
        } else {
            // Shimmer skeleton while loading
            const sx   = fx + (this._shimmerPhase * 2 - 0.5) * fw * 2;
            const grad = ctx.createLinearGradient(sx - fw * 0.6, 0, sx + fw * 0.6, 0);
            grad.addColorStop(0,    'rgba(20, 30, 65, 1)');
            grad.addColorStop(0.45, 'rgba(45, 62, 120, 1)');
            grad.addColorStop(0.55, 'rgba(65, 88, 155, 1)');
            grad.addColorStop(1,    'rgba(20, 30, 65, 1)');
            ctx.fillStyle = grad;
            ctx.fillRect(fx, fy, fw, fh);
        }
        ctx.restore();

        // Subtle border
        ctx.strokeStyle = ready ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)';
        ctx.lineWidth   = 0.6;
        this._rrect(ctx, fx, fy, fw, fh, 3);
        ctx.stroke();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _startFade(fromPage, toPage, now) {
        this._fading    = true;
        this._fromPage  = fromPage;
        this._toPage    = toPage;
        this._fadeStart = now;
    }

    _divider(ctx, x, ry, w, rowH, padL, padR) {
        ctx.strokeStyle = 'rgba(50,110,255,0.10)';
        ctx.lineWidth   = 0.6;
        ctx.beginPath();
        ctx.moveTo(x + padL,     ry + rowH);
        ctx.lineTo(x + w - padR, ry + rowH);
        ctx.stroke();
    }

    _truncateCached(ctx, text, maxWidth, font) {
        const key = `${font}|${Math.round(maxWidth)}|${text}`;
        if (this._truncCache.has(key)) return this._truncCache.get(key);
        let result = text;
        if (ctx.measureText(text).width > maxWidth) {
            let t = text;
            while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
                t = t.slice(0, -1);
            }
            result = t + '…';
        }
        if (this._truncCache.size > 500) this._truncCache.clear();
        this._truncCache.set(key, result);
        return result;
    }

    _rrect(ctx, x, y, w, h, r) {
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, r);
        } else {
            const [tl = r, tr = r, br = r, bl = r] = Array.isArray(r) ? r : [r, r, r, r];
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

    // Smooth ease-in-out for cross-fade
    _easeInOut(t) {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // Ease-out for win bump scale
    _easeOut(t) {
        return 1 - Math.pow(1 - t, 3);
    }
}
