"use strict";

/**
 * Race Week — single source of truth for all tuning.
 *
 * Every number here comes from the Phase 0 economy sim (locked 2026-07-20) or
 * the v2.2 design spec (docs/race-week-design.md). Rebalance HERE, then update
 * the MIRRORS blocks in scripts/simulateEconomy.js in the same change.
 */

// =============================================================================
// ECONOMY (Phase 0 FINAL — see race-week-design.md §4a)
// =============================================================================

const ECON = {
    flatBase: 24000,
    // FIXED — never streak/win-scaled. The old formula's billion-risk was
    // crBonusBase escalating at high streaks; that must not carry over.
    crBonusBase: 65,
    // Counted crDiff caps here (v2.2): deterministic races + free Test Race
    // make deep-underdog wins farmable, so the bonus tops out at (40+40)*65 = 5,200.
    crDiffClamp: 40,
    // crBonus eligibility: playerCR - oppCR must be <= this.
    crBonusEligibleDiff: 30,
    // Checked in descending threshold order against the race point margin.
    dominationTiers: [
        { threshold: 100, multiplier: 0.6, label: "TOTAL DOMINATION" },
        { threshold: 50, multiplier: 0.4, label: "DOMINATION" },
        { threshold: 20, multiplier: 0.15, label: "STRONG WIN" }
    ],
    luckyChance: 0.05,
    luckyMult: 0.5,
    skipFreePerDay: 10,
    skipFee: 25000
};

// Luxon format for serverStat.raceWeekState.weekKey (UTC ISO week),
// e.g. DateTime.utc().toFormat(WEEK_KEY_FORMAT) -> "2026-W30".
const WEEK_KEY_FORMAT = "kkkk-'W'WW";

// =============================================================================
// THRESHOLD LADDER (design doc §4b) — prizes land instantly in unclaimedRewards
// =============================================================================

const LADDER = [
    { wins: 10, kind: "pack" },
    { wins: 25, kind: "filler" },
    { wins: 50, kind: "car" },
    { wins: 100, kind: "car" },
    { wins: 150, kind: "car" },
    { wins: 200, kind: "pack" },
    { wins: 250, kind: "driver" },
    { wins: 300, kind: "pack" },
    // Retuned 2026-08-23: the old 500/700/888/1000 top was dead weight — across a
    // full week the best player reached 573, so 700/888/1000 were claimed by
    // NOBODY and 500 by one player. Compressed to 350/400/450/500 so every rung
    // is live, with the exclusive at 400 (2 of 19 players reached it) and pack
    // rungs continuing above it as a tail for the top of the board. Side effect: BOSS_GATES is
    // derived from the car rungs, so the fourth gate moves 1000 -> 400, which
    // finally makes the Boss Slayer driver (d00012) obtainable.
    { wins: 350, kind: "pack" },
    { wins: 400, kind: "car", exclusive: true }
];

/**
 * ENDLESS LADDER — past the fixed ladder above, a rung lands every `step`
 * wins and keeps going. Each one rolls its prize KIND fresh at the Monday roll
 * from `weights` (a weighted pick, not a per-kind independent chance), then
 * rolls the prize itself from the matching pool below.
 *
 * A rung listed in prizePools.json ALWAYS wins over the random roll — curate
 * any individual endless rung by adding its win count there like a normal rung.
 *
 * `max` only bounds how many get generated and stored each week; the best week
 * on record is 573, so 1500 is generous headroom at trivial storage cost.
 * Endless rungs are NEVER boss gates (BOSS_GATES derives from LADDER only).
 */
const ENDLESS = {
    step: 50,
    max: 1500,
    weights: { pack: 60, car: 30, driver: 10 },
    // Prize-tier cars are reserved for the exclusive rung, so these are strong
    // Normals — good pulls without cheapening the 400 headline.
    car: { cardTypes: ["Normal"], crMin: 850, crMax: 9999 },
    packTier: "elite",
    // Mirrors ROTATION_RARITIES (declared further down). Secret+ stays exclusive
    // to the 400 rung; serialised is rejected by validPrizeDriver regardless.
    driverRarities: ["base", "rare"]
};

// The race attempted when weeklyWins + 1 hits one of these is ALWAYS a boss
// round (boss-class opponents, no reqs, any hand). Derived from the car rungs.
const BOSS_GATES = LADDER.filter(rung => rung.kind === "car").map(rung => rung.wins);

