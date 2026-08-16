import ClassicEvent        from "./events/ClassicEvent.js";
import TurboEvent          from "./events/TurboEvent.js";
import LowGravityEvent     from "./events/LowGravityEvent.js";
import EarthquakeEvent     from "./events/EarthquakeEvent.js";
import ShrinkingArenaEvent from "./events/ShrinkingArenaEvent.js";
import DoubleHoleEvent     from "./events/DoubleHoleEvent.js";
import MagnetCoreEvent     from "./events/MagnetCoreEvent.js";
import WindGustEvent       from "./events/WindGustEvent.js";
import BouncyEvent         from "./events/BouncyEvent.js";
import LastStandingEvent   from "./events/LastStandingEvent.js";
import ReverseGravityEvent from "./events/ReverseGravityEvent.js";
import BlackHoleEvent      from "./events/BlackHoleEvent.js";
import SpinCycleEvent      from "./events/SpinCycleEvent.js";
import BilliardBreakEvent  from "./events/BilliardBreakEvent.js";
import OrbitDrainEvent     from "./events/OrbitDrainEvent.js";
// ── New events ────────────────────────────────────────────────────────────────
import BlenderEvent        from "./events/BlenderEvent.js";
import TidalWaveEvent      from "./events/TidalWaveEvent.js";
import ShockwaveEvent      from "./events/ShockwaveEvent.js";
import DriftEvent          from "./events/DriftEvent.js";
import StampedeEvent       from "./events/StampedeEvent.js";

// Qualifying pool only — LAST STANDING is final-exclusive (not in rotation)
const ALL_EVENTS = [
    ClassicEvent,
    TurboEvent,
    LowGravityEvent,
    EarthquakeEvent,
// ShrinkingArenaEvent,
    DoubleHoleEvent,
    MagnetCoreEvent,
    // WindGustEvent,
    BouncyEvent,
    ReverseGravityEvent,
    BlackHoleEvent,
    SpinCycleEvent,
    BilliardBreakEvent,
    OrbitDrainEvent,
    // ── New events ──────────────────────────────────────────────────────────
    BlenderEvent,
    // TidalWaveEvent,
    ShockwaveEvent,
    DriftEvent,
    StampedeEvent,
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

    /** Force CLASSIC — available if needed. */
    pickClassic() {
        this.current = new ClassicEvent();
        this._lastIndex = 0;
        return this.current;
    }

    /** Force EARTHQUAKE — used for sudden-death rounds. */
    pickEarthquake() {
        this.current = new EarthquakeEvent();
        this._lastIndex = ALL_EVENTS.indexOf(EarthquakeEvent);
        return this.current;
    }

    /**
     * Final-only: continuous LAST STANDING physics
     * (video-style swirl + steady gap + strong funnel).
     */
    pickLastStanding() {
        this.current = new LastStandingEvent();
        this._lastIndex = -1;
        return this.current;
    }

    start(ctx) { if (this.current) this.current.start(ctx); }
    update(ctx) { if (this.current) this.current.update(ctx); }
    end(ctx)   { if (this.current) this.current.end(ctx); }

    get name()  { return this.current?.name  ?? "CLASSIC"; }
    get color() { return this.current?.color ?? "#FFD700"; }
    get icon()  { return this.current?.icon  ?? "🏁"; }
}
