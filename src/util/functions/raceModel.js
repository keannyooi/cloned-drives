"use strict";

/**
 * RACE MODEL v3 — the sandbox engine
 * ===================================
 * NOT the live engine. race.js, pgGenerator.js and paceIndex.js still run the
 * v2.0 point formula; this module is read only by the sandbox (`cd-testrace`)
 * and the offline harness. Design: docs/race-engine-rework.md §3.
 *
 * A race is a lap-time comparison. Each car laps the v2 track (a list of
 * straights and corners, from src/rrtest/) with its own acceleration curve,
 * traction, grip and braking; the margin in seconds becomes points and the
 * per-phase difference is the explanation.
 *
 *   const model = require("./raceModel.js");
 *   const lap    = model.lapTime(car, "000", track);           // { seconds, phases, ... }
 *   const result = model.evalScore(carA, "969", carB, "996", track);
 *   // result.points (+ = A wins), result.breakdown [{ phase, seconds, points }], result.winner
 *
 * Inputs are plain carfile objects (BM cards resolve to their base) and a
 * track variant from testTracks.getTestTrack(). Deterministic, no RNG.
 *
 * Car side (all from existing carfile fields):
 *   curve   0-30 (from OLA), 0-60, 0-100 (from MRA), then a power model to
 *           top speed — power stated (`power`, PS) or estimated from the
 *           60-100 band; fuel type shapes the top end (EVs fade).
 *   τ       traction on launch and pull: tyre × surface × weather × drive ×
 *           TCS, fading out by 40 mph on dry tarmac and 100+ mph on loose
 *           surfaces; loose-surface tyres soften the drivetrain penalty (a
 *           rally car on gravel tyres is set up for gravel). 1.0 on dry
 *           tarmac (the stats already embed the car's own tyres in the dry).
 *           Off tarmac τ is also a ceiling on acceleration in g: the tyre
 *           can find only so much on loose ground, whatever the power.
 *   grip    corner speed ∝ √(handling × tyre-on-surface × agility × drive^½ off dry tarmac).
 *   braking 1 g × grip (× ABS in the wet), spent before every corner.
 *   humps (rocks and rough obstacles) and bumps are stretches of road with
 *   a speed limit by clearance, spread along the lap; their cost is the
 *   braking, the crawl through and the re-acceleration they force.
 *   rough ground (stages, hill climbs, rallycross on loose surfaces) caps a
 *   car's speed by clearance and tyre — power cannot buy 150 mph on a Safari.
 *   altitude thins the air: combustion cars lose power with the track's
 *   altitude, EVs do not.
 * Track side: straights and corners from the layout facts, gradient from net
 * climb, standing or rolling start, MPH targets as a run to a speed, and
 * mixed surfaces (a condition's `mix`) raced segment by segment.
 */

const { calcTune, isValidTune } = require("./calcTune.js");
const { modifiedBase } = require("./cardType.js");
const { CORNER_TYPES, straightList, cornerSequence, arcScale, PHASES } = require("./trackV2.js");
const C = require("../consts/raceModelConsts.js");

const MPH = 0.44704, MILE = 1609.344, G = 9.81, PS = 735.5;
const PHASE_LABELS = { launch: "Launch", pull: "Pull", flatOut: "Flat-out", corners: "Corners", transitions: "Braking", obstacles: "Obstacles" };
const ALL_PHASES = [...PHASES, "obstacles"];
// What the two cars are compared on. Pull and flat-out are merged into
// "Straights": where a car's flat-out time begins depends on its own top
// speed, so comparing those two labels car-to-car would credit a slow car for
// sitting on its limiter. Launch (a standing start to 60 mph), corners,
// braking and obstacles are the same stretch of road for both cars.
const COMPARE_GROUPS = [
    { key: "launch", label: "Launch", phases: ["launch"] },
    { key: "straights", label: "Straights", phases: ["pull", "flatOut"] },
    { key: "corners", label: "Corners", phases: ["corners"] },
    { key: "braking", label: "Braking", phases: ["transitions"] },
    { key: "obstacles", label: "Obstacles", phases: ["obstacles"] }
];

// ─── car profile ─────────────────────────────────────────────────────────────

function nameOf(car) {
    return `${Array.isArray(car.make) ? car.make[0] : car.make} ${car.model} (${car.modelYear})`;
}

