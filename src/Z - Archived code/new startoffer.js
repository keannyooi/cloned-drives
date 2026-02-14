"use strict";

const bot = require("../config/config.js");
const { DateTime } = require("luxon");
const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { currentOffersChannelID, defaultChoiceTime } = require("../util/consts/consts.js");
const confirm = require("../util/functions/confirm.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const offerModel = require("../models/offerSchema.js");

module.exports = {
    name: "startoffer",
    aliases: ["launchoffer"],
    usage: ["<offer name>"],
    args: 1,
    category: "Events",
    description: "Starts an inactive offer.",
    async execute(message, args) {
        try {
            const offers = await offerModel.find({ isActive: false });
            const query = args.map(arg => arg.toLowerCase());
            const searchResults = await search(message, query, offers, "offer");

            if (!Array.isArray(searchResults)) return;
            await startOffer(searchResults[0], searchResults[1]);
        } catch (error) {
            console.error("Error in executing startoffer:", error);
        }

        async function startOffer(offer, currentMessage) {
            try {
                const { settings } = await profileModel.findOne({ userID: message.author.id });

                const confirmationMessage = new InfoMessage({
                    channel: message.channel,
                    title: `Are you sure you want to start the ${offer.name} offer?`,
                    desc: `You have ${defaultChoiceTime / 1000} seconds to decide.`,
                    author: message.author,
                });

                await confirm(message, confirmationMessage, () => activateOffer(offer, currentMessage), settings.buttonstyle, currentMessage);
            } catch (error) {
                console.error("Error in startOffer:", error);
            }
        }

        async function activateOffer(offer, currentMessage) {
            try {
                const playerDatum = await profileModel.find({ "settings.sendoffernotifs": true });
                const currentOffersChannel = await bot.homeGuild.channels.fetch(currentOffersChannelID);

                // Activate the offer
                offer.isActive = true;
                if (offer.deadline.length < 9) {
                    offer.deadline = DateTime.now().plus({ days: parseInt(offer.deadline) }).toISO();
                }

                // Notify channel
                await currentOffersChannel.send(`**The ${offer.name} offer has officially gone up for sale!**`);

                // Notify eligible players
                for (const { userID } of playerDatum) {
                    try {
                        const user = await bot.homeGuild.members.fetch(userID);
                        if (user) {
                            await user.send(`**Notification: The ${offer.name} offer has officially gone up for sale!**`);
                        }
                    } catch (userError) {
                        console.log(`Unable to notify user ${userID}:`, userError);
                    }
                }

                // Update the offer in the database
                await offerModel.updateOne({ offerID: offer.offerID }, offer);

                // Send success message
                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully started the ${offer.name} offer!`,
                    author: message.author,
                });
                return successMessage.sendMessage({ currentMessage });
            } catch (error) {
                console.error("Error in activating offer:", error);
            }
        }
    },
};
