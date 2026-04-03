/**
 * Comprehensive Handling Audit Script
 * Analyzes all car files for handling consistency, outliers, and potential errors.
 * Run: node auditHandling.js
 * Output: handling-audit-report.md
 */

const fs = require("fs");
const path = require("path");

const CARS_DIR = path.join(__dirname, "src", "cars");

// ============================================================
// LOAD ALL CAR DATA
// ============================================================
function loadAllCars() {
    const files = fs.readdirSync(CARS_DIR).filter(f => f.endsWith(".json"));
    const cars = [];
    const errors = [];

    for (const file of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(CARS_DIR, file), "utf8"));
            // Skip BM variants (reference files) and inactive stubs
            if (data.reference) continue;
            if (data.active === false) continue;

            const make = Array.isArray(data.make) ? data.make.join("/") : (data.make || "Unknown");
            cars.push({
                id: data.carID || file.replace(".json", ""),
                file: file,
                name: `${make} ${data.model || "Unknown"}`,
                year: data.modelYear || 0,
                handling: data.handling,
                tyreType: data.tyreType || "Unknown",
                weight: data.weight || 0,
                driveType: data.driveType || "Unknown",
                gc: data.gc || "Unknown",
                enginePos: data.enginePos || "Unknown",
                bodyStyle: data.bodyStyle || "Unknown",
                topSpeed: data.topSpeed || 0,
                accel: data["0to60"] || 0,
                cr: data.cr || 0,
                tags: data.tags || [],
                country: data.country || "Unknown"
            });
        } catch (e) {
            errors.push(`${file}: ${e.message}`);
        }
    }

    return { cars, errors };
}

// ============================================================
// ANALYSIS HELPERS
// ============================================================
function getDecade(year) {
    if (year < 1970) return "Pre-1970";
    if (year < 1980) return "1970s";
    if (year < 1990) return "1980s";
    if (year < 2000) return "1990s";
    if (year < 2010) return "2000s";
    if (year < 2020) return "2010s";
    return "2020s";
}

function avg(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(arr) {
    const mean = avg(arr);
    const variance = avg(arr.map(x => (x - mean) ** 2));
    return Math.sqrt(variance);
}

function percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * p / 100);
    return sorted[Math.min(idx, sorted.length - 1)];
}

// ============================================================
// SECTION 1: HANDLING DISTRIBUTION OVERVIEW
// ============================================================
function analyzeDistribution(cars) {
    const values = cars.map(c => c.handling).filter(h => h !== undefined && h !== null);
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Exact value counts
    const valueCounts = {};
    for (const v of values) {
        valueCounts[v] = (valueCounts[v] || 0) + 1;
    }

    // 5-point bands
    const bands = {};
    for (const v of values) {
        const bandStart = Math.floor(v / 5) * 5;
        const bandKey = `${bandStart}-${bandStart + 4}`;
        bands[bandKey] = (bands[bandKey] || 0) + 1;
    }

    // Find suspicious clusters and gaps
    const sortedValues = Object.keys(valueCounts).map(Number).sort((a, b) => a - b);
    const clusters = []; // values with way more cars than neighbors
    const gaps = []; // values with 0 or very few cars between populated values

    for (let i = 1; i < sortedValues.length - 1; i++) {
        const v = sortedValues[i];
        const count = valueCounts[v];
        const prevCount = valueCounts[sortedValues[i - 1]] || 0;
        const nextCount = valueCounts[sortedValues[i + 1]] || 0;
        const neighborAvg = (prevCount + nextCount) / 2;

        if (count > neighborAvg * 3 && count > 20) {
            clusters.push({ value: v, count, neighborAvg: neighborAvg.toFixed(1) });
        }
    }

    // Find gaps (missing values within the range)
    for (let v = min; v <= max; v++) {
        if (!valueCounts[v] && valueCounts[v - 1] && valueCounts[v + 1]) {
            gaps.push({ value: v, before: valueCounts[v - 1], after: valueCounts[v + 1] });
        }
    }

    // Find multi-value gaps (sequences of 0s)
    for (let v = min; v <= max; v++) {
        if (!valueCounts[v]) {
            let gapEnd = v;
            while (gapEnd <= max && !valueCounts[gapEnd]) gapEnd++;
            if (gapEnd - v >= 2 && v > min && gapEnd <= max) {
                const existing = gaps.find(g => g.value >= v && g.value < gapEnd);
                if (!existing) {
                    gaps.push({ value: v, gapEnd: gapEnd - 1, before: valueCounts[v - 1] || 0, after: valueCounts[gapEnd] || 0 });
                }
            }
        }
    }

    return {
        total: values.length,
        min, max,
        mean: avg(values).toFixed(1),
        median: median(values),
        stddev: stddev(values).toFixed(1),
        valueCounts,
        bands,
        clusters,
        gaps: gaps.filter((g, i, arr) => arr.findIndex(x => x.value === g.value) === i), // dedupe
        p5: percentile(values, 5),
        p25: percentile(values, 25),
        p75: percentile(values, 75),
        p95: percentile(values, 95)
    };
}

