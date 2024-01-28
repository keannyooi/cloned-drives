"use strict";

const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { defaultChoiceTime } = require("../util/consts/consts.js");
const confirm = require("../util/functions/confirm.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const championshipModel = require("../models/championshipsSchema.js");

module.exports = {
    name: "endchampionship",
    aliases: ["removechampionship", "rmvchampionship"],
    usage: ["<championship name>"],
    args: 1,
    category: "Admin",
    description: "Ends an ongoing Championship.",
    async execute(message, args) {
        const championships = await championshipModel.find();
        const championshipName = args.map(arg => arg.toLowerCase());
        await new Promise(resolve => resolve(search(message, championshipName, championships, "championships")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await endChampionship(...response);
            })
            .catch(error => {
                throw error;
            });

        async function endChampionship(championship, currentMessage) {
            const { settings } = await profileModel.findOne({ userID: message.author.id });
            const confirmationMessage = new InfoMessage({
                channel: message.channel,
                title: `Are you sure you want to end the ${championship.name} championship?`,
                desc: `You have been given ${defaultChoiceTime / 1000} seconds to consider.`,
                author: message.author
            });
            try {
                await confirm(message, confirmationMessage, acceptedFunction, settings.buttonstyle, currentMessage);
            }
            catch (error) {
                throw error;
            }

            async function acceptedFunction(currentMessage) {
                const endChampionship = require("../util/functions/endChampionship.js");
                await endChampionship(championship);
                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully ended the ${championship.name} championship!`,
                    author: message.author,
                });
                await successMessage.sendMessage({ currentMessage });
                return successMessage.removeButtons();
            }
        }
    }
};