function fuelShape(profile, fraction) {
    const shape = C.FUEL_SHAPE[profile.fuelType];
    if (!shape || fraction <= shape.knee) return 1;
    return 1 - (1 - shape.atTop) * Math.min(1, (fraction - shape.knee) / (1 - shape.knee));
}

/** Engine power implied by a measured speed band, in PS (see docs §1d). */
function powerFromBand(mass, v1, v2, seconds, vTop, eta, profile) {
    if (!(seconds > 0) || v2 <= v1) return null;
    let avail = 0;
    const n = 20;
    for (let i = 0; i < n; i++) {
        const v = v1 + (v2 - v1) * (i + 0.5) / n;
        avail += fuelShape(profile, v / vTop) * (1 - (v / vTop) ** 3);
    }
    avail /= n;
    if (avail < 0.05) return null;
    const wheel = mass * (v2 * v2 - v1 * v1) / (2 * seconds);
    return wheel / eta / avail / PS;
}

/**
 * Engine power (PS) needed to hold a car's top speed against aerodynamic drag
 * and rolling resistance — a floor under every estimate, and the estimate
 * itself for cars too slow for a speed band. Null without a top speed.
 */
function powerFromTopSpeed(base, weight, eta) {
    const v = base.topSpeed * MPH;
    if (!(v > 0) || !(weight > 0)) return null;
    const T = C.TOP_SPEED_POWER;
    const year = base.modelYear || 2000;
    let cd = (T.cdByEra.find(([until]) => year < until) || T.cdByEra[T.cdByEra.length - 1])[1];
    let area = T.frontalArea.base + T.frontalArea.perTonne * weight / 1000;
    const bodies = Array.isArray(base.bodyStyle) ? base.bodyStyle : [base.bodyStyle];
    if (bodies.some(body => T.bulky.includes(body))) { cd += T.bulkyCd; area += T.bulkyArea; }
    if (bodies.some(body => T.open.includes(body))) cd += T.openCd;
    const crr = year < 1970 ? T.crrOld : T.crr;
    const wheel = 0.5 * T.airDensity * cd * area * v ** 3 + crr * weight * G * v;
    return wheel / eta / PS;
}

/**
 * Everything the lap needs about one car at one tune. Cheap; not cached here
 * because the sandbox races two cars at a time.
 */
function buildProfile(car, tune = "000") {
    if (!isValidTune(tune)) tune = "000";
    const base = modifiedBase(car) || car;
    const t = calcTune(base, tune);
    const sub60 = t.accel >= 99 || t.topSpeed < 60;

    // 0-30 from OLA (lower OLA = better launch), scaled with the tuned 0-60 so an
    // Engine upgrade can never make the launch worse (the live olaBonus sign bug).
    const baseT30 = base.ola > 0 && base["0to60"] < 99 ? base.ola * base["0to60"] / 200 : null;
    const t60 = sub60 ? null : t.accel;
    const t30 = baseT30 && t60 ? baseT30 * (t.accel / base["0to60"]) : null;
    const t100 = !sub60 && t.topSpeed >= 105 && t.mra > 0 ? t.accel * (1 + 100 / t.mra) : null;

    const profile = {
        carID: base.carID || car.carID, name: nameOf(base), tune,
        topSpeed: t.topSpeed, handling: t.handling, weight: t.weight, mra: t.mra, ola: t.ola,
        t30, t60, t100, sub60,
        tyreType: base.tyreType, driveType: base.driveType, gc: base.gc, fuelType: base.fuelType,
        abs: !!base.abs, tcs: !!base.tcs,
        eta: C.DRIVETRAIN_EFFICIENCY[base.driveType] ?? 0.85,
        power: null, powerEstimated: false, powerSource: null   // stated | seeded | band | fallback
    };

    const vTop = t.topSpeed * MPH;
    if (typeof base.power === "number" && base.power > 0) {
        // Stated power (or the backfill's seeded estimate, still flagged as an
        // estimate); the Engine tune digit that shortened the 0-60 scales it the same way.
        profile.power = base.power * (base["0to60"] < 99 ? base["0to60"] / t.accel : 1);
        profile.powerEstimated = base.powerEstimated === true;
        profile.powerSource = profile.powerEstimated ? "seeded" : "stated";
    }
    else {
        // Estimated: the best speed band, floored by what the top speed alone
        // demands; cars without a band get the top-speed figure outright.
        profile.powerEstimated = true;
        const floor = powerFromTopSpeed(base, t.weight, profile.eta);
        let band = null, source = null;
        if (!sub60) {
            band = t100 ? powerFromBand(t.weight, 60 * MPH, 100 * MPH, t100 - t60, vTop, profile.eta, profile)
                : powerFromBand(t.weight, 30 * MPH, 60 * MPH, t30 ? t60 - t30 : t60 / 2, vTop, profile.eta, profile);
            source = t100 ? "band" : "band30";
        }
        // A 60-100 band is trusted as it is (user decision 2026-09-13); the floor
        // corrects only the 30-60 band and stands in when there is no band.
        if (band > 0 && (source === "band" || !(floor > band))) { profile.power = band; profile.powerSource = source; }
        else if (floor > 0) { profile.power = floor; profile.powerSource = "topSpeed"; }
    }
    if (!(profile.power > 0)) { profile.power = C.FALLBACK_PS_PER_TONNE * t.weight / 1000; profile.powerEstimated = true; profile.powerSource = "fallback"; }
    return profile;
}

