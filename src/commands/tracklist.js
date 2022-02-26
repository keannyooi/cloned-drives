"use strict";

const { readdirSync } = require("fs");
const trackFiles = readdirSync("./src/tracks").filter(file => file.endsWith('.json'));
const { ErrorMessage, InfoMessage } = require("../util/classes/classes.js");
const { defaultPageLimit } = require("../util/consts/consts.js");
const listUpdate = require("../util/functions/listUpdate.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "tracklist",
    aliases: ["alltracks"],
    usage: ["[page number]"],
    args: 0,
    category: "Info",
    description: "Shows all the tracks that are available in Cloned Drives in list form.",
    async execute(message, args) {
        const { settings } = await profileModel.findOne({ userID: message.author.id });
        let list = trackFiles, page;
        if (!args.length) {
            page = 1;
        }
        else if (!isNaN(args[0])) {
            page = parseInt(args[0]);
        }
        else {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, invalid integer provided.",
                desc: "It looks like the page number you requested is not a number.",
                author: message.author
            }).displayClosest(args[0]);
            return errorMessage.sendMessage();
        }

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
        list.sort((a, b) => a - b);

        try {
            listUpdate(list, page, totalPages, listDisplay, settings);
        }
        catch (error) {
            throw error;
        }

        function listDisplay(section, page, totalPages) {
            let trackList = "";
            for (let i = 0; i < section.length; i++) {
                trackList += `**${i + 1}.** `;
                let currentTrack = require(`../tracks/${section[i]}`);
                trackList += `${currentTrack["trackName"]} \n`;
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