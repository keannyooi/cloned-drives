/*
__  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/
const Discord = require("discord.js");
const fs = require("fs");
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith('.json'));
const stringSimilarity = require("string-similarity");

class SuccessMessage {
    constructor(title, desc, image) {
        this.title = title;
        this.desc = desc;
        this.image = image;
    }
    create(message) {
        let successMessage = new Discord.MessageEmbed()
            .setColor("#03fc24")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(`Successfully ${this.title}!`)
            .setDescription(this.desc)
            .setTimestamp();
        if (this.image) {
            successMessage.setImage(this.image);
        }
        return successMessage;
    }
}

class ErrorMessage {
    constructor(title, desc, received, checkArray) {
        this.title = title;
        this.desc = desc;
        this.received = received;
        this.checkArray = checkArray;
    }
    create(message) {
        let errorMessage = new Discord.MessageEmbed()
            .setColor("#fc0303")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(`Error, ${this.title}`)
            .setDescription(this.desc)
            .setTimestamp();
        if (this.received) {
            errorMessage.addField("Value Received", `\`${this.received}\``, true);
        }
        if (this.checkArray) {
            let matches = stringSimilarity.findBestMatch(this.received, this.checkArray);
            errorMessage.addField("You may be looking for", `\`${matches.bestMatch.target}\``, true);
        }
        return errorMessage;
    }
}

class InfoMessage {
    constructor(title, desc, image, footer, thumb) {
        this.title = title;
        this.desc = desc;
        this.image = image;
        this.footer = footer;
        this.thumb = thumb;
    }
    create(message) {
        let infoMessage = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(this.title)
            .setDescription(this.desc)
            .setTimestamp();
        if (this.thumb) {
            infoMessage.setThumbnail(this.thumb);
        }
        if (this.image) {
            infoMessage.setImage(this.image);
        }
        if (this.footer) {
            infoMessage.setFooter(this.footer);
        }
        return infoMessage;
    }
}

function rarityCheck(message, rq) {
    if (rq > 79) { //leggie
        return message.client.emojis.cache.get("857512942471479337");
    }
    else if (rq > 64 && rq <= 79) { //epic
        return message.client.emojis.cache.get("726025468230238268");
    }
    else if (rq > 49 && rq <= 64) { //ultra
        return message.client.emojis.cache.get("726025431937187850");
    }
    else if (rq > 39 && rq <= 49) { //super
        return message.client.emojis.cache.get("857513197937623042");
    }
    else if (rq > 29 && rq <= 39) { //rare
        return message.client.emojis.cache.get("726025302656024586");
    }
    else if (rq > 19 && rq <= 29) { //uncommon
        return message.client.emojis.cache.get("726025273421725756");
    }
    else { //common
        return message.client.emojis.cache.get("726020544264273928");
    }
}

function carNameGen(message, currentCar, rarity, upgrade) {
    const trophyEmoji = message.client.emojis.cache.get("775636479145148418");
    let make = currentCar["make"];
    if (typeof make === "object") {
        make = currentCar["make"][0];
    }
    let currentName = `${make} ${currentCar["model"]} (${currentCar["modelYear"]})`;
    if (rarity) {
        currentName = `(${rarity} ${currentCar["rq"]}) ${currentName}`;
    }
    if (upgrade) {
        currentName += ` [${upgrade}]`;
    }
    if (currentCar["isPrize"]) {
        currentName += ` ${trophyEmoji}`;
    }
    return currentName;
}

function unbritish(value, type) {
    switch (type) {
        case "0to60":
        case "accel":
            return (value * 1.036).toFixed(1);
        case "weight":
            return Math.round(value * 2.20462262185).toString();
        case "topSpeed":
            return Math.round(value * 1.60934).toString();
        default:
            return;
    }
}

function sendMessage(message, embed, buttons, preserve, editMessage) {
    if (!preserve) {
        delete message.client.execList[message.author.id];
    }
    let components = [buttons];
    if (!buttons) {
        components = [];
    }
    return editMessage ? editMessage.edit({ embeds: [embed], components: components }) : message.channel.send({ embeds: [embed], components: components });
}

function filterCheck(car, filter) {
    let currentCar = typeof car === "string" ? require(`../cars/${car}`) : require(`../cars/${carFiles.find(f => f.includes(car.carID))}`);
    for (const [key, value] of Object.entries(filter)) {
        switch (typeof value) {
            case "object":
                if (Array.isArray(value)) {
                    if (Array.isArray(currentCar[key])) {
                        let obj = {};
                        currentCar[key].forEach((tag, index) => obj[tag.toLowerCase()] = index);
                        return value.every(tagFilter => obj[tagFilter] !== undefined);
                    }
                    else {
                        return value.includes(currentCar[key].toLowerCase());
                    }
                }
                else {
                    return currentCar[key] >= value.start && currentCar[key] <= value.end;
                }
            case "string":
                if (key === "search") {
                    let make = currentCar["make"];
                    if (typeof make === "object") {
                        make = currentCar["make"][0];
                    }
                    let name = `${make} ${currentCar["model"]}`;
                    return name.toLowerCase().includes(value);
                }
                else {
                    return currentCar[key].toLowerCase() === value;
                }
            case "boolean":
                switch (key) {
                    case "isPrize":
                        return currentCar[key] === value;
                    case "isStock":
                        return (car["000"] > 0) === value;
                    case "isUpgraded":
                        return (car["333"] + car["666"] + car["996"] + car["969"] + car["699"] > 0) === value;
                    case "isMaxed":
                        return (car["996"] + car["969"] + car["699"] > 0) === value;
                    case "isOwned":
                        return true;
                    default:
                        break;
                }
            default:
                return;
        }
    }
}

module.exports = {
    SuccessMessage,
    InfoMessage,
    ErrorMessage,
    sendMessage,
    rarityCheck,
    carNameGen,
    unbritish,
    filterCheck
}