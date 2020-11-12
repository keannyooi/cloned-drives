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
    name: "garage",
    usage: "(optional) <page number> or (optional) <username goes here> <page number>",
    args: false,
    adminOnly: false,
    description: "Shows your (or other people's) garage.",
    async execute(message, args) {
		const db = message.client.db;
        const pageLimit = 10;
        const filter = (reaction, user) => {
            return (reaction.emoji.name === "⬅️" || reaction.emoji.name === "➡️") && user.id === message.author.id;
        };
        var garageList = "";
        var page, userName;
        var user = message.author;
		var member = message.member;
        var reactionIndex = 0;

        if (!args.length) {
            page = 1;
        }
        else {
            if (isNaN(args[0])) {
                userName = args[0].toLowerCase();

                if (!args[1]) {
                    page = 1;
                }
                else {
                    page = parseInt(args[1]);
                }

				user = member = null;
				message.guild.members.cache.forEach(User => {
            		if (message.guild.member(User).displayName.toLowerCase().includes(userName)) {
                		console.log("found!");
                		user = User.user;
						member = message.guild.member(User);
            		}
        		});
        		if (!user) {
            		const errorMessage = new Discord.MessageEmbed()
                		.setColor("#fc0303")
                		.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                		.setTitle("Error, 404 user not found.")
                		.setDescription("It looks like this user isn't in this server.")
                		.setTimestamp();
            		return message.channel.send(errorMessage);
                }
                else if (user.bot) {
                    const errorMessage = new Discord.MessageEmbed()
                        .setColor("#fc0303")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Error, user requested is a bot.")
                        .setDescription("Bots can't play Cloned Drives.")
                        .setTimestamp();
                    return message.channel.send(errorMessage);
                }
            }
            else {
                page = parseInt(args[0]);
            }
        }

        const garage = await db.get(`acc${user.id}.garage`);
        const totalPages = Math.ceil(garage.length / pageLimit);

        garage.sort(function (a, b) {
            const carA = require(`./cars/${a.carFile}`);
            const carB = require(`./cars/${b.carFile}`);
            if (carA["rq"] === carB["rq"]) {
                const nameA = carA["make"].toLowerCase() + carA["model"].toLowerCase();
                const nameB = carB["make"].toLowerCase() + carB["model"].toLowerCase();

                if (nameA < nameB) {
                    return -1;
                }
                else if (nameA > nameB) {
                    return 1;
                }
                else {
                    return 0;
                }
            }
            else {
                if (carA["rq"] > carB["rq"]) {
                    return -1;
                }
                else {
                    return 1;
                }
            }
        });

        if (page < 0 || totalPages < page) {
            const errorScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, page number requested invalid.")
                .setDescription(`Your garage ends at page ${totalPages}.`)
                .setTimestamp();
            return message.channel.send(errorScreen);
        }
        garageDisplay(page);

        const infoScreen = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(`${member.displayName}'s Garage`)
            .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
            .setDescription(garageList)
            .setFooter(`Page ${page} of ${totalPages} - React with ⬅️ or ➡️ to navigate through pages.`)
            .setTimestamp();
        message.channel.send(infoScreen).then(garageMessage => {
            console.log(reactionIndex);
            switch (reactionIndex) {
                case 0:
                    break;
                case 1:
                    garageMessage.react("➡️");
                    break;
                case 2:
                    garageMessage.react("⬅️");
                    break;
                case 3:
                    garageMessage.react("⬅️");
                    garageMessage.react("➡️");
                    break;
                default:
                    break;
            }

            const collector = garageMessage.createReactionCollector(filter, { time: 60000 });
            collector.on("collect", reaction => {
                if (reaction.emoji.name === "⬅️") {
                    page -= 1;
                }
                else if (reaction.emoji.name === "➡️") {
                    page += 1;
                }
                garageDisplay(page);
                garageMessage.reactions.removeAll();

                const totalPages = Math.ceil(garage.length / pageLimit);
                const infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle(`${member.displayName}'s Garage`)
                    .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                    .setDescription(garageList)
                    .setFooter(`Page ${page} of ${totalPages} - React with ⬅️ or ➡️ to navigate through pages.`)
                    .setTimestamp();
                garageMessage.edit(infoScreen);

                switch (reactionIndex) {
                    case 0:
                        break;
                    case 1:
                        garageMessage.react("➡️");
                        break;
                    case 2:
                        garageMessage.react("⬅️");
                        break;
                    case 3:
                        garageMessage.react("⬅️");
                        garageMessage.react("➡️");
                        break;
                    default:
                        break;
                }
            });

            collector.on("end", collected => {
                console.log("end of collection");
            });
        });

        function rarityCheck(currentCar) {
            if (currentCar["rq"] > 79) { //leggie
                return message.guild.emojis.cache.find(emoji => emoji.name === "legendary");
            }
            else if (currentCar["rq"] > 64 && currentCar["rq"] <= 79) { //epic
                return message.guild.emojis.cache.find(emoji => emoji.name === "epic");
            }
            else if (currentCar["rq"] > 49 && currentCar["rq"] <= 64) { //ultra
                return message.guild.emojis.cache.find(emoji => emoji.name === "ultrarare");
            }
            else if (currentCar["rq"] > 39 && currentCar["rq"] <= 49) { //super
                return message.guild.emojis.cache.find(emoji => emoji.name === "superrare");
            }
            else if (currentCar["rq"] > 29 && currentCar["rq"] <= 39) { //rare
                return message.guild.emojis.cache.find(emoji => emoji.name === "rare");
            }
            else if (currentCar["rq"] > 19 && currentCar["rq"] <= 29) { //uncommon
                return message.guild.emojis.cache.find(emoji => emoji.name === "uncommon");
            }
            else { //common
                return message.guild.emojis.cache.find(emoji => emoji.name === "common");
            }
        }

        function garageDisplay(page) {
            var startsWith, endsWith;

            if (garage.length - pageLimit < 0) {
                startsWith = 0;
                endsWith = garage.length;
                reactionIndex = 0;
            }
            else if (page * pageLimit === pageLimit) {
                startsWith = 0;
                endsWith = pageLimit;
                reactionIndex = 1;
            }
            else if (garage.length - (pageLimit * page) < 0) {
                startsWith = pageLimit * (page - 1);
                endsWith = garage.length;
                reactionIndex = 2;
            }
            else {
                startsWith = pageLimit * (page - 1);
                endsWith = startsWith + pageLimit;
                reactionIndex = 3;
            }
            garageList = "";

            for (i = startsWith; i < endsWith; i++) {
                var currentCar = require(`./cars/${garage[i].carFile}`);
                const rarity = rarityCheck(currentCar);

                garageList += `(${rarity} ${currentCar["rq"]}) ` + currentCar["make"] + " " + currentCar["model"] + " (" + currentCar["modelYear"] + ") [" + garage[i].gearingUpgrade + garage[i].engineUpgrade + garage[i].chassisUpgrade + "]\n";
            }
        }
    }
}