"use strict";

const { readdirSync } = require("fs");
const carFiles = readdirSync('./src/cars').filter(file => file.endsWith('.json'));
const tracks = readdirSync("./src/tracks").filter(file => file.endsWith('.json'));
const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const sortCars = require("../util/functions/sortCars.js");
const { getAvailableTunes } = require("../util/functions/calcTune.js");
const championshipModel = require("../models/championshipsSchema.js");
const serverStatModel = require("../models/serverStatSchema.js");

module.exports = {
    name: "createchampionship",
    aliases: ["newchampionship"],
    usage: ["<number of rounds> <championship name>"],
    args: 2,
    category: "Admin",
    description: "Creates a championship with the name of your choice.",
    async execute(message, args) {
        const championships = await championshipModel.find();
        const { totalChampionships } = await serverStatModel.findOne({});
        const championshipName = args.splice(1, args.length).join(" ");
        if (isNaN(args[0]) || parseInt(args[0]) < 1 || parseInt(args[0]) > 100) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, round amount provided is either not a number or not supported.",
                desc: "The number of rounds in a championship is restricted to 1 ~ 100 rounds.",
                author: message.author
            }).displayClosest(args[0]);
            return errorMessage.sendMessage();
        }
        if (championships.find(champ => champ.name === championshipName) !== undefined) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, championship name already taken.",
                esc: "Check the list of championships using the command `cd-championships`.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        const rounds = parseInt(args[0]);
        let opponentIDs = [];
        for (let i = 0; i < rounds; i++) {
            opponentIDs[i] = carFiles[Math.floor(Math.random() * carFiles.length)].slice(0, 6);
        }

        opponentIDs = sortCars(opponentIDs, "cr", "ascending");
        const roster = [], upgrades = getAvailableTunes();
        for (let opponent of opponentIDs) {
            roster.push({
                carID: opponent,
                upgrade: upgrades[Math.floor(Math.random() * upgrades.length)],
                track: tracks[Math.floor(Math.random() * tracks.length)].slice(0, 6),
                reqs: {},
                rewards: {}
            });
        }
        await championshipModel.create({
            championshipID: `champ${totalChampionships + 1}`,
            name: championshipName,
            roster
        });
        await serverStatModel.updateOne({}, { "$inc": { totalChampionships: 1 } });

        const successMessage = new SuccessMessage({
            channel: message.channel,
            title: `Successfully created a new championship named ${championshipName}!`,
            desc: "You can now apply changes to the championship using `cd-editchampionship`.",
            author: message.author
        });
        return successMessage.sendMessage();
    }
};