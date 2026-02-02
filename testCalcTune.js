/**
 * Test script for calcTune.js v2.1
 * Run with: node testCalcTune.js
 * 
 * Tests:
 * - MRA/OLA decimal precision (2 decimal places)
 * - Cars upgrading past 60 mph threshold
 * - Normal tune calculations
 */

// ============================================
// INLINE CALCTUNE (copy of the actual code)
// ============================================

const upgradeLevels = {
    gearing: {
        0: { tsMult: 0, mraBonus: 0 },
        3: { tsMult: 1, mraBonus: 3 },
        6: { tsMult: 2, mraBonus: 5 },
        9: { tsMult: 3, mraBonus: 8 }
    },
    engine: {
        0: { accelMult: 1.00, olaBonus: 0 },
        3: { accelMult: 0.95, olaBonus: 3 },
        6: { accelMult: 0.90, olaBonus: 5 },
        9: { accelMult: 0.85, olaBonus: 8 }
    },
    chassis: {
        0: { handlingMult: 1.00, weightMult: 1.00 },
        3: { handlingMult: 1.033, weightMult: 0.98 },
        6: { handlingMult: 1.066, weightMult: 0.95 },
        9: { handlingMult: 1.10, weightMult: 0.92 }
    }
};

function calcTune(car, tune) {
    if (!tune) tune = "000";
    
    const gearingLvl = parseInt(tune[0]);
    const engineLvl = parseInt(tune[1]);
    const chassisLvl = parseInt(tune[2]);
    
    const gearing = upgradeLevels.gearing[gearingLvl];
    const engine = upgradeLevels.engine[engineLvl];
    const chassis = upgradeLevels.chassis[chassisLvl];
    
    if (!gearing || !engine || !chassis) {
        return {
            topSpeed: car.topSpeed,
            accel: car["0to60"],
            handling: car.handling,
            weight: car.weight,
            mra: car.mra,
            ola: car.ola
        };
    }
    
    const baseTS = car.topSpeed;
    const baseAccel = car["0to60"];
    const baseHandling = car.handling;
    const baseWeight = car.weight;
    const baseMRA = car.mra || 0;
    const baseOLA = car.ola || 0;
    
    // Top Speed
    let topSpeed;
    if (baseTS < 60) {
        topSpeed = Math.round(baseTS + (26 * (gearingLvl / 9)));
    } else {
        topSpeed = Math.round(baseTS + (520 / baseTS * gearing.tsMult));
    }
    
    // 0-60 (based on TUNED top speed)
    let accel;
    if (topSpeed < 60) {
        accel = 99.9;
    } else if (baseTS < 60 && topSpeed >= 60) {
        // Car upgraded past 60 mph!
        const mphOver60 = topSpeed - 60;
        const estimatedAccel = Math.max(4.0, 60 - (mphOver60 * 2.5));
        accel = Number((estimatedAccel * engine.accelMult).toFixed(1));
    } else {
        accel = Number((baseAccel * engine.accelMult).toFixed(1));
    }
    
    // Handling
    const handling = Math.round(baseHandling * chassis.handlingMult);
    
    // Weight
    const weight = Math.round(baseWeight * chassis.weightMult);
    
    // MRA (2 decimal precision)
    let mra;
    if (topSpeed >= 100) {
        mra = Number((baseMRA + gearing.mraBonus).toFixed(2));
    } else {
        mra = Number(Number(baseMRA).toFixed(2));
    }
    
    // OLA (2 decimal precision)
    let ola;
    if (topSpeed >= 60) {
        ola = Number((baseOLA + engine.olaBonus).toFixed(2));
    } else {
        ola = Number(Number(baseOLA).toFixed(2));
    }
    
    return { topSpeed, accel, handling, weight, mra, ola };
}

// ============================================
// TEST CASES
// ============================================

const testCars = {
    "Corvette Z06 (2023) - Normal Car": {
        topSpeed: 195,
        "0to60": 2.7,
        handling: 93,
        weight: 1709,
        mra: 79.1,      // Decimal MRA
        ola: 79.25      // Decimal OLA
    },
    "Slow Tractor (45 mph) - Can't reach 60": {
        topSpeed: 45,
        "0to60": 25.0,
        handling: 30,
        weight: 2500,
        mra: 15.5,
        ola: 40.75
    },
    "Golf Cart (55 mph) - Upgrades PAST 60": {
        topSpeed: 55,
        "0to60": 18.0,
        handling: 45,
        weight: 600,
        mra: 25.33,
        ola: 55.67
    },
    "Vintage Car (58 mph) - Barely under 60": {
        topSpeed: 58,
        "0to60": 15.0,
        handling: 50,
        weight: 1200,
        mra: 30.12,
        ola: 60.99
    }
};

const tunes = ["000", "333", "666", "996", "969", "699"];

console.log("=".repeat(100));
console.log("CALCTUNE v2.1 TEST RESULTS");
console.log("=".repeat(100));

// ============================================
// TEST 1: Normal car with decimal MRA/OLA
// ============================================
console.log("\n" + "=".repeat(100));
console.log("TEST 1: Decimal MRA/OLA Precision (Corvette Z06)");
console.log("=".repeat(100));

const corvette = testCars["Corvette Z06 (2023) - Normal Car"];
console.log(`Base MRA: ${corvette.mra} | Base OLA: ${corvette.ola}`);
console.log("-".repeat(60));

for (const tune of tunes) {
    const stats = calcTune(corvette, tune);
    console.log(`${tune}: MRA = ${stats.mra} | OLA = ${stats.ola}`);
}

