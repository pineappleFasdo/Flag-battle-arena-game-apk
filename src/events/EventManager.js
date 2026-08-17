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
        /** Recent indices — do not repeat these (last up to 3). */
        this._recent    = [];
    }

    pick() {
        const n = ALL_EVENTS.length;
        const blocked = new Set(this._recent);
        if (this._lastIndex >= 0) blocked.add(this._lastIndex);

        let idx;
        let tries = 0;
        do {
            idx = Math.floor(Math.random() * n);
            tries++;
        } while (blocked.has(idx) && tries < 40 && blocked.size < n);

        this._lastIndex = idx;
        this._recent.push(idx);
        if (this._recent.length > 3) this._recent.shift();

        this.current = new ALL_EVENTS[idx]();
        return this.current;
    }

    /** Force CLASSIC — available if needed. */
    pickClassic() {
        this.current = new ClassicEvent();
        this._lastIndex = 0;
        this._recent.push(0);
        if (this._recent.length > 3) this._recent.shift();
        return this.current;
    }

    /** Force EARTHQUAKE — used for sudden-death rounds. */
    pickEarthquake() {
        this.current = new EarthquakeEvent();
        this._lastIndex = ALL_EVENTS.indexOf(EarthquakeEvent);
        if (this._lastIndex >= 0) {
            this._recent.push(this._lastIndex);
            if (this._recent.length > 3) this._recent.shift();
        }
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
