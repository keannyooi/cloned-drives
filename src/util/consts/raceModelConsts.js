"use strict";

/**
 * RACE MODEL v3 — CONSTANTS (sandbox engine only)
 * ================================================
 * Read by src/util/functions/raceModel.js and nothing else. The live engine
 * (race.js, pgGenerator.js, paceIndex.js) never touches this file.
 *
 * Every number is a STARTING POINT to be fitted against the golden matchup
 * suite (docs/race-engine-rework.md §4, §7). Change a number here, rerun the
 * harness, attach the diff — that is the whole argument process.
 */

// ── the one convention that matters ──────────────────────────────────────────
// A car's 0-30 / 0-60 / 0-100 and its handling were measured on ITS OWN tyres
// on dry tarmac. So grip is expressed RELATIVE TO THE SAME TYRE IN THE DRY:
// dry tarmac is 1.00 for every road tyre by definition, and the table only
// says how each tyre degrades (or, for slicks on a circuit and drag tyres on
// a strip, improves) away from that. Charging Standard tyres again in the dry
// would double-count what the hand-set handling already says.
const DRY_ROAD = { Standard: 1.00, Performance: 1.00, "All-Surface": 1.00, "Off-Road": 1.00, Slick: 1.00, Drag: 0.85 };
// Wet tarmac follows the game's own tyre hierarchy (consts.js weatherVars):
// Standard > All-Surface > Performance > Off-Road > Slick > Drag. Knobbly
// off-road tyres squirm on wet asphalt and have far less rubber on the road.
const WET_ROAD = { Standard: 0.92, "All-Surface": 0.90, Performance: 0.85, "Off-Road": 0.72, Slick: 0.55, Drag: 0.35 };
const DIRT     = { Standard: 0.66, Performance: 0.56, "All-Surface": 0.90, "Off-Road": 1.00, Slick: 0.35, Drag: 0.15 };

const TYRE_GRIP = {
    "Sunny Asphalt": { ...DRY_ROAD },
    "TT OnRoad":     { ...DRY_ROAD },
    "Sunny Track":   { ...DRY_ROAD, Slick: 1.06, Drag: 0.80 },
    "Sunny Drag":    { ...DRY_ROAD, Drag: 1.15 },
    "Rainy Asphalt": { ...WET_ROAD },
    "Rainy Track":   { ...WET_ROAD },
    "Rainy Drag":    { ...WET_ROAD, Slick: 0.50, Drag: 0.30 },
    "Sunny Gravel":  { Standard: 0.72, Performance: 0.62, "All-Surface": 0.90, "Off-Road": 1.00, Slick: 0.40, Drag: 0.20 },
    "Rainy Gravel":  { Standard: 0.64, Performance: 0.52, "All-Surface": 0.85, "Off-Road": 0.98, Slick: 0.30, Drag: 0.15 },
    "Sunny Dirt":    { ...DIRT },
    "TT OffRoad":    { ...DIRT },
    "Rainy Dirt":    { Standard: 0.56, Performance: 0.46, "All-Surface": 0.85, "Off-Road": 0.98, Slick: 0.25, Drag: 0.10 },
    "Sunny Sand":    { Standard: 0.56, Performance: 0.46, "All-Surface": 0.85, "Off-Road": 1.00, Slick: 0.30, Drag: 0.10 },
    "Sunny Snow":    { Standard: 0.56, Performance: 0.42, "All-Surface": 0.85, "Off-Road": 1.00, Slick: 0.20, Drag: 0.10 },
    "Sunny Ice":     { Standard: 0.42, Performance: 0.32, "All-Surface": 0.75, "Off-Road": 1.00, Slick: 0.15, Drag: 0.08 }
};

// How each drivetrain puts power down, by surface class. AWD = six or more
// driven wheels in this game, hence its edge on loose ground.
const SURFACE_CLASS = {
    "Sunny Asphalt": "dry", "Sunny Track": "dry", "Sunny Drag": "dry", "TT OnRoad": "dry",
    "Rainy Asphalt": "wet", "Rainy Track": "wet", "Rainy Drag": "wet",
    "Sunny Gravel": "loose", "Rainy Gravel": "loose", "Sunny Dirt": "loose", "Rainy Dirt": "loose", "TT OffRoad": "loose",
    "Sunny Sand": "sand", "Sunny Snow": "snow", "Sunny Ice": "snow"
};
const DRIVE_TRACTION = {
    dry:   { RWD: 1.00, FWD: 0.98, "4WD": 1.00, AWD: 1.00 },
    wet:   { RWD: 0.85, FWD: 0.90, "4WD": 1.00, AWD: 1.02 },
    loose: { RWD: 0.70, FWD: 0.80, "4WD": 1.00, AWD: 1.05 },
    sand:  { RWD: 0.60, FWD: 0.65, "4WD": 1.00, AWD: 1.10 },
    snow:  { RWD: 0.55, FWD: 0.70, "4WD": 1.00, AWD: 1.05 }
};
const WET = new Set(["Rainy Asphalt", "Rainy Track", "Rainy Drag", "Rainy Gravel", "Rainy Dirt"]);