// ============================================================
// SECTION 2: TYRE TYPE ANALYSIS
// ============================================================
function analyzeTyreTypes(cars) {
    const tyreGroups = {};
    for (const car of cars) {
        if (!tyreGroups[car.tyreType]) tyreGroups[car.tyreType] = [];
        tyreGroups[car.tyreType].push(car);
    }

    const tyreStats = {};
    for (const [tyre, group] of Object.entries(tyreGroups)) {
        const handlingValues = group.map(c => c.handling);
        const mean = avg(handlingValues);
        const sd = stddev(handlingValues);

        tyreStats[tyre] = {
            count: group.length,
            min: Math.min(...handlingValues),
            max: Math.max(...handlingValues),
            mean: mean.toFixed(1),
            median: median(handlingValues),
            stddev: sd.toFixed(1)
        };
    }

    // Find outliers per tyre type (>2 stddev from mean)
    const outliers = [];
    for (const [tyre, group] of Object.entries(tyreGroups)) {
        const handlingValues = group.map(c => c.handling);
        const mean = avg(handlingValues);
        const sd = stddev(handlingValues);

        for (const car of group) {
            const zScore = (car.handling - mean) / sd;
            if (Math.abs(zScore) > 2.5) {
                outliers.push({
                    ...car,
                    tyreMean: mean.toFixed(1),
                    zScore: zScore.toFixed(2),
                    deviation: (car.handling - mean).toFixed(1)
                });
            }
        }
    }

    // Sort outliers by absolute z-score
    outliers.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));

    return { tyreStats, outliers: outliers.slice(0, 60), tyreGroups };
}

// ============================================================
// SECTION 3: ERA CONSISTENCY CHECK
// ============================================================
function analyzeEraConsistency(cars) {
    // Group by decade + tyre type
    const groups = {};
    for (const car of cars) {
        const decade = getDecade(car.year);
        const key = `${decade}|${car.tyreType}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(car);
    }

    const eraStats = {};
    for (const [key, group] of Object.entries(groups)) {
        const [decade, tyre] = key.split("|");
        if (!eraStats[tyre]) eraStats[tyre] = {};
        const handlingValues = group.map(c => c.handling);
        eraStats[tyre][decade] = {
            count: group.length,
            min: Math.min(...handlingValues),
            max: Math.max(...handlingValues),
            mean: avg(handlingValues).toFixed(1),
            median: median(handlingValues)
        };
    }

    // Flag pre-1990 cars scoring higher than post-2010 cars on same tyre
    const eraFlags = [];
    for (const car of cars) {
        if (car.year >= 1990) continue;
        const decade = getDecade(car.year);

        // Compare against 2010s and 2020s averages for same tyre
        const post2010Key = `2010s`;
        const post2020Key = `2020s`;
        const tyreData = eraStats[car.tyreType];
        if (!tyreData) continue;

        const post2010Avg = tyreData[post2010Key] ? parseFloat(tyreData[post2010Key].mean) : null;
        const post2020Avg = tyreData[post2020Key] ? parseFloat(tyreData[post2020Key].mean) : null;

        const modernAvg = post2020Avg || post2010Avg;
        if (modernAvg && car.handling > modernAvg + 5) {
            eraFlags.push({
                ...car,
                decade,
                modernAvg: modernAvg.toFixed(1),
                excess: (car.handling - modernAvg).toFixed(1)
            });
        }
    }

    eraFlags.sort((a, b) => parseFloat(b.excess) - parseFloat(a.excess));

    return { eraStats, eraFlags: eraFlags.slice(0, 50) };
}

// ============================================================
// SECTION 4: WEIGHT VS HANDLING ANOMALIES
// ============================================================
function analyzeWeightVsHandling(cars) {
    // Within same tyre type and decade, find weight/handling mismatches
    const groups = {};
    for (const car of cars) {
        const decade = getDecade(car.year);
        const key = `${car.tyreType}|${decade}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(car);
    }

    const anomalies = [];
    for (const [key, group] of Object.entries(groups)) {
        if (group.length < 5) continue;
        const [tyre, decade] = key.split("|");

        // Sort by handling descending
        const sorted = [...group].sort((a, b) => b.handling - a.handling);

        for (let i = 0; i < sorted.length; i++) {
            for (let j = i + 1; j < sorted.length; j++) {
                const high = sorted[i];
                const low = sorted[j];

                // Flag: car with HIGHER handling is MUCH heavier than one with LOWER handling
                if (high.handling - low.handling >= 8 && high.weight > low.weight + 500) {
                    anomalies.push({
                        highCar: high,
                        lowCar: low,
                        handlingDiff: high.handling - low.handling,
                        weightDiff: high.weight - low.weight,
                        group: `${tyre} / ${decade}`
                    });
                }
            }
        }
    }

    // Sort by how extreme the anomaly is (handling diff * weight diff)
    anomalies.sort((a, b) => (b.handlingDiff * b.weightDiff) - (a.handlingDiff * a.weightDiff));

    return anomalies.slice(0, 30);
}

