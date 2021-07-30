/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/
const Discord = require("discord.js-light");

module.exports = {
    name: "credits",
    usage: "<no arguments here>",
    args: 0,
    category: "Info",
    description: "A list of everyone that participated in the making of this server.",
    execute(message) {
        const credits = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({
                format: "png",
                dynamic: true
            }))
            .setTitle("Cloned Drives Credits")
            .setDescription("Created by keanny and many more.")
            .addFields({
                name: "Original Server Creator",
                value: "Macan94126",
                inline: true
            }, {
                name: "Head Developer (& the dude who did most of the work)",
                value: "keanny",
                inline: true
            }, {
                name: "Vice Head Developer",
                value: "DodgeDemon",
                inline: true
            }, {
                name: "Developers",
                value: "Gandu, andugandu, bnuuy",
                inline: true
            }, {
                name: "Card Creators",
                value: "keanny, Macan94126, andugandu, DodgeDemon, Olimato, havvy, bnuuy",
                inline: true
            }, {
                name: "Media Management",
                value: "keanny",
                inline: true
            }, {
                name: "Dedicated To:",
                value: "Every Top Drives player (and you)",
                inline: true
            }, {
                name: "Main Sources",
                value: "Car & Driver, Motortrend, Road & Track, autoevolution.com, automobilecatalog.com",
                inline: true
            }, )
            .setTimestamp();
        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
        return message.channel.send(credits);
    }
}