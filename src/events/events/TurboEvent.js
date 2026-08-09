export default class TurboEvent {
    name  = "TURBO";
    color = "#FF6B00";
    icon  = "⚡";

    _originalSpeed = 0.022;

    start({ arena }) {
        this._originalSpeed  = arena.rotationSpeed;
        arena._turboActive   = true;
        arena.rotationSpeed  = 0.068;
        // scaled for 48 segments (was 5/14 @ 96)
        arena.initialGapSize = 3;
        arena.maxGapSize     = 7;
    }

    update({ arena }) {
        if (arena.state === "PLAYING") {
            arena.rotationSpeed = 0.068;
        }
    }

    end({ arena }) {
        arena._turboActive   = false;
        arena.rotationSpeed  = this._originalSpeed;
        // restore to new defaults (scaled)
        arena.initialGapSize = 4;
        arena.maxGapSize     = 12;
    }
}