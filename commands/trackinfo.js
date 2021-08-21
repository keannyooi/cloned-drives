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
const tracksets = fs.readdirSync("./commands/tracks").filter(file => file.endsWith(".json"));
const stringSimilarity = require("string-similarity");

module.exports = {
    name: "trackinfo",
    aliases: ["tinfo"],
    usage: "<track name goes here>",
    args: 1,
    category: "Info",
    description: "Shows info about a specified track.",
    execute(message, args) {
        const waitTime = 60000;
        const filter = response => {
            return response.author.id === message.author.id;
        };

        let trackName = args.map(i => i.toLowerCase());
        const searchResults = tracksets.filter(function (trackset) {
            return trackName.every(part => trackset.includes(part));
        });

        if (searchResults.length > 1) {
            var trackList = "";
            for (i = 1; i <= searchResults.length; i++) {
                const track = require(`./tracksets/${searchResults[i - 1]}`);
                trackList += `${i} - ${track["trackName"]}\n`;
            }

            if (trackList.length > 2048) {
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, too many search results.")
                    .setDescription("Due to Discord's embed limitations, the bot isn't able to show the full list of search results. Try again with a more specific keyword.")
                    .addField("Total Characters in List", `\`${textList.length}\` > \`2048\``)
                    .setTimestamp();
                return message.channel.send(errorMessage);
            }

            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Multiple tracks found, please type one of the following.")
                .setDescription(trackList)
                .setTimestamp();

            message.channel.send(infoScreen).then(currentMessage => {
                message.channel.awaitMessages(filter, {
                    max: 1,
                    time: waitTime,
                    errors: ["time"]
                })
                    .then(collected => {
                        if (message.channel.type === "text") {
                            collected.first().delete();
                        }
                        if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults.length || parseInt(collected.first().content) < 1) {
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const errorMessage = new Discord.MessageEmbed()
                                .setColor("#fc0303")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Error, invalid integer provided.")
                                .setDescription("It looks like your response was either not a number or not part of the selection.")
                                .addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${searchResults.length})`)
                                .setTimestamp();
                            return currentMessage.edit(errorMessage);
                        }
                        else {
                            const currentTrack = require(`./tracksets/${searchResults[parseInt(collected.first().content) - 1]}`);
                            displayInfo(currentTrack, currentMessage);
                        }
                    })
                    .catch(() => {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const cancelMessage = new Discord.MessageEmbed()
                            .setColor("#34aeeb")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Action cancelled automatically.")
                            .setTimestamp();
                        return currentMessage.edit(cancelMessage);
                    });
            });
        }
        else if (searchResults.length > 0) {
            const currentTrack = require(`./tracksets/${searchResults[0]}`);
            displayInfo(currentTrack);
        }
        else {
            let matches = stringSimilarity.findBestMatch(trackName.join(" "), tracksets.map(i => i.slice(0, -5)));
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, track requested not found.")
                .setDescription("Well that sucks.")
                .addField("Keywords Received", `\`${trackName.join(" ")}\``, true)
                .addField("You may be looking for", `\`${matches.bestMatch.target}\``, true)
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        function displayInfo(currentTrack, currentMessage) {
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(currentTrack["trackName"])
                .setDescription("Stats of requested track:")
                .addFields(
                    { name: "Weather", value: currentTrack["weather"], inline: true },
                    { name: "Track Surface", value: currentTrack["surface"], inline: true },
                    { name: "Speedbumps", value: currentTrack["speedbumps"], inline: true },
                    { name: "Humps", value: currentTrack["humps"], inline: false },
                    { name: "Top Speed Priority", value: `${currentTrack["specsDistr"]["topSpeed"]}/100`, inline: true },
                    { name: "Acceleration Priority", value: `${currentTrack["specsDistr"]["0to60"]}/100`, inline: true },
                    { name: "Handling Priority", value: `${currentTrack["specsDistr"]["handling"]}/100`, inline: true },
                    { name: "Weight Priority", value: `${currentTrack["specsDistr"]["weight"]}/100`, inline: true },
                    { name: "MRA Priority", value: `${currentTrack["specsDistr"]["mra"]}/100`, inline: true },
                    { name: "OLA Priority", value: `${currentTrack["specsDistr"]["ola"]}/100`, inline: true }
                )
                .setImage(currentTrack["map"])
                .setTimestamp();
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            if (currentMessage) {
                return currentMessage.edit(infoScreen);
            }
            else {
                return message.channel.send(infoScreen);
            }
        }
    }
}