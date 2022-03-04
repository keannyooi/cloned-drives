"use strict";

const { readdirSync } = require("fs");
const carFiles = readdirSync('./src/cars').filter(file => file.endsWith('.json'));
const tracksets = readdirSync("./src/tracks").filter(file => file.endsWith('.json'));
const { SuccessMessage, ErrorMessage } = require("../util/classes/classes.js");
const sortCars = require("../util/functions/sortCars.js");
const eventModel = require("../models/eventSchema.js");
const serverStatModel = require("../models/serverStatSchema.js");

module.exports = {
    name: "createevent",
    aliases: ["newevent"],
    usage: ["<number of rounds> <event name>"],
    args: 2,
    category: "Events",
    description: "Creates an event with the name of your choice.",
    async execute(message, args) {
        const { totalEvents } = await serverStatModel.findOne({});
        const events = await eventModel.find();
        const eventName = args.splice(1, args.length).join(" ");
        if (isNaN(args[0]) || parseInt(args[0]) < 1 || parseInt(args[0]) > 30) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, round amount provided is either not a number or not supported.",
                desc: "The number of rounds in an event is restricted to 1 ~ 30 rounds.",
                author: message.author
            }).displayClosest(args[0]);
            return errorMessage.sendMessage();
        }
        if (events.find(event => event.name === eventName) !== undefined) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, event name already taken.",
                desc: "Check the list of events using the command `cd-events`.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }

        const rounds = parseInt(args[0]);
        let opponentIDs = [];
        for (let i = 0; i < rounds; i++) {
            opponentIDs[i] = carFiles[Math.floor(Math.random() * carFiles.length)].slice(0, 6);
        }

        opponentIDs = sortCars(opponentIDs, "rq", "ascending");
        const roster = [], upgrades = ["000", "333", "666", "699", "969", "996"];
        for (let opponent of opponentIDs) {
            roster.push({
                car: opponent,
                upgrade: upgrades[Math.floor(Math.random() * upgrades.length)],
                trackset: tracksets[Math.floor(Math.random() * tracksets.length)],
                reqs: {},
                reward: {}
            });
        }

        await eventModel.create({
            eventID: totalEvents + 1,
            name: eventName,
            roster
        });

        const successMessage = new SuccessMessage({
            channel: message.channel,
            title: `Successfully created a new event named ${eventName}!`,
            desc: "You can now apply changes to the event using `cd-editevent`.",
            author: message.author
        });
        return successMessage.sendMessage();
    }
};