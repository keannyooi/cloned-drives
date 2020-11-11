const Discord = require("discord.js-light");

module.exports = {
    name: "leaderboards",
    aliases: ["lb", "leader", "leaderboard", "lead"],
    usage: "<criteria> (optional) <page number>",
    args: true,
    adminOnly: false,
    description: "Shows the server's leaderboards.",
    async execute(message, args) {
        const db = message.client.db;
        const all = await db.all();
        const pageLimit = 10;
        const filter = (reaction, user) => {
            return (reaction.emoji.name === "⬅️" || reaction.emoji.name === "➡️") && user.id === message.author.id;
        };
        const lb = [];
        var lbList, valueList;
        var reactionIndex = 0;
        var startsWith, endsWith, emoji;
        var page, criteria, currentPlacement;

        switch (args[0].toLowerCase()) {
            case "money":
                criteria = "Money";
                emoji = message.guild.emojis.cache.find(emoji => emoji.name === "money");
                for (i = 0; i < all.length; i++) {
                    if (all[i].ID.startsWith("acc")) {
                        const id = all[i].ID.substring(3);
                        if (message.guild.member(id) && !message.client.users.cache.find(user => user.id === id).bot) {
                            lb.push({ name: message.guild.members.cache.get(id).displayName, value: all[i].data.money });
                        }
                    }
                }
                break;
            case "fusetokens":
                criteria = "Fuse Tokens";
                emoji = message.guild.emojis.cache.find(emoji => emoji.name === "fuse");
                for (i = 0; i < all.length; i++) {
                    if (all[i].ID.startsWith("acc")) {
                        const id = all[i].ID.substring(3);
                        if (message.guild.member(id) && !message.client.users.cache.find(user => user.id === id).bot) {
                            lb.push({ name: message.guild.members.cache.get(id).displayName, value: all[i].data.fuseTokens });
                        }
                    }
                }
                break;
            case "trophies":
                criteria = "Trophies";
                emoji = message.guild.emojis.cache.find(emoji => emoji.name === "trophies");
                for (i = 0; i < all.length; i++) {
                    if (all[i].ID.startsWith("acc")) {
                        const id = all[i].ID.substring(3);
                        if (message.guild.member(id) && !message.client.users.cache.find(user => user.id === id).bot) {
                            lb.push({ name: message.guild.members.cache.get(id).displayName, value: all[i].data.trophies });
                        }
                    }
                }
                break;
            case "garage":
                criteria = "Garage Points";
                emoji = "🚙";
                for (i = 0; i < all.length; i++) {
                    if (all[i].ID.startsWith("acc")) {
                        const id = all[i].ID.substring(3);
                        if (message.guild.member(id) && !message.client.users.cache.find(user => user.id === id).bot) {
                            const garage = all[i].data.garage;
                            var maxedCarAmount = 0;
                            var garagePoints = 0;
                            for (x = 0; x < garage.length; x++) {
                                const currentCar = require(`./cars/${garage[x].carFile}`);
                                const addedPoints = rarityCheck(currentCar);
                                garagePoints += addedPoints;

                                if (garage[x].gearingUpgrade + garage[x].engineUpgrade + garage[x].chassisUpgrade === 24) {
                                    maxedCarAmount++;
                                }
                            }
                            garagePoints *= maxedCarAmount / garage.length;
                            lb.push({ name: message.guild.members.cache.get(id).displayName, value: Math.round((garagePoints + Number.EPSILON) * 100) / 100 });
                        }
                    }
                }
                break;
            default:
                const errorScreen = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, criteria requested unavailable.")
                    .setDescription("Choose between `money`, `fusetokens`, `trophies` and `garage`.")
                    .setTimestamp();
                return message.channel.send(errorScreen);
        }
        console.log(lb);

        if (!args[1]) {
            page = 1;
        }
        else {
            page = parseInt(args[1]);
        }

        const totalPages = Math.ceil(lb.length / pageLimit);

        lb.sort(function (a, b) {
            if (a.value === b.value) {
                if (a.name < b.name) {
                    return -1;
                }
                else if (a.name > b.name) {
                    return 1;
                }
                else {
                    return 0;
                }
            }
            else {
                if (a.value > b.value) {
                    return -1;
                }
                else {
                    return 1;
                }
            }
        });

        for (i = 0; i < lb.length; i++) {
            if (message.guild.members.cache.get(message.author.id).displayName === lb[i].name) {
                currentPlacement = i + 1;
            }
        }

        if (page < 0 || totalPages < page) {
            const errorScreen = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Error, page number requested invalid.")
                .setDescription(`The leaderboard ends at page ${totalPages}.`)
                .setTimestamp();
            return message.channel.send(errorScreen);
        }
        lbDisplay(page);

        const infoScreen = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(`Cloned Drives Leaderboards (Selected Criteria: ${criteria})`)
            .setDescription(`Your current placement: ${currentPlacement}/${message.guild.memberCount}`)
            .addFields(
                { name: "Placement", value: lbList, inline: true },
                { name: criteria, value: valueList, inline: true }
            )
            .setFooter(`Showing places ${startsWith + 1} to ${endsWith} - React with ⬅️ or ➡️ to navigate through pages.`)
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
                lbDisplay(page);
                infoMessage.reactions.removeAll();

                const infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle(`Cloned Drives Leaderboards (Selected Criteria: ${criteria})`)
                    .setDescription(`Your current placement: ${currentPlacement}/${message.guild.memberCount}`)
                    .addFields(
                        { name: "Placement", value: lbList, inline: true },
                        { name: criteria, value: valueList, inline: true }
                    )
                    .setFooter(`Showing places ${startsWith + 1} to ${endsWith} - React with ⬅️ or ➡️ to navigate through pages.`)
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
            });
        });

        function rarityCheck(currentCar) {
            if (currentCar["rq"] > 79) { //leggie
                return 10000;
            }
            else if (currentCar["rq"] > 64 && currentCar["rq"] <= 79) { //epic
                return 3000;
            }
            else if (currentCar["rq"] > 49 && currentCar["rq"] <= 64) { //ultra
                return 750;
            }
            else if (currentCar["rq"] > 39 && currentCar["rq"] <= 49) { //super
                return 200;
            }
            else if (currentCar["rq"] > 29 && currentCar["rq"] <= 39) { //rare
                return 90;
            }
            else if (currentCar["rq"] > 19 && currentCar["rq"] <= 29) { //uncommon
                return 30;
            }
            else { //common
                return 10;
            }
        }

        function lbDisplay(page) {
            if (lb.length - pageLimit < 0) {
                startsWith = 0;
                endsWith = carFiles.length;
                reactionIndex = 0;
            }
            else if (page * pageLimit === pageLimit) {
                startsWith = 0;
                endsWith = pageLimit;
                reactionIndex = 1;
            }
            else if (lb.length - (pageLimit * page) < 0) {
                startsWith = pageLimit * (page - 1);
                endsWith = lb.length;
                reactionIndex = 2;
            }
            else {
                startsWith = pageLimit * (page - 1);
                endsWith = startsWith + pageLimit;
                reactionIndex = 3;
            }
            lbList = valueList = "";

            for (i = startsWith; i < endsWith; i++) {
                lbList += `${i + 1} - ${lb[i].name} \n`;
                valueList += `${emoji}${lb[i].value} \n`;
            }
        }
    }
}