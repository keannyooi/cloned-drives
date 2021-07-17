/*
__  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

// only run this when updating database shiet

const Discord = require("discord.js-light");
const { Database } = require("quickmongo");
const { prefix, token } = require("./config.json");

const client = new Discord.Client({
    cacheGuilds: true,
    cacheChannels: true,
    cacheOverwrites: false,
    cacheRoles: false,
    cacheEmojis: true,
    cachePresences: false,
    fetchAllMembers: true
});
client.db = new Database("mongodb+srv://keanny:6x6IsBae@databaseclusterthing.as94y.mongodb.net/DatabaseClusterThing?retryWrites=true&w=majority");

client.once("ready", async () => {
    console.log("database replace mode initiated");
    const guild = client.guilds.cache.get("711769157078876305"); //don't mind me lmao
    guild.members.cache.forEach(async user => {
        const playerData = await client.db.get(`acc${user.id}`);
        let i = 0;
        while (i < playerData.garage.length) {
            let hmm = playerData.garage[i].carFile;
            playerData.garage[i].carFile = compare(hmm);
            i++;
        }
        playerData.decks.forEach(deck => {
            for (let x = 0; x < deck.hand.length; x++) {
                let oop = deck.hand[x];
                deck.hand[x] = compare(oop);
            }
        });

        if (playerData.hand) {
            let uwu = playerData.hand.carFile;
            playerData.hand.carFile = compare(uwu);
        }
        await client.db.set(`acc${user.id}`, playerData);
    });

    // const catalog = await client.db.get("dealershipCatalog");
    // console.log(catalog);
    // let i = 0;
    // while (i < catalog.length) {
    //  	if (catalog[i].carFile === "lexus is300 (2003)") {
    //  		catalog[i].carFile = "lexus is 300 (2003)";
    //  	}
    //  	i++;
    // }
    // await client.db.set("dealershipCatalog", catalog);

    // const challenge = await client.db.get("challenge");
    // challenge.roster.forEach(round => {
    //     for (let x = 0; x < round.hand.length; x++) {
    //         let yse = round.hand[x];
    //         round.hand[x] = compare(yse);
    //     }
    // })
    // await client.db.set("challenge", challenge);

    client.user.setActivity("with database update code", { type: "PLAYING" });
});

client.login(token);

function compare(carFile) {
    if (carFile === "fiat tempra 2.5 td (1989).json") {
        console.log("croma done");
        return "fiat croma 2.5 td (1989).json";
    }
    else if (carFile === "gmc s-15 jimmy slx (1990).json") {
        console.log("jimmy done");
        return "gmc s-15 jimmy glx (1990).json";
    }
    else if (carFile === "opel lotus carlton (1990).json") {
        console.log("omega done");
        return "opel lotus omega (1990).json";
    }
    else {
        return carFile;
    }
}