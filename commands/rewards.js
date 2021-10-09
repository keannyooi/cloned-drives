"use strict";
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
    name: "rewards",
    usage: "(no arguments required)",
    args: 0,
    category: "Gameplay",
    description: "Collect your race rewards with this command!",
    async execute(message) {
        const db = message.client.db;
        const playerData = await db.get(`acc${message.author.id}`);
        const rewards = playerData.unclaimedRewards;
        if (rewards.money === 0 && rewards.fuseTokens === 0 && rewards.trophies === 0 && rewards.cars.length === 0 && rewards.packs.length === 0) {
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("It looks like you don't have any unclaimed rewards.")
                .setDescription("Come back when you have pending rewards!")
                .setTimestamp();
            return message.channel.send(infoScreen);
        }
        else {
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle(`Successfully claimed your rewards!`)
                .setTimestamp();
            if (rewards.money > 0) {
                const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
                playerData.money += rewards.money;
                infoScreen.addField("Claimed Money", `${moneyEmoji}${rewards.money}`, true);
                rewards.money = 0;
            }
            if (rewards.fuseTokens > 0) {
                const fuseEmoji = message.client.emojis.cache.get("726018658635218955");
                playerData.fuseTokens += rewards.fuseTokens;
                infoScreen.addField("Claimed Fuse Tokens", `${fuseEmoji}${rewards.fuseTokens}`, true);
                rewards.fuseTokens = 0;
            }
            if (rewards.trophies > 0) {
                const trophyEmoji = message.client.emojis.cache.get("775636479145148418");
                playerData.trophies += rewards.trophies;
                infoScreen.addField("Claimed Trophies", `${trophyEmoji}${rewards.trophies}`, true);
                rewards.trophies = 0;
            }
            if (rewards.cars.length > 0) {
                let carList = "";
                for (i = 0; i < rewards.cars.length; i++) {
                    let isInGarage = playerData.garage.findIndex(garageCar => {
                        return garageCar.carFile === rewards.cars[i].carFile;
                    });
                    if (isInGarage !== -1) {
                        playerData.garage[isInGarage]["000"] += rewards.cars[i].amount;
                    }
                    else {
                        playerData.garage.push({
                            carFile: rewards.cars[i].carFile,
                            "000": rewards.cars[i].amount,
                            "333": 0,
                            "666": 0,
                            "996": 0,
                            "969": 0,
                            "699": 0,
                        });
                    }
                    let currentCar = require(`./cars/${rewards.cars[i].carFile}`);
                    let rarity = rarityCheck(currentCar);
                    let make = currentCar["make"];
                    if (typeof make === "object") {
                        make = currentCar["make"][0];
                    }
                    carList += `(${rarity} ${currentCar["rq"]}) ${make} ${currentCar["model"]} (${currentCar["modelYear"]})\n`;
                }
                infoScreen.addField("Claimed Cars", carList);
                rewards.cars = [];
            }
            if (rewards.packs.length > 0) {
                let packList = "";
                const openPackCommand = require("./sharedfiles/openpack.js");
                for (y = 0; y < rewards.packs.length; y++) {
                    console.log(y);
                    let currentPack = require(`./packs/${rewards.packs[y]}`);
                    packList += `${currentPack["packName"]}\n`;
                    let addedCars = openPackCommand.openPack(message, currentPack);
                    for (x = 0; x < addedCars.length; x++) {
                        let isInGarage = playerData.garage.findIndex(garageCar => {
                            return garageCar.carFile === addedCars[x];
                        });
                        if (isInGarage !== -1) {
                            playerData.garage[isInGarage]["000"] += 1;
                        }
                        else {
                            playerData.garage.push({
                                carFile: addedCars[x],
                                "000": 1,
                                "333": 0,
                                "666": 0,
                                "996": 0,
                                "969": 0,
                                "699": 0,
                            });
                        }
                    }
                }
                infoScreen.addField("Claimed Packs", packList);
                rewards.packs = [];
            }
            await db.set(`acc${message.author.id}`, playerData);
            message.channel.send(infoScreen);
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
        }
        function rarityCheck(currentCar) {
            if (currentCar["rq"] > 79) { //leggie
                return message.client.emojis.cache.get("857512942471479337");
            }
            else if (currentCar["rq"] > 64 && currentCar["rq"] <= 79) { //epic
                return message.client.emojis.cache.get("726025468230238268");
            }
            else if (currentCar["rq"] > 49 && currentCar["rq"] <= 64) { //ultra
                return message.client.emojis.cache.get("726025431937187850");
            }
            else if (currentCar["rq"] > 39 && currentCar["rq"] <= 49) { //super
                return message.client.emojis.cache.get("857513197937623042");
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
    }
};
//# sourceMappingURL=rewards.js.map