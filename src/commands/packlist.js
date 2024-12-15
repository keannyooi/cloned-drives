"use strict";

const { readdirSync } = require("fs");
const packFiles = readdirSync("./src/packs").filter(file => file.endsWith('.json'));
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { defaultPageLimit } = require("../util/consts/consts.js");
const listUpdate = require("../util/functions/listUpdate.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "packlist",
    aliases: ["packs", "packstore","pl"],
    usage: ["[page number]", "[keyword]"],
    args: 0,
    category: "Info",
    description: "Shows all the packs that are available in Cloned Drives in list form. You can filter by keyword.",
    async execute(message, args) {
        const { settings } = await profileModel.findOne({ userID: message.author.id });
        let list = packFiles, page;

        // Extract keyword or page number
        let keyword = null;
        if (args.length > 0 && isNaN(args[0])) {
            keyword = args.join(" ").toLowerCase();
        } else if (!args.length) {
            page = 1;
        } else if (!isNaN(args[0])) {
            page = parseInt(args[0]);
        } else {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, invalid integer provided.",
                desc: "It looks like the page number you requested is not a number.",
                author: message.author
            }).displayClosest(args[0]);
            return errorMessage.sendMessage();
        }

        // Filter list based on keyword
        if (keyword) {
            list = list.filter(file => {
                try {
                    const currentPack = require(`../packs/${file}`);
                    return currentPack["packName"] && currentPack["packName"].toLowerCase().includes(keyword);
                } catch (err) {
                    console.error(`Error loading file: ${file}`, err);
                    return false;
                }
            });

            if (!list.length) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "No Packs Found",
                    desc: `No packs found matching the keyword \`${keyword}\`.`,
                    author: message.author
                });
                return errorMessage.sendMessage();
            }
		 page = 1; // Explicitly set the page to 1 after keyword filtering
        }

        // Calculate pagination
        const totalPages = Math.ceil(list.length / (settings.listamount || defaultPageLimit));
        if (page < 0 || totalPages < page) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, invalid integer provided.",
                desc: `The pack list ends at page \`${totalPages}\``,
                author: message.author
            }).displayClosest(page);
            return errorMessage.sendMessage();
        }
        list.sort((a, b) => {
            const packA = require(`../packs/${a}`)["packName"];
            const packB = require(`../packs/${b}`)["packName"];
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
                    let currentPack = require(`../packs/${section[i]}`);
                    packList += `**${i + 1}.** ${currentPack["packName"]} `;
                    
                    // Add green circle for packs with a "price" property
                    if (currentPack.hasOwnProperty("price")) {
                        packList += "\uD83D\uDFE2"; // Green circle emoji
                    }

                    packList += "\n"; // New line for each pack entry
                } catch (err) {
                    console.error(`Error loading file: ${section[i]}`, err);
                }
            }

            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: "List of All Packs in Cloned Drives",
                author: message.author,
                thumbnail: message.author.displayAvatarURL({ format: "png", dynamic: true }),
                fields: [{ name: "Pack", value: packList }],
                footer: `Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`
            });
            return infoMessage;
        }
    }
};