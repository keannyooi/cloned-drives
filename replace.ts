/*
__  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

// only run this when updating database shiet

require("dotenv").config();
import fs from "fs";
import Discord from "discord.js";
const carFiles = fs.readdirSync("./commands/cars").filter(file => file.endsWith(".json"));
const packFiles = fs.readdirSync("./commands/packs").filter(file => file.endsWith(".json"));
const trackFiles = fs.readdirSync("./commands/tracks").filter(file => file.endsWith(".json"));
const client = new Discord.Client({ intents: [Discord.Intents.FLAGS.GUILDS, Discord.Intents.FLAGS.GUILD_MESSAGES] });

client.once("ready", async () => {
    console.log("id replace mode initiated");
    let i = 0;
    [carFiles, packFiles, trackFiles].forEach(group => {
        updateIDs(group, i);
        i++;
    });

    client.user.setActivity("with database update code", { type: "PLAYING" });
});

client.login(process.env.BOT_TOKEN);

function updateIDs(group: Array<string>, index: number) {
    let reference = ["cars", "packs", "tracks"], type = reference[index];
    let idAmount = group.filter(f => f.startsWith(type.charAt(0)) && !isNaN(f.substring(1))).length;
    for (let file of group) {
        let test = file.slice(0, 6);
        if (!test.startsWith(type.charAt(0)) || isNaN(test.substring(1))) {
            idAmount++;
            let id = String(idAmount).padStart(5, "0");
            let currentName = `${type.charAt(0)}${id}.json`;
            console.log(currentName);
            fs.renameSync(`./commands/${type}/${file}`, `./commands/${type}/${currentName.toLowerCase()}`);
        }
    }
}