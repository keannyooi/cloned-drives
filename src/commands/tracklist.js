"use strict";

const { getTrackFiles, getTrack } = require("../util/functions/dataManager.js");
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { defaultPageLimit } = require("../util/consts/consts.js");
const listUpdate = require("../util/functions/listUpdate.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "tracklist",
    aliases: ["alltracks", "tracks","tl"],
    usage: ["[page number]", "[keyword]"],
    args: 0,
    category: "Info",
    description: "Shows all the tracks that are available in Cloned Drives in list form. You can filter by keyword.",
    async execute(message, args) {
        const trackFiles = getTrackFiles();
        const { settings } = await profileModel.findOne({ userID: message.author.id });
        let list = trackFiles, page;
		
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
                    const trackId = file.endsWith('.json') ? file.slice(0, -5) : file;
                    const currentTrack = getTrack(trackId);
                    return currentTrack && currentTrack["trackName"] && currentTrack["trackName"].toLowerCase().includes(keyword);
                } catch (err) {
                    console.error(`Error loading file: ${file}`, err);
                    return false;
                }
            });

            if (!list.length) {
                const errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "No Tracks Found",
                    desc: `No Tracks found matching the keyword \`${keyword}\`.`,
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
                desc: `The track list ends at page \`${totalPages}\``,
                author: message.author
            }).displayClosest(page);
            return errorMessage.sendMessage();
        }
        list.sort((a, b) => {
            const trackIdA = a.endsWith('.json') ? a.slice(0, -5) : a;
            const trackIdB = b.endsWith('.json') ? b.slice(0, -5) : b;
            const trackA = getTrack(trackIdA)["trackName"];
            const trackB = getTrack(trackIdB)["trackName"];
            return trackA.localeCompare(trackB);
        });

        try {
            await listUpdate(list, page, totalPages, listDisplay, settings);
        }
        catch (error) {
            throw error;
        }

        function listDisplay(section, page, totalPages) {
            let trackList = "";
            for (let i = 0; i < section.length; i++) {
                try {
                    const trackId = section[i].endsWith('.json') ? section[i].slice(0, -5) : section[i];
                    let currentTrack = getTrack(trackId);
                    trackList += `**${i + 1}.** ${currentTrack["trackName"]} `;
                    trackList += "\n"; // New line for each Track entry
                } catch (err) {
                    console.error(`Error loading file: ${section[i]}`, err);
                }
            }

            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: "List of All Tracks in Cloned Drives",
                author: message.author,
                thumbnail: message.author.displayAvatarURL({ format: "png", dynamic: true }),
                fields: [{ name: "Track", value: trackList }],
                footer: `Page ${page} of ${totalPages} - Interact with the buttons below to navigate through pages.`
            });
            return infoMessage;
        }
    }
};
