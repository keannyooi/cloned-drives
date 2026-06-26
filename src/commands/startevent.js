"use strict";

const bot = require("../config/config.js");
const { DateTime } = require("luxon");
const { SuccessMessage, InfoMessage } = require("../util/classes/classes.js");
const { currentEventsChannelID, defaultChoiceTime } = require("../util/consts/consts.js");
const confirm = require("../util/functions/confirm.js");
const search = require("../util/functions/search.js");
const generateEventGraphic = require("../util/functions/eventGraphic.js");
const notifyEventStart = require("../util/functions/notifyEventStart.js");
const profileModel = require("../models/profileSchema.js");
const eventModel = require("../models/eventSchema.js");

// 🔧 Manual dev switch to disable DMs
const DEV_MODE = false;

module.exports = {
    name: "startevent",
    aliases: ["launchevent"],
    usage: ["<event name>"],
    args: 1,
    category: "Events",
    description: "Starts an inactive event.",
    async execute(message, args) {
        const events = await eventModel.find({ isActive: false });
        let query = args.map(i => i.toLowerCase());

        await new Promise(resolve => resolve(search(message, query, events, "event")))
            .then(async (response) => {
                if (!Array.isArray(response)) return;
                await startEvent(...response);
            })
            .catch(error => {
                throw error;
            });

        async function startEvent(event, currentMessage) {
            const { settings } = await profileModel.findOne({ userID: message.author.id });
            const confirmationMessage = new InfoMessage({
                channel: message.channel,
                title: `Are you sure you want to start the ${event.name} event?`,
                desc: `You have been given ${defaultChoiceTime / 1000} seconds to consider.`,
                author: message.author
            });

            await confirm(message, confirmationMessage, acceptedFunction, settings.buttonstyle, currentMessage);

            async function acceptedFunction(currentMessage) {
                const currentEventsChannel = await bot.homeGuild.channels.fetch(currentEventsChannelID);
                event.isActive = true;

                if (event.deadline.length < 9) {
                    event.deadline = DateTime.now().plus({ days: parseInt(event.deadline) }).toISO();
                }

                const attachment = await generateEventGraphic(event);

                const successMessage = new SuccessMessage({
                    channel: message.channel,
                    title: `Successfully started the ${event.name} event!`,
                    author: message.author,
                });

                await currentEventsChannel.send({
                    content: `**The ${event.name} event has officially started!**`,
                    files: [attachment]
                });

                await eventModel.updateOne({ eventID: event.eventID }, event);

                // ✅ Send success message IMMEDIATELY
                await successMessage.sendMessage({ attachment, currentMessage });

                // 🔕 Send DM notifications in background (non-blocking)
                if (!DEV_MODE) {
                    notifyEventStart(event.name).catch(err => {
                        console.error('[EVENT DMs] Error sending notifications:', err);
                    });
                } else {
                    profileModel.countDocuments({ "settings.sendeventnotifs": true })
                        .then(count => console.log(`[DEV_MODE] Skipping DM notifications for ${count} players.`));
                }
            }
        }
    }
};