module.exports = {
    TYRE_GRIP,
    SURFACE_CLASS,
    DRIVE_TRACTION,
    WET,

    // Lap-time margin → points: tenths of a percent of the track's reference
    // lap (so a second means more on a 13 s strip than on a 15-minute stage).
    // MPH-target runs, which have no lap, use POINTS_PER_SECOND. Both are
    // Phase-2 fits so the median margin lands near today's.
    POINTS_PER_LAP_PERMILLE: 1,
    POINTS_PER_SECOND: 10,
    // Handling that corresponds to the reference corner speeds in trackV2.CORNER_TYPES.
    REFERENCE_HANDLING: 85,
    // Traction loss applies in full at standstill and fades out by this speed,
    // per surface class: wheelspin decides a launch on tarmac, but on gravel a
    // RWD car is still spinning its wheels in third gear.
    TRACTION_FADE_MPH: { dry: 40, wet: 70, loose: 100, sand: 120, snow: 120 },
    // On loose ground traction is also a CEILING, not just a scaling. Scaling
    // a car's dry launch by its traction factor still lets a 1,000 PS road
    // car pull 0.8 g on dirt, which no road tyre can find there: the surface
    // sets the limit and power beyond it just spins the wheels. Peak
    // acceleration in g for a car whose traction factor is 1 (four driven
    // wheels on the right tyre), by surface class; a car's own ceiling is
    // this × its traction factor (tyre × drive × TCS). Rally cars manage
    // about 0.7 g on gravel. No ceiling on tarmac: the stats already embed
    // the dry, and the wet is left to the multiplier for now.
    SURFACE_ACCEL_CAP_G: { dry: Infinity, wet: Infinity, loose: 0.70, sand: 0.50, snow: 0.40 },
    // Off dry tarmac the drivetrain also shapes how much of the tyre's grip a
    // car can use through a corner (stability, throttle on exit): corner grip
    // is multiplied by driveTraction ^ this exponent. 0 = drive never touches
    // cornering; 0.5 makes a RWD car on gravel corner about 8% slower than
    // the same car with 4WD.
    DRIVE_CORNER_EXPONENT: 0.5,
    // A car on loose-surface tyres is a car set up for loose surfaces (a Group
    // B 037 on gravel tyres is not a RWD Ferrari on the wrong road): off dry
    // tarmac the drivetrain penalty is softened by this factor for these
    // tyres. From the 2026-09-12 audit, scaling the live drive penalty by
    // tyres was the single change that lifted RWD rally cars from 31% to 64%
    // wins against 4WD SUVs.
    TYRE_SOFTENS_DRIVE: { "Off-Road": 0.35, "All-Surface": 0.6 },
    // Rough ground caps speed regardless of power: a Low road car cannot run
    // 150 mph down a Safari stage, it would be wrecked. On loose, sand and
    // snow surfaces of ROUGH kinds (stage, hillclimb, rallycross) the car's
    // speed is capped by clearance, adjusted by tyre. Graded surfaces —
    // drags, MPH runs, circuits and ovals on dirt — are not rough.
    ROUGH_KINDS: ["stage", "hillclimb", "rallycross"],
    ROUGH_SPEED_CAP_MPH: { Low: 90, Medium: 115, High: 140 },
    ROUGH_TYRE_BONUS_MPH: { "Off-Road": 10, "All-Surface": 5, Slick: -10, Drag: -20 },
    TCS_TRACTION_BONUS: 1.05,          // off dry tarmac only
    ABS_WET_BRAKING_BONUS: 1.05,       // wet conditions only
    // Fraction of top speed at or above which a straight counts as "flat out".
    FLAT_OUT_FRACTION: 0.85,
    LAUNCH_UNTIL_MPH: 60,
    DRIVETRAIN_EFFICIENCY: { RWD: 0.86, FWD: 0.86, "4WD": 0.80, AWD: 0.76 },
    // Power available above the knee (fraction of top speed) fades linearly to
    // `atTop` at top speed. Combustion cars keep full power through the gears.
    FUEL_SHAPE: { Electric: { knee: 0.45, atTop: 0.55 }, Hybrid: { knee: 0.55, atTop: 0.75 } },
    // Optional, mild: mass and ride height modulate cornering (the SUV lever).
    // Set enabled: false and nothing else moves.
    AGILITY: { enabled: true, perKgOver1600: 0.04 / 500, gc: { Low: 0, Medium: 0.03, High: 0.07 }, floor: 0.5 },
    BRAKING_G: 1.0,
    // Obstacles are stretches of road with a speed limit by clearance. A
    // speed bump is what it says. A hump is the game's word for big rocks and
    // rough obstacles on a stage — the things that kill low cars: a Low car
    // picks its way through at walking pace, a Medium car slows right down, a
    // High car barely lifts. The cost is paid by the same simulation as
    // everything else — braking down to the limit, holding it through the
    // obstacle, pulling back up — so a Low sports car arriving at 90 mph pays
    // far more than a High rally car, and a car that was crawling anyway pays
    // almost nothing. Bounded by physics, not by a constant.
    // Speed bumps: a Low car crawls, a Medium car (Cayenne) slows a little, a
    // High car (Raptor) does not care unless it is really flying.
    OBSTACLE_LIMIT_MPH: { speedbump: { Low: 8, Medium: 35, High: 60 }, hump: { Low: 5, Medium: 15, High: 40 } },
    // How much road each obstacle takes at that limit, in metres: a speed bump
    // is the bump plus a careful approach and exit; a hump is a section of
    // rocks and ruts. Never more than half of the straight it sits on.
    OBSTACLE_LENGTH_M: { speedbump: 5, hump: 30 },
    // MPH-target runs: a car that cannot reach the end speed loses to any car that can.
    MPH_FAIL_POINTS: 250,
    // A car that cannot reach 60 mph reaches its top speed in about this long.
    SUB60_ACCEL_SECONDS: 60,
    // Power from top speed: the engine must at least push the car's drag and
    // rolling resistance at its top speed. That is a floor under every
    // estimate (a speed band can only under-read: traction and gearing hide
    // power) and the only estimate for cars too slow for a speed band, where
    // it lands within ~15% of the real figure for the classics we can check
    // (Peel P50 4 PS, 1909 Opel 7, Subaru 360 18, Beetle 1300 42, Golf 1.4 66).
    // Drag coefficient by era, frontal area from mass, bulky and open bodies
    // adjusted, rolling resistance higher on pre-1970 tyres.
    TOP_SPEED_POWER: {
        airDensity: 1.225,                                                          // kg/m³, sea level
        cdByEra: [[1950, 0.65], [1970, 0.50], [1990, 0.42], [2010, 0.34], [Infinity, 0.30]],   // [built before, Cd]
        frontalArea: { base: 1.6, perTonne: 0.35 },                                 // m²
        bulky: ["SUV", "Pickup"], bulkyCd: 0.05, bulkyArea: 0.4,
        open: ["Convertible", "Open Air"], openCd: 0.05,
        crr: 0.012, crrOld: 0.015
    },
    // Fallback power (PS per tonne) when even the top speed is missing.
    FALLBACK_PS_PER_TONNE: 100,
    // Thin air. Air density follows the standard atmosphere — each thousand
    // feet takes a share of what is left, not a fixed slice of sea level:
    // 0.83 of sea-level density at 6,200 ft (Naivasha), 0.65 at the 14,115 ft
    // Pikes Peak summit. A combustion engine's power tracks that density,
    // scaled by how much of the loss its fuel type feels: naturally aspirated
    // engines all of it, turbos noticeably less, so the roster-wide petrol
    // figure sits between; EVs feel none, which is why electric cars own the
    // Pikes Peak record. Floor keeps a car from losing more than half.
    ALTITUDE_SENSITIVITY: { Petrol: 0.85, Diesel: 0.85, Alternative: 0.85, Hybrid: 0.4, Electric: 0 },
    ALTITUDE_POWER_FLOOR: 0.5,
    // Simulation step, seconds.
    DT: 0.05
};