// Money portion of the 25-win rung (aggregates into existing
// same-origin unclaimedRewards entries per the reward contract).
const FILLER_25 = {
    money: 800000
};

// =============================================================================
// WEEKLY PRIZE ROLLING RULES (consumed by the Monday rollover manager)
// =============================================================================

/**
 * car rungs: roll a random car whose cardType and base cr fit the window.
 * Pool sanity (live data, §13.3): Normal 550-699 ≈ 1,279 | 700-849 ≈ 1,289 |
 * 850-999 ≈ 942 | Prize 1000+ = 123. All comfortably rollable.
 * pack rungs: value is a pack TIER resolved via daily.js-style getPackTier
 * inference ("elite" in name → elite, "booster" → booster, else standard);
 * null = not a pack rung (250 is the weekly driver rung).
 * The exclusive rung additionally rolls a RUNG_EXCLUSIVE_DRIVER_RARITY driver alongside
 * the exclusive car (rarity v3) — the prize object carries both keys.
 */
const PRIZE_POOLS = {
    car: {
        50: { cardTypes: ["Normal"], crMin: 550, crMax: 699 },
        100: { cardTypes: ["Normal"], crMin: 700, crMax: 849 },
        150: { cardTypes: ["Normal"], crMin: 850, crMax: 999 },
        400: { cardTypes: ["Prize"], crMin: 1000, crMax: 99999 }
    },
    pack: {
        10: "standard",
        200: "standard",
        250: null,
        300: "standard",
        350: "elite"
    }
};

// =============================================================================
// DIFFICULTY SCHEDULE (design doc §3) — matched on current weeklyWins
// =============================================================================

/**
 * Opponent CR windows adapted from live smartGen streak bands so the early
 * week feels like today's early streaks:
 *   0-9   ≈ live streak 0-15  (cr <= 499 / 200-649, merged)
 *   10-24 ≈ live streak 6-30  (200/300-649)
 *   25-49 =  live streak 31-49 (400-849)
 *   50-99 =  live streak 51-74 (549-990)
 *   100-149 ≈ live streak 101-124 (>= 799)
 *   150+  =  live plateau/else band (>= 949) — escalation STOPS here.
 * Normal-card pool sizes per window (§13.3): all bands have 500+ candidates;
 * the tightest (949+) still has ~550 Normal cars.
 *
 * reqMode: "none" = open match; "crCap" = hand CR cap only;
 * "soft"/"hard"/"twist" = CR cap + one req rolled from REQ_POOLS.
 * crCapSlack: hand cap is oppCR + rand(0-5) + crCapSlack (current randomize()
 * shape) — 30 = light cap, 20 = tight cap. null = no cap.
 * Boss gates OVERRIDE any band: boss-class pool, no reqs, no cap.
 */
const DIFFICULTY = [
    { min: 0, max: 9, oppCrMin: 1, oppCrMax: 549, reqMode: "none", crCapSlack: null },
    { min: 10, max: 24, oppCrMin: 250, oppCrMax: 649, reqMode: "crCap", crCapSlack: 30 },
    { min: 25, max: 49, oppCrMin: 400, oppCrMax: 849, reqMode: "soft", crCapSlack: 30 },
    { min: 50, max: 99, oppCrMin: 549, oppCrMax: 990, reqMode: "hard", crCapSlack: 20 },
    { min: 100, max: 149, oppCrMin: 799, oppCrMax: 9999, reqMode: "twist", crCapSlack: 20 },
    { min: 150, max: Infinity, oppCrMin: 949, oppCrMax: 9999, reqMode: "twist", crCapSlack: 20 }
];

/**
 * soft/hard: property names sampled off a random reference car, exactly like
 * current randomize() (values become filterCheck criteria).
 * twist: descriptors — { type: "req", pool } rolls one hard-pool property;
 * { type: "crMax", values } picks a value and caps the HAND at that CR
 * (the "make cheap cars useful" lever; bounded payout via ECON.crDiffClamp).
 */
const REQ_POOLS = {
    soft: ["bodyStyle", "seatCount", "modelYear"],
    hard: ["make", "tags", "gc", "modelYear"],
    twist: [
        { type: "crMax", values: [350, 400, 450] },
        { type: "req", pool: ["make", "tags", "gc", "modelYear"] }
    ]
};

