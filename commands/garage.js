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
    args: 0,
    adminOnly: false,
    description: "Shows your (or other people's) garage.",
    async execute(message, args) {
		const db = message.client.db;
        const pageLimit = 10;
        const trophyEmoji = message.client.emojis.cache.get("775636479145148418");
        const filter = (reaction, user) => {
            return (reaction.emoji.name === "⬅️" || reaction.emoji.name === "➡️") && user.id === message.author.id;
        };
        var garageList = "";
        var page, userName;
        var user = message.author;
        var member = message.member;
        var sortBy = "rq";
        var reactionIndex = 0;

        if (!args.length || args[0] === "-s") {
            page = 1;
        }
        else {
            if (isNaN(args[0])) {
                userName = args[0].toLowerCase();

                if (!args[1] || args[1] === "-s") {
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

        if (args[args.length - 2] === "-s") {
            switch (args[args.length - 1].toLowerCase()) {
                case "rq":
                case "handling":
                case "weight":
                case "mra":
                case "ola":
                    sortBy = args[args.length - 1].toLowerCase();
                    break;
                case "topspeed":
                    sortBy = "topSpeed";
                    break;
                case "accel":
                    sortBy = "0to60";
                    break;
                default:
                    const errorScreen = new Discord.MessageEmbed()
                        .setColor("#fc0303")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Error, sorting criteria not found.")
                        .setDescription(`Here is a list of sorting criterias. 
                                         \`-s topspeed\` - Sort by top speed. 
                                         \`-s accel\` - Sort by acceleration. 
                                         \`-s handling\` - Sort by handling. 
                                         \`-s weight\` - Sort by weight. 
                                         \`-s mra\` - Sort by mid-range acceleraion. 
                                         \`-s ola\` - Sort by off-the-line acceleration.`)
                        .setTimestamp();
                    return message.channel.send(errorScreen);
            }
        }

        const garage = await db.get(`acc${user.id}.garage`);
        const totalPages = Math.ceil(garage.length / pageLimit);

        garage.sort(function (a, b) {
            const carA = require(`./cars/${a.carFile}`);
            const carB = require(`./cars/${b.carFile}`);
            var criteriaA = carA[sortBy];
            var criteriaB = carB[sortBy];
            switch (sortBy) {
                case "topSpeed":
                    switch (a.gearingUpgrade + a.engineUpgrade + a.chassisUpgrade) {
                        case 0:
                            break;
                        case 9:
                            criteriaA = carA["1StarTopSpeed"];
                            break;
                        case 18:
                            criteriaA = carA["2StarTopSpeed"];
                            break;
                        case 24:
                            criteriaA = carA[`${a.gearingUpgrade}${a.engineUpgrade}${a.chassisUpgrade}MaxedTopSpeed`];
                            break;
                        default:
                            break;
                    }
                    switch (b.gearingUpgrade + b.engineUpgrade + b.chassisUpgrade) {
                        case 0:
                            break;
                        case 9:
                            criteriaB = carB["1StarTopSpeed"];
                            break;
                        case 18:
                            criteriaB = carB["2StarTopSpeed"];
                            break;
                        case 24:
                            criteriaB = carB[`${b.gearingUpgrade}${b.engineUpgrade}${b.chassisUpgrade}MaxedTopSpeed`];
                            break;
                        default:
                            break;
                    }
                    break;
                case "0to60":
                    switch (a.gearingUpgrade + a.engineUpgrade + a.chassisUpgrade) {
                        case 0:
                            break;
                        case 9:
                            criteriaA = carA["1Star0to60"];
                            break;
                        case 18:
                            criteriaA = carA["2Star0to60"];
                            break;
                        case 24:
                            criteriaA = carA[`${a.gearingUpgrade}${a.engineUpgrade}${a.chassisUpgrade}Maxed0to60`];
                            break;
                        default:
                            break;
                    }
                    switch (b.gearingUpgrade + b.engineUpgrade + b.chassisUpgrade) {
                        case 0:
                            break;
                        case 9:
                            criteriaB = carB["1Star0to60"];
                            break;
                        case 18:
                            criteriaB = carB["2Star0to60"];
                            break;
                        case 24:
                            criteriaB = carB[`${b.gearingUpgrade}${b.engineUpgrade}${b.chassisUpgrade}Maxed0to60`];
                            break;
                        default:
                            break;
                    }
                    break;
                case "handling":
                    switch (a.gearingUpgrade + a.engineUpgrade + a.chassisUpgrade) {
                        case 0:
                            break;
                        case 9:
                            criteriaA = carA["1StarHandling"];
                            break;
                        case 18:
                            criteriaA = carA["2StarHandling"];
                            break;
                        case 24:
                            criteriaA = carA[`${a.gearingUpgrade}${a.engineUpgrade}${a.chassisUpgrade}MaxedHandling`];
                            break;
                        default:
                            break;
                    }
                    switch (b.gearingUpgrade + b.engineUpgrade + b.chassisUpgrade) {
                        case 0:
                            break;
                        case 9:
                            criteriaB = carB["1StarHandling"];
                            break;
                        case 18:
                            criteriaB = carB["2StarHandling"];
                            break;
                        case 24:
                            criteriaB = carB[`${b.gearingUpgrade}${b.engineUpgrade}${b.chassisUpgrade}MaxedHandling`];
                            break;
                        default:
                            break;
                    }
                    break;
                default:
                    break;
            }
            if (criteriaA === criteriaB) {
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
                if (criteriaA > criteriaB) {
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
                garageMessage.reactions.removeAll();
            });
        });

        function rarityCheck(currentCar) {
            if (currentCar["rq"] > 79) { //leggie
                return message.client.emojis.cache.get("726025494138454097");
            }
            else if (currentCar["rq"] > 64 && currentCar["rq"] <= 79) { //epic
                return message.client.emojis.cache.get("726025468230238268");
            }
            else if (currentCar["rq"] > 49 && currentCar["rq"] <= 64) { //ultra
                return message.client.emojis.cache.get("726025431937187850");
            }
            else if (currentCar["rq"] > 39 && currentCar["rq"] <= 49) { //super
                return message.client.emojis.cache.get("726025394104434759");
            }
            else if (currentCar["rq"] > 29 && currentCar["rq"] <= 39) { //rare
                return message.client.emojis.cache.get("726025302656024586");
            }
            else if (currentCar["rq"] > 19 && currentCar["rq"] <= 29) { //uncommon
                return message.client.emojis.cache.get("726025273421725756");
            }
            else { //common
                return message.client.emojis.cache.get("726020544264273928");
            }
        }

        function garageDisplay(page) {
            var startsWith, endsWith;

            if (garage.length - pageLimit <= 0) {
                startsWith = 0;
                endsWith = garage.length;
                reactionIndex = 0;
            }
            else if (page * pageLimit === pageLimit) {
                startsWith = 0;
                endsWith = pageLimit;
                reactionIndex = 1;
            }
            else if (garage.length - (pageLimit * page) <= 0) {
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

                garageList += `(${rarity} ${currentCar["rq"]}) ` + currentCar["make"] + " " + currentCar["model"] + " (" + currentCar["modelYear"] + ") [" + garage[i].gearingUpgrade + garage[i].engineUpgrade + garage[i].chassisUpgrade + "]";
                if (sortBy !== "rq") {
                    switch (sortBy) {
                        case "topSpeed":
                            switch (garage[i].gearingUpgrade + garage[i].engineUpgrade + garage[i].chassisUpgrade) {
                                case 0:
                                    garageList += ` \`${currentCar[sortBy]}\``;
                                    break;
                                case 9:
                                    garageList += ` \`${currentCar["1StarTopSpeed"]}\``;
                                    break;
                                case 18:
                                    garageList += ` \`${currentCar["2StarTopSpeed"]}\``;
                                    break;
                                case 24:
                                    garageList += ` \`${currentCar[`${garage[i].gearingUpgrade}${garage[i].engineUpgrade}${garage[i].chassisUpgrade}MaxedTopSpeed`]}\``;
                                    break;
                                default:
                                    break;
                            }
                            break;
                        case "0to60":
                            switch (garage[i].gearingUpgrade + garage[i].engineUpgrade + garage[i].chassisUpgrade) {
                                case 0:
                                    garageList += ` \`${currentCar[sortBy]}\``;
                                    break;
                                case 9:
                                    garageList += ` \`${currentCar["1Star0to60"]}\``;
                                    break;
                                case 18:
                                    garageList += ` \`${currentCar["2Star0to60"]}\``;
                                    break;
                                case 24:
                                    garageList += ` \`${currentCar[`${garage[i].gearingUpgrade}${garage[i].engineUpgrade}${garage[i].chassisUpgrade}Maxed0to60`]}\``;
                                    break;
                                default:
                                    break;
                            }
                            break;
                        case "handling":
                            switch (garage[i].gearingUpgrade + garage[i].engineUpgrade + garage[i].chassisUpgrade) {
                                case 0:
                                    garageList += ` \`${currentCar[sortBy]}\``;
                                    break;
                                case 9:
                                    garageList += ` \`${currentCar["1StarHandling"]}\``;
                                    break;
                                case 18:
                                    garageList += ` \`${currentCar["2StarHandling"]}\``;
                                    break;
                                case 24:
                                    garageList += ` \`${currentCar[`${garage[i].gearingUpgrade}${garage[i].engineUpgrade}${garage[i].chassisUpgrade}MaxedHandling`]}\``;
                                    break;
                                default:
                                    break;
                            }
                            break;
                        default:
                            garageList += ` \`${currentCar[sortBy]}\``;
                            break;
                    }
                }
                if (currentCar["isPrize"]) {
                    garageList += ` ${trophyEmoji}`;
                }
                garageList += "\n";
            }
        }
    }
}