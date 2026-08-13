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
    }
}