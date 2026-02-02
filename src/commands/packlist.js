"use strict";

const { getPackFiles, getPack } = require("../util/functions/dataManager.js");
const { ErrorMessage } = require("../util/classes/classes.js");
const { defaultPageLimit } = require("../util/consts/consts.js");
const listUpdate = require("../util/functions/listUpdate.js");
const { InfoMessage } = require("../util/classes/classes.js");

module.exports = {
    name: "packlist",
    aliases: ["plist", "pl"],
    usage: ["[page number]", "[keyword]"],
    args: 0,
    category: "Info",
    description: "Shows you a list of all the packs available in the game.",
    async execute(message, args) {
        const packFiles = getPackFiles();
        let page = 1;

        let list = packFiles;
        if (args.length > 0) {
            if (!isNaN(args[0])) {
                page = parseInt(args[0]);
            } else {
                // Filter by keyword
                const keyword = args.join(" ").toLowerCase();
                list = packFiles.filter(packFile => {
                    const packId = packFile.endsWith('.json') ? packFile.slice(0, -5) : packFile;
                    const currentPack = getPack(packId);
                    return currentPack && currentPack["packName"] && currentPack["packName"].toLowerCase().includes(keyword);
                });

                if (list.length === 0) {
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, no packs found matching your keyword.",
                        desc: "Try a different keyword.",
                        author: message.author
                    });
                    return errorMessage.sendMessage();
                }
            }
        }

        const totalPages = Math.ceil(list.length / defaultPageLimit);
        const settings = { channel: message.channel, author: message.author };

        if (page < 1 || page > totalPages) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, the page you requested doesn't exist.",
                desc: `The pack list ends at page \`${totalPages}\``,
                author: message.author
            }).displayClosest(page);
            return errorMessage.sendMessage();
        }
        list.sort((a, b) => {
            const packIdA = a.endsWith('.json') ? a.slice(0, -5) : a;
            const packIdB = b.endsWith('.json') ? b.slice(0, -5) : b;
            const packA = getPack(packIdA)["packName"];
            const packB = getPack(packIdB)["packName"];
            return packA.localeCompare(packB);
        });

        try {
            await listUpdate(list, page, totalPages, listDisplay, settings);
        }
        catch (error) {
            throw error;
        }

        function listDisplay(section, page, totalPages) {
            let packList = "";
            for (let i = 0; i < section.length; i++) {
                try {
                    const packId = section[i].endsWith('.json') ? section[i].slice(0, -5) : section[i];
                    let currentPack = getPack(packId);
                    packList += `**${i + 1}.** ${currentPack["packName"]} `;

                    // Category / tier indicators
                    const categories = getPackCategories(currentPack);
                    const tier = getPackTier(currentPack);

                    // Green circle for buyable packs (category "normal" with a price)
                    if (categories.includes("normal") && currentPack.price) {
                        packList += "\uD83D\uDFE2"; // 🟢
                    }

                    // Tier badge
                    if (tier === "elite") {
                        packList += "\uD83D\uDD34"; // 🔴
                    } else if (tier === "booster") {
                        packList += "\uD83D\uDFE1"; // 🟡
                    }

                    packList += "\n";
                } catch (err) {
                    console.error(`Error loading file: ${section[i]}`, err);
                }
            }

            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: "List of All Packs in Cloned Drives",
                desc: "🟢 Buyable · 🔴 Elite · 🟡 Booster",
                author: message.author,
                thumbnail: message.author.displayAvatarURL({ format: "png", dynamic: true }),
                fields: [{ name: "Pack", value: packList }],
                footer: `Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`
            });
            return infoMessage;
        }
    }
};

// === Backward-compatible helpers ===
function getPackCategories(pack) {
    if (pack.categories) return pack.categories;
    const cats = [];
    if (pack.price) cats.push("normal");
    cats.push("daily", "event", "limited", "reward", "calendar");
    return cats;
}

function getPackTier(pack) {
    if (pack.tier) return pack.tier;
    const name = (pack.packName || "").toLowerCase();
    if (name.includes("elite")) return "elite";
    if (name.includes("booster")) return "booster";
    return "standard";
}
