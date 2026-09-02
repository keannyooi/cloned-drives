"use strict";

const { getCarFiles, getCar, getDriverFiles, getDriver } = require("./dataManager.js");
const { getBaseType } = require("./cardType.js");
const { rarityOf } = require("./raceWeekEvents.js");
const filterCheck = require("./filterCheck.js");
const calcTotal = require("./calcTotal.js");

// Redemption display order for driver rarities (best first), mirroring
// dataManager's DRIVER_RARITIES ladder.
const RARITY_RANK = { serialised: 0, autograph: 1, icon: 2, divine: 3, secret: 4, rare: 5, base: 6 };

/**
 * Resolve a voucher's redeem block into the concrete choice list for one
 * player (docs/voucher-system.md). Pure read — no writes anywhere.
 *
 * Rules enforced here:
 *  - FAIL-CLOSED RAIL: a car FILTER grants Normal cards only unless the
 *    voucher itself names a cardType. Explicit list IDs bypass the rail.
 *  - `unownedOnly` drops choices the player already owns; otherwise owned
 *    choices stay pickable and are merely flagged.
 *  - Serialised drivers are excluded from FILTER pools (their serial can run
 *    out between choosing and claiming); an explicit list ID still works.
 *
 * @param {Object} voucher - Voucher data object from dataManager
 * @param {Object} playerData - Profile doc (garage + raceWeekStats read)
 * @returns {Array<{kind: "car"|"driver", id: string, item: Object, owned: boolean}>}
 *          Cars first (CR desc), then drivers (best rarity first, then name).
 */
function buildVoucherChoices(voucher, playerData) {
    const redeem = voucher.redeem || {};
    const garage = Array.isArray(playerData.garage) ? playerData.garage : [];
    const ownedDrivers = playerData.raceWeekStats?.ownedDrivers || [];

    const ownsCar = carID => {
        const entry = garage.find(c => c.carID === carID);
        return !!entry && calcTotal(entry) > 0;
    };
    const ownsDriver = driverID => ownedDrivers.includes(driverID);

    const choices = [];
    const push = (kind, id, item, owned) => {
        if (redeem.unownedOnly && owned) return;
        choices.push({ kind, id, item, owned });
    };

    if (Array.isArray(redeem.list)) {
        for (const id of redeem.list) {
            if (id.startsWith("c")) {
                const car = getCar(id);
                if (car) push("car", id, car, ownsCar(id));
            }
            else {
                const driver = getDriver(id);
                if (driver) push("driver", id, driver, ownsDriver(id));
            }
        }
    }
    else if (redeem.pool === "cars") {
        const railed = !redeem.filter.cardType;
        for (const file of getCarFiles()) {
            const carID = file.slice(0, 6);
            const car = getCar(carID);
            if (!car) continue;
            // The rail: filter vouchers hand out Normal cards only, unless the
            // voucher names a cardType on purpose.
            if (railed && getBaseType(car) !== "Normal") continue;
            if (!filterCheck({ car: { carID }, filter: redeem.filter })) continue;
            push("car", carID, car, ownsCar(carID));
        }
    }
    else if (redeem.pool === "drivers") {
        for (const file of getDriverFiles()) {
            const driverID = file.slice(0, -5);
            const driver = getDriver(driverID);
            if (!driver) continue;
            if (rarityOf(driver) === "serialised") continue;
            if (redeem.filter.rarity !== undefined && rarityOf(driver) !== redeem.filter.rarity) continue;
            if (redeem.filter.inRotation !== undefined && driver.inRotation !== redeem.filter.inRotation) continue;
            push("driver", driverID, driver, ownsDriver(driverID));
        }
    }

    choices.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "car" ? -1 : 1;
        if (a.kind === "car") return (b.item.cr || 0) - (a.item.cr || 0);
        const rankDiff = (RARITY_RANK[rarityOf(a.item)] ?? 9) - (RARITY_RANK[rarityOf(b.item)] ?? 9);
        return rankDiff !== 0 ? rankDiff : a.item.name.localeCompare(b.item.name);
    });
    return choices;
}

module.exports = buildVoucherChoices;
