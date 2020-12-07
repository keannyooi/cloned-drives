/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const Canvas = require("canvas");

module.exports = {
    name: "decks",
    usage: "<(optional) name of deck>",
    args: 0,
    adminOnly: false,
    description: "Shows your decks.",
    async execute(message, args) {
        const db = message.client.db;
        const decks = await db.get(`acc${message.author.id}.decks`);

        if (!args[0]) {
            if (decks.length === 0) {
                const infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle(`${message.author.tag}'s Decks`)
                    .setDescription("You currently don't have any decks. Use `cd-createdeck` to create one!")
                    .setTimestamp();
                return message.channel.send(infoScreen);
            }

            const handList = new Array();
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle("Your Decks")
                .setTimestamp();

            for (i = 0; i < decks.length; i++) {
                handList[i] = "";
                for (x = 0; x < 5; x++) {
                    console.log(x);

                    if (decks[i].hand[x] === "None") {
                        handList[i] += "(empty)\n";
                    }
                    else {
                        console.log(decks[i].hand[x].carFile);
                        var currentCar = require(`./cars/${decks[i].hand[x].carFile}`);
                        var rarity = rarityCheck(currentCar);
                        handList[i] += `(${rarity} ${currentCar["rq"]}) ` + currentCar["make"] + " " + currentCar["model"] + " (" + currentCar["modelYear"] + ") [" + decks[i].hand[x].gearingUpgrade + decks[i].hand[x].engineUpgrade + decks[i].hand[x].chassisUpgrade + "]\n";
                    }
                }

                if (decks[i]) {
                    infoScreen.addField(`${i + 1} - ${decks[i].name}`, handList[i]);
                }
            }
            return message.channel.send(infoScreen);
        }
        else {
            const deckName = args[0];
            const filter = response => {
                return response.author.id === message.author.id;
            };

            const searchResults = decks.filter(function (deck) {
                return deck.name === deckName;
            });

            if (searchResults.length > 1) {
                var deckList = "";
                for (i = 1; i <= searchResults.length; i++) {
                    deckList += `${i} - ${searchResults[i - 1].name} \n`;
                }

                const infoScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Multiple decks found, please type one of the following.")
                    .setDescription(deckList)
                    .setTimestamp();

                message.channel.send(infoScreen).then(currentMessage => {
                    message.channel.awaitMessages(filter, {
                        max: 1,
                        time: 30000,
                        errors: ['time']
                    })
                        .then(collected => {
                            if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults.length) {
                                const errorMessage = new Discord.MessageEmbed()
                                    .setColor("#fc0303")
                                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                                    .setTitle("Error, invalid integer provided.")
                                    .setDescription("It looks like your response was either not a number or not part of the selection.")
                                    .setTimestamp();
                                return currentMessage.edit(errorMessage);
                            }
                            else {
                                display(searchResults[parseInt(collected.first()) - 1]);
                            }
                        })
                        .catch(() => {
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
                display(searchResults[0]);
            }
            else {
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, 404 deck not found.")
                    .setDescription(`It looks like you don't have a deck named \`${deckName}\`.`)
                    .setTimestamp();
                return message.channel.send(errorMessage);
            }
        }

        async function display(currentDeck) {
            const wait = await message.channel.send("**Loading deck, this may take a while... (please wait)**");

            try {
                var handList = "";
                const handPlacement = [{ x: 287, y: 24 }, { x: 658, y: 24 }, { x: 1029, y: 24 }, { x: 1400, y: 24 }, { x: 1771, y: 24 }];
                const canvas = Canvas.createCanvas(2135, 249);
                const ctx = canvas.getContext("2d");
                const background = await Canvas.loadImage("https://cdn.discordapp.com/attachments/716917404868935691/744882896828891136/deck_screen.png");
                ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

                for (i = 0; i < currentDeck.hand.length; i++) {
                    if (currentDeck.hand[i] !== "None") {
                        console.log(currentDeck.hand[i]);
                        const car = require(`./cars/${currentDeck.hand[i].carFile}`);
                        var racehud = await Canvas.loadImage(car[`racehud${currentDeck.hand[i].gearingUpgrade}${currentDeck.hand[i].engineUpgrade}${currentDeck.hand[i].chassisUpgrade}`]);
                        var rarity = rarityCheck(car);

                        ctx.drawImage(racehud, handPlacement[i].x, handPlacement[i].y, 334, 203);
                        handList += `(${rarity} ${car["rq"]}) ${car["make"]} ${car["model"]} (${car["modelYear"]}) [${currentDeck.hand[i].gearingUpgrade}${currentDeck.hand[i].engineUpgrade}${currentDeck.hand[i].chassisUpgrade}]\n`;
                    }
                }

                const attachment = new Discord.MessageAttachment(canvas.toBuffer(), 'deck.png');
                const deckScreen = new Discord.MessageEmbed()
                    .setColor("#34aeeb")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle(currentDeck.name)
                    .setDescription(handList)
                    .attachFiles(attachment)
                    .setImage("attachment://deck.png")
                    .setTimestamp();
                wait.delete();
                return message.channel.send(deckScreen);
            }
            catch (error) {
                const errorMessage = new Discord.MessageEmbed()
                    .setColor("#fc0303")
                    .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                    .setTitle("Error, failed to load in deck.")
                    .setDescription(`Something must have gone wrong. Please report this issure to the devs. \n${error}`)
                    .setTimestamp()
                wait.delete();
                return message.channel.send(errorMessage);
            }
        }

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
    }
}