// ============================================================
// SECTION 5: CROSS-GROUP CONSISTENCY
// ============================================================
function analyzeCrossGroup(cars) {
    // Find groups of cars at the same handling value from very different categories
    const byHandling = {};
    for (const car of cars) {
        if (!byHandling[car.handling]) byHandling[car.handling] = [];
        byHandling[car.handling].push(car);
    }

    const interestingComparisons = [];

    // Pick handling values with decent populations
    const popularValues = Object.entries(byHandling)
        .filter(([_, group]) => group.length >= 10)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 15);

    for (const [handlingVal, group] of popularValues) {
        // Find diverse pairs: different enginePos, bodyStyle, driveType, tyre, era
        const diverse = [];
        const seen = new Set();

        for (const car of group) {
            const sig = `${car.bodyStyle}|${car.enginePos}|${car.driveType}|${getDecade(car.year)}`;
            if (!seen.has(sig)) {
                seen.add(sig);
                diverse.push(car);
            }
        }

        if (diverse.length >= 3) {
            // Pick up to 6 most diverse
            interestingComparisons.push({
                handling: parseInt(handlingVal),
                totalCars: group.length,
                samples: diverse.slice(0, 6)
            });
        }
    }

    // Also find specific odd pairings: FWD hatchback == RWD coupe at same handling
    const oddPairings = [];
    for (const [handlingVal, group] of Object.entries(byHandling)) {
        if (group.length < 4) continue;
        const hatchbacks = group.filter(c => c.bodyStyle === "Hatchback" && c.enginePos === "Front");
        const coupes = group.filter(c => c.bodyStyle === "Coupe" && (c.enginePos === "Rear" || c.enginePos === "Middle"));
        const suvs = group.filter(c => c.bodyStyle === "SUV");
        const convertibles = group.filter(c => c.bodyStyle === "Convertible");

        if (hatchbacks.length > 0 && coupes.length > 0) {
            oddPairings.push({
                handling: parseInt(handlingVal),
                type: "Hatchback vs Rear/Mid Coupe",
                cars: [...hatchbacks.slice(0, 2), ...coupes.slice(0, 2)]
            });
        }
        if (suvs.length > 0 && coupes.length > 0) {
            oddPairings.push({
                handling: parseInt(handlingVal),
                type: "SUV vs Rear/Mid Coupe",
                cars: [...suvs.slice(0, 2), ...coupes.slice(0, 2)]
            });
        }
    }

    oddPairings.sort((a, b) => b.handling - a.handling);

    return { interestingComparisons: interestingComparisons.slice(0, 10), oddPairings: oddPairings.slice(0, 15) };
}

