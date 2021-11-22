"use strict";

const fs = require("fs");
const packFiles = fs.readdirSync("./commands/packs").filter(file => file.endsWith(".json"));
const { search, openPack } = require("./sharedfiles/secondary.js");

module.exports = {
    name: "testpack",
    aliases: ["tp"],
    usage: "<pack name goes here>",
    args: 1,
    category: "Miscellaneous",
    cooldown: 4.388,
    description: "Opens a pack, however the cars in said pack won't be added into your garage and you won't be charged. Perfect for those who have a gambling addiction.",
    async execute(message, args) {
        let query = args.map(i => i.toLowerCase());
        if (args[0].toLowerCase() === "random") {
            let currentPack = require(`./packs/${Math.floor(Math.random() * packFiles.length)}`);
            return openPack(message, currentPack);
        }

        new Promise(resolve => resolve(search(message, query, packFiles, "pack")))
            .then(async (hmm) => {
                if (!Array.isArray(hmm)) return;
                let [result, currentMessage] = hmm;
                try {
                    let currentPack = require(`./packs/${result}`);
                    openPack(message, currentPack, currentMessage);
                    message.channel.send("**Note: Since you opened this pack using `cd-testpack`, these cars won't be added into your garage and you won't be charged with money.**");
                }
                catch (error) {
                    throw error;
                }
            });
    }
};