const corvetteTest = calcTune(corvette, "996");
const mraHasDecimals = corvetteTest.mra.toString().includes(".");
const olaHasDecimals = corvetteTest.ola.toString().includes(".");
console.log(`\n✓ MRA preserves decimals: ${mraHasDecimals ? "PASS ✅" : "FAIL ❌"}`);
console.log(`✓ OLA preserves decimals: ${olaHasDecimals ? "PASS ✅" : "FAIL ❌"}`);

// ============================================
// TEST 2: Car that stays under 60 mph
// ============================================
console.log("\n" + "=".repeat(100));
console.log("TEST 2: Car That Stays Under 60mph (Slow Tractor)");
console.log("=".repeat(100));

const tractor = testCars["Slow Tractor (45 mph) - Can't reach 60"];
console.log(`Base: ${tractor.topSpeed} mph | ${tractor["0to60"]}s 0-60`);
console.log("-".repeat(60));

for (const tune of tunes) {
    const stats = calcTune(tractor, tune);
    console.log(`${tune}: Top Speed = ${stats.topSpeed} mph | 0-60 = ${stats.accel}s`);
}

const tractorMax = calcTune(tractor, "996");
console.log(`\n✓ Max tune top speed (${tractorMax.topSpeed} mph) still < 60: ${tractorMax.topSpeed < 60 ? "PASS ✅" : "FAIL ❌"}`);
console.log(`✓ 0-60 stays 99.9: ${tractorMax.accel === 99.9 ? "PASS ✅" : "FAIL ❌"}`);

// ============================================
// TEST 3: Car that upgrades PAST 60 mph
// ============================================
console.log("\n" + "=".repeat(100));
console.log("TEST 3: Car That Upgrades PAST 60mph (Golf Cart)");
console.log("=".repeat(100));

const golfCart = testCars["Golf Cart (55 mph) - Upgrades PAST 60"];
console.log(`Base: ${golfCart.topSpeed} mph | ${golfCart["0to60"]}s 0-60 (can't actually reach 60)`);
console.log("-".repeat(60));

for (const tune of tunes) {
    const stats = calcTune(golfCart, tune);
    const canReach60 = stats.topSpeed >= 60;
    const status = canReach60 ? "CAN reach 60! 🎉" : "still under 60";
    console.log(`${tune}: Top Speed = ${stats.topSpeed} mph | 0-60 = ${stats.accel}s | ${status}`);
}

const golfCartMax = calcTune(golfCart, "996");
console.log(`\n✓ Max tune top speed (${golfCartMax.topSpeed} mph) >= 60: ${golfCartMax.topSpeed >= 60 ? "PASS ✅" : "FAIL ❌"}`);
console.log(`✓ 0-60 is NOT 99.9 (got ${golfCartMax.accel}s): ${golfCartMax.accel !== 99.9 ? "PASS ✅" : "FAIL ❌"}`);
console.log(`✓ 0-60 is reasonable (<60s, got ${golfCartMax.accel}s): ${golfCartMax.accel < 60 ? "PASS ✅" : "FAIL ❌"}`);

// ============================================
// TEST 4: Car barely under 60 mph
// ============================================
console.log("\n" + "=".repeat(100));
console.log("TEST 4: Car Barely Under 60mph (Vintage Car - 58 mph)");
console.log("=".repeat(100));

const vintage = testCars["Vintage Car (58 mph) - Barely under 60"];
console.log(`Base: ${vintage.topSpeed} mph | ${vintage["0to60"]}s 0-60`);
console.log("-".repeat(60));

for (const tune of tunes) {
    const stats = calcTune(vintage, tune);
    const canReach60 = stats.topSpeed >= 60;
    const status = canReach60 ? "CAN reach 60!" : "still under 60";
    console.log(`${tune}: Top Speed = ${stats.topSpeed} mph | 0-60 = ${stats.accel}s | ${status}`);
}

// ============================================
// TEST 5: Full stat table for normal car
// ============================================
console.log("\n" + "=".repeat(100));
console.log("TEST 5: Full 6-Stat Table (Corvette Z06)");
console.log("=".repeat(100));

console.log("\n| Tune | Top Speed | 0-60  | Handling | Weight | MRA    | OLA    |");
console.log("|------|-----------|-------|----------|--------|--------|--------|");

for (const tune of tunes) {
    const s = calcTune(corvette, tune);
    console.log(`| ${tune} | ${s.topSpeed.toString().padStart(9)} | ${s.accel.toFixed(1).padStart(5)} | ${s.handling.toString().padStart(8)} | ${s.weight.toString().padStart(6)} | ${s.mra.toFixed(2).padStart(6)} | ${s.ola.toFixed(2).padStart(6)} |`);
}

// ============================================
// SUMMARY
// ============================================
console.log("\n" + "=".repeat(100));
console.log("TEST SUMMARY");
console.log("=".repeat(100));

let allPassed = true;

// Test 1 checks
if (!mraHasDecimals || !olaHasDecimals) allPassed = false;

// Test 2 checks
if (tractorMax.topSpeed >= 60 || tractorMax.accel !== 99.9) allPassed = false;

// Test 3 checks
if (golfCartMax.topSpeed < 60 || golfCartMax.accel === 99.9 || golfCartMax.accel >= 60) allPassed = false;

if (allPassed) {
    console.log("\n🎉 ALL TESTS PASSED! 🎉\n");
} else {
    console.log("\n❌ SOME TESTS FAILED - Review output above ❌\n");
}

console.log("=".repeat(100));