// =============================================================================
// DRIVERS (v2 — data-driven, design doc §5)
// =============================================================================

/**
 * The v1 DRIVERS roster and DRIVER_ROTATION array lived here; drivers are now
 * JSON files in src/drivers/ (dXXXXX.json) loaded by dataManager. The weekly
 * rung-250 rotation is built at roll time from drivers with inRotation: true
 * AND a rarity in ROTATION_RARITIES (rarity v3, 2026-07-24).
 * The default driver everyone owns is d00000 "The Rookie (2026)".
 */

// The per-rarity level curves (RARITY_CURVES) live in
// functions/raceWeekEvents.js — the single source of truth for cumulative
// dupes-per-level (base 1/6/16, rare +31, secret +50, divine +75;
// icon/autograph/serialised max level 0 with every bonus active on
// ownership). Recruiting a card is LEVEL 0.

// Rung-250 "driver of the week" rotation pool constraint: inRotation === true
// AND one of these rarities.
const ROTATION_RARITIES = ["base", "rare"];

// Rung-1000 grants the exclusive car AND a rolled driver of this rarity —
// the weekly prize object carries both keys (additive, not replacing the car).
const RUNG_EXCLUSIVE_DRIVER_RARITY = "secret";

/**
 * Card-art palette (rarity v3) — the colour each tier's card is printed in.
 * Embeds tint themselves to match, so the bot and the art speak one language.
 * NOTE: serialised is NEAR-black on purpose — Discord renders a literal
 * 0x000000 embed colour as "no colour" (default grey), which would silently
 * strip the rarest tier of its identity.
 */
const RARITY_COLORS = {
    base: 0x9e9e9e,        // grey
    rare: 0x3b8ed0,        // blue
    secret: 0xe02424,      // red
    divine: 0xcd7f32,      // bronze
    icon: 0xf5f5f5,        // white
    autograph: 0xd9c520,   // yellow-gold
    serialised: 0x1a1a1a   // black (gold accents live in the art)
};

/**
 * DRIVER RECRUITMENT (cd-recruit) — a permanent cash shop for selected
 * drivers. Price escalates exponentially with the copies you ALREADY own, so
 * levelling a driver purely with money is a deliberate long haul:
 *     price = recruitPrice × multiplier ^ copiesOwned
 * At the defaults, a base driver (17 copies to max Level 3) totals ~$316M —
 * the 1st copy is $4M, the 17th is ~$49M.
 *
 * Per-driver JSON fields (all optional):
 *   recruitPrice      — base price; its PRESENCE is what lists a driver in the shop
 *   recruitMultiplier — override the curve for this driver
 *   recruitExclusive  — true = shop/offers ONLY (blocked from rotation, scout,
 *                       pack drops and every reward path)
 */
const RECRUIT = {
    defaultMultiplier: 1.17,
    // Safety rail: never let a single purchase exceed this, however many copies
    // a player stacks up.
    maxPrice: 2000000000
};

// A duplicate past the rarity's max level — or ANY dupe of an
// icon/autograph/serialised driver (max level 0) — converts to money instead.
// Serialised drivers can't actually dupe (a player never receives one twice);
// the money path there covers defensive re-grants only.
const DUPE_DRIVER_MONEY = 250000;

// The boss-slayer driver (Ragnar Voss, re-raritied to BASE under rarity v3 —
// legacy-mapping override in raceWeekEvents.js) is granted when all four boss
// gates (50/100/150/1000) are claimed within a single week. He is
// inRotation: false, so the gate rule is the intended way to earn him (the
// ~0.06%-per-race Driver Scout can technically also roll any driver).
const BOSS_SLAYER_RULE = "all4gates";
const BOSS_SLAYER_DRIVER_ID = "d00012";

// =============================================================================
// IN-RACE EVENT TABLE (Phase 4 layer — ideas doc Family I / I2)
// =============================================================================

