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
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith('.json'));

module.exports = {
    name: "carlist",
    aliases: ["allcars"],
    usage: "(optional) <page number>",
    args: false,
    adminOnly: false,
    description: "Shows all the cars that are available in Cloned Drives in list form.",
    async execute(message, args) {
        const db = message.client.db;
        const pageLimit = 10;
        const trophyEmoji = message.guild.emojis.cache.find(emoji => emoji.name === "trophies");
        const filter = (reaction, user) => {
            return (reaction.emoji.name === "⬅️" || reaction.emoji.name === "➡️") && user.id === message.author.id;
        };
        var carList = "";
        var reactionIndex = 0;
        var sortBy = "rq";
        var page;

        if (!args.length || (args[0] === "-s" && args[1])) {
            page = 1;
        }
        else if (!isNaN(args[0])) {
            page = parseInt(args[0]);
        }
        else {
            const errorScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, invalid integer provided.")
                .setDescription("It looks like the page number you requested is not a number.")
                .setTimestamp();
            return message.channel.send(errorScreen);
        }

        const garage = await db.get(`acc${message.author.id}.garage`);
        const totalPages = Math.ceil(carFiles.length / pageLimit);

        const ownedCars = carFiles.filter(function (carFile) {
            return garage.some(part => carFile.includes(part.carFile));
        });

        if (args[args.length - 2] === "-s") {
            switch (args[args.length - 1].toLowerCase()) {
                case "rq":
                    break;
                case "topspeed":
                    sortBy = "topSpeed";
                    break;
                case "accel":
                    sortBy = "0to60";
                    break;
                case "handling":
                case "weight":
                case "mra":
                case "ola":
                    sortBy = args[args.length - 1].toLowerCase();
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

        carFiles.sort(function (a, b) {
            const carA = require(`./cars/${a}`);
            const carB = require(`./cars/${b}`);
            if (carA[sortBy] === carB[sortBy]) {
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
                if (carA[sortBy] - carB[sortBy] > 0) {
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
                .setDescription(`The car list ends at page ${totalPages}.`)
                .setTimestamp();
            return message.channel.send(errorScreen);
        }
        carDisplay(page);

        const infoScreen = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(`List of All Cars in Cloned Drives (${ownedCars.length}/${carFiles.length} Cars Owned)`)
            .setDescription(carList)
            .setFooter(`Page ${page} of ${totalPages} - React with ⬅️ or ➡️ to navigate through pages.`)
            .setTimestamp();
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

                const totalPages = Math.ceil(carFiles.length / pageLimit);
                const infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle(`List of All Cars in Cloned Drives (${ownedCars.length}/${carFiles.length} Cars Owned)`)
                    .setDescription(carList)
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

            collector.on("end", collected => {
                console.log("end of collection");
                infoMessage.reactions.removeAll();
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

        function carDisplay(page) {
            var startsWith, endsWith;

            if (carFiles.length - pageLimit < 0) {
                startsWith = 0;
                endsWith = carFiles.length;
                reactionIndex = 0;
            }
            else if (page * pageLimit === pageLimit) {
                startsWith = 0;
                endsWith = pageLimit;
                reactionIndex = 1;
            }
            else if (carFiles.length - (pageLimit * page) < 0) {
                startsWith = pageLimit * (page - 1);
                endsWith = carFiles.length;
                reactionIndex = 2;
            }
            else {
                startsWith = pageLimit * (page - 1);
                endsWith = startsWith + pageLimit;
                reactionIndex = 3;
            }
            carList = "";

            for (i = startsWith; i < endsWith; i++) {
                const currentCar = require(`./cars/${carFiles[i]}`);
                const rarity = rarityCheck(currentCar);

                carList += `(${rarity} ${currentCar["rq"]}) ` + currentCar["make"] + " " + currentCar["model"] + " (" + currentCar["modelYear"] + ")";
                if (sortBy !== "rq") {
                    carList += ` \`${currentCar[sortBy]}\``;
                }
                if (currentCar["isPrize"]) {
                    carList += ` ${trophyEmoji}`;
                }

                if (ownedCars.some(car => carFiles[i].includes(car))) {
                    carList += " ✅ \n";
                }
                else {
                    carList += "\n";
                }
            }
        }
    }
}