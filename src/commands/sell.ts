/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const stringSimilarity = require("string-similarity");

module.exports = {
    name: "sell",
    aliases: ["s"],
    usage: "(optional) <amount> | <car name goes here>",
    description: "Sells one or more cars from your garage.",
    args: 1,
    category: "Gameplay",
    async execute(message, args) {
        const db = message.client.db;
        const playerData = await db.get(`acc${message.author.id}`);
        const garage = playerData.garage;
        const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
        const filter = response => {
            return response.author.id === message.author.id;
        };

        if (garage.length <= 5) {
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("HOLD ON RIGHT THERE!")
                .setDescription("You can't do anything without more than 5 cars. Please don't sell any more cars and build up your garage!")
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        let carName;
        let amount = 1;
        if (args[0].toLowerCase() === "all" && args[1]) {
            carName = args.slice(1, args.length).map(i => i.toLowerCase());
        }
        else if (isNaN(args[0]) || !args[1]) {
            carName = args.slice(0, args.length).map(i => i.toLowerCase());
        }
        else {
            amount = Math.ceil(parseInt(args[0]));
            carName = args.slice(1, args.length).map(i => i.toLowerCase());
        }

        const searchResults = garage.filter(function (garageCar) {
            let test = require(`./cars/${garageCar.carFile}`);
            return carName.every(part => garageCar.carFile.includes(part)) && !test["isPrize"] && (garageCar["000"] >= amount || garageCar["333"] >= amount || garageCar["666"] >= amount);
        });

        if (searchResults.length > 1) {
            var carList = "";
            for (i = 1; i <= searchResults.length; i++) {
                let car = require(`./cars/${searchResults[i - 1].carFile}`);
                let make = car["make"];
                if (typeof make === "object") {
                    make = car["make"][0];
                }
                carList += `${i} - ${make} ${car["model"]} (${car["modelYear"]})\n`;
            }

            if (carList.length > 2048) {
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, too many search results.")
                    .setDescription("Due to Discord's embed limitations, the bot isn't able to show the full list of search results. Try again with a more specific keyword.")
                    .addField("Total Characters in List", `\`${carList.length}\` > \`2048\``)
                    .setTimestamp();
                return message.channel.send(errorMessage);
            }

            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Multiple cars found, please type one of the following.")
                .setDescription(carList)
                .setTimestamp();

            message.channel.send(infoScreen).then(currentMessage => {
                message.channel.awaitMessages(filter, {
                    max: 1,
                    time: 30000,
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
                            selectUpgrade(searchResults[parseInt(collected.first().content) - 1], currentMessage);
                        }
                    })
                    .catch(() => {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
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
            selectUpgrade(searchResults[0]);
        }
        else {
            let find = garage.filter(g => {
                return carName.every(part => g.carFile.includes(part));
            })
            if (find.length === 0) {
                let matches = stringSimilarity.findBestMatch(carName.join(" "), garage.map(i => i.carFile.slice(0, -5)));
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, it looks like you don't have this car.")
                    .setDescription("Well that's sad.")
                    .addField("Keywords Received", `\`${carName.join(" ")}\``, true)
                    .addField("You may be looking for", `\`${matches.bestMatch.target}\``, true)
                    .setTimestamp();
                return message.channel.send(errorMessage);
            }
            else {
                let bannedList = "";
                let errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, it looks like you either don't have this car, or you are unable to sell it.")
                    .setDescription("Note: You can't sell maxed cars and prize cars.")
                    .addField("Keywords Received", `\`${carName.join(" ")}\``)
                    .setTimestamp();
                for (let i = 0; i < find.length; i++) {
                    let errCar = require(`./cars/${find[i].carFile}`);
                    let make = errCar["make"];
                    if (typeof make === "object") {
                        make = errCar["make"][0];
                    }

                    if (errCar["isPrize"]) {
                        bannedList += `${make} ${errCar["model"]} (${errCar["modelYear"]}) ${trophyEmoji}\n`;
                    }
                    else {
                        let upgList = "";
                        for (let [key, value] of Object.entries(find[i])) {
                            if (!isNaN(value) && value !== 0) {
                                upgList += `${value}x ${key}, `;
                            }
                        }
                        bannedList += `${make} ${errCar["model"]} (${errCar["modelYear"]}) \`(${upgList.slice(0, -2)}, not enough to perform action) (${amount}x non-maxed car required)\`\n`;
                    }
                }
                errorMessage.addField("Cars Found", bannedList);
                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                return message.channel.send(errorMessage);
            }
        }

        async function selectUpgrade(currentCar, currentMessage) {
            let isOne = Object.keys(currentCar).filter(m => !isNaN(currentCar[m]) && !m.includes("96") && !m.includes("69") && currentCar[m] >= amount);
            if (isOne.length === 1) {
                sell(currentCar, isOne[0], currentMessage);
            }
            else {
                let upgradeList = "Type in any tune that is displayed here.\n";
                for (i = 0; i < isOne.length; i++) {
                    upgradeList += `\`${isOne[i]}\`, `;
                }
                let infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Sell car of which tune?")
                    .setDescription(upgradeList.slice(0, -2))
                    .setTimestamp();
                let upgradeMessage;
                if (currentMessage && message.channel.type === "text") {
                    upgradeMessage = await currentMessage.edit(infoScreen);
                }
                else {
                    upgradeMessage = await message.channel.send(infoScreen);
                }

                message.channel.awaitMessages(filter, {
                    max: 1,
                    time: 60000,
                    errors: ["time"]
                })
                    .then(collected => {
                        if (message.channel.type === "text") {
                            collected.first().delete();
                        }
                        if (isOne.find(m => m === collected.first().content) === undefined) {
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const errorMessage = new Discord.MessageEmbed()
                                .setColor("#fc0303")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Error, invalid selection provided.")
                                .setDescription("It looks like your response was not part of the selection.")
                                .addField("Value Received", `\`${collected.first().content}\``)
                                .setTimestamp();
                            return upgradeMessage.edit(errorMessage);
                        }
                        else {
                            sell(currentCar, collected.first().content, upgradeMessage);
                        }
                    })
                    .catch(() => {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const cancelMessage = new Discord.MessageEmbed()
                            .setColor("#34aeeb")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                            .setTitle("Action cancelled automatically.")
                            .setTimestamp();
                        return upgradeMessage.edit(cancelMessage);
                    });
            }
        }

        async function sell(currentCar, upgrade, currentMessage) {
            const buttonFilter = (button) => {
                return button.clicker.user.id === message.author.id;
            };
            const car = require(`./cars/${currentCar.carFile}`);
            let make = car["make"];
            if (typeof make === "object") {
                make = car["make"][0];
            }
            const currentName = `${make} ${car["model"]} (${car["modelYear"]}) [${upgrade}]`;
            if (args[0].toLowerCase() === "all") {
                amount = currentCar[upgrade];
            }

            let money;
            if (car["rq"] > 79) { //leggie
                money = 200000 + ((parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2])) * 4500);
            }
            else if (car["rq"] > 64 && car["rq"] <= 79) { //epic
                money = 77500 + ((parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2])) * 3750);
            }
            else if (car["rq"] > 49 && car["rq"] <= 64) { //ultra
                money = 27500 + ((parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2])) * 3000);
            }
            else if (car["rq"] > 39 && car["rq"] <= 49) { //super
                money = 7500 + ((parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2])) * 2250);
            }
            else if (car["rq"] > 29 && car["rq"] <= 39) { //rare
                money = 1000 + ((parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2])) * 1500);
            }
            else if (car["rq"] > 19 && car["rq"] <= 29) { //uncommon
                money = 500 + ((parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2])) * 750);
            }
            else { //common
                money = 200 + ((parseInt(upgrade[0]) + parseInt(upgrade[1]) + parseInt(upgrade[2])) * 500);
            }
            money *= amount;

            let yse, nop;
            if (playerData.settings.buttonstyle === "classic") {
                yse = new disbut.MessageButton()
                    .setStyle("grey")
                    .setEmoji("✅")
                    .setID("yse");
                nop = new disbut.MessageButton()
                    .setStyle("grey")
                    .setEmoji("❎")
                    .setID("nop");
            }
            else {
                yse = new disbut.MessageButton()
                    .setStyle("green")
                    .setLabel("Yes!")
                    .setID("yse");
                nop = new disbut.MessageButton()
                    .setStyle("red")
                    .setLabel("No!")
                    .setID("nop");
            }
            let row = new disbut.MessageActionRow().addComponents(yse, nop);

            const confirmationMessage = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Are you sure you want to sell ${amount} of your ${currentName}s for ${moneyEmoji}${money}?`)
                .setImage(car["card"])
                .setTimestamp();
            let reactionMessage, processed = false;
            if (currentMessage && message.channel.type === "text") {
                reactionMessage = await currentMessage.edit({ embed: confirmationMessage, component: row });
            }
            else {
                reactionMessage = await message.channel.send({ embed: confirmationMessage, component: row });
            }

            const collector = reactionMessage.createButtonCollector(buttonFilter, { time: 10000 });
            collector.on("collect", async button => {
                if (!processed) {
                    processed = true;
                    switch (button.id) {
                        case "yse":
                            if (playerData.hand) {
                                if (playerData.hand.carFile === currentCar.carFile) {
                                    delete playerData.hand;
                                }
                            }
                            for (i = 0; i < playerData.decks.length; i++) {
                                for (x = 0; x < 5; x++) {
                                    if (playerData.decks[i].hand[x] === currentCar.carFile && playerData.decks[i].tunes[x] === upgrade) {
                                        playerData.decks[i].hand[x] = "None";
                                        playerData.decks[i].tunes[x] = "000";
                                    }
                                }
                            }

                            let remove = garage.find(garageCar => {
                                return garageCar.carFile === currentCar.carFile;
                            });
                            remove[upgrade] -= amount;
                            if (remove["000"] + remove["333"] + remove["666"] + remove["996"] + remove["969"] + remove["699"] === 0) {
                                playerData.garage.splice(garage.indexOf(currentCar), 1);
                            }
                            playerData.money += money;

                            await db.set(`acc${message.author.id}`, playerData);
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)

                            const infoScreen = new Discord.MessageEmbed()
                                .setColor("#03fc24")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle(`Successfully sold ${amount} of your ${currentName}s!`)
                                .setDescription(`You earned ${moneyEmoji}${money}!`)
                                .addField("Your Money Balance", `${moneyEmoji}${playerData.money}`)
                                .setImage(car["card"])
                                .setTimestamp();
                            return reactionMessage.edit({ embed: infoScreen, component: null });
                        case "nop":
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
                            const cancelMessage = new Discord.MessageEmbed()
                                .setColor("#34aeeb")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                .setTitle("Action cancelled.")
                                .setDescription(`Your ${currentName}s stays in your garage.`)
                                .setImage(car["card"])
                                .setTimestamp();
                            return reactionMessage.edit({ embed: cancelMessage, component: null });
                        default:
                            break;
                    }
                }
            });
            collector.on("end", () => {
                if (!processed) {
                    message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1)
                    const cancelMessage = new Discord.MessageEmbed()
                        .setColor("#34aeeb")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                        .setTitle("Action cancelled automatically.")
                        .setDescription(`Your ${currentName}s stays in your garage.`)
                        .setImage(car["card"])
                        .setTimestamp();
                    return reactionMessage.edit({ embed: cancelMessage, component: null });
                }
            });
        }
    }
}