// ============================================================
// SECTION 6: SUSPECTED ERRORS / OUTLIERS
// ============================================================
function findSuspectedErrors(cars, tyreGroups) {
    const suspected = [];

    // Build tyre type stats
    const tyreStatMap = {};
    for (const [tyre, group] of Object.entries(tyreGroups)) {
        const vals = group.map(c => c.handling);
        tyreStatMap[tyre] = { mean: avg(vals), sd: stddev(vals), min: Math.min(...vals), max: Math.max(...vals) };
    }

    for (const car of cars) {
        const reasons = [];
        let severity = "WORTH REVIEWING";
        const ts = tyreStatMap[car.tyreType];
        if (!ts) continue;

        const zScore = ts.sd > 0 ? (car.handling - ts.mean) / ts.sd : 0;

        // Extreme outlier for its tyre type
        if (Math.abs(zScore) > 3) {
            reasons.push(`Handling ${car.handling} is ${zScore.toFixed(1)} std devs from ${car.tyreType} mean (${ts.mean.toFixed(0)})`);
            severity = Math.abs(zScore) > 4 ? "LIKELY ERROR" : "POSSIBLE ERROR";
        }

        // Tyre type hierarchy violations
        const tyreExpected = {
            "Standard": [40, 80],
            "Performance": [55, 95],
            "All-Surface": [40, 85],
            "Off-Road": [30, 80],
            "Slick": [75, 110]
        };

        const expected = tyreExpected[car.tyreType];
        if (expected) {
            if (car.handling > expected[1] + 5) {
                reasons.push(`Handling ${car.handling} exceeds expected ${car.tyreType} ceiling of ~${expected[1]}`);
                severity = car.handling > expected[1] + 10 ? "LIKELY ERROR" : "POSSIBLE ERROR";
            }
            if (car.handling < expected[0] - 10) {
                reasons.push(`Handling ${car.handling} below expected ${car.tyreType} floor of ~${expected[0]}`);
                severity = car.handling < expected[0] - 15 ? "LIKELY ERROR" : "POSSIBLE ERROR";
            }
        }

        // Very old car with very high handling
        if (car.year < 1975 && car.handling > 85) {
            reasons.push(`Pre-1975 car with handling ${car.handling} — unusually high for era`);
            if (severity === "WORTH REVIEWING") severity = "POSSIBLE ERROR";
        }

        // Very heavy car with very high handling (potential flag)
        if (car.weight > 2500 && car.handling > 90) {
            reasons.push(`Heavy car (${car.weight}kg) with handling ${car.handling}`);
        }

        // Very light car with very low handling
        if (car.weight < 900 && car.handling < 50 && car.tyreType !== "Standard" && car.tyreType !== "Off-Road") {
            reasons.push(`Light car (${car.weight}kg) on ${car.tyreType} tyres but handling only ${car.handling}`);
            if (severity === "WORTH REVIEWING") severity = "POSSIBLE ERROR";
        }

        // Handling of 0 or negative (definitely wrong)
        if (car.handling <= 0) {
            reasons.push(`Handling is ${car.handling} — invalid value`);
            severity = "LIKELY ERROR";
        }

        // Handling over 110 (probably wrong unless slick race car)
        if (car.handling > 110) {
            reasons.push(`Handling ${car.handling} — extremely high`);
            if (car.tyreType !== "Slick") severity = "LIKELY ERROR";
        }

        if (reasons.length > 0) {
            suspected.push({ ...car, reasons, severity });
        }
    }

    // Sort: LIKELY ERROR first, then POSSIBLE, then WORTH REVIEWING
    const severityOrder = { "LIKELY ERROR": 0, "POSSIBLE ERROR": 1, "WORTH REVIEWING": 2 };
    suspected.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || Math.abs(parseFloat(b.reasons[0]?.match(/([\d.-]+) std/)?.[1] || 0)) - Math.abs(parseFloat(a.reasons[0]?.match(/([\d.-]+) std/)?.[1] || 0)));

    return suspected.slice(0, 60);
}

