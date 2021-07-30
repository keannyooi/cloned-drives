/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/
const Discord = require("discord.js-light");
const disbut = require("discord-buttons");

module.exports = {
    name: "reset",
    aliases: ["rs", "noneandquitthegame"],
    usage: "<username> <what to reset>",
    args: 2,
    category: "Admin",
    description: "Resets your stats.",
    async execute(message, args) {
        const starterCars = ["honda s2000 (1999).json", "peugeot 405 mi16 (1989).json", "range rover county (1989).json", "nissan leaf (2010).json", "de tomaso mangusta (1967).json"];
        const filter = response => {
            return response.author.id === message.author.id;
        };

        if (message.mentions.users.first()) {
            if (!message.mentions.users.first().bot) {
                noneAndQuitTheGame(message.mentions.users.first());
            } else {
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                        format: "png",
                        dynamic: true
                    }))
                    .setTitle("Error, user requested is a bot.")
                    .setDescription("Bots can't play Cloned Drives.")
                    .setTimestamp();
                return message.channel.send(errorMessage);
            }
        } else {
            let userName = args[0].toLowerCase();
            let userList = [];
            message.guild.members.cache.forEach(User => {
                if ((User.displayName.toLowerCase().includes(userName) || User.user.username.toLowerCase().includes(userName)) && !User.user.bot) {
                    userList.push(User.user);
                }
            });

            if (userList.length > 1) {
                let textList = "";
                for (i = 1; i <= userList.length; i++) {
                    textList += `${i} - ${userList[i - 1].tag}\n`;
                }

                if (textList.length > 2048) {
                    message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                    const errorMessage = new Discord.MessageEmbed()
                        .setColor("#fc0303")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({
                            format: "png",
                            dynamic: true
                        }))
                        .setTitle("Error, too many search results.")
                        .setDescription("Due to Discord's embed limitations, the bot isn't able to show the full list of search results. Try again with a more specific keyword.")
                        .addField("Total Characters in List", `\`${textList.length}\` > \`2048\``)
                        .setTimestamp();
                    return message.channel.send(errorMessage);
                }

                const infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                        format: "png",
                        dynamic: true
                    }))
                    .setTitle("Multiple users found, please type one of the following.")
                    .setDescription(textList)
                    .setTimestamp();

                message.channel.send(infoScreen).then(currentMessage => {
                    message.channel.awaitMessages(filter, {
                            max: 1,
                            time: 30000,
                            errors: ["time"]
                        })
                        .then(collected => {
                            collected.first().delete();
                            if (isNaN(collected.first().content) || parseInt(collected.first().content) > userList.length || parseInt(collected.first().content) < 1) {
                                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                const errorMessage = new Discord.MessageEmbed()
                                    .setColor("#fc0303")
                                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                        format: "png",
                                        dynamic: true
                                    }))
                                    .setTitle("Error, invalid integer provided.")
                                    .setDescription("It looks like your response was either not a number or not part of the selection.")
                                    .addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${userList.length})`)
                                    .setTimestamp();
                                return currentMessage.edit(errorMessage);
                            } else {
                                noneAndQuitTheGame(userList[parseInt(collected.first().content) - 1], currentMessage);
                            }
                        })
                        .catch(() => {
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                    format: "png",
                                    dynamic: true
                                }))
                                .setTitle("Action cancelled automatically.")
                                .setTimestamp();
                            return currentMessage.edit(cancelMessage);
                        });
                });
            } else if (userList.length > 0) {
                noneAndQuitTheGame(userList[0]);
            } else {
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                        format: "png",
                        dynamic: true
                    }))
                    .setTitle("Error, 404 user not found.")
                    .setDescription("It looks like this user isn't in this server.")
                    .addField("Keywords Received", `\`${userName}\``)
                    .setTimestamp();
                return message.channel.send(errorMessage);
            }
        }

        async function noneAndQuitTheGame(user, currentMessage) {
            const settings = await db.get(`acc${message.author.id}.settings`);
            const buttonFilter = (button) => {
                return button.clicker.user.id === message.author.id;
            };
            let reset = args[1].toLowerCase(),
                yse, nop;
            if (settings.buttonstyle === "classic") {
                yse = new disbut.MessageButton()
                    .setStyle("grey")
                    .setEmoji("✅")
                    .setID("yse");
                nop = new disbut.MessageButton()
                    .setStyle("grey")
                    .setEmoji("❎")
                    .setID("nop");
            } else {
                yse = new disbut.MessageButton()
                    .setStyle("green")
                    .setLabel("Yes!")
                    .setID("yse");
                nop = new disbut.MessageButton()
                    .setStyle("red")
                    .setLabel("No!")
                    .setID("nop");
            }
            let row = new disbut.MessageActionRow().addComponents(yse, nop);
            let confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setThumbnail(user.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTimestamp();

            switch (reset) {
                case "money":
                    confirmationMessage.setTitle(`Are you sure you want to reset ${user.username}'s cash balance?`)
                    break;
                case "fusetokens":
                    confirmationMessage.setTitle(`Are you sure you want to reset ${user.username}'s fuse token balance?`)
                    break;
                case "trophies":
                    confirmationMessage.setTitle(`Are you sure you want to reset ${user.username}'s trophy balance?`)
                    break;
                case "garage":
                    confirmationMessage.setTitle(`Are you sure you want to reset ${user.username}'s garage? (WARNING: THIS ACTION IS IRREVERSIBLE)`)
                    break;
                case "all":
                    confirmationMessage.setTitle(`Are you sure you want to reset all of ${user.username}'s data? (WARNING: THIS ACTION IS IRREVERSIBLE)`)
                    break;
                default:
                    message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                    const errorScreen = new Discord.MessageEmbed()
                        .setColor("#fc0303")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({
                            format: "png",
                            dynamic: true
                        }))
                        .setTitle("Error, reset criteria selected not found.")
                        .setDescription(`Here is a list of reset criterias. 
										\`money\` - Resets the user's money balance to 0.
										\`fusetokens\` - Resets the user's fuse token balance to 0.
										\`trophies\` - Resets the user's trophy balance to 0.
										\`garage\` - Resets the user's garage to the five starter cars.
										\`all\` - Performs a total data wipe for the user.`)
                        .addField("Criteria Received", `\`${reset}\``)
                        .setTimestamp();
                    return message.channel.send(errorScreen);
            }

            let reactionMessage, processed = false;
            if (currentMessage) {
                reactionMessage = await currentMessage.edit({
                    embed: confirmationMessage,
                    component: row
                });
            } else {
                reactionMessage = await message.channel.send({
                    embed: confirmationMessage,
                    component: row
                });
            }

            const collector = reactionMessage.createButtonCollector(buttonFilter, {
                time: 10000
            });
            collector.on("collect", async button => {
                if (!processed) {
                    processed = true;
                    switch (button.id) {
                        case "yse":
                            let infoScreen, newGarage = [];
                            switch (reset) {
                                case "money":
                                    await message.client.db.set(`acc${user.id}.money`, 0);
                                    infoScreen = new Discord.MessageEmbed()
                                        .setColor("#03fc24")
                                        .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                            format: "png",
                                            dynamic: true
                                        }))
                                        .setThumbnail(user.displayAvatarURL({
                                            format: "png",
                                            dynamic: true
                                        }))
                                        .setTitle(`Successfully reset ${user.username}'s money balance!`)
                                        .setTimestamp();
                                    break;
                                case "fusetokens":
                                    await message.client.db.set(`acc${user.id}.fuseTokens`, 0);
                                    infoScreen = new Discord.MessageEmbed()
                                        .setColor("#03fc24")
                                        .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                            format: "png",
                                            dynamic: true
                                        }))
                                        .setThumbnail(user.displayAvatarURL({
                                            format: "png",
                                            dynamic: true
                                        }))
                                        .setTitle(`Successfully reset ${user.username}'s fuse token balance!`)
                                        .setTimestamp();
                                    break;
                                case "trophies":
                                    await message.client.db.set(`acc${user.id}.trophies`, 0);
                                    infoScreen = new Discord.MessageEmbed()
                                        .setColor("#03fc24")
                                        .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                            format: "png",
                                            dynamic: true
                                        }))
                                        .setThumbnail(user.displayAvatarURL({
                                            format: "png",
                                            dynamic: true
                                        }))
                                        .setTitle(`Successfully reset ${user.username}'s trophy balance!`)
                                        .setTimestamp();
                                    break;
                                case "garage":
                                    for (let i = 0; i < 5; i++) {
                                        newGarage[i] = {
                                            carFile: starterCars[i],
                                            "000": 1,
                                            "333": 0,
                                            "666": 0,
                                            "996": 0,
                                            "969": 0,
                                            "699": 0
                                        };
                                    }
                                    await message.client.db.set(`acc${user.id}.garage`, newGarage);
                                    infoScreen = new Discord.MessageEmbed()
                                        .setColor("#03fc24")
                                        .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                            format: "png",
                                            dynamic: true
                                        }))
                                        .setThumbnail(user.displayAvatarURL({
                                            format: "png",
                                            dynamic: true
                                        }))
                                        .setTitle(`Successfully reset ${user.username}'s garage!`)
                                        .setTimestamp();
                                    break;
                                case "all":
                                    for (let i = 0; i < 5; i++) {
                                        newGarage[i] = {
                                            carFile: starterCars[i],
                                            "000": 1,
                                            "333": 0,
                                            "666": 0,
                                            "996": 0,
                                            "969": 0,
                                            "699": 0
                                        };
                                    }
                                    await message.client.db.set(`acc${user.id}`, {
                                        money: 0,
                                        fuseTokens: 0,
                                        trophies: 0,
                                        garage: newGarage,
                                        decks: [],
                                        campaignProgress: {
                                            chapter: 0,
                                            part: 1,
                                            race: 1
                                        },
                                        unclaimedRewards: {
                                            money: 0,
                                            fuseTokens: 0,
                                            trophies: 0,
                                            cars: [],
                                            packs: []
                                        },
                                        settings: {
                                            enablegraphics: true,
                                            senddailynotifs: false,
                                            filtercarlist: true,
                                            filtergarage: true,
                                            showbmcars: false,
                                            unitpreference: "british",
                                            sortingorder: "descending",
                                            buttonstyle: "default",
                                            shortenedlists: false
                                        }
                                    });
                                    infoScreen = new Discord.MessageEmbed()
                                        .setColor("#03fc24")
                                        .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                            format: "png",
                                            dynamic: true
                                        }))
                                        .setThumbnail(user.displayAvatarURL({
                                            format: "png",
                                            dynamic: true
                                        }))
                                        .setTitle(`Successfully reset ${user.username}'s data!`)
                                        .setTimestamp();
                                    break;
                                default:
                                    break;
                            }
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            return reactionMessage.edit({
                                embed: infoScreen,
                                component: null
                            });
                        case "nop":
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                    format: "png",
                                    dynamic: true
                                }))
                                .setThumbnail(user.displayAvatarURL({
                                    format: "png",
                                    dynamic: true
                                }))
                                .setTitle("Action cancelled.")
                                .setTimestamp();
                            return reactionMessage.edit({
                                embed: cancelMessage,
                                component: null
                            });
                        default:
                            break;
                    }
                }
            });
            collector.on("end", () => {
                if (!processed) {
                    message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
                    const cancelMessage = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({
                            format: "png",
                            dynamic: true
                        }))
                        .setThumbnail(user.displayAvatarURL({
                            format: "png",
                            dynamic: true
                        }))
                        .setTitle("Action cancelled automatically.")
                        .setTimestamp();
                    return reactionMessage.edit({
                        embed: cancelMessage,
                        component: null
                    });
                }
            });
        }
    }
}