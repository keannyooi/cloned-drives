"use strict";

const bot = require("../config/config.js");
const { getPackFiles, getPack, getCar } = require("../util/functions/dataManager.js");
const { InfoMessage } = require("../util/classes/classes.js");
const { moneyEmojiID } = require("../util/consts/consts.js");
const carNameGen = require("../util/functions/carNameGen.js");
const search = require("../util/functions/search.js");

module.exports = {
    name: "packinfo",
    aliases: ["pinfo"],
    usage: ["<pack name>", "-<pack id>"],
    args: 1,
    category: "Configuration",
    description: "Shows info about a specified card pack.",
    async execute(message, args) {
        const packFiles = getPackFiles();
        let query = args.map(i => i.toLowerCase()), searchBy = "pack";
        if (args[0].toLowerCase() === "random") {
            const randomFile = packFiles[Math.floor(Math.random() * packFiles.length)];
            const packId = randomFile.endsWith('.json') ? randomFile.slice(0, -5) : randomFile;
            return displayInfo(packId);
        }
        else if (args[0].toLowerCase().startsWith("-p")) {
            query = [args[0].toLowerCase().slice(1)];
            searchBy = "id";
        }

        await new Promise(resolve => resolve(search(message, query, packFiles, searchBy)))
            .then(response => {
                if (!Array.isArray(response)) return;
                let [result, currentMessage] = response;
                const packId = result.endsWith('.json') ? result.slice(0, -5) : result;
                displayInfo(packId, currentMessage);
            })
            .catch(error => {
                throw error;
            });

        function displayInfo(packId, currentMessage) {
            const moneyEmoji = bot.emojis.cache.get(moneyEmojiID);
            let currentPack = getPack(packId);
            const repetition = currentPack.repetition || 1;

            // === Base info ===
            let descLines = [`ID: \`${packId.slice(0, 6)}\``];

            // Categories
            if (currentPack.categories) {
                descLines.push(`Categories: \`${currentPack.categories.join(", ")}\``);
            }
            // Tier
            if (currentPack.tier) {
                descLines.push(`Tier: \`${currentPack.tier}\``);
            }
            // No duplicates
            if (currentPack.noDuplicates) {
                descLines.push(`No Duplicates: ✅`);
            }
            // Filter logic
            if (currentPack.filterLogic && currentPack.filterLogic !== "and") {
                descLines.push(`Filter Logic: \`${currentPack.filterLogic.toUpperCase()}\``);
            }

            let infoMessage = new InfoMessage({
                channel: message.channel,
                title: currentPack["packName"],
                desc: descLines.join("\n"),
                author: message.author,
                image: currentPack["pack"],
                fields: [
                    { name: "Price", value: currentPack["price"] ? `${moneyEmoji}${currentPack["price"].toLocaleString("en")}` : "Not Purchasable" },
                    { name: "Description", value: currentPack["description"] || "No description." }
                ]
            });

            // === Upgrade chance ===
            if (currentPack.upgradeChance) {
                let upgradeStr = "";
                for (const [upg, chance] of Object.entries(currentPack.upgradeChance)) {
                    upgradeStr += `${upg}: ${chance}%\n`;
                }
                infoMessage.editEmbed({ fields: [{ name: "⬆️ Upgrade Chance", value: `\`${upgradeStr.trim()}\``, inline: true }] });
            }

            // === Bonus rewards ===
            if (currentPack.bonusRewards) {
                let bonusStr = "";
                for (const [type, amount] of Object.entries(currentPack.bonusRewards)) {
                    bonusStr += `${type}: ${amount.toLocaleString("en")}\n`;
                }
                infoMessage.editEmbed({ fields: [{ name: "🎁 Bonus Rewards", value: `\`${bonusStr.trim()}\``, inline: true }] });
            }

            // === Card slot drop rates ===
            const fields = [];
            for (let i = 0; i < currentPack.packSequence.length; i++) {
                const slotDef = currentPack.packSequence[i];
                const rates = slotDef.rates || slotDef;
                const hasSlotFilter = !!slotDef.filter;

                let dropRate = "`";
                for (const key of Object.keys(rates)) {
                    if (key === "pool") {
                        // Calculate total pool weight
                        const totalPoolWeight = rates.pool.reduce((sum, e) => sum + e.weight, 0);
                        dropRate += `pool: ${totalPoolWeight}%\n`;

                        // List individual pool entries
                        for (const entry of rates.pool) {
                            try {
                                const poolCar = getCar(entry.carID);
                                const name = poolCar
                                    ? `${Array.isArray(poolCar.make) ? poolCar.make[0] : poolCar.make} ${poolCar.model}`
                                    : entry.carID;
                                dropRate += `  → ${name}: ${entry.weight}%`;
                                if (entry.upgrade && entry.upgrade !== "000") {
                                    dropRate += ` [${entry.upgrade}]`;
                                }
                                dropRate += "\n";
                            } catch {
                                dropRate += `  → ${entry.carID}: ${entry.weight}%\n`;
                            }
                        }
                    } else {
                        dropRate += `${key}: ${rates[key]}%\n`;
                    }
                }
                dropRate += "`";

                const cardRange = repetition > 1
                    ? `${i * repetition + 1}~${(i + 1) * repetition}`
                    : (i + 1);
                let fieldName = `Card(s) ${cardRange} Drop Rate`;
                if (hasSlotFilter) fieldName += " 🔍";

                fields.push({
                    name: fieldName,
                    value: dropRate,
                    inline: true
                });
            }
            infoMessage.editEmbed({ fields });

            // === Total card count ===
            const totalCards = currentPack.packSequence.length * repetition;
            const cardsPerPage = currentPack.cardsPerPage || 5;
            if (totalCards !== 5 || cardsPerPage !== 5) {
                infoMessage.editEmbed({ fields: [{
                    name: "Pack Layout",
                    value: `Total Cards: \`${totalCards}\` | Cards Per Page: \`${cardsPerPage}\``,
                    inline: false
                }] });
            }

            return infoMessage.sendMessage({ currentMessage });
        }
    }
};
