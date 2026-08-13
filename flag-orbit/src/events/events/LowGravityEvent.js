export default class LowGravityEvent {
    name  = "LOW GRAVITY";
    color = "#00C8FF";
    icon  = "🌙";

    start({ physics }) {
        physics.engine.world.gravity.y = 0.003;
        physics.engine.world.gravity.x = 0;
    }

    update() {}

    end({ physics }) {
        physics.engine.world.gravity.y = 0;
        physics.engine.world.gravity.x = 0;
    }
}