"use strict";

const bot = require("../config/config.js");
const { getPackFiles, getPack } = require("../util/functions/dataManager.js");
const search = require("../util/functions/search.js");
const openPack = require("../util/functions/openPack.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "testpack",
    aliases: ["tp"],
    usage: ["<pack name>", "-<pack id>"],
    args: 1,
    category: "Miscellaneous",
    description: "Opens a pack, however the cars in said pack won't be added into your garage and you won't be charged. Perfect for those who have a gambling addiction.",
    async execute(message, args) {
        const packFiles = getPackFiles();
        let query = args.map(i => i.toLowerCase());

        // Load player data for NEW indicators (we won't persist changes)
        const playerData = await profileModel.findOne({ userID: message.author.id });
        let discoveredCars = playerData?.discoveredCars ? [...playerData.discoveredCars] : [];
        if (discoveredCars.length === 0 && playerData?.garage?.length > 0) {
            discoveredCars = playerData.garage.map(c => c.carID);
        }

        if (args[0].toLowerCase() === "random") {
            const randomFile = packFiles[Math.floor(Math.random() * packFiles.length)];
            const packId = randomFile.endsWith('.json') ? randomFile.slice(0, -5) : randomFile;
            let currentPack = getPack(packId);
            await openPack({ message, currentPack, test: true, discoveredCars });
            return bot.deleteID(message.author.id);
        }

        await new Promise(resolve => resolve(search(message, query, packFiles, "pack")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                let [result, currentMessage] = response;
                const packId = result.endsWith('.json') ? result.slice(0, -5) : result;
                let currentPack = getPack(packId);
                await openPack({ message, currentPack, currentMessage, test: true, discoveredCars });
                return bot.deleteID(message.author.id);
            })
            .catch(error => {
                throw error;
            });
    }
};
