"use strict";

const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { defaultChoiceTime } = require("../util/consts/consts.js");
const confirm = require("../util/functions/confirm.js");
const search = require("../util/functions/search.js");
const profileModel = require("../models/profileSchema.js");
const eventModel = require("../models/eventSchema.js");

module.exports = {
    name: "endevent",
    aliases: ["removeevent", "rmvevent"],
    usage: ["<event name>"],
    args: 1,
    category: "Events",
    description: "Ends an ongoing event.",
    async execute(message, args) {
        const events = await eventModel.find();
        const eventName = args.map(arg => arg.toLowerCase());
        await new Promise(resolve => resolve(search(message, eventName, events, "event")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                let [result, currentMessage] = response;
                await endEvent(result, currentMessage);
            })
            .catch(error => {
                throw error;
            });

        async function endEvent(event, currentMessage) {
            const { settings } = await profileModel.findOne({ userID: message.author.id });
            const confirmationMessage = new InfoMessage({
                channel: message.channel,
                title: `Are you sure you want to end the ${event.name} event?`,
                desc: `You have been given ${defaultChoiceTime / 1000} seconds to consider.`,
                author: message.author
            });
            await confirm(message, confirmationMessage, acceptedFunction, settings.buttonstyle, currentMessage);

            async function acceptedFunction(currentMessage) {
                await eventModel.deleteOne({ eventID: event.eventID });
                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully ended the ${event.name} event!`,
                    author: message.author,
                });
                await successMessage.sendMessage({ currentMessage });
                return successMessage.removeButtons();
            }
        }
    }
};