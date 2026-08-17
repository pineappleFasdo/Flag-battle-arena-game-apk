// LeaderboardRenderer.js — Pro Esports Broadcast Scoreboard
import { gf } from '../GameFont.js';
// Design: dark glassmorphism panel, metallic rank badges, gold medal tiers,
// animated win counters, shimmer effects, team-style flag + name layout.

export default class LeaderboardRenderer {

    constructor() {
        this._isFinalMode       = false;
        this._isGrandFinal      = false;
        this._isHighestWinsMode = false;
        this._isLongBattleMode  = false;
        this._allRows      = [];
        this._bumps        = new Map();
        this._newRows      = new Set();
        this._shimmerPhase = 0;

        this._pageIndex      = 0;
        this._pageTotal      = 1;
        this._lastPageSwitch = 0;

        this._fading     = false;
        this._fadeStart  = 0;
        this._fadeDur    = 400;
        this._fromPage   = 0;
        this._toPage     = 0;

        this._staggerStart = 0;
        this._truncCache   = new Map();

        // Subtle panel pulse animation
        this._pulsePhase = 0;
        this._themeId = 'classic';
    }

    setTheme(theme) {
        this._themeId = theme?.id || 'classic';
    }

    _palette() {
        if (this._themeId === 'space') {
            return {
                border: 'rgba(160, 120, 255, 0.55)',
                panel0: '#0A0618',
                panel1: '#120A28',
                panel2: '#060312',
                header0: '#1A1040',
                header1: '#241858',
                header2: '#140E30',
                accentA: 'rgba(160,120,255,0.85)',
                accentB: 'rgba(100,200,255,0.85)',
                accentSoft: 'rgba(160,120,255,0.25)',
                textAccent: '#B8A0FF',
                rankBg: 'rgba(160,120,255,0.12)',
                rankText: '#9B8AD8',
                rankBorder: 'rgba(160,120,255,0.28)',
            };
        }
        return {
            border: 'rgba(61, 124, 255, 0.55)',
            panel0: '#0D1929',
            panel1: '#101D38',
            panel2: '#080F1E',
            header0: '#1A3060',
            header1: '#1E3D78',
            header2: '#142548',
            accentA: 'rgba(61,124,255,0.8)',
            accentB: 'rgba(56,213,255,0.8)',
            accentSoft: 'rgba(61,124,255,0.25)',
            textAccent: '#38D5FF',
            rankBg: 'rgba(61,124,255,0.10)',
            rankText: '#6A88B8',
            rankBorder: 'rgba(61,124,255,0.20)',
        };
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
        this._isFinalMode = !!enabled;
    }

    setGrandFinal(enabled) {
        this._isGrandFinal = !!enabled;
    }

    setHighestWinsMode(enabled) {
        this._isHighestWinsMode = !!enabled;
    }

    setLongBattleMode(enabled) {
        this._isLongBattleMode = !!enabled;
    }

