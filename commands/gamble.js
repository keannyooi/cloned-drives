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
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith(".json"));
const tracksets = fs.readdirSync("./commands/tracksets").filter(file => file.endsWith(".json"));
const {
    DateTime,
    Interval
} = require("luxon");

module.exports = {
    name: "gamble",
    usage: "<money here>",
    args: 1,
    category: "Gameplay",
    description: "Gamble where the randomness of random races increases with your hand being random too. A great way to lose all your money.",
    async execute(message, args) {
        const db = message.client.db;
        const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
        const raceCommand = require("./sharedfiles/race.js");
        const playerData = await db.get(`acc${message.author.id}`);
        const garage = playerData.garage;

        let lastGambleRefresh = playerData.lastGambleRefresh;
        if (!lastGambleRefresh || !isNaN(lastGambleRefresh)) {
            lastGambleRefresh = DateTime.fromISO("2021-01-01");
        } else {
            lastGambleRefresh = DateTime.fromISO(lastGambleRefresh);
        }
        const interval = Interval.fromDateTimes(DateTime.now(), lastGambleRefresh.plus({
            hours: 8
        }))

        if (isNaN(args[0]) || parseInt(args[0]) > playerData.money || parseInt(args[0]) > 1000000) {
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTitle("Error, your bet is either not a number, more than your money balance or more than what's allowed.")
                .setDescription("You are only able to bet up to 1 million cash.")
                .addFields({
                    name: "Your Money Balance",
                    value: `${moneyEmoji}${playerData.money}`,
                    inline: true
                }, {
                    name: "Amount You Are Trying to Bet",
                    value: `${moneyEmoji}${args[0]}`,
                    inline: true
                })
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        if (interval.invalid !== null) {
            let bet = parseInt(args[0]);
            let playerThing = garage[Math.floor(Math.random() * garage.length)];
            let playerUpgrade = [];
            for (let [key, value] of Object.entries(playerThing)) {
                if (!isNaN(value) && value > 0) {
                    playerUpgrade.push(key);
                }
            }
            playerUpgrade = playerUpgrade[Math.floor(Math.random() * playerUpgrade.length)]

            let opponentCarFile = carFiles[Math.floor(Math.random() * carFiles.length)];
            let car = require(`./cars/${opponentCarFile}`);
            let upgradeIndex = Math.floor(Math.random() * 4);
            let upgradePattern = [0, 0, 0];
            switch (upgradeIndex) {
                case 0:
                    break;
                case 1:
                    upgradePattern = [3, 3, 3];
                    break;
                case 2:
                    upgradePattern = [6, 6, 6];
                    break;
                case 3:
                    let maxedTunes = [996, 969, 699];
                    let i = Math.floor(Math.random() * maxedTunes.length);
                    while (!car[`${maxedTunes[i]}TopSpeed`]) {
                        i = Math.floor(Math.random() * maxedTunes.length);
                    }
                    upgradePattern = Array.from(maxedTunes[i].toString(), (val) => Number(val));
                    break;
                default:
                    break;
            }
            let opponent = {
                carFile: opponentCarFile,
                gearingUpgrade: upgradePattern[0],
                engineUpgrade: upgradePattern[1],
                chassisUpgrade: upgradePattern[2]
            };
            let player = {
                carFile: playerThing.carFile,
                gearingUpgrade: playerUpgrade[0],
                engineUpgrade: playerUpgrade[1],
                chassisUpgrade: playerUpgrade[2]
            };

            const track = require(`./tracksets/${tracksets[Math.floor(Math.random() * tracksets.length)]}`);
            const playerCar = createCar(player);
            const opponentCar = createCar(opponent);
            const playerList = createList(player);
            const opponentList = createList(opponent);
            const intermission = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTitle("Ready to Gamble!")
                .setDescription(`Trackset: ${track["trackName"]}, Bet: ${moneyEmoji}${bet}`)
                .addFields({
                    name: "Your Hand",
                    value: playerList,
                    inline: true
                }, {
                    name: "Opponent's Hand",
                    value: opponentList,
                    inline: true
                })
                .setFooter("Win double or lose it all.")
                .setTimestamp();

            message.channel.send(intermission);
            const result = await raceCommand.race(message, playerCar, opponentCar, track);
            const delay = ms => new Promise(res => setTimeout(res, ms));
            await delay(2000);

            if (result > 0) {
                playerData.unclaimedRewards.money += bet;
                message.channel.send(`**You have earned ${moneyEmoji}${bet}! Claim your reward using \`cd-rewards\`.**`);
            } else if (result === 0) {
                message.channel.send(`**Nothing happened to your money.**`);
            } else {
                playerData.money -= bet;
                message.channel.send(`**You have lost ${moneyEmoji}${bet} for losing the bet.**`);
            }
            playerData.lastGambleRefresh = DateTime.now().toISO();
            await db.set(`acc${message.author.id}`, playerData);
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            return;
        } else {
            let hours = Math.floor(interval.length("hours"));
            let minutes = Math.floor(interval.length("minutes") - (hours * 60));
            let seconds = Math.floor(interval.length("seconds") - (hours * 3600) - (minutes * 60));
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTitle("You may only gamble once every 8 hours.")
                .setDescription(`Come back in \`${hours}h ${minutes}m ${seconds}s\`!`)
                .setTimestamp();
            return message.channel.send(infoScreen);
        }


        function createList(currentCar) {
            const car = require(`./cars/${currentCar.carFile}`);
            let make = car["make"];
            if (typeof make === "object") {
                make = car["make"][0];
            }
            const rarity = rarityCheck(car);
            var carSpecs = `(${rarity} ${car["rq"]}) ${make} ${car["model"]} (${car["modelYear"]}) [${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}]\n`;

            if (currentCar.gearingUpgrade > 0) {
                carSpecs += `Top Speed: ${car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}TopSpeed`]}MPH\n`;
                carSpecs += `0-60MPH: ${car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}0to60`]} sec\n`;
                carSpecs += `Handling: ${car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}Handling`]}\n`;
            } else {
                carSpecs += `Top Speed: ${car["topSpeed"]}MPH\n`;
                carSpecs += `0-60MPH: ${car["0to60"]} sec\n`;
                carSpecs += `Handling: ${car["handling"]}\n`;
            }
            carSpecs += `Drive Type: ${car["driveType"]}\n`;
            carSpecs += `${car["tyreType"]} Tyres\n`;
            carSpecs += `Weight: ${car["weight"]}kg\n`;
            carSpecs += `Ground Clearance: ${car["gc"]}\n`;
            carSpecs += `TCS: ${car["tcs"]}, ABS: ${car["abs"]}\n`;
            carSpecs += `MRA: ${car["mra"]}\n`;
            carSpecs += `OLA: ${car["ola"]}\n`;

            return carSpecs;
        }

        function createCar(currentCar) {
            const car = require(`./cars/${currentCar.carFile}`);
            const carModule = {
                rq: car["rq"],
                topSpeed: car["topSpeed"],
                accel: car["0to60"],
                handling: car["handling"],
                driveType: car["driveType"],
                tyreType: car["tyreType"],
                weight: car["weight"],
                gc: car["gc"],
                tcs: car["tcs"],
                abs: car["abs"],
                mra: car["mra"],
                ola: car["ola"],
                racehud: car[`racehud${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}`]
            };

            if (currentCar.gearingUpgrade > 0) {
                carModule.topSpeed = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}TopSpeed`];
                carModule.accel = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}0to60`];
                carModule.handling = car[`${currentCar.gearingUpgrade}${currentCar.engineUpgrade}${currentCar.chassisUpgrade}Handling`];
            }
            if (carModule.topSpeed < 100) {
                carModule.mra = 0;
            }
            if (carModule.topSpeed < 30) {
                carModule.ola = 0;
            }
            return carModule;
        }

        function rarityCheck(currentCar) {
            if (currentCar["rq"] > 79) { //leggie
                return message.client.emojis.cache.get("857512942471479337");
            } else if (currentCar["rq"] > 64 && currentCar["rq"] <= 79) { //epic
                return message.client.emojis.cache.get("726025468230238268");
            } else if (currentCar["rq"] > 49 && currentCar["rq"] <= 64) { //ultra
                return message.client.emojis.cache.get("726025431937187850");
            } else if (currentCar["rq"] > 39 && currentCar["rq"] <= 49) { //super
                return message.client.emojis.cache.get("857513197937623042");
            } else if (currentCar["rq"] > 29 && currentCar["rq"] <= 39) { //rare
                return message.client.emojis.cache.get("726025302656024586");
            } else if (currentCar["rq"] > 19 && currentCar["rq"] <= 29) { //uncommon
                return message.client.emojis.cache.get("726025273421725756");
            } else { //common
                return message.client.emojis.cache.get("726020544264273928");
            }
        }
    }
}