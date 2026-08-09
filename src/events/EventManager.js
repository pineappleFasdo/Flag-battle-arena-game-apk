import ClassicEvent        from "./events/ClassicEvent.js";
import TurboEvent          from "./events/TurboEvent.js";
import LowGravityEvent     from "./events/LowGravityEvent.js";
import EarthquakeEvent     from "./events/EarthquakeEvent.js";
import ShrinkingArenaEvent from "./events/ShrinkingArenaEvent.js";
import DoubleHoleEvent     from "./events/DoubleHoleEvent.js";
import MagnetCoreEvent     from "./events/MagnetCoreEvent.js";
import WindGustEvent       from "./events/WindGustEvent.js";
import BouncyEvent         from "./events/BouncyEvent.js";

const ALL_EVENTS = [
     ClassicEvent,
  TurboEvent,
     LowGravityEvent,
    EarthquakeEvent,
// ShrinkingArenaEvent,
    DoubleHoleEvent,
    MagnetCoreEvent,
    WindGustEvent,
    BouncyEvent,
];

export default class EventManager {

    constructor() {
        this.current    = null;
        this._lastIndex = -1;
    }

    pick() {
        let idx;
        do {
            idx = Math.floor(Math.random() * ALL_EVENTS.length);
        } while (idx === this._lastIndex && ALL_EVENTS.length > 1);

        this._lastIndex = idx;
        this.current    = new ALL_EVENTS[idx]();
        return this.current;
    }

    start(ctx) { if (this.current) this.current.start(ctx); }
    update(ctx) { if (this.current) this.current.update(ctx); }
    end(ctx)   { if (this.current) this.current.end(ctx); }

    get name()  { return this.current?.name  ?? "CLASSIC"; }
    get color() { return this.current?.color ?? "#FFD700"; }
    get icon()  { return this.current?.icon  ?? "🏁"; }
}