/**
 * Rolled once at race generation: rollChance to trigger at all, then a
 * weighted pick from table (weights are RELATIVE — total 86.5 since the
 * driverscout rework moved 14 points of common weight down to 0.5 rare;
 * commons ≈16.2% each of triggered rolls). One active event per player;
 * skips re-roll the race AND its event. The classic LUCKY RACE
 * (ECON.luckyChance/luckyMult) stays a separate win-path roll.
 * Tiers: common = pure-upside confetti; optin = a button the player may
 * decline for free; rare = spice (jackpot odds well under 1% per race).
 */
const EVENTS = {
    rollChance: 0.10,
    table: [
        // common — weight-heavy
        { id: "photofinish", tier: "common", weight: 14, marginMax: 5, bonusMult: 0.5 },
        // cashvein money trimmed 2026-07-22 — the fuse→money conversion
        // pushed nolife event-EV past the $38M guardrail at the original
        // 40k value.
        { id: "cashvein", tier: "common", weight: 14, races: 3, moneyPerWin: 25000 },
        { id: "skiptoken", tier: "common", weight: 14, skips: 2 },
        { id: "packshards", tier: "common", weight: 14, shards: 1, shardsPerPack: 6 },
        // opt-in gambles
        { id: "doubleornothing", tier: "optin", weight: 5, mult: 2 },
        { id: "cursedrace", tier: "optin", weight: 5, mult: 5, oppCrBoost: 150 },
        { id: "convoy", tier: "optin", weight: 5, races: 2, mult: 2.5 },
        { id: "underdogoffer", tier: "optin", weight: 5, mult: 3, handCrMax: 350 },
        { id: "showcase", tier: "optin", weight: 5, mult: 2, unusedThisWeek: true },
        // rare
        { id: "goldenopponent", tier: "rare", weight: 2, pack: "standard" },
        { id: "revengematch", tier: "rare", weight: 3, bonusMult: 1.0 },
        /**
         * driverscout — wins a RANDOM driver rolled from `rarities` (weights
         * normalized by the picker; dupes allowed, dupes are progression).
         * Failed picks (empty pool / exhausted serialised mint / already-owned
         * serialised) re-roll one rarity tier down; below base the win pays
         * moneyIfAllOwned instead.
         *
         * WEIGHT IS TUNED FROM THE BASE-DRIVER RATE, not picked by feel:
         *
         *   P(scout)      = rollChance × weight / (86 + weight)
         *   P(base/race)  = P(scout) × 75/100.121
         *
         * weight 1.3485 → scout fires 1 in 648 races, base driver 1 in 888.
         * That 888 is the target; solve for weight again if it moves, or if
         * the `rarities` split below changes — raising the top tiers dilutes
         * base, so the two are tuned together, never separately.
         *
         * (Was 0.5 → base 1 in 2,309, raised 2026-08-11.)
         */
        {
            id: "driverscout", tier: "rare", weight: 1.3485, moneyIfAllOwned: 50000,
            /**
             * Per-race odds at the weight above:
             *   base       1 in     888     rare       1 in   2,775
             *   secret     1 in  26,640     divine     1 in  66,600
             *   icon       1 in 333,000     autograph  1 in 666,000
             *   serialised 1 in 3,330,000
             *
             * Tuned so each tier is a visible step rather than a cliff. The
             * old split put divine at 1 in 666,000 — twelve years of maximum
             * play, i.e. folklore rather than a prize. Now a divine is a
             * few-times-a-year server event and an icon roughly annual, while
             * serialised stays genuinely legendary (and is mint-capped anyway).
             */
            rarities: {
                base: 75, rare: 24, secret: 2.5,
                divine: 1, icon: 0.2, autograph: 0.1, serialised: 0.02
            }
        }
    ]
    // DEFERRED (designed in ideas doc Family I, NOT implemented): detour,
    // streakecho, trackday, prizechallenge, leaderboardghost, bossambush,
    // goldenhour.
};

module.exports = {
    ECON,
    WEEK_KEY_FORMAT,
    LADDER,
    BOSS_GATES,
    ENDLESS,
    FILLER_25,
    PRIZE_POOLS,
    DIFFICULTY,
    REQ_POOLS,
    ROTATION_RARITIES,
    RUNG_EXCLUSIVE_DRIVER_RARITY,
    RARITY_COLORS,
    RECRUIT,
    DUPE_DRIVER_MONEY,
    BOSS_SLAYER_RULE,
    BOSS_SLAYER_DRIVER_ID,
    EVENTS
};
