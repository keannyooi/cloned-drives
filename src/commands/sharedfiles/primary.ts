/*
__  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/
import { MessageButton, BaseGuildEmojiManager } from "discord.js";
import { FunctionArgsTemp } from "./classes";

interface RarityCheckArgs extends FunctionArgsTemp {
    emojis: BaseGuildEmojiManager;
    rq: number;
    shortenedLists: boolean;
}

interface UnitConvertArgs {
    value: number;
    type: string;
}

interface NameGenArgs extends FunctionArgsTemp {
    currentCar: {
        "rq": number;
        "make": string;
        "model": string;
        "modelYear": number;
        "isPrize": boolean;
    };
    rarity: boolean;
    upgrade: string;
}

interface GetButtonArgs {
    listType: string;
    buttonStyle: string;
}

function rarityCheck(args: RarityCheckArgs) {
    const emojis = args.message.client.emojis;
    if (args.shortenedLists) {
        return "RQ";
    }
    else if (args.rq > 79) { //leggie
        return emojis.cache.get("857512942471479337");
    }
    else if (args.rq > 64 && args.rq <= 79) { //epic
        return emojis.cache.get("726025468230238268");
    }
    else if (args.rq > 49 && args.rq <= 64) { //ultra
        return emojis.cache.get("726025431937187850");
    }
    else if (args.rq > 39 && args.rq <= 49) { //super
        return emojis.cache.get("857513197937623042");
    }
    else if (args.rq > 29 && args.rq <= 39) { //rare
        return emojis.cache.get("726025302656024586");
    }
    else if (args.rq > 19 && args.rq <= 29) { //uncommon
        return emojis.cache.get("726025273421725756");
    }
    else { //common
        return emojis.cache.get("726020544264273928");
    }
}

function carNameGen(args: NameGenArgs) {
    const trophyEmoji = args.message.client.emojis.cache.get("775636479145148418");
    const currentCar = args.currentCar;
    let make = currentCar["make"];
    if (typeof make === "object") {
        make = currentCar["make"][0];
    }
    let currentName = `${make} ${currentCar["model"]} (${currentCar["modelYear"]})`;
    if (args.rarity) {
        currentName = `(${args.rarity} ${currentCar["rq"]}) ${currentName}`;
    }
    if (args.upgrade) {
        currentName += ` [${args.upgrade}]`;
    }
    if (currentCar["isPrize"]) {
        currentName += ` ${trophyEmoji}`;
    }
    return currentName;
}

function unbritish(args: UnitConvertArgs) {
    switch (args.type) {
        case "0to60":
        case "accel":
            return (args.value * 1.036).toFixed(1);
        case "weight":
            return Math.round(args.value * 2.20462262185).toString();
        case "topSpeed":
            return Math.round(args.value * 1.60934).toString();
        default:
            return;
    }
}

function getButtons(args: GetButtonArgs) {
    switch (args.listType) {
        case "menu":
            let firstPage, prevPage, nextPage, lastPage;
            if (args.buttonStyle === "classic") {
                firstPage = new MessageButton()
                    .setStyle("SECONDARY")
                    .setEmoji("⏪")
                    .setCustomId("first_page");
                prevPage = new MessageButton()
                    .setStyle("SECONDARY")
                    .setEmoji("⬅️")
                    .setCustomId("prev_page");
                nextPage = new MessageButton()
                    .setStyle("SECONDARY")
                    .setEmoji("➡️")
                    .setCustomId("next_page");
                lastPage = new MessageButton()
                    .setStyle("SECONDARY")
                    .setEmoji("⏩")
                    .setCustomId("last_page");
            }
            else {
                firstPage = new MessageButton()
                    .setStyle("DANGER")
                    .setLabel("<<")
                    .setCustomId("first_page");
                prevPage = new MessageButton()
                    .setStyle("PRIMARY")
                    .setLabel("<")
                    .setCustomId("prev_page");
                nextPage = new MessageButton()
                    .setStyle("PRIMARY")
                    .setLabel(">")
                    .setCustomId("next_page");
                lastPage = new MessageButton()
                    .setStyle("DANGER")
                    .setLabel(">>")
                    .setCustomId("last_page");
            }
            return { firstPage: firstPage, prevPage: prevPage, nextPage: nextPage, lastPage: lastPage };
        case "choice":
            return;
        default:
            return;
    }
}

export {
    rarityCheck,
    carNameGen,
    unbritish,
    getButtons
};