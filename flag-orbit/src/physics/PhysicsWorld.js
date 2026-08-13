import Matter from "matter-js";

export default class PhysicsWorld {

    constructor(width, height) {

        // FIX 10a: Enable sleeping so packed / stationary flags cost near-zero CPU.
        // Matter.js will mark bodies that haven't moved for sleepThreshold frames
        // as "sleeping" and skip their physics entirely.
        this.engine = Matter.Engine.create({
            enableSleeping: true,
            // PERFORMANCE: fewer solver iterations = less CPU, still stable
            positionIterations: 4,
            velocityIterations: 3,
        });

        this.world = this.engine.world;

        this.world.gravity.y = 0;

        this.width  = width;
        this.height = height;
    }

    update() {
        // Fixed timestep: always step by exactly 1000/60 ms.
        Matter.Engine.update(this.engine, 1000 / 60);
    }

}