/**
 * The engine's own power estimate for a carfile, in PS, from its stock stats:
 * what scripts/estimatePowerAll.js seeds into `power` with `powerEstimated:
 * true`. Ignores any power already in the file. The source says which won:
 * the 60-100 band, the 30-60 band, or the top speed (the floor). Null only
 * when the car has no top speed at all.
 * @returns {{ power: number, source: string } | null}
 */
const ESTIMATE_SOURCE = { band: "60-100 mph band", band30: "30-60 mph band", topSpeed: "top speed" };
function estimatePower(car) {
    const base = modifiedBase(car) || car;
    const stripped = { ...base };
    delete stripped.power;
    delete stripped.powerEstimated;
    const profile = buildProfile(stripped, "000");
    if (!ESTIMATE_SOURCE[profile.powerSource] || !(profile.power > 0)) return null;
    return { power: Math.max(5, Math.round(profile.power / 5) * 5), source: ESTIMATE_SOURCE[profile.powerSource] };
}

// ─── the car on a given surface ──────────────────────────────────────────────

function conditionOf(track) {
    return `${track.weather} ${track.surface}`;
}

/** Air density relative to sea level at an altitude in feet (ISA troposphere). */
function airDensityRatio(altitudeFeet) {
    const metres = altitudeFeet * 0.3048;
    return Math.pow(Math.max(0, 1 - 2.25577e-5 * metres), 4.25588);
}

/** Surface-dependent factors for one profile on one track condition. */
function surfaceFactors(profile, track) {
    const condition = conditionOf(track);
    const surfaceClass = C.SURFACE_CLASS[condition] || "dry";
    const tyre = (C.TYRE_GRIP[condition] || C.TYRE_GRIP["Sunny Asphalt"])[profile.tyreType] ?? 1;
    const rawDrive = (C.DRIVE_TRACTION[surfaceClass] || C.DRIVE_TRACTION.dry)[profile.driveType] ?? 1;
    const soften = surfaceClass === "dry" ? 1 : (C.TYRE_SOFTENS_DRIVE[profile.tyreType] ?? 1);
    const drive = rawDrive >= 1 ? rawDrive : 1 - (1 - rawDrive) * soften;
    const wet = C.WET.has(condition);
    let traction = tyre * drive;
    if (surfaceClass !== "dry" && profile.tcs) traction *= C.TCS_TRACTION_BONUS;

    let agility = 1;
    if (C.AGILITY.enabled) {
        agility = 1 - C.AGILITY.perKgOver1600 * Math.max(0, profile.weight - 1600) - (C.AGILITY.gc[profile.gc] || 0);
        agility = Math.max(C.AGILITY.floor, agility);
    }
    const driveGrip = surfaceClass === "dry" ? 1 : Math.pow(drive, C.DRIVE_CORNER_EXPONENT);
    const grip = (profile.handling / C.REFERENCE_HANDLING) * tyre * agility * driveGrip;
    let braking = C.BRAKING_G * G * tyre * agility;
    if (wet && profile.abs) braking *= C.ABS_WET_BRAKING_BONUS;
    const fadeMph = C.TRACTION_FADE_MPH[surfaceClass] ?? C.TRACTION_FADE_MPH.dry;
    // loose ground: the most acceleration this tyre and drivetrain can find there, in m/s²
    const accelCap = (C.SURFACE_ACCEL_CAP_G[surfaceClass] ?? Infinity) * G * Math.max(traction, 0.05);
    // thin air: air density from the standard atmosphere, power loss scaled by fuel type
    const sensitivity = C.ALTITUDE_SENSITIVITY[profile.fuelType] ?? 0.85;
    const altitudePower = typeof track.altitude === "number" && track.altitude > 0
        ? Math.max(C.ALTITUDE_POWER_FLOOR, 1 - sensitivity * (1 - airDensityRatio(track.altitude)))
        : 1;
    // rough ground: a speed cap by clearance and tyre
    const rough = surfaceClass !== "dry" && surfaceClass !== "wet" && C.ROUGH_KINDS.includes(track.kind);
    const capMph = rough ? (C.ROUGH_SPEED_CAP_MPH[profile.gc] ?? 115) + (C.ROUGH_TYRE_BONUS_MPH[profile.tyreType] ?? 0) : Infinity;
    return { condition, surfaceClass, wet, tyre, drive, driveGrip, traction, agility, grip, braking, fadeMph, accelCap, rough, capMph, altitudePower };
}

