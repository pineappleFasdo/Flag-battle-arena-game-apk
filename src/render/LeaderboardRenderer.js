// LeaderboardRenderer.js
// Professional sports scoreboard — LAST FLAG STANDING
// Palette: panels #101D38, rows #172B50, rank muted blue, names ice white, wins gold

export default class LeaderboardRenderer {

    constructor() {
        this._isFinalMode  = false;
        this._allRows      = [];
        this._bumps        = new Map();
        this._newRows      = new Set();
        this._shimmerPhase = 0;

        this._pageIndex      = 0;
        this._pageTotal      = 1;
        this._lastPageSwitch = 0;

        this._fading     = false;
        this._fadeStart  = 0;
        this._fadeDur    = 500;
        this._fromPage   = 0;
        this._toPage     = 0;

        this._staggerStart = 0;
        this._staggerDur   = 80;

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
                this._newRows.add(winCode);
            }
            this._bumps.set(winCode, {
                startTime : performance.now(),
                duration  : 900,
                toValue   : rows.find(r => r.code === winCode)?.wins ?? 1,
            });

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

    draw(ctx, rows, x, y, w, rowH = 28) {
        this._shimmerPhase = (performance.now() / 1400) % 1;
        const now = performance.now();
        const n   = 5;

        if (this._allRows.length === 0 && rows.length > 0) {
            this._allRows   = rows;
            this._pageTotal = Math.max(1, Math.ceil(rows.length / n));
        }

        if (!this._fading && this._pageTotal > 1) {
            if (this._lastPageSwitch === 0) {
                this._lastPageSwitch = now;
            } else if (now - this._lastPageSwitch > 6000) {
                const next = (this._pageIndex + 1) % this._pageTotal;
                this._startFade(this._pageIndex, next, now);
            }
        }

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

        const headerH = Math.round(rowH * 0.75);
        const totalH  = headerH + n * rowH;
        const padL    = Math.round(rowH * 0.30);
        const padR    = Math.round(rowH * 0.30);
        const flagW   = Math.round(rowH * 1.60);
        const flagH   = Math.round(rowH * 0.74);
        const rankW   = Math.round(rowH * 1.15);
        const fSize   = Math.max(10, Math.round(rowH * 0.44));
        const winsW   = Math.round(w * 0.22);
        const radius  = 10;

        ctx.save();

        // Panel background — #101D38
        ctx.fillStyle = '#101D38';
        this._rrect(ctx, x, y, w, totalH, radius);
        ctx.fill();

        // Thin professional electric-blue border (reduced glow)
        ctx.shadowColor = 'rgba(61, 124, 255, 0.35)';
        ctx.shadowBlur  = 8;
        ctx.strokeStyle = '#2E62E8';
        ctx.lineWidth   = 1.5;
        this._rrect(ctx, x, y, w, totalH, radius);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Header band
        const hg = ctx.createLinearGradient(x, y, x, y + headerH);
        hg.addColorStop(0, '#203B68');
        hg.addColorStop(1, '#101D38');
        ctx.fillStyle = hg;
        this._rrect(ctx, x, y, w, headerH, [radius, radius, 0, 0]);
        ctx.fill();

        // Header separator
        ctx.strokeStyle = 'rgba(46, 98, 232, 0.45)';
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(x + 10, y + headerH);
        ctx.lineTo(x + w - 10, y + headerH);
        ctx.stroke();

        // Header text — uppercase broadcast label
        const hFontSize = Math.max(9, Math.round(headerH * 0.50));
        ctx.fillStyle    = '#F4F7FF';
        ctx.font         = `800 ${hFontSize}px system-ui, Arial, sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            this._isFinalMode ? 'LAST FLAG STANDING' : 'QUALIFIED FOR FINAL',
            x + w / 2, y + headerH / 2
        );

        const rowsY = y + headerH;
        const rowsH = n * rowH;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, rowsY, w, rowsH);
        ctx.clip();

        if (this._fading && fadeT < 1) {
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
            const staggerElapsed = now - this._staggerStart;
            this._drawPage(ctx, this._pageIndex, x, rowsY, w, rowH, n,
                padL, padR, flagW, flagH, rankW, fSize, winsW,
                staggerElapsed, now);
        }

        ctx.restore();

        // Page indicator dots
        if (this._pageTotal > 1 && this._pageTotal <= 15) {
            const dotR   = Math.max(2.5, Math.round(rowH * 0.10));
            const dotGap = dotR * 2.8;
            const totalDotsW = (this._pageTotal - 1) * dotGap + dotR * 2;
            let dotX = x + (w - totalDotsW) / 2;
            const dotY = rowsY + rowsH - dotR - 4;

            for (let p = 0; p < this._pageTotal; p++) {
                const active = p === (this._fading ? this._toPage : this._pageIndex);
                ctx.beginPath();
                ctx.arc(dotX + dotR, dotY, active ? dotR * 1.3 : dotR, 0, Math.PI * 2);
                ctx.fillStyle = active
                    ? '#3D7CFF'
                    : 'rgba(61, 124, 255, 0.28)';
                ctx.fill();
                dotX += dotGap;
            }
        }

        ctx.restore();
    }

    _drawPage(ctx, pageIdx, x, rowsY, w, rowH, n,
              padL, padR, flagW, flagH, rankW, fSize, winsW,
              staggerElapsed, now) {

        const start = pageIdx * n;
        for (let i = 0; i < n; i++) {
            const globalRank = start + i;
            const entry      = this._allRows[globalRank] ?? null;

            const rowStaggerMs = i * 80;
            const rowAlpha = staggerElapsed >= 99999
                ? 1
                : Math.min(1, Math.max(0, (staggerElapsed - rowStaggerMs) / 160));

            ctx.save();
            ctx.globalAlpha *= rowAlpha;
            this._drawRow(ctx, entry, globalRank, i, x, rowsY + i * rowH, w, rowH,
                padL, padR, flagW, flagH, rankW, fSize, winsW, n, now);
            ctx.restore();
        }
    }

    _drawRow(ctx, entry, globalRank, rowI, x, ry, w, rowH,
             padL, padR, flagW, flagH, rankW, fSize, winsW, n, now) {

        const midY = ry + rowH / 2;

        // Alternating rows — #172B50 / transparent
        ctx.fillStyle = (globalRank % 2 === 0)
            ? '#172B50'
            : 'rgba(0,0,0,0)';
        ctx.fillRect(x, ry, w, rowH);

        // New-winner gold flash
        if (entry && this._newRows.has(entry.code)) {
            const bump = this._bumps.get(entry.code);
            if (bump) {
                const t = Math.min(1, (now - bump.startTime) / bump.duration);
                if (t < 1) {
                    const flashAlpha = Math.max(0, 0.18 * (1 - t));
                    ctx.fillStyle = `rgba(255, 200, 61, ${flashAlpha})`;
                    ctx.fillRect(x, ry, w, rowH);
                } else {
                    this._newRows.delete(entry.code);
                }
            }
        }

        // Rank — muted blue
        const rankLabel = `#${globalRank + 1}`;
        ctx.fillStyle    = '#91A7C9';
        ctx.font         = `600 ${fSize}px system-ui, Arial, sans-serif`;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(rankLabel, x + padL + rankW, midY);

        const flagX = x + padL + rankW + 7;
        const flagY = ry + (rowH - flagH) / 2;

        if (!entry) {
            ctx.save();
            this._rrect(ctx, flagX, flagY, flagW, flagH, 2);
            ctx.fillStyle = 'rgba(23, 43, 80, 0.7)';
            ctx.fill();
            ctx.restore();
            ctx.fillStyle = 'rgba(145, 167, 201, 0.35)';
            ctx.font      = `${fSize}px system-ui, Arial, sans-serif`;
            ctx.textAlign = 'left';
            ctx.fillText('—', flagX + flagW + 8, midY);
            if (rowI < n - 1) this._divider(ctx, x, ry, w, rowH, padL, padR);
            return;
        }

        this._drawFlag(ctx, entry.image, flagX, flagY, flagW, flagH);

        // Country name — ice white
        const nameX    = flagX + flagW + 8;
        const nameMaxW = w - (nameX - x) - winsW - padR - 4;
        const nameFont = `600 ${fSize}px system-ui, Arial, sans-serif`;
        ctx.fillStyle    = '#F4F7FF';
        ctx.font         = nameFont;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            this._truncateCached(ctx, entry.name, nameMaxW, nameFont),
            nameX, midY
        );