    markDirty(rows, winCode) {
        if (winCode) {
            const existing = this._allRows.find(r => r.code === winCode);
            if (!existing) this._newRows.add(winCode);

            this._bumps.set(winCode, {
                startTime : performance.now(),
                duration  : 800,
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
        const now = performance.now();
        this._shimmerPhase = (now / 1600) % 1;
        this._pulsePhase   = (now / 2200) % 1;
        const n = 5;

        if (this._allRows.length === 0 && rows.length > 0) {
            this._allRows   = rows;
            this._pageTotal = Math.max(1, Math.ceil(rows.length / n));
        }

        // Auto page-flip every 5.5 seconds
        if (!this._fading && this._pageTotal > 1) {
            if (this._lastPageSwitch === 0) {
                this._lastPageSwitch = now;
            } else if (now - this._lastPageSwitch > 5500) {
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

        const headerH = Math.round(rowH * 0.85);
        const totalH  = headerH + n * rowH;
        const radius  = 12;

        // ── Sizes ─────────────────────────────────────────────────────────────
        const padL   = Math.round(rowH * 0.25);
        const padR   = Math.round(rowH * 0.28);
        const flagH  = Math.round(rowH * 0.70);
        const flagW  = Math.round(flagH * 1.5);  // standard 3:2 flag ratio
        const rankW  = Math.round(rowH * 1.10);
        const fSize  = Math.max(9, Math.round(rowH * 0.42));
        const winsW  = Math.round(w * 0.28);

        ctx.save();
        const pal = this._palette();

        // ── Outer glow (subtle pulse) ─────────────────────────────────────────
        const pulse = 0.5 + 0.5 * Math.sin(this._pulsePhase * Math.PI * 2);

        ctx.shadowBlur = 0;
        this._rrect(ctx, x - 1, y - 1, w + 2, totalH + 2, radius + 1);
        ctx.strokeStyle = pal.border.replace(/[\d.]+\)$/, `${0.55 + 0.15 * pulse})`);
        ctx.lineWidth   = 1.5;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // ── Panel body ───────────────────────────────────────────────────────
        const panelGrad = ctx.createLinearGradient(x, y, x, y + totalH);
        panelGrad.addColorStop(0,   pal.panel0);
        panelGrad.addColorStop(0.15, pal.panel1);
        panelGrad.addColorStop(1,   pal.panel2);
        ctx.fillStyle = panelGrad;
        this._rrect(ctx, x, y, w, totalH, radius);
        ctx.fill();

        // ── Subtle top highlight strip ────────────────────────────────────────
        const highlightGrad = ctx.createLinearGradient(x, y, x + w, y);
        highlightGrad.addColorStop(0,    'rgba(255,255,255,0)');
        highlightGrad.addColorStop(0.35, 'rgba(255,255,255,0.04)');
        highlightGrad.addColorStop(0.65, 'rgba(255,255,255,0.04)');
        highlightGrad.addColorStop(1,    'rgba(255,255,255,0)');
        ctx.fillStyle = highlightGrad;
        this._rrect(ctx, x, y, w, 3, [radius, radius, 0, 0]);
        ctx.fill();

        // ── Header ────────────────────────────────────────────────────────────
        const hg = ctx.createLinearGradient(x, y, x + w, y + headerH);
        hg.addColorStop(0,   pal.header0);
        hg.addColorStop(0.5, pal.header1);
        hg.addColorStop(1,   pal.header2);
        ctx.fillStyle = hg;
        this._rrect(ctx, x, y, w, headerH, [radius, radius, 0, 0]);
        ctx.fill();

        // Header accent line at bottom
        const accentGrad = ctx.createLinearGradient(x, 0, x + w, 0);
        accentGrad.addColorStop(0,    'rgba(0,0,0,0)');
        accentGrad.addColorStop(0.3,  pal.accentA);
        accentGrad.addColorStop(0.7,  pal.accentB);
        accentGrad.addColorStop(1,    'rgba(0,0,0,0)');
        ctx.strokeStyle = accentGrad;
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 12, y + headerH);
        ctx.lineTo(x + w - 12, y + headerH);
        ctx.stroke();

        // Header icon + label
        const hFontSize = Math.max(8, Math.round(headerH * 0.44));
        const label = this._isGrandFinal
            ? '⚔️  5H ROUND WINNERS ELIMINATION'
            : this._isFinalMode
            ? '⚔️  ELIMINATION ROUND'
            : this._isLongBattleMode
                ? '⏱️  5H ROUND STANDINGS'
            : this._isHighestWinsMode
                ? '🏆  LEADERBOARD'
                : '🏅  QUALIFIED FOR FINAL';

        ctx.fillStyle    = '#FFFFFF';
        ctx.font         = gf(700, hFontSize);
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        ctx.shadowBlur = 0;
        ctx.fillText(label, x + w / 2, y + headerH / 2);
        ctx.shadowBlur = 0;

        // ── Row area ──────────────────────────────────────────────────────────
        const rowsY = y + headerH;
        const rowsH = n * rowH;

        ctx.save();
        this._rrect(ctx, x, rowsY, w, rowsH, [0, 0, radius, radius]);
        ctx.clip();

        if (this._fading && fadeT < 1) {
            ctx.save();
            ctx.globalAlpha = 1 - fadeT;
            this._drawPage(ctx, this._fromPage, x, rowsY, w, rowH, n,
                padL, padR, flagW, flagH, rankW, fSize, winsW, 99999, now);
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = fadeT;
            this._drawPage(ctx, this._toPage, x, rowsY, w, rowH, n,
                padL, padR, flagW, flagH, rankW, fSize, winsW, 99999, now);
            ctx.restore();
        } else {
            const staggerElapsed = now - this._staggerStart;
            this._drawPage(ctx, this._pageIndex, x, rowsY, w, rowH, n,
                padL, padR, flagW, flagH, rankW, fSize, winsW, staggerElapsed, now);
        }

        ctx.restore();

        // ── Page indicator dots ───────────────────────────────────────────────
        if (this._pageTotal > 1 && this._pageTotal <= 20) {
            const dotR   = Math.max(2, Math.round(rowH * 0.09));
            const dotGap = dotR * 2.6;
            const totalDotsW = (this._pageTotal - 1) * dotGap + dotR * 2;
            let dotX = x + (w - totalDotsW) / 2;
            const dotY = rowsY + rowsH - dotR * 2 - 3;

            for (let p = 0; p < this._pageTotal; p++) {
                const active = p === (this._fading ? this._toPage : this._pageIndex);
                ctx.beginPath();
                ctx.arc(dotX + dotR, dotY, active ? dotR * 1.4 : dotR, 0, Math.PI * 2);
                if (active) {
                    ctx.fillStyle = '#38D5FF';

                    ctx.shadowBlur = 0;
                } else {
                    ctx.fillStyle = 'rgba(61,124,255,0.25)';
                    ctx.shadowBlur = 0;
                }
                ctx.fill();
                ctx.shadowBlur = 0;
                dotX += dotGap;
            }
        }

        // ── Final outer border stroke ─────────────────────────────────────────
        const palBorder = this._palette();
        ctx.strokeStyle = palBorder.border.replace(/[\d.]+\)$/, `${0.35 + 0.15 * pulse})`);
        ctx.lineWidth   = 1;
        this._rrect(ctx, x, y, w, totalH, radius);
        ctx.stroke();

        ctx.restore();
    }

    _drawPage(ctx, pageIdx, x, rowsY, w, rowH, n,
              padL, padR, flagW, flagH, rankW, fSize, winsW,
              staggerElapsed, now) {
        const start = pageIdx * n;
        for (let i = 0; i < n; i++) {
            const globalRank = start + i;
            const entry      = this._allRows[globalRank] ?? null;
            const rowStaggerMs = i * 70;
            const rowAlpha = staggerElapsed >= 99999
                ? 1
                : Math.min(1, Math.max(0, (staggerElapsed - rowStaggerMs) / 150));

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

        // ── Row background — alternating subtle bands ──────────────────────
        if (globalRank % 2 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            ctx.fillRect(x, ry, w, rowH);
        }

        // ── Gold flash for new entry ───────────────────────────────────────
        if (entry && this._newRows.has(entry.code)) {
            const bump = this._bumps.get(entry.code);
            if (bump) {
                const t = Math.min(1, (now - bump.startTime) / bump.duration);
                if (t < 1) {
                    const flashAlpha = Math.max(0, 0.22 * Math.sin(Math.PI * (1 - t)));
                    ctx.fillStyle = `rgba(255, 200, 61, ${flashAlpha})`;
                    ctx.fillRect(x, ry, w, rowH);
                } else {
                    this._newRows.delete(entry.code);
                }
            }
        }

        // ── Rank badge ────────────────────────────────────────────────────
        const rankLabel = globalRank + 1;
        const badgeX = x + padL;
        const badgeY = ry + (rowH - rowH * 0.62) / 2;
        const badgeW = rankW - 4;
        const badgeH = rowH * 0.62;

        // Medal colors for top 3
        let badgeBg, badgeTextColor, badgeBorder;
        if (rankLabel === 1) {
            badgeBg        = 'rgba(255,200,61,0.18)';
            badgeTextColor = '#FFD700';
            badgeBorder    = 'rgba(255,200,61,0.55)';
        } else if (rankLabel === 2) {
            badgeBg        = 'rgba(192,192,192,0.15)';
            badgeTextColor = '#C0C8D8';
            badgeBorder    = 'rgba(192,192,192,0.40)';
        } else if (rankLabel === 3) {
            badgeBg        = 'rgba(205,127,50,0.15)';
            badgeTextColor = '#CD9B6E';
            badgeBorder    = 'rgba(205,127,50,0.40)';
        } else {
            const rp = this._palette();
            badgeBg        = rp.rankBg;
            badgeTextColor = rp.rankText;
            badgeBorder    = rp.rankBorder;
        }

        ctx.fillStyle = badgeBg;
        this._rrect(ctx, badgeX, badgeY, badgeW, badgeH, 4);
        ctx.fill();
        ctx.strokeStyle = badgeBorder;
        ctx.lineWidth   = 0.8;
        this._rrect(ctx, badgeX, badgeY, badgeW, badgeH, 4);
        ctx.stroke();

        ctx.fillStyle    = badgeTextColor;
        ctx.font         = gf(700, Math.max(8, Math.round(fSize * 0.88)));
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`#${rankLabel}`, badgeX + badgeW / 2, midY);

        // ── Flag ──────────────────────────────────────────────────────────
        const flagX = x + padL + rankW + 5;
        const flagY = ry + (rowH - flagH) / 2;

        if (!entry) {
            // Empty row placeholder
            ctx.save();
            this._rrect(ctx, flagX, flagY, flagW, flagH, 2);
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 0.5;
            ctx.stroke();
            ctx.restore();
            ctx.fillStyle = 'rgba(100,130,180,0.30)';
            ctx.font      = gf(400, fSize);
            ctx.textAlign = 'left';
            ctx.fillText('—', flagX + flagW + 8, midY);
            if (rowI < n - 1) this._divider(ctx, x, ry, w, rowH);
            return;
        }

        this._drawFlag(ctx, entry.image, flagX, flagY, flagW, flagH, globalRank);

        // ── Country name ──────────────────────────────────────────────────
        const nameX    = flagX + flagW + 8;
        const nameMaxW = w - (nameX - x) - winsW - padR - 4;
        const nameFont = gf(600, fSize);

        // Top 3 get slightly brighter names
        ctx.fillStyle    = rankLabel <= 3 ? '#FFFFFF' : '#D0DCF0';
        ctx.font         = nameFont;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            this._truncateCached(ctx, entry.name, nameMaxW, nameFont),
            nameX, midY
        );

        // ── Win counter ───────────────────────────────────────────────────
        this._drawWins(ctx, entry, globalRank, x + w - padR, midY, fSize, now);

        if (rowI < n - 1) this._divider(ctx, x, ry, w, rowH);
    }

    _drawWins(ctx, entry, globalRank, rightEdge, midY, fSize, now) {
        const bump = this._bumps.get(entry.code);
        let wins  = entry.wins;
        let scale = 1;
        let color, glowColor;

        const rank = globalRank + 1;
        if (rank === 1)      { color = '#FFD700'; glowColor = 'rgba(255,200,61,0.6)'; }
        else if (rank === 2) { color = '#C8D4E8'; glowColor = 'rgba(192,210,232,0.4)'; }
        else if (rank === 3) { color = '#CD9B6E'; glowColor = 'rgba(200,140,80,0.4)'; }
        else                 { color = '#38D5FF'; glowColor = 'rgba(56,213,255,0.35)'; }

        if (bump) {
            const t = Math.min(1, (now - bump.startTime) / bump.duration);
            wins    = bump.toValue;
            if (t < 1) {
                const peak = 0.25;
                scale = t < peak
                    ? 1 + 0.45 * (t / peak)
                    : 1 + 0.45 * this._easeOut(1 - (t - peak) / (1 - peak));
                scale = Math.max(1, scale);
                // Flash white-to-gold on win
                const flash = Math.max(0, 1 - t * 2);
                color = `rgb(${Math.round(255)},${Math.round(200 + 55 * flash)},${Math.round(61 + 194 * flash)})`;
            } else {
                this._bumps.delete(entry.code);
            }
        }

        const label = wins === 1 ? '1 WIN' : `${wins} WINS`;

        ctx.save();
        ctx.font         = gf(800, Math.round(fSize * scale));
        ctx.fillStyle    = color;
        ctx.textAlign    = 'right';
        ctx.textBaseline = 'middle';

        if (scale > 1.05 || rank <= 3) {

            ctx.shadowBlur = 0;
        }
        ctx.fillText(label, rightEdge, midY);
        ctx.restore();
    }

    _drawFlag(ctx, img, fx, fy, fw, fh, rank) {
        const ready = img && img.complete && img.naturalWidth > 0;

        ctx.save();
        this._rrect(ctx, fx, fy, fw, fh, 3);
        ctx.clip();

        if (ready) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, fx, fy, fw, fh);
        } else {
            // Shimmer placeholder
            const sx   = fx + (this._shimmerPhase * 2 - 0.5) * fw * 2;
            const grad = ctx.createLinearGradient(sx - fw * 0.5, 0, sx + fw * 0.5, 0);
            grad.addColorStop(0,    '#0D1929');
            grad.addColorStop(0.45, '#1A3060');
            grad.addColorStop(0.55, '#2E62E8');
            grad.addColorStop(1,    '#0D1929');
            ctx.fillStyle = grad;
            ctx.fillRect(fx, fy, fw, fh);
        }
        ctx.restore();

