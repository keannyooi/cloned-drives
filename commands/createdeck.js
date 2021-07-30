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
    name: "createdeck",
    aliases: ["newdeck"],
    usage: "<deck name goes here>",
    args: 1,
    category: "Configuration",
    description: 'Creates a deck with the name of your choice. (NOTE: Deck names cannot contain spaces, use underscores "_" instead)',
    async execute(message, args) {
        const db = message.client.db;
        const deckName = args[0];
        const decks = await db.get(`acc${message.author.id}.decks`);

        if (decks.length >= 10) {
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTitle("Error, unable to create a new deck.")
                .setDescription("You have too many decks, consider deleting an unused one using `cd-removedeck`. The deck limit is 10.")
                .setTimestamp();
            return message.channel.send(errorScreen);
        } else if (args[1]) {
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTitle("Error, deck name provided contains spaces.")
                .setDescription('Deck names cannot contain spaces. Consider replacing the spaces with underscores "_".')
                .setTimestamp();
            return message.channel.send(errorScreen);
        }
        for (i = 0; i < decks.length; i++) {
            if (decks[i].name === deckName) {
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorScreen = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                        format: "png",
                        dynamic: true
                    }))
                    .setTitle("Error, deck name already taken.")
                    .setDescription("Check your list of decks using the command `cd-decks`.")
                    .setTimestamp();
                return message.channel.send(errorScreen);
            }
        }

        await db.push(`acc${message.author.id}.decks`, {
            name: deckName,
            hand: ["None", "None", "None", "None", "None"],
            tunes: ["000", "000", "000", "000", "000"]
        });
        const infoScreen = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({
                format: "png",
                dynamic: true
            }))
            .setTitle(`Successfully created new deck named ${deckName}.`)
            .setDescription("Add your cars into your newly-created deck using `cd-addtodeck`!")
            .setFooter(`You have ${9 - decks.length} deck slots remaining.`)
            .setTimestamp();
        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
        return message.channel.send(infoScreen);
    }
}