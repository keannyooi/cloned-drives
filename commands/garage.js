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
    usage: "(all optional) <username goes here> | <page number> | -s <sorting criteria>",
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
        var garageList = "", valueList = "";
        var page, userName;
        let user = message.author;
        let member = message.member;
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

        var garage = await db.get(`acc${user.id}.garage`);
        const carFilter = await db.get(`acc${message.author.id}.filter`);
        if (carFilter !== null) {
            for (const [key, value] of Object.entries(carFilter)) {
                switch (typeof value) {
                    case "object":
                        if (Array.isArray(value)) {
                            garage = garage.filter(function (car) {
                                let currentCar = require(`./cars/${car.carFile}`);
                                if (Array.isArray(currentCar[key])) {
                                    var obj = {};
                                    currentCar[key].forEach((tag, index) => obj[tag.toLowerCase()] = index);
                                    return value.every(tagFilter => { return obj[tagFilter] !== undefined });
                                }
                                else {
                                    return value.includes(currentCar[key].toLowerCase());
                                }
                            });
                        }
                        else {
                            garage = garage.filter(function (car) {
                                let currentCar = require(`./cars/${car.carFile}`);
                                return currentCar[key.replace("count", "Count").replace("y", "Y")] >= value.start && currentCar[key.replace("count", "Count").replace("y", "Y")] <= value.end;
                            });
                        }
                        break;
                    case "string":
                        garage = garage.filter(function (car) {
                            let currentCar = require(`./cars/${car.carFile}`);
                            return currentCar[key.replace("type", "Type")].toLowerCase() === value;
                        });
                        break;
                    default:
                        break;
                }
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

        const totalPages = Math.ceil(garage.length / pageLimit);
        garage.sort(function (a, b) {
            const carA = require(`./cars/${a.carFile}`);
            const carB = require(`./cars/${b.carFile}`);
            var criteriaA = carA[sortBy];
            var criteriaB = carB[sortBy];

            if (a.gearingUpgrade > 0) {
                switch (sortBy) {
                    case "topSpeed":
                        criteriaA = carA[`${a.gearingUpgrade}${a.engineUpgrade}${a.chassisUpgrade}TopSpeed`];
                        break;
                    case "0to60":
                        criteriaA = carA[`${a.gearingUpgrade}${a.engineUpgrade}${a.chassisUpgrade}0to60`];
                        break;
                    case "handling":
                        criteriaA = carA[`${a.gearingUpgrade}${a.engineUpgrade}${a.chassisUpgrade}Handling`];
                        break;
                    default:
                        break;
                }
            }
            if (b.gearingUpgrade > 0) {
                switch (sortBy) {
                    case "topSpeed":
                        criteriaB = carB[`${b.gearingUpgrade}${b.engineUpgrade}${b.chassisUpgrade}TopSpeed`];
                        break;
                    case "0to60":
                        criteriaB = carB[`${b.gearingUpgrade}${b.engineUpgrade}${b.chassisUpgrade}0to60`];
                        break;
                    case "handling":
                        criteriaB = carB[`${b.gearingUpgrade}${b.engineUpgrade}${b.chassisUpgrade}Handling`];
                        break;
                    default:
                        break;
                }
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
                if (sortBy === "0to60" || sortBy === "weight") {
                    if (criteriaA > criteriaB) {
                        return 1;
                    }
                    else {
                        return -1;
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

        let infoScreen = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(`${member.displayName}'s Garage`)
            .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
            .setDescription(`Current Sorting Criteria: \`${sortBy}\``)
            .addField("Car", garageList, true)
            .setFooter(`Page ${page} of ${totalPages} - React with ⬅️ or ➡️ to navigate through pages.`)
            .setTimestamp();
        if (sortBy !== "rq") {
            infoScreen.addField("Value", valueList, true);
        }

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

                let infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle(`${member.displayName}'s Garage`)
                    .setThumbnail(user.displayAvatarURL({ format: "png", dynamic: true }))
                    .setDescription(`Current Sorting Criteria: \`${sortBy}\``)
                    .addField("Car", garageList, true)
                    .setFooter(`Page ${page} of ${totalPages} - React with ⬅️ or ➡️ to navigate through pages.`)
                    .setTimestamp();
                if (sortBy !== "rq") {
                    infoScreen.addField("Value", valueList, true);
                }
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

            collector.on("end", () => {
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
            let startsWith, endsWith;

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
            garageList = valueList = "";

            for (i = startsWith; i < endsWith; i++) {
                let currentCar = require(`./cars/${garage[i].carFile}`);
                const rarity = rarityCheck(currentCar);

                garageList += `(${rarity} ${currentCar["rq"]}) ` + currentCar["make"] + " " + currentCar["model"] + " (" + currentCar["modelYear"] + ") [" + garage[i].gearingUpgrade + garage[i].engineUpgrade + garage[i].chassisUpgrade + "]";
                if (sortBy !== "rq") {
                    if (garage[i].gearingUpgrade > 0) {
                        switch (sortBy) {
                            case "topSpeed":
                                valueList += `\`${currentCar[`${garage[i].gearingUpgrade}${garage[i].engineUpgrade}${garage[i].chassisUpgrade}TopSpeed`]}\`\n`;
                                break;
                            case "0to60":
                                valueList += `\`${currentCar[`${garage[i].gearingUpgrade}${garage[i].engineUpgrade}${garage[i].chassisUpgrade}0to60`]}\`\n`;
                                break;
                            case "handling":
                                valueList += `\`${currentCar[`${garage[i].gearingUpgrade}${garage[i].engineUpgrade}${garage[i].chassisUpgrade}Handling`]}\`\n`;
                                break;
                            default:
                                valueList += `\`${currentCar[sortBy]}\`\n`
                                break;
                        }
                    }
                    else {
                        valueList += `\`${currentCar[sortBy]}\`\n`
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