"use strict";

const { MessageButton, MessageActionRow, MessageSelectMenu } = require("discord.js");
const { SuccessMessage, InfoMessage, ErrorMessage } = require("./sharedfiles/classes.js");
const { defaultWaitTime } = require("./sharedfiles/consts.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
    name: "settings",
    usage: "<(optional) name of deck>",
    args: 0,
    category: "Configuration",
    description: "Configure settings here.",
    async execute(message, args) {
        let { settings } = await profileModel.findOne({ userID: message.author.id });

        if (!args[0]) {
            const filter = (button) => button.user.id === message.author.id;
            let { infoMessage, row } = menu(), processing = false;
            let currentMessage = await infoMessage.sendMessage({ buttons: [row] });

            const collector = message.channel.createMessageComponentCollector({ filter, time: defaultWaitTime });
            collector.on("collect", async (button) => {
                if (processing === false) {
                    processing = true;
                    switch (button.customId) {
                        case "category_select":
                            let backButton;
                            if (settings.buttonstyle === "classic") {
                                backButton = new MessageButton({
                                    emoji: "⬅️",
                                    style: "SECONDARY",
                                    customId: "back"
                                });
                            }
                            else {
                                backButton = new MessageButton({
                                    label: "Back",
                                    style: "PRIMARY",
                                    customId: "back"
                                });
                            }
    
                            infoMessage = new InfoMessage({
                                channel: message.channel,
                                title: "Settings",
                                desc: `Category Selected: \`${button.values[0]}\``,
                                author: message.author
                            });
                            row = new MessageActionRow({ components: [backButton] });
    
                            switch (button.values[0]) {
                                case "Gameplay":
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
                                            }
                                        ]
                                    });
                                    break;
                                case "Garage + List":
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
                                                name: "Hide Black Market Cars (ID: \`hidebmcars\`)",
                                                value: `(This is WIP, doesn't do anything currently)
                                                **Value:** \`${settings.hidebmcars ?? false}\``,
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
                                            }
                                        ]
                                    });
                                    break;
                                case "Profile":
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
                    await button.deferUpdate();
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
                case "disablecarlistfilter":
                case "disablegaragefilter":
                case "hidebmcars":
                    if (argument === "true") {
                        if (setting === "senddailynotifs") {
                            message.author.send("You have activated daily reward notifications! Notifications will be sent here.")
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
                    if (bio > 1024) {
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
                        \`senddailynotifs\` - Eable automated daily reward notifications. Provide a boolean (\`true\` or \`false\`) after that. Remember to enable \`DMs from server members\` for this to work.
                        \`disablecarlistfilter\` - Disable cd-carlist filtering. Provide a boolean (\`true\` or \`false\`) after that.
                        \`disablegaragefilter\` - Disable garage filtering. Provide a boolean (\`true\` or \`false\`) after that.
                        \`hidebmcars\` - Disable black market car visibility. Provide a boolean (\`true\` or \`false\`) after that.
                        \`unitpreference\` - Choose a unit system of your liking. Provide a the name of a unit system (\`british\`, \`imperial\` or \`metric\`) after that.
                        \`sortorder\` - Choose the order that items are sorted in. Provide either \`ascending\` or \`descending\` after that.
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
            const dropdownList = new MessageSelectMenu({
                customId: "category_select",
                placeholder: "Select a category...",
                options: [
                    {
                        label: "Gameplay Settings",
                        description: "Affects general gameplay.",
                        value: "Gameplay"
                    },
                    {
                        label: "Garage + List Settings",
                        description: "Affects the garage and list commands.",
                        value: "Garage + List"
                    },
                    {
                        label: "Profile Settings",
                        description: "Affects your profile.",
                        value: "Profile"
                    }
                ]
            });
            let row = new MessageActionRow({ components: [dropdownList] });
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