// ============================================================
// SECTION 7: HANDLING CEILING BY CATEGORY
// ============================================================
function analyzeCeilings(cars) {
    // By body style
    const byBody = {};
    for (const car of cars) {
        if (!byBody[car.bodyStyle]) byBody[car.bodyStyle] = [];
        byBody[car.bodyStyle].push(car);
    }

    const bodyCeilings = {};
    for (const [body, group] of Object.entries(byBody)) {
        const vals = group.map(c => c.handling);
        const maxCar = group.reduce((a, b) => a.handling > b.handling ? a : b);
        const minCar = group.reduce((a, b) => a.handling < b.handling ? a : b);
        bodyCeilings[body] = {
            count: group.length,
            min: Math.min(...vals),
            max: Math.max(...vals),
            mean: avg(vals).toFixed(1),
            maxCar: `${maxCar.name} (${maxCar.year}) [${maxCar.id}]`,
            minCar: `${minCar.name} (${minCar.year}) [${minCar.id}]`
        };
    }

    // By drive type
    const byDrive = {};
    for (const car of cars) {
        if (!byDrive[car.driveType]) byDrive[car.driveType] = [];
        byDrive[car.driveType].push(car);
    }

    const driveCeilings = {};
    for (const [drive, group] of Object.entries(byDrive)) {
        const vals = group.map(c => c.handling);
        const maxCar = group.reduce((a, b) => a.handling > b.handling ? a : b);
        driveCeilings[drive] = {
            count: group.length,
            min: Math.min(...vals),
            max: Math.max(...vals),
            mean: avg(vals).toFixed(1),
            maxCar: `${maxCar.name} (${maxCar.year}) [${maxCar.id}]`
        };
    }

    // By engine position
    const byEngine = {};
    for (const car of cars) {
        if (!byEngine[car.enginePos]) byEngine[car.enginePos] = [];
        byEngine[car.enginePos].push(car);
    }

    const engineCeilings = {};
    for (const [pos, group] of Object.entries(byEngine)) {
        const vals = group.map(c => c.handling);
        const maxCar = group.reduce((a, b) => a.handling > b.handling ? a : b);
        engineCeilings[pos] = {
            count: group.length,
            min: Math.min(...vals),
            max: Math.max(...vals),
            mean: avg(vals).toFixed(1),
            maxCar: `${maxCar.name} (${maxCar.year}) [${maxCar.id}]`
        };
    }

    // By GC
    const byGC = {};
    for (const car of cars) {
        if (!byGC[car.gc]) byGC[car.gc] = [];
        byGC[car.gc].push(car);
    }

    const gcCeilings = {};
    for (const [gc, group] of Object.entries(byGC)) {
        const vals = group.map(c => c.handling);
        gcCeilings[gc] = {
            count: group.length,
            min: Math.min(...vals),
            max: Math.max(...vals),
            mean: avg(vals).toFixed(1)
        };
    }

    return { bodyCeilings, driveCeilings, engineCeilings, gcCeilings };
}

