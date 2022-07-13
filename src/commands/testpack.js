"use strict";

const { readdirSync } = require("fs");
const packFiles = readdirSync("./src/packs").filter(file => file.endsWith(".json"));
const search = require("../util/functions/search.js");
const openPack = require("../util/functions/openPack.js");

module.exports = {
    name: "testpack",
    aliases: ["tp"],
    usage: ["<pack name>", "-<pack id>"],
    args: 1,
    category: "Miscellaneous",
    description: "Opens a pack, however the cars in said pack won't be added into your garage and you won't be charged. Perfect for those who have a gambling addiction.",
    async execute(message, args) {
        let query = args.map(i => i.toLowerCase());
        if (args[0].toLowerCase() === "random") {
            let currentPack = require(`../packs/${packFiles[Math.floor(Math.random() * packFiles.length)]}`);
            openPack(message, currentPack);
            return message.channel.send("**Note: Since you opened this pack using `cd-testpack`, these cars won't be added into your garage and you won't be charged with money.**");
        }

        await new Promise(resolve => resolve(search(message, query, packFiles, "pack")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                let [result, currentMessage] = response;
                let currentPack = require(`../packs/${result}`);
                return openPack({ message, currentPack, currentMessage, test: true });
            })
            .catch(error => {
                throw error;
            });
    }
};