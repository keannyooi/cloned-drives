const Discord = require("discord.js-light");
const fs = require("fs");
const packFiles = fs.readdirSync("./commands/packs").filter(file => file.endsWith('.json'));

module.exports = {
    name: "store",
    aliases: ["shop"],
    usage: "(optional) <page number>",
    args: false,
    adminOnly: false,
    description: "Shows all the packs that are available for purchase in list form.",
    execute(message, args) {
        const pageLimit = 25;
        const moneyEmoji = message.guild.emojis.cache.find(emoji => emoji.name === "money");
        const filter = (reaction, user) => {
            return (reaction.emoji.name === "⬅️" || reaction.emoji.name === "➡️") && user.id === message.author.id;
        };
        var reactionIndex = 0;
        var page;

        if (!args.length) {
            page = 1;
        }
        else {
            if (isNaN(args[0])) {
                const errorScreen = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, invalid integer provided.")
                    .setDescription("It looks like the page number you requested is not a number.")
                    .setTimestamp();
                return message.channel.send(errorScreen);
            }
            else {
                page = args[0];
            }
        }
        const totalPages = Math.ceil(packFiles.length / pageLimit);

        if (page < 0 || totalPages < page) {
            const errorScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, page number requested invalid.")
                .setDescription(`The pack list ends at page ${totalPages}.`)
                .setTimestamp();
            return message.channel.send(errorScreen);
        }

        const infoScreen = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle("Pack Shop")
            .setDescription("React with ⬅️ or ➡️ to navigate through pages.")
            .setFooter(`Page ${page} of ${totalPages}`)
            .setTimestamp();
        packDisplay(infoScreen, page);

        message.channel.send(infoScreen).then(infoMessage => {
            console.log(reactionIndex);
            switch (reactionIndex) {
                case 0:
                    break;
                case 1:
                    infoMessage.react("➡️");
                    break;
                case 2:
                    infoMessage.react("⬅️");
                    break;
                case 3:
                    infoMessage.react("⬅️");
                    infoMessage.react("➡️");
                    break;
                default:
                    break;
            }

            const collector = infoMessage.createReactionCollector(filter, { time: 60000 });
            collector.on("collect", reaction => {
                if (reaction.emoji.name === "⬅️") {
                    page -= 1;
                }
                else if (reaction.emoji.name === "➡️") {
                    page += 1;
                }
                carDisplay(page);
                infoMessage.reactions.removeAll();

                const totalPages = Math.ceil(packFiles.length / pageLimit);
                const infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Pack Shop")
                    .setDescription("React with ⬅️ or ➡️ to navigate through pages.")
                    .setFooter(`Page ${page} of ${totalPages}`)
                    .setTimestamp();
                packDisplay(infoScreen, page);
                infoMessage.edit(infoScreen);

                switch (reactionIndex) {
                    case 0:
                        break;
                    case 1:
                        infoMessage.react("➡️");
                        break;
                    case 2:
                        infoMessage.react("⬅️");
                        break;
                    case 3:
                        infoMessage.react("⬅️");
                        infoMessage.react("➡️");
                        break;
                    default:
                        break;
                }
            });

            collector.on("end", collected => {
                console.log("end of collection");
            });
        });

        function packDisplay(screen, page) {
            var startsWith, endsWith;

            if (packFiles.length - pageLimit < 0) {
                startsWith = 0;
                endsWith = packFiles.length;
                reactionIndex = 0;
            }
            else if (page * pageLimit === pageLimit) {
                startsWith = 0;
                endsWith = pageLimit;
                reactionIndex = 1;
            }
            else if (packFiles.length - (pageLimit * page) < 0) {
                startsWith = pageLimit * (page - 1);
                endsWith = packFiles.length;
                reactionIndex = 2;
            }
            else {
                startsWith = pageLimit * (page - 1);
                endsWith = startsWith + pageLimit;
                reactionIndex = 3;
            }

            for (i = 0; i < packFiles.length; i++) {
                const pack = require(`./packs/${packFiles[i]}`);
                screen.addField(pack["packName"], `${moneyEmoji}${pack["price"]}`, true);
            }
        }
    }
}