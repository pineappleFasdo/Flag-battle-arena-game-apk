import Matter from "matter-js";

export default class ArenaPhysics {

    static STATE_INTRO   = "INTRO";
    static STATE_OPENING = "OPENING";
    static STATE_PLAYING = "PLAYING";

    constructor(world, cx, cy, radius) {

        this.cx     = cx;
        this.cy     = cy;
        this.radius = radius;

        this.rotationSpeed = 0.024;
        this.angle         = 0;

        // PERFORMANCE: 48 segments is visually almost identical and cuts wall physics cost ~50%
        this.segmentCount = 48;
        this.thickness    = 22;

        this.initialGapSize = 4;   // scaled for fewer segments (was 7 @ 96)
        this.maxGapSize     = 12;  // scaled for fewer segments (was 22 @ 96)
        this.gapSize        = 0;

        this.state           = ArenaPhysics.STATE_INTRO;
        this.introDuration   = 180;
        this.introTimer      = 0;
        this.openingDuration = 90;
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
                    restitution : 0.95,
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
        if (this.state !== ArenaPhysics.STATE_PLAYING) return;

        const eliminated = this.totalFlags - count;
        const t = Math.max(0, Math.min(1, eliminated / Math.max(1, this.totalFlags - 1)));
        const eased = 1 - Math.pow(1 - t, 1.6);
        this.gapSize = Math.round(
            this.initialGapSize + (this.maxGapSize - this.initialGapSize) * eased
        );
    }


    startOpening() {
        if (this.state === ArenaPhysics.STATE_INTRO) {
            this.state        = ArenaPhysics.STATE_OPENING;
            this.openingTimer = 0;
        }
    }


    // FIX 2b: syncWalls() is only called explicitly (resize/state-change).
    // update() does the inline wall sync itself to avoid a double-loop.
    syncWalls() {
        const effectiveGap = (this.state === ArenaPhysics.STATE_PLAYING)
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
            this.state === ArenaPhysics.STATE_INTRO ||
            this.state === ArenaPhysics.STATE_OPENING
        );
    }


    update() {

        // ── State machine ──────────────────────────────────────────────────
        if (this.state === ArenaPhysics.STATE_INTRO) {
            this.introTimer++;
            this.rotationSpeed = 0.024 + 0.010 * Math.sin(this.introTimer * 0.06);

            if (this.introTimer >= this.introDuration) {
                this.startOpening();
            }

        } else if (this.state === ArenaPhysics.STATE_OPENING) {
            this.openingTimer++;
            const t = Math.min(1, this.openingTimer / this.openingDuration);
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            this.gapSize       = Math.round(this.initialGapSize * eased);
            this.rotationSpeed = 0.024;

            if (this.openingTimer >= this.openingDuration) {
                this.state   = ArenaPhysics.STATE_PLAYING;
                this.gapSize = this.initialGapSize;
            }

        } else {
            const remainRatio = this.remainingFlags / Math.max(1, this.totalFlags);
            this.rotationSpeed = 0.024 + (1 - remainRatio) * 0.012;
        }

        this.angle += this.rotationSpeed;
        if (this.angle > Math.PI * 2) this.angle -= Math.PI * 2;

        const effectiveGap = (this.state === ArenaPhysics.STATE_PLAYING) ? this.gapSize : 0;

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