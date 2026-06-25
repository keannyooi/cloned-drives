"use strict";

/**
 * DIAMOND ODDS SIMULATOR
 * =======================
 * Simulates N pack openings and reports the observed diamond pull rate.
 * Mirrors the exact logic in openPack.js:
 *   - Each slot has an independent diamond pre-roll
 *   - Per-slot rate defaults to DIAMOND_BASELINE_CHANCE unless overridden
 *   - Max 1 diamond per pack (once hit, skip remaining slots)
 *
 * Usage:  node testDiamondOdds.js
 *
 * Edit the SCENARIOS array below to test different pack configs.
 */

// Must match the constant in src/util/functions/openPack.js
const DIAMOND_BASELINE_CHANCE = 0.001; // % (1 in 100,000)

// ----------------------------------------------------------------------
// Core simulator — one "pack opening"
// Returns true if the pack pulled a diamond, false otherwise.
// ----------------------------------------------------------------------
function simulatePack(slots) {
    let diamondPulled = false;
    for (const slot of slots) {
        const chance = (slot.diamond !== undefined) ? slot.diamond : DIAMOND_BASELINE_CHANCE;
        if (!diamondPulled && chance > 0 && Math.random() * 100 < chance) {
            diamondPulled = true;
        }
    }
    return diamondPulled;
}

// ----------------------------------------------------------------------
// Run a scenario N times, report observed vs. expected
// ----------------------------------------------------------------------
function runScenario(name, slots, N) {
    // Expected rate per pack: 1 - product of (1 - chance_i)
    let expectedMissProb = 1;
    for (const slot of slots) {
        const chance = (slot.diamond !== undefined) ? slot.diamond : DIAMOND_BASELINE_CHANCE;
        expectedMissProb *= (1 - chance / 100);
    }
    const expectedRate = (1 - expectedMissProb) * 100; // %
    const expectedHitsPerN = (expectedRate / 100) * N;

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📦 ${name}`);
    console.log(`   Slots: ${slots.length}`);
    slots.forEach((s, i) => {
        const c = (s.diamond !== undefined) ? s.diamond : DIAMOND_BASELINE_CHANCE;
        console.log(`     Slot ${i + 1}: diamond chance = ${c}% ${s.diamond === undefined ? "(baseline)" : "(explicit)"}`);
    });
    console.log(`   Expected rate per pack: ${expectedRate.toFixed(6)}%  (~1 in ${Math.round(1 / (expectedRate / 100)).toLocaleString()})`);
    console.log(`   Running ${N.toLocaleString()} simulations...`);

    const t0 = Date.now();
    let hits = 0;
    for (let i = 0; i < N; i++) {
        if (simulatePack(slots)) hits++;
    }
    const elapsed = (Date.now() - t0) / 1000;

    const observedRate = (hits / N) * 100;
    const delta = observedRate - expectedRate;
    const deltaPct = expectedRate > 0 ? (delta / expectedRate) * 100 : 0;

    console.log(`   ─────────────────────────────────────────────`);
    console.log(`   Observed: ${hits.toLocaleString()} diamond pulls in ${N.toLocaleString()} packs`);
    console.log(`   Observed rate:  ${observedRate.toFixed(6)}%  (~1 in ${hits > 0 ? Math.round(N / hits).toLocaleString() : "∞"})`);
    console.log(`   Expected hits:  ${Math.round(expectedHitsPerN).toLocaleString()}`);
    console.log(`   Delta:          ${delta > 0 ? "+" : ""}${delta.toFixed(6)}%  (${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(2)}% vs expected)`);
    console.log(`   Runtime:        ${elapsed.toFixed(2)}s`);

    // Statistical check: for binomial(N, p), std dev is sqrt(N*p*(1-p))
    const p = expectedRate / 100;
    const stddev = Math.sqrt(N * p * (1 - p));
    const zScore = stddev > 0 ? Math.abs(hits - expectedHitsPerN) / stddev : 0;
    if (zScore < 2) {
        console.log(`   ✅ Within 2σ (z=${zScore.toFixed(2)}) — looks healthy`);
    } else if (zScore < 3) {
        console.log(`   ⚠️  Between 2σ and 3σ (z=${zScore.toFixed(2)}) — unlikely but possible`);
    } else {
        console.log(`   ❌ Over 3σ (z=${zScore.toFixed(2)}) — something is OFF`);
    }
}

// ----------------------------------------------------------------------
// SCENARIOS — edit these to match your real packs
// Each slot object represents ONE card slot in the pack.
// If a slot has `diamond: X` it uses rate X%; otherwise it uses the baseline.
// ----------------------------------------------------------------------
const SCENARIOS = [
    {
        name: "Generic 5-card pack (baseline only)",
        slots: [{}, {}, {}, {}, {}],
        N: 10_000_000
    },
    {
        name: "10-card Elite Pack (baseline only)",
        slots: Array(10).fill({}),
        N: 10_000_000
    },
    {
        name: "Elite Pack with boosted final slot (slot 5 = 1% diamond)",
        slots: [{}, {}, {}, {}, { diamond: 1 }],
        N: 1_000_000
    },
    {
        name: "Diamond-themed pack (all slots = 0.5%)",
        slots: Array(5).fill({ diamond: 0.5 }),
        N: 1_000_000
    },
    {
        name: "Diamond-only pack (1 slot = 100%)",
        slots: [{ diamond: 100 }],
        N: 10_000
    }
];

// ----------------------------------------------------------------------
console.log(`DIAMOND ODDS SIMULATOR`);
console.log(`Baseline rate per slot: ${DIAMOND_BASELINE_CHANCE}%  (1 in ${Math.round(100 / DIAMOND_BASELINE_CHANCE).toLocaleString()})`);

for (const sc of SCENARIOS) {
    runScenario(sc.name, sc.slots, sc.N);
}

console.log(`\n🏁 Done.\n`);
