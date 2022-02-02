"use strict";

const fs = require("fs");
const trackFiles = fs.readdirSync("./commands/tracks").filter(file => file.endsWith(".json"));
const { InfoMessage } = require("./sharedfiles/classes.js");
const { search } = require("./sharedfiles/secondary.js");

module.exports = {
    name: "trackinfo",
    aliases: ["tinfo"],
    usage: ["<track name>", "-<track id>"],
    args: 1,
    category: "Info",
    description: "Shows info about a specified track.",
    execute(message, args) {
        let query = args.map(i => i.toLowerCase()), searchBy = "track";
        if (args[0].toLowerCase() === "random") {
            return displayInfo(trackFiles[Math.floor(Math.random() * trackFiles.length)]);
        }
        else if (args[0].toLowerCase().startsWith("-t")) {
            query = [args[0].toLowerCase().slice(1)];
            searchBy = "id";
        }

        new Promise(resolve => resolve(search(message, query, trackFiles, searchBy)))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                displayInfo(...response);
            })
            .catch(error => {
                throw error;
            })
        
        function displayInfo(track, currentMessage) {
            let currentTrack = require(`./tracks/${track}`);
            const infoMessage = new InfoMessage({
                channel: message.channel,
                title: currentTrack["trackName"],
                desc: `ID: \`${track.slice(0, 6)}\``,
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