// ============================================================
// GENERATE REPORT
// ============================================================
function generateReport() {
    console.log("Loading car data...");
    const { cars, errors } = loadAllCars();
    console.log(`Loaded ${cars.length} cars (${errors.length} load errors)`);

    let report = `# Handling Audit Report\n\n`;
    report += `**Generated:** ${new Date().toISOString().split("T")[0]}\n`;
    report += `**Cars Analyzed:** ${cars.length}\n`;
    if (errors.length > 0) {
        report += `**Load Errors:** ${errors.length}\n`;
    }
    report += `\n---\n\n`;

    // ==========================================
    // SECTION 1
    // ==========================================
    console.log("Analyzing handling distribution...");
    const dist = analyzeDistribution(cars);

    report += `## 1. Handling Distribution Overview\n\n`;
    report += `| Metric | Value |\n|--------|-------|\n`;
    report += `| Total Cars | ${dist.total} |\n`;
    report += `| Min | ${dist.min} |\n`;
    report += `| Max | ${dist.max} |\n`;
    report += `| Mean | ${dist.mean} |\n`;
    report += `| Median | ${dist.median} |\n`;
    report += `| Std Dev | ${dist.stddev} |\n`;
    report += `| 5th Percentile | ${dist.p5} |\n`;
    report += `| 25th Percentile | ${dist.p25} |\n`;
    report += `| 75th Percentile | ${dist.p75} |\n`;
    report += `| 95th Percentile | ${dist.p95} |\n\n`;

    report += `### 5-Point Band Distribution\n\n`;
    report += `| Band | Count | Bar |\n|------|-------|-----|\n`;
    const sortedBands = Object.entries(dist.bands).sort((a, b) => {
        return parseInt(a[0]) - parseInt(b[0]);
    });
    const maxBandCount = Math.max(...Object.values(dist.bands));
    for (const [band, count] of sortedBands) {
        const bar = "█".repeat(Math.round(count / maxBandCount * 40));
        report += `| ${band} | ${count} | ${bar} |\n`;
    }

    report += `\n### Full Value Distribution (every handling value)\n\n`;
    report += `| Value | Count | Bar |\n|-------|-------|-----|\n`;
    const allValues = Object.keys(dist.valueCounts).map(Number).sort((a, b) => a - b);
    const maxCount = Math.max(...Object.values(dist.valueCounts));
    for (const v of allValues) {
        const count = dist.valueCounts[v];
        const bar = "█".repeat(Math.round(count / maxCount * 30));
        report += `| ${v} | ${count} | ${bar} |\n`;
    }

    if (dist.clusters.length > 0) {
        report += `\n### Suspicious Clusters\n\n`;
        report += `These values have 3x+ more cars than their neighbors:\n\n`;
        report += `| Value | Count | Neighbor Avg |\n|-------|-------|-------------|\n`;
        for (const c of dist.clusters) {
            report += `| ${c.value} | ${c.count} | ${c.neighborAvg} |\n`;
        }
    }

    if (dist.gaps.length > 0) {
        report += `\n### Notable Gaps\n\n`;
        report += `Values with 0 cars despite neighbors having cars:\n\n`;
        report += `| Gap Value(s) | Cars Before | Cars After |\n|-------------|-------------|------------|\n`;
        for (const g of dist.gaps.slice(0, 20)) {
            const label = g.gapEnd ? `${g.value}-${g.gapEnd}` : `${g.value}`;
            report += `| ${label} | ${g.before} | ${g.after} |\n`;
        }
    }

    report += `\n---\n\n`;

    // ==========================================
    // SECTION 2
    // ==========================================
    console.log("Analyzing tyre types...");
    const { tyreStats, outliers, tyreGroups } = analyzeTyreTypes(cars);

    report += `## 2. Tyre Type Analysis\n\n`;
    report += `### Stats Per Tyre Type\n\n`;
    report += `| Tyre Type | Count | Min | Max | Mean | Median | Std Dev |\n`;
    report += `|-----------|-------|-----|-----|------|--------|--------|\n`;

    const tyreOrder = ["Standard", "All-Surface", "Off-Road", "Performance", "Slick"];
    const sortedTyres = Object.entries(tyreStats).sort((a, b) => {
        const ai = tyreOrder.indexOf(a[0]);
        const bi = tyreOrder.indexOf(b[0]);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    for (const [tyre, stats] of sortedTyres) {
        report += `| ${tyre} | ${stats.count} | ${stats.min} | ${stats.max} | ${stats.mean} | ${stats.median} | ${stats.stddev} |\n`;
    }

    report += `\n### Tyre Type Outliers (>2.5 Std Dev from tyre mean)\n\n`;
    report += `| Car | ID | Year | Tyre | Handling | Tyre Mean | Z-Score | Deviation |\n`;
    report += `|-----|----|------|------|----------|-----------|---------|----------|\n`;
    for (const o of outliers) {
        report += `| ${o.name} | ${o.id} | ${o.year} | ${o.tyreType} | ${o.handling} | ${o.tyreMean} | ${o.zScore} | ${o.deviation > 0 ? "+" : ""}${o.deviation} |\n`;
    }

    report += `\n---\n\n`;

    // ==========================================
    // SECTION 3
    // ==========================================
    console.log("Analyzing era consistency...");
    const { eraStats, eraFlags } = analyzeEraConsistency(cars);

    report += `## 3. Era Consistency Check\n\n`;
    report += `### Average Handling by Decade and Tyre Type\n\n`;

    const decades = ["Pre-1970", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"];
    report += `| Tyre Type | ${decades.join(" | ")} |\n`;
    report += `|-----------|${decades.map(() => "------").join("|")}|\n`;

    for (const tyre of tyreOrder) {
        if (!eraStats[tyre]) continue;
        const cells = decades.map(d => {
            const s = eraStats[tyre][d];
            return s ? `${s.mean} (${s.count})` : "-";
        });
        report += `| ${tyre} | ${cells.join(" | ")} |\n`;
    }

    if (eraFlags.length > 0) {
        report += `\n### Era Anomalies: Pre-1990 Cars Scoring 5+ Above Post-2010 Average\n\n`;
        report += `| Car | ID | Year | Tyre | Handling | Modern Avg | Excess |\n`;
        report += `|-----|----|------|------|----------|------------|--------|\n`;
        for (const f of eraFlags) {
            report += `| ${f.name} | ${f.id} | ${f.year} | ${f.tyreType} | ${f.handling} | ${f.modernAvg} | +${f.excess} |\n`;
        }
    }

    report += `\n---\n\n`;

    // ==========================================
    // SECTION 4
    // ==========================================
    console.log("Analyzing weight vs handling...");
    const weightAnomalies = analyzeWeightVsHandling(cars);

    report += `## 4. Weight vs Handling Anomalies\n\n`;
    report += `Cars where a heavier car has 8+ more handling than a lighter car within the same tyre type and decade.\n\n`;
    report += `| Higher-Handling Car | Handling | Weight | Lower-Handling Car | Handling | Weight | Group |\n`;
    report += `|--------------------|----------|--------|--------------------|----------|--------|-------|\n`;
    for (const a of weightAnomalies) {
        report += `| ${a.highCar.name} (${a.highCar.year}) [${a.highCar.id}] | ${a.highCar.handling} | ${a.highCar.weight}kg | ${a.lowCar.name} (${a.lowCar.year}) [${a.lowCar.id}] | ${a.lowCar.handling} | ${a.lowCar.weight}kg | ${a.group} |\n`;
    }

    report += `\n---\n\n`;

    // ==========================================
    // SECTION 5
    // ==========================================
    console.log("Analyzing cross-group consistency...");
    const crossGroup = analyzeCrossGroup(cars);

    report += `## 5. Cross-Group Consistency\n\n`;
    report += `### Cars at the Same Handling Value from Different Categories\n\n`;

    for (const comp of crossGroup.interestingComparisons) {
        report += `#### Handling = ${comp.handling} (${comp.totalCars} cars total)\n\n`;
        report += `| Car | ID | Year | Body | Engine | Drive | Tyre | Weight |\n`;
        report += `|-----|----|------|------|--------|-------|------|--------|\n`;
        for (const car of comp.samples) {
            report += `| ${car.name} | ${car.id} | ${car.year} | ${car.bodyStyle} | ${car.enginePos} | ${car.driveType} | ${car.tyreType} | ${car.weight}kg |\n`;
        }
        report += `\n`;
    }

    if (crossGroup.oddPairings.length > 0) {
        report += `### Odd Pairings: Very Different Car Types at Same Handling\n\n`;
        for (const pair of crossGroup.oddPairings) {
            report += `#### Handling = ${pair.handling} — ${pair.type}\n\n`;
            report += `| Car | ID | Year | Body | Engine | Drive | Tyre | Weight |\n`;
            report += `|-----|----|------|------|--------|-------|------|--------|\n`;
            for (const car of pair.cars) {
                report += `| ${car.name} | ${car.id} | ${car.year} | ${car.bodyStyle} | ${car.enginePos} | ${car.driveType} | ${car.tyreType} | ${car.weight}kg |\n`;
            }
            report += `\n`;
        }
    }

    report += `\n---\n\n`;

    // ==========================================
    // SECTION 6
    // ==========================================
    console.log("Finding suspected errors...");
    const suspected = findSuspectedErrors(cars, tyreGroups);

    report += `## 6. Suspected Errors or Outliers\n\n`;

    const likelyErrors = suspected.filter(s => s.severity === "LIKELY ERROR");
    const possibleErrors = suspected.filter(s => s.severity === "POSSIBLE ERROR");
    const worthReviewing = suspected.filter(s => s.severity === "WORTH REVIEWING");

    if (likelyErrors.length > 0) {
        report += `### LIKELY ERRORS (${likelyErrors.length})\n\n`;
        report += `| Car | ID | Year | Tyre | Handling | Weight | Reasons |\n`;
        report += `|-----|----|------|------|----------|--------|--------|\n`;
        for (const s of likelyErrors) {
            report += `| ${s.name} | ${s.id} | ${s.year} | ${s.tyreType} | ${s.handling} | ${s.weight}kg | ${s.reasons.join("; ")} |\n`;
        }
        report += `\n`;
    }

    if (possibleErrors.length > 0) {
        report += `### POSSIBLE ERRORS (${possibleErrors.length})\n\n`;
        report += `| Car | ID | Year | Tyre | Handling | Weight | Reasons |\n`;
        report += `|-----|----|------|------|----------|--------|--------|\n`;
        for (const s of possibleErrors) {
            report += `| ${s.name} | ${s.id} | ${s.year} | ${s.tyreType} | ${s.handling} | ${s.weight}kg | ${s.reasons.join("; ")} |\n`;
        }
        report += `\n`;
    }

    if (worthReviewing.length > 0) {
        report += `### WORTH REVIEWING (${worthReviewing.length})\n\n`;
        report += `| Car | ID | Year | Tyre | Handling | Weight | Reasons |\n`;
        report += `|-----|----|------|------|----------|--------|--------|\n`;
        for (const s of worthReviewing) {
            report += `| ${s.name} | ${s.id} | ${s.year} | ${s.tyreType} | ${s.handling} | ${s.weight}kg | ${s.reasons.join("; ")} |\n`;
        }
    }

    report += `\n---\n\n`;

    // ==========================================
    // SECTION 7
    // ==========================================
    console.log("Analyzing handling ceilings...");
    const ceilings = analyzeCeilings(cars);

    report += `## 7. Handling Ceiling by Category\n\n`;

    report += `### By Body Style\n\n`;
    report += `| Body Style | Count | Min | Max | Mean | Highest Car | Lowest Car |\n`;
    report += `|-----------|-------|-----|-----|------|-------------|------------|\n`;
    const sortedBodies = Object.entries(ceilings.bodyCeilings).sort((a, b) => b[1].max - a[1].max);
    for (const [body, stats] of sortedBodies) {
        report += `| ${body} | ${stats.count} | ${stats.min} | ${stats.max} | ${stats.mean} | ${stats.maxCar} | ${stats.minCar} |\n`;
    }

    report += `\n### By Drive Type\n\n`;
    report += `| Drive Type | Count | Min | Max | Mean | Highest Car |\n`;
    report += `|-----------|-------|-----|-----|------|-------------|\n`;
    for (const [drive, stats] of Object.entries(ceilings.driveCeilings).sort((a, b) => b[1].max - a[1].max)) {
        report += `| ${drive} | ${stats.count} | ${stats.min} | ${stats.max} | ${stats.mean} | ${stats.maxCar} |\n`;
    }

    report += `\n### By Engine Position\n\n`;
    report += `| Engine Pos | Count | Min | Max | Mean | Highest Car |\n`;
    report += `|-----------|-------|-----|-----|------|-------------|\n`;
    for (const [pos, stats] of Object.entries(ceilings.engineCeilings).sort((a, b) => b[1].max - a[1].max)) {
        report += `| ${pos} | ${stats.count} | ${stats.min} | ${stats.max} | ${stats.mean} | ${stats.maxCar} |\n`;
    }

    report += `\n### By Ground Clearance\n\n`;
    report += `| GC | Count | Min | Max | Mean |\n`;
    report += `|----|-------|-----|-----|------|\n`;
    for (const [gc, stats] of Object.entries(ceilings.gcCeilings).sort((a, b) => b[1].max - a[1].max)) {
        report += `| ${gc} | ${stats.count} | ${stats.min} | ${stats.max} | ${stats.mean} |\n`;
    }

    report += `\n---\n\n`;

    // ==========================================
    // SUMMARY
    // ==========================================
    report += `## Summary\n\n`;
    report += `This audit analyzed **${cars.length} cars** across the full handling spectrum of **${dist.min}** to **${dist.max}**. `;
    report += `The mean handling is **${dist.mean}** with a median of **${dist.median}** and standard deviation of **${dist.stddev}**. `;

    const totalErrors = likelyErrors.length + possibleErrors.length;
    report += `The analysis identified **${likelyErrors.length} likely errors**, **${possibleErrors.length} possible errors**, `;
    report += `and **${worthReviewing.length} cars worth reviewing**. `;
    report += `${eraFlags.length} pre-1990 cars were flagged for scoring notably above modern averages on the same tyre type.\n\n`;

    report += `### Top 5 Issues to Address First\n\n`;

    // Compile top issues
    const topIssues = [];
    for (const e of likelyErrors.slice(0, 3)) {
        topIssues.push(`1. **${e.name}** (${e.id}): ${e.reasons[0]}`);
    }
    for (const e of possibleErrors.slice(0, 5 - topIssues.length)) {
        topIssues.push(`${topIssues.length + 1}. **${e.name}** (${e.id}): ${e.reasons[0]}`);
    }
    // If still need more, pull from era flags
    while (topIssues.length < 5 && eraFlags.length > topIssues.length - likelyErrors.length - possibleErrors.length) {
        const flag = eraFlags[topIssues.length - likelyErrors.length];
        if (flag) {
            topIssues.push(`${topIssues.length + 1}. **${flag.name}** (${flag.id}): Pre-${flag.decade.replace("s","")} car with handling ${flag.handling} vs modern ${flag.tyreType} avg of ${flag.modernAvg}`);
        } else break;
    }

    report += topIssues.join("\n") + "\n";

    // Write report
    const outputPath = path.join(__dirname, "handling-audit-report.md");
    fs.writeFileSync(outputPath, report, "utf8");
    console.log(`\nReport written to: ${outputPath}`);
    console.log(`Total: ${cars.length} cars analyzed`);
    console.log(`Likely errors: ${likelyErrors.length}`);
    console.log(`Possible errors: ${possibleErrors.length}`);
    console.log(`Worth reviewing: ${worthReviewing.length}`);
    console.log(`Era flags: ${eraFlags.length}`);
}

generateReport();
