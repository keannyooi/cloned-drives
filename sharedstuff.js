/*
__  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/
const Discord = require("discord.js");
const stringSimilarity = require("string-similarity");

class SuccessMessage {
    constructor(title, desc, image) {
        this.title = title;
        this.desc = desc;
        this.image = image;
    }
    create(message, removeRecord) {
        let successMessage = new Discord.MessageEmbed()
            .setColor("#03fc24")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(`Successfully ${this.title}!`)
            .setDescription(this.desc)
            .setTimestamp();
        if (removeRecord) {
            delete message.client.execList[message.author.id];
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
    create(message, removeRecord) {
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
        if (removeRecord) {
            delete message.client.execList[message.author.id];
        }
        return errorMessage;
    }
}

class InfoMessage {
    constructor(title, desc, removeRecord) {
        this.title = title;
        this.desc = desc;
        this.removeRecord = removeRecord;
    }
    create(message, removeRecord) {
        let infoMessage = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(this.title)
            .setDescription(this.desc)
            .setTimestamp();
        if (removeRecord) {
            delete message.client.execList[message.author.id];
        }
        return infoMessage;
    }
}

class ListMessage {
    constructor(title, desc, lists) {
        this.title = title;
        this.desc = desc;
        this.lists = lists;
    }
    init(message, page) {
        let listMessage = new Discord.MessageEmbed()
            .setColor("#34aeeb")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(this.title)
            .setDescription(this.desc)
            .setTimestamp();
        for (let list of this.lists) {
            listMessage.addField(list[0], list[1], true);
        }
        return message.channel.send(listMessage);
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

function carName(message, currentCar, rarity, upgrade) {
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

module.exports = {
    SuccessMessage,
    InfoMessage,
    ErrorMessage,
    ListMessage,
    rarityCheck,
    carName
}