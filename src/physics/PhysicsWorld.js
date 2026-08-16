import Matter from "matter-js";

export default class PhysicsWorld {

    constructor(width, height) {

        // FIX 10a: Enable sleeping so packed / stationary flags cost near-zero CPU.
        this.engine = Matter.Engine.create({
            enableSleeping: true,
            positionIterations: 4,
            velocityIterations: 3,
        });

        this.world = this.engine.world;
        this.world.gravity.y = 0;

        this.width  = width;
        this.height = height;

        /** 0 = light (many flags), 1 = normal, 2 = precise (few flags) */
        this._loadTier = 1;
    }

    /**
     * Scale solver cost with live flag count. No gameplay rule changes —
     * only how hard the engine works per frame.
     */
    setFlagLoad(count) {
        let tier;
        if (count > 160)      tier = 0; // crowded
        else if (count > 80)  tier = 1; // medium
        else                  tier = 2; // sparse

        if (tier === this._loadTier) return;
        this._loadTier = tier;

        if (tier === 0) {
            this.engine.positionIterations = 2;
            this.engine.velocityIterations = 2;
        } else if (tier === 1) {
            this.engine.positionIterations = 3;
            this.engine.velocityIterations = 3;
        } else {
            this.engine.positionIterations = 4;
            this.engine.velocityIterations = 3;
        }
    }

    update() {
        Matter.Engine.update(this.engine, 1000 / 60);
    }

}
