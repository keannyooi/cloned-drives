"use strict";

const { ButtonBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType: { Button } } = require("discord.js");
const { SuccessMessage, InfoMessage, ErrorMessage } = require("../util/classes/classes.js");
const { defaultWaitTime } = require("../util/consts/consts.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "settings",
    aliases: ["options"],
    usage: ["[setting id] [value] (more info is within the command itself)"],
    args: 0,
    category: "Configuration",
    description: "Configure settings here.",
    async execute(message, args) {
        let { settings } = await profileModel.findOne({ userID: message.author.id });

        if (!args[0]) {
            // const filter = (button) => button.user.id === message.author.id;
            let { infoMessage, row } = menu(), processing = false;
            let currentMessage = await infoMessage.sendMessage({ buttons: [row] });

            const collector = currentMessage.message.createMessageComponentCollector({ filter, time: defaultWaitTime, componentType: Button });
            collector.on("collect", async (interaction) => {
                console.log("hi");
                if (processing === false) {
                    processing = true;
                    switch (interaction.customId) {
                        case "categorySelect":
                            let backButton;
                            if (settings.buttonstyle === "classic") {
                                backButton = new ButtonBuilder()
                                    .setCustomId("back")
                                    .setEmoji("⬅️")
                                    .setStyle(Secondary);
                            }
                            else {
                                backButton = new ButtonBuilder()
                                    .setCustomId("back")
                                    .setLabel("Back")
                                    .setStyle(Primary);
                            }

                            infoMessage = new InfoMessage({
                                channel: message.channel,
                                title: "Settings",
                                desc: `Category Selected: \`${interaction.values[0]}\``,
                                author: message.author
                            });
                            row = new ActionRowBuilder().addComponents(backButton);

                            switch (interaction.values[0]) {
                                case "gameplay":
                                    infoMessage.editEmbed({
                                        fields: [
                                            {
                                                name: "Disable Graphics (ID: \`disablegraphics\`)",
                                                value: `Having this set to \`true\` skips through all bot-generated graphics. Perfect for faster loading times.
                                                **Value:** \`${settings.disablegraphics ?? false}\``,
                                                inline: true
                                            },
                                            {
                                                name: "Enable Daily Reward Notifications (ID: \`senddailynotifs\`)",
                                                value: `Having this set to \`true\` enables automated DM notifications when your daily reward can be claimed.
                                                **Value:** \`${settings.senddailynotifs ?? false}\``,
                                                inline: true
                                            },
                                            {
                                                name: "Enable Event Notifications (ID: \`sendeventnotifs\`)",
                                                value: `Having this set to \`true\` enables automated DM notifications when a new event goes live.
                                                **Value:** \`${settings.sendeventnotifs ?? false}\``,
                                                inline: true
                                            },
                                            {
                                                name: "Enable Limited Offer Notifications (ID: \`sendoffernotifs\`)",
                                                value: `Having this set to \`true\` enables automated DM notifications when a new offer is on sale.
                                                **Value:** \`${settings.senddoffernotifs ?? false}\``,
                                                inline: true
                                            },
                                            {
                                                name: "Enable Dealership Refresh Notifications (ID: \`senddealnotifs\`)",
                                                value: `Having this set to \`true\` enables automated DM notifications when the dealership refreshes.
                                                **Value:** \`${settings.senddealnotifs ?? false}\``,
                                                inline: true
                                            },
                                            {
                                                name: "Unit Preference (ID: \`unitpreference\`)",
                                                value: `Lets you choose the unit system of your preference. Graphics aren't affected by this setting. The game uses British units by default and you can switch to metric and imperial units.
                                                **Value:** \`${settings.unitpreference ?? "british"}\``,
                                                inline: true
                                            },
                                            {
                                                name: "Button Style (ID: \`buttonstyle\`)",
                                                value: `Lets you choose the button style of your preference. The \`default\` style gives a more modern look with Discord's new embed buttons while the \`classic\` style resembles old-school emoji buttons.
                                                **Value:** \`${settings.buttonstyle ?? "default"}\``,
                                                inline: true
                                            },
                                            {
                                                name: "Hide Own Car Stats Before Races (ID: \`hideownstats\`)",
                                                value: `Having this set to \`true\` hides all specifications of the car in your hand before a race. Useful for removing clutter if you're playing on mobile.
                                                **Value:** \`${settings.hideownstats ?? false}\``,
                                                inline: true
                                            }
                                        ]
                                    });
                                    break;
                                case "garage+list":
                                    infoMessage.editEmbed({
                                        fields: [
                                            {
                                                name: "Disable Filter for Garage (ID: \`disablegaragefilter\`)",
                                                value: `Having this set to \`true\` disables your current filter when viewing your (or other people's) garage.
                                                **Value:** \`${settings.disablegaragefilter ?? false}\``,
                                                inline: true
                                            },
                                            {
                                                name: "Disable Filter for Car List (ID: \`disablecarlistfilter\`)",
                                                value: `Having this set to \`true\` disables your current filter when viewing the car list.
                                                **Value:** \`${settings.disablecarlistfilter ?? false}\``,
                                                inline: true
                                            },
                                            {
                                                name: "Sorting Order (ID: \`sortorder\`)",
                                                value: `Lets you choose to sort either by ascending or descending.
                                                **Value:** \`${settings.sortorder ?? "descending"}\``,
                                                inline: true
                                            },
                                            {
                                                name: "Amount of Items Listed Per Page (ID: \`listamount\`)",
                                                value: `Lets you choose the amount of items listed per page. Values are restricted between \`5\` and \`10\`.
                                                **Value:** \`${settings.listamount ?? 10}\``,
                                                inline: true
                                            },
                                            {
                                                name: "Filter Logic (ID: \`filterlogic\`)",
                                                value: `\`and\` logic narrows the filter selection when more criterias are added while \`or\` logic widens it.
                                                **Value:** \`${settings.filterlogic ?? "and"}\``,
                                                inline: true
                                            }
                                        ]
                                    });
                                    break;
                                case "profile":
                                    infoMessage.editEmbed({
                                        fields: [
                                            {
                                                name: "About Me (ID: \`bio\`)",
                                                value: "Tells people who you are when doing \`cd-stats\`.",
                                                inline: true
                                            }
                                        ]
                                    });
                                    break;
                                default:
                                    break;
                            }

                            await infoMessage.sendMessage({ currentMessage, buttons: [row] });
                            break;
                        case "back":
                            ({ infoMessage, row } = menu());
                            await infoMessage.sendMessage({ currentMessage, buttons: [row] });
                            break;
                        default:
                            break;
                    }
                    await interaction.deferUpdate();
                    processing = false;
                }
            });
            collector.on("end", () => {
                return infoMessage.removeButtons();
            });
        }
        else {
            let infoMessage;
            const setting = args[0].toLowerCase();
            if (!args[1]) {
                let errorMessage = new ErrorMessage({
                    channel: message.channel,
                    title: "Error, argument not provided.",
                    desc: "You are expected to provide a value after the setting ID. Refer to the help section by running `cd-help settings`.",
                    author: message.author
                });
                return errorMessage.sendMessage();
            }
            const argument = args[1].toLowerCase();

            switch (setting) {
                case "disablegraphics":
                case "senddailynotifs":
                case "sendeventnotifs":
                case "sendoffernotifs":
                case "senddealnotifs":
                case "disablecarlistfilter":
                case "disablegaragefilter":
                case "hideownstats":
                    if (argument === "true") {
                        if (setting.startsWith("send")) {
                            let msg = "";
                            switch (setting) {
                                case "senddailynotifs":
                                    msg = "You have activated daily reward notifications! Notifications will be sent here.";
                                    break;
                                case "sendeventnotifs":
                                    msg = "You have activated event notifications! Notifications will be sent here.";
                                    break;
                                case "sendoffernotifs":
                                    msg = "You have activated offer notifications! Notifications will be sent here.";
                                    break;
                                default:
                                    break;
                            }
                            message.author.send(msg)
                                .catch(() => {
                                    let errorMessage = new ErrorMessage({
                                        channel: message.channel,
                                        title: "Error, it looks like I can't DM you.",
                                        desc: "This notification system requires the bot to have access to your DMs. Try enabling **Allow direct messages from server members**.",
                                        author: message.author
                                    });
                                    return errorMessage.sendMessage();
                                });
                        }
                        settings[setting] = JSON.parse(argument);
                    }
                    else if (argument === "false") {
                        delete settings[setting];
                    }
                    else {
                        let errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, argument provided is not a boolean.",
                            desc: "Booleans only have 2 states, `true` or `false`.",
                            author: message.author
                        }).displayClosest(argument);
                        return errorMessage.sendMessage();
                    }

                    infoMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully set the \`${setting}\` setting to \`${argument}\`!`,
                        author: message.author
                    });
                    break;
                case "unitpreference":
                    if (argument === "british" || argument === "imperial" || argument === "metric") {
                        if (argument === "british") {
                            delete settings[setting];
                        }
                        else {
                            settings[setting] = argument;
                        }

                        infoMessage = new SuccessMessage({
                            channel: message.channel,
                            title: `Successfully set your unit system of choice to the \`${argument}\` system!`,
                            author: message.author
                        });
                    }
                    else {
                        let errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, argument provided is not a valid unit system.",
                            desc: "This game supports `british`, `imperial` (US) and `metric` (SI) unit systems only.",
                            author: message.author
                        }).displayClosest(argument);
                        return errorMessage.sendMessage();
                    }
                    break;
                case "sortorder":
                    if (argument === "ascending") {
                        settings[setting] = argument;
                    }
                    else if (argument === "descending") {
                        delete settings[setting];
                    }
                    else {
                        let errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, argument provided is invalid.",
                            desc: "You are expected to provide either `ascending` or `descending`.",
                            author: message.author
                        }).displayClosest(argument);
                        return errorMessage.sendMessage();
                    }

                    infoMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully set the sorting order to \`${argument}\`!`,
                        author: message.author
                    });
                    break;
                case "filterlogic":
                    if (argument === "or") {
                        settings[setting] = argument;
                    }
                    else if (argument === "and") {
                        delete settings[setting];
                    }
                    else {
                        let errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, argument provided is invalid.",
                            desc: "You are expected to provide either `and` or `or`.",
                            author: message.author
                        }).displayClosest(argument);
                        return errorMessage.sendMessage();
                    }

                    infoMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully set the filter logic to \`${argument}\`!`,
                        author: message.author
                    });
                    break;
                case "buttonstyle":
                    if (argument === "classic") {
                        settings[setting] = argument;
                    }
                    else if (argument === "default") {
                        delete settings[setting];
                    }
                    else {
                        let errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, argument provided is invalid.",
                            desc: "There are 2 styles to choose from: `default` and `classic`.",
                            author: message.author
                        }).displayClosest(argument);
                        return errorMessage.sendMessage();
                    }

                    infoMessage = new SuccessMessage({
                        channel: message.channel,
                        title: `Successfully set the button style to \`${argument}\`!`,
                        author: message.author
                    });
                    break;
                case "listamount":
                    if (!isNaN(argument)) {
                        let amount = parseInt(argument);
                        if (amount === 10) {
                            delete settings[setting];
                        }
                        else if (amount >= 5 && amount < 10) {
                            settings[setting] = amount;
                        }
                        else {
                            let errorMessage = new ErrorMessage({
                                channel: message.channel,
                                title: "Error, argument provided is out of range.",
                                desc: "The value should be a number between `5` and `10`.",
                                author: message.author
                            }).displayClosest(amount);
                            return errorMessage.sendMessage();
                        }

                        infoMessage = new SuccessMessage({
                            channel: message.channel,
                            title: `Successfully set the amount of items per page to \`${amount}\`!`,
                            author: message.author
                        });
                    }
                    else {
                        let errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, argument provided is not a number.",
                            desc: "The value should be a number between `5` and `10`.",
                            author: message.author
                        }).displayClosest(argument);
                        return errorMessage.sendMessage();
                    }
                    break;
                case "bio":
                    let bio = args.slice(1, args.length).join(" ").trim();
                    if (bio.length > 1024) {
                        let errorMessage = new ErrorMessage({
                            channel: message.channel,
                            title: "Error, bio is too long.",
                            desc: "Due to Discord's embed limitations, your bio may not be more than `1024` characters long.",
                            author: message.author,
                            fields: [{ name: "Amount of Characters in Bio", value: `\`${bio.length}\` (> 1024)` }]
                        });
                        return errorMessage.sendMessage();
                    }

                    settings[setting] = bio;
                    infoMessage = new SuccessMessage({
                        channel: message.channel,
                        title: "Successfully updated your About Me!",
                        desc: bio,
                        author: message.author
                    });
                    break;
                default:
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, setting provided not found.",
                        desc: `Here is a list of setting IDs. 
                        \`disablegraphics\` - Disable bot-generated graphics. Provide a boolean (\`true\` or \`false\`) after that.
                        \`senddailynotifs\` - Enable automated daily reward notifications. Provide a boolean (\`true\` or \`false\`) after that. Remember to enable \`DMs from server members\` for this to work.
                        \`sendeventnotifs\` - Enable automated event notifications. Provide a boolean (\`true\` or \`false\`) after that. Remember to enable \`DMs from server members\` for this to work.
                        \`sendoffernotifs\` - Enable automated offer notifications. Provide a boolean (\`true\` or \`false\`) after that. Remember to enable \`DMs from server members\` for this to work.
                        \`senddealnotifs\` - Enable automated dealership refresh notifications. Provide a boolean (\`true\` or \`false\`) after that. Remember to enable \`DMs from server members\` for this to work.
                        \`disablecarlistfilter\` - Disable cd-carlist filtering. Provide a boolean (\`true\` or \`false\`) after that.
                        \`disablegaragefilter\` - Disable garage filtering. Provide a boolean (\`true\` or \`false\`) after that.
                        \`unitpreference\` - Choose a unit system of your liking. Provide a the name of a unit system (\`british\`, \`imperial\` or \`metric\`) after that.
                        \`sortorder\` - Choose the order that items are sorted in. Provide either \`ascending\` or \`descending\` after that.
                        \`filterlogic\` - Choose the preferred filter logic. Provide \`and\` or \`or\` after that.
                        \`buttonstyle\` - Choose the order that items are sorted in. Provide either \`default\` or \`classic\` after that.
                        \`listamount\` - Choose the amount of items listed per page. Provide a number between \`5\` and \`10\` after that.
                        \`bio\` - Edits the text in your About Me.`,
                        author: message.author
                    }).displayClosest(setting);
                    return errorMessage.sendMessage();
            }

            await profileModel.updateOne({ userID: message.author.id }, { settings });
            return infoMessage.sendMessage();
        }

        function menu() {
            const dropdownList = new StringSelectMenuBuilder()
                .setCustomId("categorySelect")
                .setPlaceholder("Select a category...")
                .addOptions([
                    {
                        label: "Gameplay Settings",
                        description: "Affects general gameplay.",
                        value: "gameplay"
                    },
                    {
                        label: "Garage + List Settings",
                        description: "Affects the garage and list commands.",
                        value: "garage+list"
                    },
                    {
                        label: "Profile Settings",
                        description: "Affects your profile.",
                        value: "profile"
                    }
                ]);
            
            let row = new ActionRowBuilder({ components: [dropdownList] });
            let infoMessage = new InfoMessage({
                channel: message.channel,
                title: "Settings",
                desc: "Choose a settings category to view.",
                author: message.author
            });

            return { row, infoMessage };
        }
    }
};