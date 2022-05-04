"use strict";

const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { defaultChoiceTime } = require("../util/consts/consts.js");
const confirm = require("../util/functions/confirm.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const offerModel = require("../models/offerSchema.js");

module.exports = {
    name: "endoffer",
    aliases: ["removeoffer", "rmvoffer"],
    usage: ["<offer name>"],
    args: 1,
    category: "Events",
    description: "Ends an ongoing offer.",
    async execute(message, args) {
        const offers = await offerModel.find();
        let query = args.map(i => i.toLowerCase());
        await new Promise(resolve => resolve(search(message, query, offers, "offer")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await endOffer(...response);
            })
            .catch(error => {
                throw error;
            });

        async function endOffer(offer, currentMessage) {
            const { settings } = await profileModel.findOne({ userID: message.author.id });
            const confirmationMessage = new InfoMessage({
                channel: message.channel,
                title: `Are you sure you want to end the ${offer.name} offer?`,
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
                const endOffer = require("../util/functions/endOffer.js");
                await endOffer(offer);
                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully ended the ${offer.name} offer!`,
                    author: message.author,
                });
                await successMessage.sendMessage({ currentMessage });
                return successMessage.removeButtons();
            }
        }
    }
};