/** Base (dry, no gradient) acceleration in m/s² at speed v (m/s). */
function baseAccel(profile, v) {
    const vTop = profile.topSpeed * MPH;
    if (v >= vTop) return 0;
    if (profile.sub60) return Math.max(0.05, vTop / C.SUB60_ACCEL_SECONDS);
    const v30 = 30 * MPH, v60 = 60 * MPH, v100 = 100 * MPH;
    const a1 = profile.t30 ? v30 / profile.t30 : null;
    const a2 = profile.t30 ? (v60 - v30) / (profile.t60 - profile.t30) : v60 / profile.t60;
    const a3 = profile.t100 ? (v100 - v60) / (profile.t100 - profile.t60) : null;
    if (a1 && v < v30) return a1;
    if (v < v60) return a2;
    if (a3 && v < v100) return a3;
    // power-limited region up to top speed; never above the last measured band
    const last = a3 || a2;
    const wheelPower = profile.power * PS * profile.eta;
    const k = wheelPower * fuelShape(profile, 1) / (vTop ** 3);          // drag such that a(vTop) = 0
    const a = wheelPower * fuelShape(profile, v / vTop) / (profile.weight * Math.max(v, 5)) - k * v * v / profile.weight;
    return Math.max(0.05, Math.min(last, a));
}

/** Traction multiplier at speed v: full penalty at standstill, gone by the surface's fade speed. */
function tractionAt(factors, v) {
    const fade = factors.fadeMph * MPH;
    return factors.traction + (1 - factors.traction) * Math.min(1, v / fade);
}

// ─── lapping a track ─────────────────────────────────────────────────────────

function cornerSpeed(type, factors) {
    return CORNER_TYPES[type].mph * MPH * Math.sqrt(Math.max(factors.grip, 0.05));
}

/**
 * One straight: accelerate, then brake just late enough to meet the next
 * corner's speed. Phase time is attributed as we go. Returns the exit speed.
 */
function runStraight(profile, factors, lengthM, vEntry, vExit, gradient, standing, T) {
    const vTop = Math.min(profile.topSpeed * MPH, factors.capMph * MPH);
    const dt = C.DT;
    let v = vEntry, d = 0;
    const aBrake = Math.max(0.5, factors.braking + G * gradient);   // uphill helps braking, downhill hurts
    while (d < lengthM) {
        const remaining = lengthM - d;
        if (vExit !== null && v > vExit) {
            const brakeDistance = (v * v - vExit * vExit) / (2 * aBrake);
            if (remaining <= brakeDistance) {
                T.transitions += (v - vExit) / aBrake;
                return vExit;
            }
        }
        const a = Math.max(0, Math.min(factors.accelCap, baseAccel(profile, v) * factors.altitudePower * tractionAt(factors, v)) - G * gradient);
        v = Math.min(vTop, v + a * dt);
        d += Math.max(v, 0.5) * dt;
        if (standing && v < C.LAUNCH_UNTIL_MPH * MPH) T.launch += dt;
        else if (v >= C.FLAT_OUT_FRACTION * vTop) T.flatOut += dt;
        else T.pull += dt;
    }
    if (vExit !== null && v > vExit) {          // ran out of road: brake at the very end
        T.transitions += (v - vExit) / aBrake;
        return vExit;
    }
    return v;
}

/**
 * Lap time of one car (with tune) on one v2 track variant.
 * @returns {{ seconds, phases, dnf, profile, factors }}
 */
