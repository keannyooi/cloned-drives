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
        const offers = await offerModel.find({ isActive: false });
        let query = args.map(i => i.toLowerCase());
        await new Promise(resolve => resolve(search(message, query, offers, "offer")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await startOffer(...response);
            })
            .catch(error => {
                throw error;
            });

        async function startOffer(offer, currentMessage) {
            const { settings } = await profileModel.findOne({ userID: message.author.id });
            const confirmationMessage = new InfoMessage({
                channel: message.channel,
                title: `Are you sure you want to start the ${offer.name} offer?`,
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
                const playerDatum = await profileModel.find({ "settings.sendoffernotifs": true });
                const currentOffersChannel = await bot.homeGuild.channels.fetch(currentOffersChannelID);
                offer.isActive = true;
                if (offer.deadline.length < 9) {
                    offer.deadline = DateTime.now().plus({ days: parseInt(offer.deadline[0]) }).toISO();
                }

                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully started the ${offer.name} offer!`,
                    author: message.author,
                });
                await currentOffersChannel.send(`**The ${offer.name} offer has officially gone up for sale!**`);
                for (let { userID } of playerDatum) {
                    let user = await bot.homeGuild.members.fetch(userID);
                    await user.send(`**Notification: The ${offer.name} offer has officially gone up for sale!**`)
				        .catch(() => console.log(`unable to send notification to user ${userID}`));
                }

                await offerModel.updateOne({ offerID: offer.offerID }, offer);
                return successMessage.sendMessage({ currentMessage });
            }
        }
    }
};