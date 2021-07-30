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
const packFiles = fs.readdirSync("./commands/packs").filter(file => file.endsWith(".json"));
const stringSimilarity = require("string-similarity");
const {
    DateTime
} = require("luxon");

module.exports = {
    name: "editoffer",
    usage: "<offer name> | <criteria> | <value>",
    args: 3,
    category: "Community Management",
    description: "Edits an offer.",
    async execute(message, args) {
        const db = message.client.db;
        const offers = await db.get("limitedOffers");
        const moneyEmoji = message.client.emojis.cache.get("726017235826770021");
        const fuseEmoji = message.client.emojis.cache.get("726018658635218955");
        const keyword = args[0].toLowerCase();
        const filter = response => {
            return response.author.id === message.author.id;
        };

        const searchResults = offers.filter(function(offer) {
            return offer.name.toLowerCase().includes(keyword);
        });

        if (searchResults.length > 1) {
            let offerList = "";
            for (i = 1; i <= searchResults.length; i++) {
                offerList += `${i} - ${searchResults[i - 1].name} \n`;
            }

            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTitle("Multiple offers found, please type one of the following.")
                .setDescription(offerList)
                .setTimestamp();

            message.channel.send(infoScreen).then(currentMessage => {
                message.channel.awaitMessages(filter, {
                        max: 1,
                        time: 30000,
                        errors: ["time"]
                    })
                    .then(collected => {
                        collected.first().delete();
                        if (isNaN(collected.first().content) || parseInt(collected.first()) > searchResults.length || parseInt(collected.first().content) < 1) {
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const errorMessage = new Discord.MessageEmbed()
                                .setColor("#fc0303")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                    format: "png",
                                    dynamic: true
                                }))
                                .setTitle("Error, invalid integer provided.")
                                .setDescription("It looks like your response was either not a number or not part of the selection.")
                                .addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${searchResults.length})`)
                                .setTimestamp();
                            return currentMessage.edit(errorMessage);
                        } else {
                            editOffer(searchResults[parseInt(collected.first()) - 1], currentMessage);
                        }
                    })
                    .catch(() => {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const cancelMessage = new Discord.MessageEmbed()
                            .setColor("#34aeeb")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                format: "png",
                                dynamic: true
                            }))
                            .setTitle("Action cancelled automatically.")
                            .setTimestamp();
                        return currentMessage.edit(cancelMessage);
                    });
            });
        } else if (searchResults.length > 0) {
            editOffer(searchResults[0]);
        } else {
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor("#fc0303")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTitle("Error, 404 offer not found.")
                .setDescription("Try checking again using `cd-limitedoffers`.")
                .addField("Keywords Received", `\`${keyword}\``)
                .setTimestamp();
            return message.channel.send(errorMessage);
        }

        async function editOffer(offer, currentMessage) {
            let criteria = args[1].toLowerCase();
            let infoScreen;
            switch (criteria) {
                case "name":
                    let oldName = offer.name;
                    let offerName = args.slice(2, args.length).join(" ");
                    offer.name = offerName;

                    infoScreen = new Discord.MessageEmbed()
                        .setColor("#03fc24")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({
                            format: "png",
                            dynamic: true
                        }))
                        .setTitle(`Successfully changed the offer name from ${oldName} to ${offerName}!`)
                        .setTimestamp();
                    break;
                case "price":
                    if (isNaN(args[2]) || args[2] < 1) {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const errorMessage = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                format: "png",
                                dynamic: true
                            }))
                            .setTitle("Error, price provided is either not a number or less than 1.")
                            .setDescription("An offer's price should always be a positive number, i.e: `360`, `42`, etc.")
                            .addField("Number Received", `\`${args[1]}\` (not a positive number)`)
                            .setTimestamp();
                        if (currentMessage) {
                            return currentMessage.edit(errorMessage);
                        } else {
                            return message.channel.send(errorMessage);
                        }
                    }

                    let newPrice = parseInt(args[2]);
                    offer.price = newPrice;
                    infoScreen = new Discord.MessageEmbed()
                        .setColor("#03fc24")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({
                            format: "png",
                            dynamic: true
                        }))
                        .setTitle(`Successfully changed the ${offer.name} offer's price to ${moneyEmoji}${newPrice}!`)
                        .setTimestamp();
                    break;
                case "duration":
                    if (offer.isActive) {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const errorScreen = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                format: "png",
                                dynamic: true
                            }))
                            .setTitle("Error, this attribute cannot be edited while the offer is live.")
                            .setDescription("If you edit this value while an offer is live, it would break the bot. If you want to extend the time of the challenge, use `cd-editoffer extend <time in hours>`.")
                            .setTimestamp();
                        if (currentMessage) {
                            return currentMessage.edit(errorScreen);
                        } else {
                            return message.channel.send(errorScreen);
                        }
                    }

                    if (!args[2]) {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const errorScreen = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                format: "png",
                                dynamic: true
                            }))
                            .setTitle("Error, arguments provided incomplete.")
                            .setDescription("You are expected to provide the number of days after the criteria, or `unlimited` if you want the offer to go on forever.")
                            .setTimestamp();
                        if (currentMessage) {
                            return currentMessage.edit(errorScreen);
                        } else {
                            return message.channel.send(errorScreen);
                        }
                    }

                    let duration = args[2];
                    if ((duration !== "unlimited" && isNaN(duration)) || parseInt(duration) < 1) {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const errorScreen = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                format: "png",
                                dynamic: true
                            }))
                            .setTitle("Error, duration provided is invalid.")
                            .setDescription("The duration in days must be a positive number. If you want an offer to last forever, just type `unlimited`.")
                            .setTimestamp();
                        if (currentMessage) {
                            return currentMessage.edit(errorScreen);
                        } else {
                            return message.channel.send(errorScreen);
                        }
                    }

                    offer.timeLeft = parseInt(duration);
                    infoScreen = new Discord.MessageEmbed()
                        .setColor("#03fc24")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({
                            format: "png",
                            dynamic: true
                        }))
                        .setTitle(`Successfully changed the duration of the ${offer.name} to \`${duration} day(s)\`!`)
                        .setTimestamp();
                    break;
                case "extend":
                    if (!offer.isActive) {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const errorScreen = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                format: "png",
                                dynamic: true
                            }))
                            .setTitle("Error, this attribute can only be edited while an offer is live.")
                            .setDescription("This command is only intended for the unlikely scenario of bot-related delays.")
                            .setTimestamp();
                        if (currentMessage) {
                            return currentMessage.edit(errorScreen);
                        } else {
                            return message.channel.send(errorScreen);
                        }
                    }

                    if (!args[2]) {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const errorScreen = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                format: "png",
                                dynamic: true
                            }))
                            .setTitle("Error, arguments provided incomplete.")
                            .setDescription("You are expected to provide the extended duration in hours after the criteria.")
                            .setTimestamp();
                        if (currentMessage) {
                            return currentMessage.edit(errorScreen);
                        } else {
                            return message.channel.send(errorScreen);
                        }
                    }

                    let time = args[2];
                    if (isNaN(time) || parseInt(time) < 1) {
                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                        const errorScreen = new Discord.MessageEmbed()
                            .setColor("#fc0303")
                            .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                format: "png",
                                dynamic: true
                            }))
                            .setTitle("Error, duration provided is invalid.")
                            .setDescription("The extended duration in hours must be a positive number.")
                            .addField("Duration Value Received", `\`${time}\` (not a positive number)`)
                            .setTimestamp();
                        if (currentMessage) {
                            return currentMessage.edit(errorScreen);
                        } else {
                            return message.channel.send(errorScreen);
                        }
                    }

                    let origDate = DateTime.fromISO(offer.deadline);
                    offer.deadline = origDate.plus({
                        hours: time
                    }).toISO();
                    offer.timeLeft += parseInt((time / 24).toFixed(2));
                    infoScreen = new Discord.MessageEmbed()
                        .setColor("#03fc24")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({
                            format: "png",
                            dynamic: true
                        }))
                        .setTitle(`Successfully extended the duration of the ${offer.name} offer by \`${time} hour(s)\`!`)
                        .setTimestamp();
                    break;
                case "addcontent":
                    switch (args[2].toLowerCase()) {
                        case "pack":
                            let packName = args.slice(3, args.length).map(i => i.toLowerCase());
                            let packFile;
                            let searchResults = packFiles.filter(function(pack) {
                                return packName.every(part => pack.includes(part));
                            });

                            if (searchResults.length > 1) {
                                let packList = "";
                                for (i = 1; i <= searchResults.length; i++) {
                                    let currentPack = require(`./packs/${searchResults[i - 1]}`);
                                    packList += `${i} - ` + currentPack["packName"] + "\n";
                                }

                                const infoScreen = new Discord.MessageEmbed()
                                    .setColor("#34aeeb")
                                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                        format: "png",
                                        dynamic: true
                                    }))
                                    .setTitle("Multiple packs found, please type one of the following.")
                                    .setDescription(packList)
                                    .setTimestamp();

                                if (currentMessage) {
                                    await currentMessage.edit(infoScreen);
                                } else {
                                    await message.channel.send(infoScreen);
                                }
                                await message.channel.awaitMessages(filter, {
                                        max: 1,
                                        time: 60000,
                                        errors: ["time"]
                                    })
                                    .then(collected => {
                                        collected.first().delete();
                                        if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults.length || parseInt(collected.first().content) < 1) {
                                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                            const errorMessage = new Discord.MessageEmbed()
                                                .setColor("#fc0303")
                                                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                                    format: "png",
                                                    dynamic: true
                                                }))
                                                .setTitle("Error, invalid integer provided.")
                                                .setDescription("It looks like your response was either not a number or not part of the selection.")
                                                .addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${searchResults.length})`)
                                                .setTimestamp();
                                            return currentMessage.edit(errorMessage);
                                        } else {
                                            packFile = searchResults[parseInt(collected.first().content) - 1];
                                        }
                                    })
                                    .catch(() => {
                                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                        const cancelMessage = new Discord.MessageEmbed()
                                            .setColor("#34aeeb")
                                            .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                                format: "png",
                                                dynamic: true
                                            }))
                                            .setTitle("Action cancelled automatically.")
                                            .setTimestamp();
                                        return currentMessage.edit(cancelMessage);
                                    });
                            } else if (searchResults.length > 0) {
                                packFile = searchResults[0];
                            } else {
                                let matches = stringSimilarity.findBestMatch(packName.join(" "), packFiles.map(i => i.slice(0, -5)));
                                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                const errorMessage = new Discord.MessageEmbed()
                                    .setColor("#fc0303")
                                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                        format: "png",
                                        dynamic: true
                                    }))
                                    .setTitle("Error, pack requested not found.")
                                    .setDescription("Well that sucks.")
                                    .addField("Keywords Received", `\`${packName.join(" ")}\``, true)
                                    .addField("You may be looking for", `\`${matches.bestMatch.target}\``, true)
                                    .setTimestamp();
                                if (currentMessage) {
                                    await currentMessage.edit(errorMessage);
                                } else {
                                    await message.channel.send(errorMessage);
                                }
                            }

                            offer.offer.pack = packFile;
                            let currentPack = require(`./packs/${packFile}`);
                            infoScreen = new Discord.MessageEmbed()
                                .setColor("#03fc24")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                    format: "png",
                                    dynamic: true
                                }))
                                .setTitle(`Successfully assigned a(n) ${currentPack["packName"]} to the ${offer.name} offer!`)
                                .setImage(currentPack["pack"])
                                .setTimestamp();
                            break;
                        case "car":
                            if (!args[3]) {
                                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                const errorScreen = new Discord.MessageEmbed()
                                    .setColor("#fc0303")
                                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                        format: "png",
                                        dynamic: true
                                    }))
                                    .setTitle("Error, car name not provided.")
                                    .setDescription("You are expected to provide the name of the car after `addcontent`.")
                                    .setTimestamp();
                                if (currentMessage) {
                                    return currentMessage.edit(errorScreen);
                                } else {
                                    return message.channel.send(errorScreen);
                                }
                            }

                            let carFile;
                            let carName = args.slice(3, args.length).map(i => i.toLowerCase());
                            let searchResults1 = new Set(carFiles);
                            searchResults1.forEach(function(car) {
                                if (carName.every(part => car.includes(part)) === false) {
                                    searchResults1.delete(car);
                                }
                            });

                            if (searchResults1.size > 1) {
                                let carList = "";
                                let redirect = [];
                                let i = 1;
                                searchResults1.forEach(function(thing) {
                                    const car = require(`./cars/${thing}`);
                                    let make = car["make"];
                                    if (typeof make === "object") {
                                        make = car["make"][0];
                                    }
                                    carList += `${i} - ${make} ${car["model"]} (${car["modelYear"]})\n`;
                                    redirect[i - 1] = thing;
                                    i++;
                                });

                                if (carList.length > 2048) {
                                    message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                    const errorMessage = new Discord.MessageEmbed()
                                        .setColor("#fc0303")
                                        .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                            format: "png",
                                            dynamic: true
                                        }))
                                        .setTitle("Error, too many search results.")
                                        .setDescription("Due to Discord's embed limitations, the bot isn't able to show the full list of search results. Try again with a more specific keyword.")
                                        .addField("Total Characters in List", `\`${carList.length}\` > \`2048\``)
                                        .setTimestamp();
                                    return message.channel.send(errorMessage);
                                }

                                const infoScreen = new Discord.MessageEmbed()
                                    .setColor("#34aeeb")
                                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                        format: "png",
                                        dynamic: true
                                    }))
                                    .setTitle("Multiple cars found, please type one of the following.")
                                    .setDescription(carList);

                                if (currentMessage) {
                                    await currentMessage.edit(infoScreen);
                                } else {
                                    await message.channel.send(infoScreen);
                                }
                                await message.channel.awaitMessages(filter, {
                                        max: 1,
                                        time: 60000,
                                        errors: ["time"]
                                    })
                                    .then(collected => {
                                        collected.first().delete();
                                        if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults1.size) {
                                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                            const errorMessage = new Discord.MessageEmbed()
                                                .setColor("#fc0303")
                                                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                                    format: "png",
                                                    dynamic: true
                                                }))
                                                .setTitle("Error, invalid integer provided.")
                                                .setDescription("It looks like your response was either not a number or not part of the selection.")
                                                .addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${searchResults1.size})`)
                                                .setTimestamp();
                                            return currentMessage.edit(errorMessage);
                                        } else {
                                            carFile = redirect[parseInt(collected.first().content) - 1];
                                        }
                                    })
                                    .catch(() => {
                                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                        const cancelMessage = new Discord.MessageEmbed()
                                            .setColor("#34aeeb")
                                            .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                                format: "png",
                                                dynamic: true
                                            }))
                                            .setTitle("Action cancelled automatically.")
                                            .setTimestamp();
                                        return currentMessage.edit(cancelMessage);
                                    });
                            } else if (searchResults1.size > 0) {
                                carFile = Array.from(searchResults1)[0];
                            } else {
                                let matches = stringSimilarity.findBestMatch(carName.join(" "), carFiles.map(i => i.slice(0, -5)));
                                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                const errorMessage = new Discord.MessageEmbed()
                                    .setColor("#fc0303")
                                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                        format: "png",
                                        dynamic: true
                                    }))
                                    .setTitle("Error, car requested not found.")
                                    .setDescription("Well that sucks.")
                                    .addField("Keywords Received", `\`${carName.join(" ")}\``, true)
                                    .addField("You may be looking for", `\`${matches.bestMatch.target}\``, true)
                                    .setTimestamp();
                                return message.channel.send(errorMessage);
                            }

                            let list = "";
                            if (offer.offer.cars) {
                                offer.offer.cars.push(carFile);
                            } else {
                                offer.offer.cars = [carFile];
                            }
                            for (let i = 0; i < offer.offer.cars.length; i++) {
                                let car = require(`./cars/${offer.offer.cars[i]}`);
                                let make = car["make"];
                                if (typeof make === "object") {
                                    make = car["make"][0];
                                }
                                let rarity = rarityCheck(car);
                                list += `(${rarity} ${car["rq"]}) ${make} ${car["model"]} (${car["modelYear"]})\n`;
                            }

                            let cardThing = require(`./cars/${carFile}`);
                            let make = cardThing["make"];
                            if (typeof make === "object") {
                                make = cardThing["make"][0];
                            }
                            infoScreen = new Discord.MessageEmbed()
                                .setColor("#03fc24")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                    format: "png",
                                    dynamic: true
                                }))
                                .setTitle(`Successfully added a car to the ${offer.name} offer!`)
                                .addField("Current Cars", list)
                                .setImage(cardThing["card"])
                                .setTimestamp();
                            break;
                        case "fusetokens":
                            if (isNaN(args[3]) || args[3] < 1) {
                                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                const errorMessage = new Discord.MessageEmbed()
                                    .setColor("#fc0303")
                                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                        format: "png",
                                        dynamic: true
                                    }))
                                    .setTitle("Error, fuse token amount provided is either not a number or less than 1.")
                                    .setDescription("This amount should always be a positive number, i.e: `997`, `500`, etc.")
                                    .addField("Number Received", `\`${args[3]}\` (either not a positive number or not \`unlimited\`)`)
                                    .setTimestamp();
                                if (currentMessage) {
                                    return currentMessage.edit(errorMessage);
                                } else {
                                    return message.channel.send(errorMessage);
                                }
                            }

                            let amount = parseInt(args[3]);
                            offer.offer.fuseTokens = amount;
                            infoScreen = new Discord.MessageEmbed()
                                .setColor("#03fc24")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                    format: "png",
                                    dynamic: true
                                }))
                                .setTitle(`Successfully assigned fuse tokens to the ${offer.name} offer!`)
                                .addField("Current Fuse Token Amount", `${fuseEmoji}${amount}`)
                                .setTimestamp();
                            break;
                        default:
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const errorScreen = new Discord.MessageEmbed()
                                .setColor("#fc0303")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                    format: "png",
                                    dynamic: true
                                }))
                                .setTitle("Error, offer editing criteria not found.")
                                .setDescription(`Here is a list of offer editing criterias. 
											\`pack\` - Sets a pack to the offer bundle. Provide the name of a pack after that.
											\`car\` - Adds a car to the offer bundle. Provide the name of a car after that.
											\`fusetokens\` - Sets a certain amount of fuse tokens to the offer bundle. Provide the amount of fuse tokens after that.`)
                                .setTimestamp();
                            if (currentMessage) {
                                return currentMessage.edit(errorScreen);
                            } else {
                                return message.channel.send(errorScreen);
                            }
                    }
                    break;
                case "removecontent":
                    switch (args[2].toLowerCase()) {
                        case "fusetokens":
                        case "pack":
                            delete offer.offer[args[2].toLowerCase().replace("tokens", "Tokens")];
                            infoScreen = new Discord.MessageEmbed()
                                .setColor("#03fc24")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                    format: "png",
                                    dynamic: true
                                }))
                                .setTitle(`Successfully removed the \`${args[2].toLowerCase()}\` from the ${offer.name} offer!`)
                                .setTimestamp();
                            break;
                        case "cars":
                            if (!args[3]) {
                                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                const errorScreen = new Discord.MessageEmbed()
                                    .setColor("#fc0303")
                                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                        format: "png",
                                        dynamic: true
                                    }))
                                    .setTitle("Error, car name not provided.")
                                    .setDescription("You are expected to provide the name of the car after `removecontent`.")
                                    .setTimestamp();
                                if (currentMessage) {
                                    return currentMessage.edit(errorScreen);
                                } else {
                                    return message.channel.send(errorScreen);
                                }
                            }

                            let carFile;
                            let carName = args.slice(3, args.length).map(i => i.toLowerCase());
                            let searchResults2 = offer.offer.cars.filter(car => {
                                return carName.every(part => car.includes(part));
                            }) || [];

                            if (searchResults2.length > 1) {
                                let carList = "";
                                for (let i = 0; i < searchResults2.length; i++) {
                                    const car = require(`./cars/${searchResults2[i]}`);
                                    let make = car["make"];
                                    if (typeof make === "object") {
                                        make = car["make"][0];
                                    }
                                    carList += `${i + 1} - ${make} ${car["model"]} (${car["modelYear"]})\n`;
                                }

                                const infoScreen = new Discord.MessageEmbed()
                                    .setColor("#34aeeb")
                                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                        format: "png",
                                        dynamic: true
                                    }))
                                    .setTitle("Multiple cars found, please type one of the following.")
                                    .setDescription(carList);

                                let currentMessage2;
                                if (currentMessage) {
                                    currentMessage2 = await currentMessage.edit(infoScreen);
                                } else {
                                    currentMessage2 = await message.channel.send(infoScreen);
                                }
                                await message.channel.awaitMessages(filter, {
                                        max: 1,
                                        time: 60000,
                                        errors: ["time"]
                                    })
                                    .then(collected => {
                                        collected.first().delete();
                                        if (isNaN(collected.first().content) || parseInt(collected.first().content) > searchResults2.length) {
                                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                            const errorMessage = new Discord.MessageEmbed()
                                                .setColor("#fc0303")
                                                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                                    format: "png",
                                                    dynamic: true
                                                }))
                                                .setTitle("Error, invalid integer provided.")
                                                .setDescription("It looks like your response was either not a number or not part of the selection.")
                                                .addField("Number Received", `\`${collected.first().content}\` (either not a number, smaller than 1 or bigger than ${searchResults2.length})`)
                                                .setTimestamp();
                                            return currentMessage2.edit(errorMessage);
                                        } else {
                                            carFile = searchResults2[parseInt(collected.first().content) - 1];
                                        }
                                    })
                                    .catch(error => {
                                        console.log(error);
                                        message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                        const cancelMessage = new Discord.MessageEmbed()
                                            .setColor("#34aeeb")
                                            .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                                format: "png",
                                                dynamic: true
                                            }))
                                            .setTitle("Action cancelled automatically.")
                                            .setTimestamp();
                                        return currentMessage2.edit(cancelMessage);
                                    });
                            } else if (searchResults2.length > 0) {
                                carFile = searchResults2[0];
                            } else {
                                message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                                const errorMessage = new Discord.MessageEmbed()
                                    .setColor("#fc0303")
                                    .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                        format: "png",
                                        dynamic: true
                                    }))
                                    .setTitle("Error, car requested not found.")
                                    .setDescription("Well that sucks.")
                                    .addField("Keywords Received", `\`${carName.join(" ")}\``)
                                    .setTimestamp();
                                if (currentMessage) {
                                    return currentMessage.edit(errorMessage);
                                } else {
                                    return message.channel.send(errorMessage);
                                }
                            }

                            offer.offer.cars.splice([carFile], 1);
                            if (offer.offer.cars.length < 1) {
                                delete offer.offer.cars;
                            }

                            let cardThing = require(`./cars/${carFile}`);
                            let make = cardThing["make"];
                            if (typeof make === "object") {
                                make = cardThing["make"][0];
                            }
                            infoScreen = new Discord.MessageEmbed()
                                .setColor("#03fc24")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                    format: "png",
                                    dynamic: true
                                }))
                                .setTitle(`Successfully removed a car from the ${offer.name} offer!`)
                                .setImage(cardThing["card"])
                                .setTimestamp();
                            if (offer.offer.cars) {
                                let carList = "";
                                for (let i = 0; i < offer.offer.cars.length; i++) {
                                    let car = require(`./cars/${offer.offer.cars[i]}`);
                                    let make = car["make"];
                                    if (typeof make === "object") {
                                        make = car["make"][0];
                                    }
                                    let rarity = rarityCheck(car);
                                    carList += `(${rarity} ${car["rq"]}) ${make} ${car["model"]} (${car["modelYear"]})\n`;
                                }

                                infoScreen.addField("Current Cars", carList);
                            }
                            break;
                        default:
                            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                            const errorScreen = new Discord.MessageEmbed()
                                .setColor("#fc0303")
                                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                                    format: "png",
                                    dynamic: true
                                }))
                                .setTitle("Error, offer editing criteria not found.")
                                .setDescription(`Here is a list of offer editing criterias. 
											\`pack\` - Sets a pack to the offer bundle.
											\`car\` - Adds a car to the offer bundle. Provide the name of a car after that.
											\`fusetokens\` - Sets a certain amount of fuse tokens to the offer bundle.`)
                                .setTimestamp();
                            return message.channel.send(errorScreen);
                    }
                    break;
                default:
                    message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
                    const errorScreen = new Discord.MessageEmbed()
                        .setColor("#fc0303")
                        .setAuthor(message.author.tag, message.author.displayAvatarURL({
                            format: "png",
                            dynamic: true
                        }))
                        .setTitle("Error, offer editing criteria not found.")
                        .setDescription(`Here is a list of offer editing criterias. 
                                    \`name\` - The name of the offer. 
									\`duration\` - How long the offer goes live for.
									\`extend\` - How long an offer is going to be extended by (in hours). 
									\`price\` - How much the offer is charged for. 
									\`addcontent\` - Adds something to the offer bundle.
									\`removecontent\` - Removes something from the offer bundle.`)
                        .setTimestamp();
                    return message.channel.send(errorScreen);
            }

            await db.set("limitedOffers", offers);
            message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            if (currentMessage) {
                return currentMessage.edit(infoScreen);
            } else {
                return message.channel.send(infoScreen);
            }
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