function lapTime(car, tune, track) {
    const profile = buildProfile(car, tune);
    const factors = surfaceFactors(profile, track);
    const T = Object.fromEntries(ALL_PHASES.map(key => [key, 0]));
    const result = { seconds: 0, phases: T, dnf: false, profile, factors, track: track.trackID };

    if (track.kind === "mphTarget" && track.mphTarget) {
        const start = track.mphTarget.start * MPH, end = track.mphTarget.end * MPH;
        if (profile.topSpeed * MPH < end) { result.dnf = true; result.seconds = Infinity; return result; }
        let v = start, t = 0;
        while (v < end && t < 600) {
            const a = Math.max(0.01, Math.min(factors.accelCap, baseAccel(profile, v) * factors.altitudePower * tractionAt(factors, v)));
            v += a * C.DT; t += C.DT;
            if (v < C.LAUNCH_UNTIL_MPH * MPH) T.launch += C.DT; else T.pull += C.DT;
        }
        result.seconds = t;
        return result;
    }

    const facts = track.layout;
    if (!facts || typeof track.distance !== "number") {
        result.dnf = true; result.seconds = Infinity; result.unsupported = `no layout for kind ${track.kind}`;
        return result;
    }
    const straights = straightList({ layout: facts }, track.distance).map(miles => miles * MILE);
    const corners = cornerSequence(facts.corners || {});
    const scale = arcScale(facts.corners, track.distance);      // < 1 on densely cornered roads
    const gradient = (facts.netClimb || 0) * 0.3048 / (track.distance * MILE);
    const standing = (track.start || facts.start) === "standing";

    // Mixed surfaces (rallycross): a share of the segments — a straight and the
    // corner that ends it — run on a secondary surface, spread evenly round the
    // lap, each with its own traction, grip, braking and rough-ground cap.
    const segmentFactors = straights.map(() => factors);
    if (track.mix && typeof track.mix === "object") {
        const taken = new Set();
        for (const [surface, share] of Object.entries(track.mix)) {
            const alt = surfaceFactors(profile, { ...track, surface });
            const count = Math.round(share * straights.length);
            for (let k = 0; k < count; k++) {
                const index = Math.min(straights.length - 1, Math.floor((k + 0.5) * straights.length / count));
                if (!taken.has(index)) { segmentFactors[index] = alt; taken.add(index); }
            }
        }
        result.mixed = true;
    }

    // Obstacles as stretches of road with a speed limit by clearance, spread
    // evenly along the straights: a speed bump is short; a hump (the game's
    // word for rocks and rough ground a low car cannot take at speed) is a
    // longer section the car must pick its way through at its limit.
    const limits = straights.map(() => []);
    const spread = (count, kind) => {
        const mph = C.OBSTACLE_LIMIT_MPH[kind][profile.gc] ?? 20, length = C.OBSTACLE_LENGTH_M[kind] ?? 0;
        for (let k = 0; k < count; k++) limits[Math.min(straights.length - 1, Math.floor((k + 0.5) * straights.length / count))].push({ mph, length });
    };
    spread(track.speedbumps || 0, "speedbump");
    spread(track.humps || 0, "hump");

    let v = !standing && corners.length ? cornerSpeed(corners[corners.length - 1], segmentFactors[straights.length - 1]) : 0;
    for (let i = 0; i < straights.length; i++) {
        const seg = segmentFactors[i];
        const corner = corners.length ? corners[i % corners.length] : null;
        const vExit = corner ? cornerSpeed(corner, seg) : null;
        const first = standing && i === 0;
        if (!limits[i].length) {
            v = runStraight(profile, seg, straights[i], v, vExit, gradient, first, T);
        }
        else {
            // Run it clean for the phase split, then for real with the obstacles;
            // the extra time is what the obstacles cost.
            const clean = Object.fromEntries(ALL_PHASES.map(key => [key, 0]));
            runStraight(profile, seg, straights[i], v, vExit, gradient, first, clean);
            const real = Object.fromEntries(ALL_PHASES.map(key => [key, 0]));
            const parts = limits[i].length + 1;
            // the obstacles' own length comes out of the straight, never more than half of it
            const wanted = limits[i].reduce((sum, o) => sum + o.length, 0);
            const hold = Math.min(straights[i] / 2, wanted);
            const partLength = (straights[i] - hold) / parts;
            let vv = v;
            for (let p = 0; p < parts; p++) {
                const obstacle = p < limits[i].length ? limits[i][p] : null;
                vv = runStraight(profile, seg, partLength, vv, obstacle ? obstacle.mph * MPH : vExit, gradient, first && p === 0, real);
                if (obstacle && hold > 0 && obstacle.length > 0) {
                    // through the obstacle itself, held at its limit (or slower, if the car was slower anyway)
                    const length = hold * obstacle.length / wanted;
                    vv = runStraight(profile, { ...seg, capMph: Math.min(seg.capMph, obstacle.mph) }, length, Math.min(vv, obstacle.mph * MPH), null, gradient, false, real);
                }
            }
            const cleanTotal = ALL_PHASES.reduce((sum, key) => sum + clean[key], 0);
            const realTotal = ALL_PHASES.reduce((sum, key) => sum + real[key], 0);
            for (const key of ALL_PHASES) T[key] += clean[key];
            T.obstacles += Math.max(0, realTotal - cleanTotal);
            v = vv;
        }
        if (corner) {
            T.corners += CORNER_TYPES[corner].arcMiles * scale * MILE / vExit;
            v = vExit;
        }
    }
    result.seconds = ALL_PHASES.reduce((sum, key) => sum + T[key], 0);
    return result;
}

