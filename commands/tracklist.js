/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const fs = require("fs");
const trackFiles = fs.readdirSync("./commands/tracksets").filter(file => file.endsWith('.json'));

module.exports = {
    name: "tracklist",
    aliases: ["alltracks"],
    usage: "(optional) <page number>",
    args: 0,
	isExternal: true,
    adminOnly: false,
    description: "Shows all the cars that are available in Cloned Drives in list form.",
    async execute(message, args) {
        const pageLimit = 10;
        const filter = (reaction, user) => {
            return (reaction.emoji.name === "⬅️" || reaction.emoji.name === "➡️") && user.id === message.author.id;
        };
        var trackList = "";
        var reactionIndex = 0;
        var page;

        if (!args.length) {
            page = 1;
        }
        else if (!isNaN(args[0])) {
            page = parseInt(args[0]);
        }
        else {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, invalid integer provided.")
                .setDescription("It looks like the page number you requested is not a number.")
                .setTimestamp();
            return message.channel.send(errorScreen);
        }
		
		const totalTracks = trackFiles.length;
        const totalPages = Math.ceil(totalTracks / pageLimit);

        trackFiles.sort(function (a, b) {
            if (a < b) {
                return -1;
            }
            else if (a > b) {
                return 1;
            }
            else {
                return 0;
            }
        });

        if (page < 0 || totalPages < page) {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, page number requested invalid.")
                .setDescription(`The car list ends at page ${totalPages}.`)
                .setTimestamp();
            return message.channel.send(errorScreen);
        }
        trackDisplay(page);

        let infoScreen = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle("List of All Tracks in Cloned Drives")
            .addField("Track", trackList, true)
            .setFooter(`Page ${page} of ${totalPages} - React with ⬅️ or ➡️ to navigate through pages.`)
            .setTimestamp();
		if (message.channel.type === "text") {
			infoScreen.setFooter(`Page ${page} of ${totalPages} - React with ⬅️ or ➡️ to navigate through pages.`);
		}
		else {
			infoScreen.setFooter(`Page ${page} of ${totalPages} - Arrow navigation is disabled in DMs, please use cd-carlist <page number> to view a different page.`);
		}

		message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
        message.channel.send(infoScreen).then(infoMessage => {
			if (message.channel.type === "text") {
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
					trackDisplay(page);
					infoMessage.reactions.removeAll();

					let infoScreen = new Discord.MessageEmbed()
						.setColor("#34aeeb")
						.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
						.setTitle("List of All Tracks in Cloned Drives")
						.addField("Track", trackList, true)
						.setFooter(`Page ${page} of ${totalPages} - React with ⬅️ or ➡️ to navigate through pages.`)
						.setTimestamp();
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

				collector.on("end", () => {
					console.log("end of collection");
					infoMessage.reactions.removeAll();
				});
			}
        });

        function trackDisplay(page) {
            let startsWith, endsWith;
            if (trackFiles.length - pageLimit <= 0) {
                startsWith = 0;
                endsWith = trackFiles.length;
                reactionIndex = 0;
            }
            else if (page * pageLimit === pageLimit) {
                startsWith = 0;
                endsWith = pageLimit;
                reactionIndex = 1;
            }
            else if (trackFiles.length - (pageLimit * page) <= 0) {
                startsWith = pageLimit * (page - 1);
                endsWith = trackFiles.length;
                reactionIndex = 2;
            }
            else {
                startsWith = pageLimit * (page - 1);
                endsWith = startsWith + pageLimit;
                reactionIndex = 3;
            }
            trackList = "";

            for (i = startsWith; i < endsWith; i++) {
				trackList += `${i + 1 - ((page - 1) * 10)}. `;
                let currentTrack = require(`./tracksets/${trackFiles[i]}`);
                trackList += `${currentTrack["trackName"]} \n`;
            }
        }
    }
}