        // Gold border for rank 1, silver for rank 2, subtle for rest
        let borderColor;
        if (rank === 0)      borderColor = 'rgba(255,215,0,0.55)';
        else if (rank === 1) borderColor = 'rgba(192,210,232,0.40)';
        else                 borderColor = ready ? 'rgba(255,255,255,0.14)' : 'rgba(46,98,232,0.22)';

        ctx.strokeStyle = borderColor;
        ctx.lineWidth   = 0.8;
        this._rrect(ctx, fx, fy, fw, fh, 3);
        ctx.stroke();
    }

    _divider(ctx, x, ry, w, rowH) {
        const divGrad = ctx.createLinearGradient(x, 0, x + w, 0);
        divGrad.addColorStop(0,   'rgba(61,124,255,0)');
        divGrad.addColorStop(0.3, 'rgba(61,124,255,0.15)');
        divGrad.addColorStop(0.7, 'rgba(56,213,255,0.15)');
        divGrad.addColorStop(1,   'rgba(61,124,255,0)');
        ctx.strokeStyle = divGrad;
        ctx.lineWidth   = 0.6;
        ctx.beginPath();
        ctx.moveTo(x + 6,     ry + rowH);
        ctx.lineTo(x + w - 6, ry + rowH);
        ctx.stroke();
    }

    _startFade(fromPage, toPage, now) {
        this._fading    = true;
        this._fromPage  = fromPage;
        this._toPage    = toPage;
        this._fadeStart = now;
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
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    _easeOut(t) {
        return 1 - Math.pow(1 - t, 3);
    }
}