// ─── the race ────────────────────────────────────────────────────────────────

/**
 * Race A against B. Positive points = A wins. Mirrors the sign convention of
 * race.js so the sandbox can show both engines side by side.
 */
function evalScore(carA, tuneA, carB, tuneB, track) {
    const a = lapTime(carA, tuneA, track), b = lapTime(carB, tuneB, track);
    // seconds → points: per mille of the track's reference lap; MPH runs per second
    const scale = track.referenceLapSeconds > 0 ? C.POINTS_PER_LAP_PERMILLE * 1000 / track.referenceLapSeconds : C.POINTS_PER_SECOND;
    const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;
    let points, reason = null;
    if (a.dnf || b.dnf) {
        if (a.dnf && b.dnf) { points = a.profile.topSpeed - b.profile.topSpeed; reason = "neither car reaches the target speed — top speed decides"; }
        else { points = a.dnf ? -C.MPH_FAIL_POINTS : C.MPH_FAIL_POINTS; reason = `${a.dnf ? a.profile.name : b.profile.name} cannot reach the target speed`; }
    }
    else {
        points = (b.seconds - a.seconds) * scale;
    }
    points = round2(points);
    const breakdown = COMPARE_GROUPS
        .map(group => {
            const seconds = group.phases.reduce((sum, phase) => sum + ((b.phases[phase] || 0) - (a.phases[phase] || 0)), 0);
            return { group: group.key, label: group.label, seconds: round2(seconds), points: round2(seconds * scale) };
        })
        .filter(entry => Math.abs(entry.seconds) > 0.005)
        .sort((x, y) => Math.abs(y.seconds) - Math.abs(x.seconds));
    return {
        points, winner: points > 0 ? "A" : points < 0 ? "B" : "tie", reason,
        marginSeconds: a.dnf || b.dnf ? null : round2(b.seconds - a.seconds),
        marginPercent: a.dnf || b.dnf || !(track.referenceLapSeconds > 0) ? null : round2((b.seconds - a.seconds) / track.referenceLapSeconds * 100),
        a, b, breakdown
    };
}

/** "Corners +4.1 · Launch +1.3 · Straights −2.0" from a breakdown, from A's point of view (seconds gained per group). */
function describeBreakdown(breakdown, limit = 5) {
    if (!breakdown.length) return "dead even in every phase";
    return breakdown.slice(0, limit).map(entry => `${entry.label} ${entry.seconds > 0 ? "+" : "−"}${Math.abs(entry.seconds).toFixed(1)} s`).join(" · ");
}

/** The tune that laps fastest for this car on this track (null when the car cannot finish). */
function bestTune(car, track, tunes = ["000", "333", "666", "699", "969", "996"]) {
    let best = null;
    for (const tune of tunes) {
        const lap = lapTime(car, tune, track);
        if (lap.dnf) continue;
        if (!best || lap.seconds < best.seconds) best = { tune, seconds: lap.seconds };
    }
    return best;
}

module.exports = { buildProfile, estimatePower, powerFromTopSpeed, surfaceFactors, baseAccel, lapTime, evalScore, describeBreakdown, bestTune, airDensityRatio, PHASE_LABELS, ALL_PHASES, COMPARE_GROUPS };
