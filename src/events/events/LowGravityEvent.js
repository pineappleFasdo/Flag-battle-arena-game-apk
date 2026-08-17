export default class LowGravityEvent {
    name  = "LOW GRAVITY";
    color = "#00C8FF";
    icon  = "🌙";

    start({ physics }) {
        // Slightly stronger so effect stays visible under SmoothArena residual stir
        physics.engine.world.gravity.y = 0.006;
        physics.engine.world.gravity.x = 0;
    }

    update() {}

    end({ physics }) {
        physics.engine.world.gravity.y = 0;
        physics.engine.world.gravity.x = 0;
    }
}