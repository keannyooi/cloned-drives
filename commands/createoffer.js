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

module.exports = {
    name: "createoffer",
    aliases: ["newoffer"],
    usage: "<amount purchasable> <offer name goes here>",
    args: 2,
    category: "Community Management",
    description: "Creates a limited offer with the name of your choice.",
    async execute(message, args) {
        const db = message.client.db;
        const offers = await db.get("limitedOffers");
        let offerName = args.splice(1, args.length).join(" ");
        let amount = args[0];

        if (!message.member.roles.cache.has("802043346951340064")) {
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTitle("Error, you don't have access to this command.")
                .setDescription("This command is only accessible if you are a part of Community Management.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        if (isNaN(args[0]) || parseInt(args[0]) < 1 || parseInt(args[0]) > 10) {
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTitle("Error, amount provided is either not a number or not supported.")
                .setDescription("The amount of times a limited offer is purchasable is restricted to 1 ~ 10 times.")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
        amount = parseInt(amount);

        if (offers.findIndex(offer => offer.name === offerName) > -1) {
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTitle("Error, offer name already taken.")
                .setDescription("Check the list of offers using the command `cd-limitedoffers`.")
                .setTimestamp();
            return message.channel.send(errorScreen);
        }

        await db.push("limitedOffers", {
            name: offerName,
            isActive: false,
            amount: amount,
            price: 50000,
            timeLeft: "unlimited",
            deadline: "until someone turns it off",
            offer: {},
            players: {}
        });
        const infoScreen = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({
                format: "png",
                dynamic: true
            }))
            .setTitle(`Successfully created a new offer named ${offerName}!`)
            .setDescription("Apply changes to the offer using `cd-editoffer`.")
            .setTimestamp();
        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
        return message.channel.send(infoScreen);
    }
}