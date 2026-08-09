export default class LayoutManager {

    constructor() {
        this.width  = 0;
        this.height = 0;

        // ── Leaderboard ───────────────────────────────────────────────
        this.lbRowCount = 5;
        this.lbRowH     = 26;    // overridden in update()
        this.lbTopPad   = 4;
        this.lbGapBelow = 4;
        this.lbZoneH    = 0;     // computed

        // ── Progress bar ──────────────────────────────────────────────
        this.barHeight   = 18;   // overridden in update()
        this.barLabelH   = 14;
        this.barGapAbove = 6;
        this.barGapBelow = 4;
        this.barZoneH    = 0;    // computed

        // ── Bottom tray ───────────────────────────────────────────────
        this.bottomTrayHeight = 90;   // overridden in update()

        // ── Arena ─────────────────────────────────────────────────────
        this.arenaRadius = 0;
        this.arenaX      = 0;
        this.arenaY      = 0;

        // ── Leaderboard panel coords ──────────────────────────────────
        this.lbX = 0;
        this.lbY = 0;
        this.lbW = 0;

        // ── Progress bar coords ───────────────────────────────────────
        this.barY       = 0;
        this.barCenterX = 0;
        this.barWidth   = 0;

        // ── Tray top ──────────────────────────────────────────────────
        this.trayTop = 0;
    }

    update(width, height) {
        this.width  = width;
        this.height = height;

        // Row height scales: ~19px on small phones, up to 26px on tablets/desktop
        this.lbRowH    = Math.round(Math.min(26, Math.max(18, height * 0.028)));
        // lbHeaderH mirrors the header stripe added by LeaderboardRenderer
        this.lbHeaderH = Math.max(14, Math.round(this.lbRowH * 0.48));
        this.lbZoneH   = this.lbTopPad + this.lbHeaderH + this.lbRowCount * this.lbRowH + this.lbGapBelow;

        // Bar height scales with screen
        this.barHeight = Math.round(Math.min(20, Math.max(14, height * 0.020)));
        this.barZoneH  = this.barGapAbove + this.barHeight + this.barLabelH + this.barGapBelow;

        // Tray scales: 55px min on tiny phones, 90px max on tablets/desktop
        this.bottomTrayHeight = Math.round(Math.min(90, Math.max(55, height * 0.10)));

        // Tray
        this.trayTop = height - this.bottomTrayHeight;

        // Play zone — space between leaderboard and bar+tray
        const playZoneTop = this.lbZoneH;
        const playZoneBot = this.trayTop - this.barZoneH;
        const playZoneH   = Math.max(10, playZoneBot - playZoneTop);

        // Arena — maximise radius, 0.48 leaves breathing room for ring stroke
        this.arenaRadius = Math.min(width * 0.48, playZoneH * 0.48);
        this.arenaX      = width / 2;
        this.arenaY      = playZoneTop + playZoneH / 2;

        // Leaderboard panel — nearly full-width on mobile
        this.lbY = this.lbTopPad;
        this.lbW = Math.min(520, width * 0.92);
        this.lbX = (width - this.lbW) / 2;

        // Progress bar — nearly full-width on mobile
        this.barY       = this.arenaY + this.arenaRadius + this.barGapAbove;
        this.barCenterX = width / 2;
        this.barWidth   = Math.min(560, width * 0.92);
    }
}