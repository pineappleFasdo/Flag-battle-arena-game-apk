export default class TurboEvent {
    name  = "TURBO";
    color = "#FF6B00";
    icon  = "⚡";

    _originalSpeed = 0.022;
    _origInitialGap = 3;
    _origMaxGap = 3;

    start({ arena }) {
        this._originalSpeed   = arena.rotationSpeed;
        this._origInitialGap  = arena.initialGapSize;
        this._origMaxGap      = arena.maxGapSize;
        arena._turboActive    = true;
        arena.rotationSpeed   = 0.068;
        // Keep gap small even in turbo — do not widen
        arena.gapSize         = Math.min(arena.gapSize || 3, 3);
    }

    update({ arena }) {
        if (arena.state === "PLAYING") {
            arena.rotationSpeed = 0.068;
            // Hold fixed small gap
            if (arena.gapSize > 3) arena.gapSize = 3;
        }
    }

    end({ arena }) {
        arena._turboActive   = false;
        arena.rotationSpeed  = this._originalSpeed;
        arena.initialGapSize = this._origInitialGap;
        arena.maxGapSize     = this._origMaxGap;
    }
}