        this._drawWins(ctx, entry, x + w - padR, midY, fSize, now);

        if (rowI < n - 1) this._divider(ctx, x, ry, w, rowH, padL, padR);
    }

    _drawWins(ctx, entry, rightEdge, midY, fSize, now) {
        const bump = this._bumps.get(entry.code);

        let wins  = entry.wins;
        let scale = 1;
        let color = '#FFC83D';

        if (bump) {
            const t = Math.min(1, (now - bump.startTime) / bump.duration);
            wins    = bump.toValue;

            if (t < 1) {
                const peak = 0.20;
                scale = t < peak
                    ? 1 + 0.50 * (t / peak)
                    : 1 + 0.50 * this._easeOut(1 - (t - peak) / (1 - peak));
                scale = Math.max(1, scale);

                const flash = Math.max(0, 1 - t * 1.8);
                const r = 255;
                const g = Math.round(200 + 55 * flash);
                const b = Math.round(61 + 120 * flash * 0.4);
                color = `rgb(${r},${g},${b})`;
            } else {
                this._bumps.delete(entry.code);
            }
        }

        const label = `${wins} ${wins === 1 ? 'WIN' : 'WINS'}`;

        ctx.save();
        ctx.font         = `800 ${Math.round(fSize * scale)}px system-ui, Arial, sans-serif`;
        ctx.fillStyle    = color;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';

        if (scale > 1.1) {
            ctx.shadowColor = 'rgba(255, 200, 61, 0.55)';
            ctx.shadowBlur  = 8;
        }
        ctx.fillText(label, rightEdge, midY);
        ctx.restore();
    }

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
            const sx   = fx + (this._shimmerPhase * 2 - 0.5) * fw * 2;
            const grad = ctx.createLinearGradient(sx - fw * 0.6, 0, sx + fw * 0.6, 0);
            grad.addColorStop(0,    '#101D38');
            grad.addColorStop(0.45, '#203B68');
            grad.addColorStop(0.55, '#2E62E8');
            grad.addColorStop(1,    '#101D38');
            ctx.fillStyle = grad;
            ctx.fillRect(fx, fy, fw, fh);
        }
        ctx.restore();

        ctx.strokeStyle = ready ? 'rgba(244, 247, 255, 0.18)' : 'rgba(46, 98, 232, 0.25)';
        ctx.lineWidth   = 0.6;
        this._rrect(ctx, fx, fy, fw, fh, 3);
        ctx.stroke();
    }

    _startFade(fromPage, toPage, now) {
        this._fading    = true;
        this._fromPage  = fromPage;
        this._toPage    = toPage;
        this._fadeStart = now;
    }

    _divider(ctx, x, ry, w, rowH, padL, padR) {
        ctx.strokeStyle = 'rgba(46, 98, 232, 0.18)';
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

    _easeInOut(t) {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    _easeOut(t) {
        return 1 - Math.pow(1 - t, 3);
    }
}
