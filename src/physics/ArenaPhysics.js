import Matter from "matter-js";

const STATE_INTRO   = "INTRO";
const STATE_OPENING = "OPENING";
const STATE_PLAYING = "PLAYING";

export default class ArenaPhysics {



    constructor(world, cx, cy, radius) {

        this.cx     = cx;
        this.cy     = cy;
        this.radius = radius;

        this.rotationSpeed = 0.020;
        this.angle         = 0;

        // PERFORMANCE: 48 segments is visually almost identical and cuts wall physics cost ~50%
        this.segmentCount = 48;
        this.thickness    = 22;

        // Gap starts moderate; progressive widen (setRemainingFlags) opens up to maxGap
        this.initialGapSize = 3;
        this.maxGapSize     = 7;
        this.gapSize        = 0;

        this.state           = STATE_INTRO;
        this.introDuration   = 180;
        this.introTimer      = 0;
        this.openingDuration = 120; // faster open so flags start draining sooner
        this.openingTimer    = 0;

        this.remainingFlags = 50;
        this.totalFlags     = 50;

        this.segments = [];
        this._wallUpdateCounter = 0;  // for every-2-frames wall sync

        // Pre-compute per-segment angles once — avoid recomputing every frame
        this._segAngles  = new Float32Array(this.segmentCount);
        this._segCosines = new Float32Array(this.segmentCount);
        this._segSines   = new Float32Array(this.segmentCount);

        for (let i = 0; i < this.segmentCount; i++) {
            const segAngle = (i / this.segmentCount) * Math.PI * 2;
            this._segAngles[i]  = segAngle;
            this._segCosines[i] = Math.cos(segAngle);
            this._segSines[i]   = Math.sin(segAngle);

            const wall = Matter.Bodies.rectangle(
                cx + this._segCosines[i] * radius,
                cy + this._segSines[i]   * radius,
                this.thickness, 32,
                {
                    isStatic    : true,
                    angle       : segAngle,
                    restitution : 1.0,
                    friction    : 0,
                    label       : "arenaWall"
                }
            );
            this.segments.push(wall);
        }

        Matter.World.add(world, this.segments);

        // ── Orange barrier arc: opposite, faster, physics paddle ──
        this.rimEnabled   = false;
        this.rimSegments  = [];
        this.rimAngle     = Math.PI;
        this.rimRadius    = radius + 4;
        this.rimThickness = 12;
        this.rimGapSize   = 0;
        this.rimArcSpan   = 0.2;
        this.rimSpeedMult = 0.8; // was 2.2 — rim now slower than disc, acts as brake not launcher
        this._world       = world;
    }



    /**
     * Orange barrier arc — opposite rotation, faster than disc.
     * Physics: only the arc sector is solid (paddle), rest open → no trapping.
     * Arc angular size matches arena gap.
     */
    enableRim(on = true) {
        this.rimEnabled = !!on;
        if (on) {
            this._buildRimSegments();
            this._syncRimWalls(this.gapSize || this.initialGapSize || 2);
        } else {
            this._removeRimSegments();
        }
    }

    _buildRimSegments() {
        this._removeRimSegments();
        // Enough segments to cover the max gap arc smoothly
        const maxSeg = Math.min(this.segmentCount, 24);
        const r = this.rimRadius;
        const chord = (2 * Math.PI * r) / this.segmentCount * 1.15;
        for (let i = 0; i < maxSeg; i++) {
            const wall = Matter.Bodies.rectangle(
                this.cx,
                this.cy,
                this.rimThickness,
                chord,
                {
                    isStatic: true,
                    restitution: 0.55,  // was 1.05 — absorbs energy on contact, slows flags down
                    friction: 0.08,     // slight drag on rim contact
                    frictionStatic: 0,
                    label: "arenaRimWall",
                    collisionFilter: { category: 0x0002, mask: 0xFFFFFFFF },
                }
            );
            this.rimSegments.push(wall);
        }
        Matter.World.add(this._world, this.rimSegments);
    }

    _removeRimSegments() {
        if (this.rimSegments.length && this._world) {
            for (const w of this.rimSegments) {
                try { Matter.World.remove(this._world, w); } catch (_) {}
            }
        }
        this.rimSegments = [];
    }

    _syncRimWalls(effectiveMainGap) {
        if (!this.rimEnabled) return;
        if (!this.rimSegments.length) this._buildRimSegments();

        const g = this.state === STATE_PLAYING
            ? Math.max(1, effectiveMainGap | 0)
            : 0;
        this.rimGapSize = g;
        // Arc size == arena gap size
        this.rimArcSpan = (g / Math.max(1, this.segmentCount)) * Math.PI * 2;
        this.rimRadius = this.radius + 4;
        this.rimThickness = 12;

        const n = this.rimSegments.length;
        // How many paddle segments are active for this arc
        const active = Math.max(1, Math.min(n, g));
        const step = this.rimArcSpan / active;

        for (let i = 0; i < n; i++) {
            const wall = this.rimSegments[i];
            if (!wall) continue;

            if (i < active) {
                const a = this.rimAngle + i * step + step * 0.5;
                const x = this.cx + Math.cos(a) * this.rimRadius;
                const y = this.cy + Math.sin(a) * this.rimRadius;
                wall.collisionFilter.mask = 0xFFFFFFFF;
                Matter.Body.setPosition(wall, { x, y });
                Matter.Body.setAngle(wall, a);
            } else {
                // Park inactive segments off-world, no collision
                wall.collisionFilter.mask = 0;
                Matter.Body.setPosition(wall, { x: -9999, y: -9999 });
            }
        }
    }




