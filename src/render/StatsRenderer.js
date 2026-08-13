import { gf, GAME_FONT } from '../GameFont.js';
// StatsRenderer.js — compact match statistics panel (broadcast style)

import StatsManager from "../managers/StatsManager";

export default class StatsRenderer {

    draw(ctx, snapshot, canvasW, canvasH, trayTop) {
        if (!snapshot) return;

        const rows = this._buildRows(snapshot);
        if (rows.length === 0) return;

        const padX = 10;
        const padY = 6;
        const lineH = Math.min(16, Math.max(12, canvasH * 0.018));
        const titleH = lineH + 2;
        const panelH = padY * 2 + titleH + rows.length * lineH;
        const panelW = Math.min(220, canvasW * 0.42);
        const panelX = 8;
        const panelY = Math.max(8, (trayTop ?? canvasH - 90) - panelH - 6);

        ctx.save();

        // Card background — panels
        ctx.fillStyle = 'rgba(16, 29, 56, 0.88)';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(panelX, panelY, panelW, panelH, 10);
        } else {
            ctx.rect(panelX, panelY, panelW, panelH);
        }
        ctx.fill();

        // Accent border
        ctx.strokeStyle = 'rgba(46, 98, 232, 0.50)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Title
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = gf(800, Math.max(10, lineH - 1));
        ctx.fillStyle = '#38D5FF';
        ctx.fillText('STATS', panelX + padX, panelY + padY);

        // Rows
        ctx.font = gf(500, Math.max(9, lineH - 2));
        let y = panelY + padY + titleH;

        for (const row of rows) {
            ctx.fillStyle = '#91A7C9';
            ctx.fillText(row.label, panelX + padX, y);

            ctx.fillStyle = '#F4F7FF';
            ctx.textAlign = 'right';
            const value = this._truncate(ctx, row.value, panelW - padX * 2 - 70);
            ctx.fillText(value, panelX + panelW - padX, y);
            ctx.textAlign = 'left';

            y += lineH;
        }

        ctx.restore();
    }

    _buildRows(s) {
        const rows = [];

        rows.push({
            label: 'Matches',
            value: String(s.totalMatches ?? 0),
        });

        if (s.highestWins) {
            rows.push({
                label: 'Top wins',
                value: `${s.highestWins.name} (${s.highestWins.wins})`,
            });
        }

        if (s.streak) {
            rows.push({
                label: 'Streak',
                value: `${s.streak.name} ×${s.streak.count}`,
            });
        }

        if (s.longestSurvive) {
            rows.push({
                label: 'Longest',
                value: `${s.longestSurvive.name} ${StatsManager.formatMs(s.longestSurvive.ms)}`,
            });
        }

        if (s.fastestElim) {
            rows.push({
                label: 'Fastest out',
                value: `${s.fastestElim.name} ${StatsManager.formatMs(s.fastestElim.ms)}`,
            });
        }

        return rows;
    }

    _truncate(ctx, text, maxW) {
        if (ctx.measureText(text).width <= maxW) return text;
        let t = text;
        while (t.length > 3 && ctx.measureText(t + '…').width > maxW) {
            t = t.slice(0, -1);
        }
        return t + '…';
    }
}
