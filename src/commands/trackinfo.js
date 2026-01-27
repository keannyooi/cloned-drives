"use strict";

const { getTrackFiles, getTrack } = require("../util/functions/dataManager.js");
const { InfoMessage } = require("../util/classes/classes.js");
const search = require("../util/functions/search.js");

module.exports = {
    name: "trackinfo",
    aliases: ["tinfo"],
    usage: ["<track name>", "-<track id>"],
    args: 1,
    category: "Info",
    description: "Shows info about a specified track.",
    async execute(message, args) {
        const trackFiles = getTrackFiles();
        let query = args.map(i => i.toLowerCase()), searchBy = "track";
        if (args[0].toLowerCase() === "random") {
            const randomFile = trackFiles[Math.floor(Math.random() * trackFiles.length)];
            const trackId = randomFile.endsWith('.json') ? randomFile.slice(0, -5) : randomFile;
            return displayInfo(trackId);
        }
        else if (args[0].toLowerCase().startsWith("-t")) {
            query = [args[0].toLowerCase().slice(1)];
            searchBy = "id";
        }

        await new Promise(resolve => resolve(search(message, query, trackFiles, searchBy)))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                let [result, currentMessage] = response;
                const trackId = result.endsWith('.json') ? result.slice(0, -5) : result;
                displayInfo(trackId, currentMessage);
            })
            .catch(error => {
                throw error;
            })
        
        function displayInfo(trackId, currentMessage) {
            let currentTrack = getTrack(trackId);
            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: currentTrack["trackName"],
                desc: `ID: \`${trackId.slice(0, 6)}\``,
                author: message.author,
                image: currentTrack["background"],
                thumbnail: currentTrack["map"],
                fields: [
                    { name: "Weather", value: currentTrack["weather"], inline: true },
                    { name: "Track Surface", value: currentTrack["surface"], inline: true },
                    { name: "Speedbumps", value: currentTrack["speedbumps"].toString(), inline: true },
                    { name: "Humps", value: currentTrack["humps"].toString(), inline: false },
                    { name: "Top Speed Priority", value: `${currentTrack["specsDistr"]["topSpeed"]}/100`, inline: true },
                    { name: "Acceleration Priority", value: `${currentTrack["specsDistr"]["0to60"]}/100`, inline: true },
                    { name: "Handling Priority", value: `${currentTrack["specsDistr"]["handling"]}/100`, inline: true },
                    { name: "Weight Priority", value: `${currentTrack["specsDistr"]["weight"]}/100`, inline: true },
                    { name: "MRA Priority", value: `${currentTrack["specsDistr"]["mra"]}/100`, inline: true },
                    { name: "OLA Priority", value: `${currentTrack["specsDistr"]["ola"]}/100`, inline: true }
                ]
            });
            return infoMessage.sendMessage({ currentMessage });
        }
    }
};