    setTotalFlags(count) {
        this.totalFlags     = count;
        this.remainingFlags = count;
    }


    setRemainingFlags(count) {
        this.remainingFlags = count;
        // Progressive widen: as flags leave, open the disc more so remaining
        // flags (and larger elim-round flags) can still exit cleanly.
        // ratio 1 → initialGap, ratio 0 → maxGap.
        if (this.state === STATE_PLAYING) {
            const total = Math.max(1, this.totalFlags);
            const ratio = Math.max(0, Math.min(1, count / total));
            // Ease so early eliminations only open a little; late game opens more.
            const t = 1 - ratio;
            const eased = t * t; // ease-in
            const minG = this.initialGapSize;
            const maxG = Math.max(minG, this.maxGapSize);
            this.gapSize = Math.max(minG, Math.round(minG + (maxG - minG) * eased));
        }
    }


    startOpening() {
        if (this.state === STATE_INTRO) {
            this.state        = STATE_OPENING;
            this.openingTimer = 0;
        }
    }


    // FIX 2b: syncWalls() is only called explicitly (resize/state-change).
    // update() does the inline wall sync itself to avoid a double-loop.
    syncWalls() {
        const effectiveGap = (this.state === STATE_PLAYING)
            ? this.gapSize
            : 0;

        const gapStart = Math.floor(
            (this.angle / (Math.PI * 2)) * this.segmentCount
        );

        for (let i = 0; i < this.segmentCount; i++) {
            const wall  = this.segments[i];
            const inGap = ((i - gapStart + this.segmentCount) % this.segmentCount)
                          < effectiveGap;

            wall.collisionFilter.mask = inGap ? 0 : 0xFFFFFFFF;

            // Use pre-cached trig values
            Matter.Body.setPosition(wall, {
                x: this.cx + this._segCosines[i] * this.radius,
                y: this.cy + this._segSines[i]   * this.radius,
            });
            Matter.Body.setAngle(wall, this._segAngles[i]);
        }
        this._syncRimWalls(effectiveGap);
    }


    get isIntro() {
        return (
            this.state === STATE_INTRO ||
            this.state === STATE_OPENING
        );
    }


    update() {

        // ── State machine ──────────────────────────────────────────────────
        if (this.state === STATE_INTRO) {
            this.introTimer++;
            this.rotationSpeed = 0.016 + 0.006 * Math.sin(this.introTimer * 0.06);

            if (this.introTimer >= this.introDuration) {
                this.startOpening();
            }

        } else if (this.state === STATE_OPENING) {
            this.openingTimer++;
            const t = Math.min(1, this.openingTimer / this.openingDuration);
            // Slow ease-out: gap creeps open gradually instead of snapping wide
            const eased = 1 - Math.pow(1 - t, 2.4);
            this.gapSize       = Math.max(1, Math.round(this.initialGapSize * eased));
            this.rotationSpeed = 0.014;

            if (this.openingTimer >= this.openingDuration) {
                this.state   = STATE_PLAYING;
                this.gapSize = this.initialGapSize;
            }

        } else {
            const remainRatio = this.remainingFlags / Math.max(1, this.totalFlags);
            this.rotationSpeed = 0.016 + (1 - remainRatio) * 0.006;
        }

        this.angle += this.rotationSpeed;
        if (this.angle > Math.PI * 2) this.angle -= Math.PI * 2;

        // Orange arc: opposite + faster than disc
        if (this.rimEnabled) {
            const spd = this.rotationSpeed * (this.rimSpeedMult || 2.2);
            this.rimAngle -= spd;
            if (this.rimAngle < 0) this.rimAngle += Math.PI * 2;
        }

        const effectiveGap = (this.state === STATE_PLAYING) ? this.gapSize : 0;

        this.gapStart = Math.floor(
            (this.angle / (Math.PI * 2)) * this.segmentCount
        );

        // PERFORMANCE: Update wall bodies only every 2 frames.
        // Gap mask + position still feel smooth; halves Matter.js body work.
        this._wallUpdateCounter++;
        if (this._wallUpdateCounter % 2 !== 0) return;

        for (let i = 0; i < this.segmentCount; i++) {
            const wall  = this.segments[i];
            const inGap = ((i - this.gapStart + this.segmentCount) % this.segmentCount)
                          < effectiveGap;

            wall.collisionFilter.mask = inGap ? 0 : 0xFFFFFFFF;

            Matter.Body.setPosition(wall, {
                x: this.cx + this._segCosines[i] * this.radius,
                y: this.cy + this._segSines[i]   * this.radius,
            });
            Matter.Body.setAngle(wall, this._segAngles[i]);
        }

        this._syncRimWalls(effectiveGap);
    }
}