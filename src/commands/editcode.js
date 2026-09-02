"use strict";

const bot = require("../config/config.js");
const { ErrorMessage, SuccessMessage } = require("../util/classes/classes.js");
const { moneyEmojiID, fuseEmojiID, trophyEmojiID } = require("../util/consts/consts.js");
const { getCarFiles, getPackFiles, getCar, getPack, getDriver, getAllDrivers, getVoucher, getVoucherFiles } = require("../util/functions/dataManager.js");
const { rarityOf, driverDisplayName } = require("../util/functions/raceWeekEvents.js");
const carNameGen = require("../util/functions/carNameGen.js");
const search = require("../util/functions/search.js");
const listRewards = require("../util/functions/listRewards.js");
const codeModel = require("../models/codeSchema.js");

module.exports = {
    name: "editcode",
    usage: [
        "<code> money <amount>",
        "<code> trophies <amount>",
        "<code> fusetokens <amount>",
        "<code> addcar <car name>",
        "<code> removecar <car name>",
        "<code> addpack <pack name>",
        "<code> removepack <pack name>",
        "<code> adddriver <driver ID or name>",
        "<code> removedriver <driver ID or name>",
        "<code> addvoucher <voucher ID> [amount]",
        "<code> removevoucher <voucher ID>",
        "<code> maxuses <number>",
        "<code> deadline <days or \"unlimited\">",
        "<code> activate",
        "<code> deactivate"
    ],
    args: 2,
    category: "Admin",
    description: "Edits a redeemable code's rewards and settings.",
    async execute(message, args) {
        const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
        const fuseEmoji = bot.emojis.cache.get(fuseEmojiID);
        const trophyEmoji = bot.emojis.cache.get(trophyEmojiID);
        const carFiles = getCarFiles();
        const packFiles = getPackFiles();

        const codeName = args[0].toUpperCase();
        const codeData = await codeModel.findOne({ code: codeName });
        if (!codeData) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, code not found.",
                desc: `No code with the name \`${codeName}\` exists. Use \`cd-codes\` to view all codes.`,
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        let criteria = args[1].toLowerCase();
        let operationFailed = false;
        let successMessage, currentMessage;

        switch (criteria) {
            case "money":
                if (!args[2] || isNaN(args[2]) || parseInt(args[2]) < 0) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, money amount provided is invalid.",
                        desc: "Provide a positive number for the money reward, or `0` to remove it.",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }

                let moneyAmount = parseInt(args[2]);
                if (moneyAmount === 0) {
                    delete codeData.rewards.money;
                } else {
                    codeData.rewards.money = moneyAmount;
                }
                successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: moneyAmount === 0
                        ? `Successfully removed the money reward from code \`${codeName}\`!`
                        : `Successfully set the money reward for code \`${codeName}\` to ${moneyEmoji}${moneyAmount.toLocaleString("en")}!`,
                    author: message.author,
                    fields: [{ name: "Current Rewards", value: listRewards(codeData.rewards) }]
                });
                break;

            case "trophies":
                if (!args[2] || isNaN(args[2]) || parseInt(args[2]) < 0) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, trophy amount provided is invalid.",
                        desc: "Provide a positive number for the trophy reward, or `0` to remove it.",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }

                let trophyAmount = parseInt(args[2]);
                if (trophyAmount === 0) {
                    delete codeData.rewards.trophies;
                } else {
                    codeData.rewards.trophies = trophyAmount;
                }
                successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: trophyAmount === 0
                        ? `Successfully removed the trophy reward from code \`${codeName}\`!`
                        : `Successfully set the trophy reward for code \`${codeName}\` to ${trophyEmoji}${trophyAmount.toLocaleString("en")}!`,
                    author: message.author,
                    fields: [{ name: "Current Rewards", value: listRewards(codeData.rewards) }]
                });
                break;

            case "fusetokens":
                if (!args[2] || isNaN(args[2]) || parseInt(args[2]) < 0) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, fuse token amount provided is invalid.",
                        desc: "Provide a positive number for the fuse token reward, or `0` to remove it.",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }

                let fuseAmount = parseInt(args[2]);
                if (fuseAmount === 0) {
                    delete codeData.rewards.fuseTokens;
                } else {
                    codeData.rewards.fuseTokens = fuseAmount;
                }
                successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: fuseAmount === 0
                        ? `Successfully removed the fuse token reward from code \`${codeName}\`!`
                        : `Successfully set the fuse token reward for code \`${codeName}\` to ${fuseEmoji}${fuseAmount.toLocaleString("en")}!`,
                    author: message.author,
                    fields: [{ name: "Current Rewards", value: listRewards(codeData.rewards) }]
                });
                break;

            case "addcar":
                if (!args[2]) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, please provide a car name.",
                        desc: "Usage: `cd-editcode <code> addcar <car name>`",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }

                let carQuery = args.slice(2).map(i => i.toLowerCase());
                await new Promise(resolve => resolve(search(message, carQuery, carFiles, "carWithBM")))
                    .then(async (response) => {
                        if (!Array.isArray(response)) {
                            operationFailed = true;
                        }
                        else {
                            let [carFile, currentMessage2] = response;
                            currentMessage = currentMessage2;
                            let carID = carFile.slice(0, 6);

                            if (!codeData.rewards.cars) {
                                codeData.rewards.cars = [];
                            }
                            codeData.rewards.cars.push({ carID, upgrade: "000" });

                            let list = "";
                            for (let car of codeData.rewards.cars) {
                                let currentCar = getCar(car.carID);
                                list += `${carNameGen({ currentCar, rarity: true, upgrade: car.upgrade })}\n`;
                            }

                            let currentCar = getCar(carFile);
                            successMessage = new SuccessMessage({
                                channel: message.channel,
                                title: `Successfully added 1 ${carNameGen({ currentCar })} to code \`${codeName}\`!`,
                                author: message.author,
                                fields: [{ name: "Current Car Rewards", value: list }],
                                image: currentCar["racehud"]
                            });
                        }
                    })
                    .catch(error => {
                        throw error;
                    });
                break;

            case "removecar":
                if (!codeData.rewards.cars || codeData.rewards.cars.length === 0) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, this code has no car rewards to remove.",
                        desc: "Add cars first using `cd-editcode <code> addcar <car name>`.",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }

                if (!args[2]) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, please provide a car name.",
                        desc: "Usage: `cd-editcode <code> removecar <car name>`",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }

                let removeCarQuery = args.slice(2).map(i => i.toLowerCase());
                let carIDList = codeData.rewards.cars.map(c => `${c.carID}.json`);
                await new Promise(resolve => resolve(search(message, removeCarQuery, carIDList, "car")))
                    .then(async (response) => {
                        if (!Array.isArray(response)) {
                            operationFailed = true;
                        }
                        else {
                            let [carFile, currentMessage2] = response;
                            currentMessage = currentMessage2;
                            let removeID = carFile.slice(0, 6);

                            let removeIndex = codeData.rewards.cars.findIndex(c => c.carID === removeID);
                            codeData.rewards.cars.splice(removeIndex, 1);
                            if (codeData.rewards.cars.length === 0) {
                                delete codeData.rewards.cars;
                            }

                            let currentCar = getCar(carFile);
                            let list = "None";
                            if (codeData.rewards.cars && codeData.rewards.cars.length > 0) {
                                list = "";
                                for (let car of codeData.rewards.cars) {
                                    let c = getCar(car.carID);
                                    list += `${carNameGen({ currentCar: c, rarity: true, upgrade: car.upgrade })}\n`;
                                }
                            }

                            successMessage = new SuccessMessage({
                                channel: message.channel,
                                title: `Successfully removed 1 ${carNameGen({ currentCar })} from code \`${codeName}\`!`,
                                author: message.author,
                                fields: [{ name: "Current Car Rewards", value: list }],
                                image: currentCar["racehud"]
                            });
                        }
                    })
                    .catch(error => {
                        throw error;
                    });
                break;

            case "addpack":
                if (!args[2]) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, please provide a pack name.",
                        desc: "Usage: `cd-editcode <code> addpack <pack name>`",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }

                let packQuery = args.slice(2).map(i => i.toLowerCase());
                await new Promise(resolve => resolve(search(message, packQuery, packFiles, "pack")))
                    .then(response => {
                        if (!Array.isArray(response)) {
                            operationFailed = true;
                        }
                        else {
                            let [packFile, currentMessage2] = response;
                            currentMessage = currentMessage2;
                            let packID = packFile.slice(0, 6);

                            if (!codeData.rewards.packs) {
                                codeData.rewards.packs = [];
                            }
                            codeData.rewards.packs.push(packID);

                            let currentPack = getPack(packFile);
                            let list = "";
                            for (let pID of codeData.rewards.packs) {
                                let p = getPack(pID);
                                list += `${p["packName"]}\n`;
                            }

                            successMessage = new SuccessMessage({
                                channel: message.channel,
                                title: `Successfully added 1 ${currentPack["packName"]} to code \`${codeName}\`!`,
                                author: message.author,
                                fields: [{ name: "Current Pack Rewards", value: list }],
                                image: currentPack["pack"]
                            });
                        }
                    })
                    .catch(error => {
                        throw error;
                    });
                break;

            case "removepack":
                if (!codeData.rewards.packs || codeData.rewards.packs.length === 0) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, this code has no pack rewards to remove.",
                        desc: "Add packs first using `cd-editcode <code> addpack <pack name>`.",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }

                if (!args[2]) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, please provide a pack name.",
                        desc: "Usage: `cd-editcode <code> removepack <pack name>`",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }

                let removePackQuery = args.slice(2).map(i => i.toLowerCase());
                let packIDList = codeData.rewards.packs.map(p => `${p}.json`);
                await new Promise(resolve => resolve(search(message, removePackQuery, packIDList, "pack")))
                    .then(response => {
                        if (!Array.isArray(response)) {
                            operationFailed = true;
                        }
                        else {
                            let [packFile, currentMessage2] = response;
                            currentMessage = currentMessage2;
                            let removeID = packFile.slice(0, 6);

                            let removeIndex = codeData.rewards.packs.indexOf(removeID);
                            codeData.rewards.packs.splice(removeIndex, 1);
                            if (codeData.rewards.packs.length === 0) {
                                delete codeData.rewards.packs;
                            }

                            let currentPack = getPack(packFile);
                            let list = "None";
                            if (codeData.rewards.packs && codeData.rewards.packs.length > 0) {
                                list = "";
                                for (let pID of codeData.rewards.packs) {
                                    let p = getPack(pID);
                                    list += `${p["packName"]}\n`;
                                }
                            }

                            successMessage = new SuccessMessage({
                                channel: message.channel,
                                title: `Successfully removed 1 ${currentPack["packName"]} from code \`${codeName}\`!`,
                                author: message.author,
                                fields: [{ name: "Current Pack Rewards", value: list }],
                                image: currentPack["pack"]
                            });
                        }
                    })
                    .catch(error => {
                        throw error;
                    });
                break;

            case "adddriver":
            case "removedriver": {
                if (!args[2]) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, please provide a driver.",
                        desc: `Usage: \`cd-editcode <code> ${criteria} <driver ID or name>\` — IDs look like \`d00003\`, see \`cd-driverlist\`.`,
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }
                // Resolve by ID first, then by (partial) display name.
                const driverQuery = args.slice(2).join(" ").toLowerCase();
                let driver = getDriver(driverQuery);
                if (!driver) {
                    const matches = getAllDrivers().filter(entry =>
                        driverDisplayName(entry).toLowerCase().includes(driverQuery));
                    if (matches.length === 1) driver = matches[0];
                    else {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: matches.length === 0 ? "Error, driver not found." : "Error, more than one driver matches.",
                            desc: matches.length === 0
                                ? "Provide a driver ID (\`d00003\`) or enough of the name to be unique. \`cd-driverlist\` shows the roster."
                                : matches.map(entry => `\`${entry.driverID}\` ${driverDisplayName(entry)}`).join("\n"),
                            author: message.author
                        });
                        return errorMessage.sendMessage();
                    }
                }

                if (criteria === "adddriver") {
                    // Serialised drivers mint numbered copies from a global,
                    // capped ledger — the Driver Scout is their only intended
                    // source, and a code with unlimited redemptions could
                    // drain the whole mint. Keep them out of codes entirely.
                    if (rarityOf(driver) === "serialised") {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, serialised drivers can't be given through codes.",
                            desc: "Serials mint from a capped global ledger — the Driver Scout is their only source.",
                            author: message.author
                        });
                        return errorMessage.sendMessage();
                    }
                    if (!codeData.rewards.drivers) codeData.rewards.drivers = [];
                    codeData.rewards.drivers.push(driver.driverID);
                }
                else {
                    const index = (codeData.rewards.drivers || []).indexOf(driver.driverID);
                    if (index === -1) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, that driver isn't on this code.",
                            author: message.author
                        });
                        return errorMessage.sendMessage();
                    }
                    codeData.rewards.drivers.splice(index, 1);
                    if (codeData.rewards.drivers.length === 0) delete codeData.rewards.drivers;
                }

                const driverList = (codeData.rewards.drivers || []).map(id => {
                    const entry = getDriver(id);
                    return entry ? driverDisplayName(entry) : id;
                }).join("\n") || "None";
                successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully ${criteria === "adddriver" ? "added" : "removed"} ${driverDisplayName(driver)} ${criteria === "adddriver" ? "to" : "from"} code \`${codeName}\`!`,
                    fields: [{ name: "Drivers on this code", value: driverList }],
                    author: message.author
                });
                break;
            }

            case "addvoucher":
            case "removevoucher": {
                if (!args[2]) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, please provide a voucher ID.",
                        desc: `Usage: \`cd-editcode <code> ${criteria} <voucher ID>\` — IDs look like \`v00001\`, see \`cd-voucherinfo\`.`,
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }
                const voucherID = args[2].toLowerCase();
                const voucherDef = getVoucher(voucherID);
                if (!voucherDef) {
                    const known = getVoucherFiles().map(f => `\`${f.slice(0, -5)}\``).join(", ") || "(none loaded)";
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, voucher not found.",
                        desc: `Loaded vouchers: ${known}`,
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }

                if (criteria === "addvoucher") {
                    let voucherAmount = 1;
                    if (args[3] !== undefined) {
                        if (!/^\d+$/.test(args[3]) || parseInt(args[3]) < 1 || parseInt(args[3]) > 100) {
                            const errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, voucher amount provided is invalid.",
                                desc: "Provide a whole number from 1 to 100.",
                                author: message.author
                            });
                            return errorMessage.sendMessage();
                        }
                        voucherAmount = parseInt(args[3]);
                    }
                    if (!codeData.rewards.vouchers) codeData.rewards.vouchers = [];
                    const existing = codeData.rewards.vouchers.find(v => v.voucherID === voucherID);
                    if (existing) existing.amount += voucherAmount;
                    else codeData.rewards.vouchers.push({ voucherID, amount: voucherAmount });
                }
                else {
                    const index = (codeData.rewards.vouchers || []).findIndex(v => v.voucherID === voucherID);
                    if (index === -1) {
                        const errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, that voucher isn't on this code.",
                            author: message.author
                        });
                        return errorMessage.sendMessage();
                    }
                    codeData.rewards.vouchers.splice(index, 1);
                    if (codeData.rewards.vouchers.length === 0) delete codeData.rewards.vouchers;
                }

                const voucherList = (codeData.rewards.vouchers || []).map(v => {
                    const entry = getVoucher(v.voucherID);
                    return `${v.amount}x ${entry ? entry.name : v.voucherID}`;
                }).join("\n") || "None";
                successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully ${criteria === "addvoucher" ? "added" : "removed"} ${voucherDef.name} ${criteria === "addvoucher" ? "to" : "from"} code \`${codeName}\`!`,
                    fields: [{ name: "Vouchers on this code", value: voucherList }],
                    author: message.author
                });
                break;
            }

            case "maxuses":
                if (!args[2] || isNaN(args[2]) || parseInt(args[2]) < 0) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, max uses value provided is invalid.",
                        desc: "Provide a positive number, or `0` for unlimited redemptions.",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }

                let maxUses = parseInt(args[2]);
                codeData.maxRedemptions = maxUses;
                successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully set max uses for code \`${codeName}\` to \`${maxUses === 0 ? "Unlimited" : maxUses}\`!`,
                    author: message.author
                });
                break;

            case "deadline":
                if (!args[2]) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, please provide a deadline.",
                        desc: "Provide a number of days, or `unlimited` for no expiry.",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }

                let deadlineInput = args[2].toLowerCase();
                if (deadlineInput === "unlimited") {
                    codeData.deadline = "unlimited";
                } else if (isNaN(deadlineInput) || parseInt(deadlineInput) < 1) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, deadline provided is invalid.",
                        desc: "The deadline in days must be a positive number, or `unlimited` for no expiry.",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                } else {
                    codeData.deadline = `${parseInt(deadlineInput)}d`;
                }

                successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully set the deadline for code \`${codeName}\` to \`${deadlineInput === "unlimited" ? "Unlimited" : deadlineInput + " day(s)"}\`!`,
                    desc: deadlineInput !== "unlimited" ? "The countdown starts when you activate the code." : undefined,
                    author: message.author
                });
                break;

            case "activate":
                if (codeData.isActive) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, this code is already active.",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }

                if (Object.keys(codeData.rewards).length === 0) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, this code has no rewards configured.",
                        desc: "Add at least one reward before activating the code.",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }

                codeData.isActive = true;
                // If deadline is in "Xd" format, convert to actual ISO date from now
                if (codeData.deadline.endsWith("d")) {
                    const { DateTime } = require("luxon");
                    let days = parseInt(codeData.deadline);
                    codeData.deadline = DateTime.now().plus({ days }).toISO();
                }

                successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully activated code \`${codeName}\`!`,
                    desc: "Players can now redeem this code using `cd-redeem`.",
                    author: message.author
                });
                break;

            case "deactivate":
                if (!codeData.isActive) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, this code is already inactive.",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }

                codeData.isActive = false;
                successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully deactivated code \`${codeName}\`!`,
                    desc: "Players can no longer redeem this code.",
                    author: message.author
                });
                break;

            default:
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, editing criteria not found.",
                    desc: `Here is a list of editing options:
                    \`money <amount>\` - Set the money reward (0 to remove).
                    \`trophies <amount>\` - Set the trophy reward (0 to remove).
                    \`fusetokens <amount>\` - Set the fuse token reward (0 to remove).
                    \`addcar <car name>\` - Add a car reward.
                    \`removecar <car name>\` - Remove a car reward.
                    \`addpack <pack name>\` - Add a pack reward.
                    \`removepack <pack name>\` - Remove a pack reward.
                    \`maxuses <number>\` - Set max redemptions (0 = unlimited).
                    \`deadline <days/unlimited>\` - Set expiry duration.
                    \`activate\` - Activate the code.
                    \`deactivate\` - Deactivate the code.`,
                    author: message.author
                });
                return errorMessage.sendMessage({ currentMessage });
        }

        if (!operationFailed) {
            await codeModel.updateOne({ code: codeName }, codeData);
            return successMessage.sendMessage({ currentMessage });
        }
    }
};
