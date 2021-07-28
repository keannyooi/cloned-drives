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

const client = new Discord.Client({
    cacheGuilds: true,
    cacheChannels: true,
    cacheOverwrites: false,
    cacheRoles: false,
    cacheEmojis: true,
    cachePresences: false,
    fetchAllMembers: true
});
client.db = new Database(process.env.MONGO_PW);

client.once("ready", async () => {
    console.log("database replace mode initiated");
    const guild = client.guilds.cache.get("711769157078876305"); //don't mind me lmao
    guild.members.cache.forEach(async user => {
        const playerData = await client.db.get(`acc${user.id}`);
        // let i = 0;
        // while (i < playerData.garage.length) {
        //     let hmm = playerData.garage[i].carFile;
        //     playerData.garage[i].carFile = compare(hmm);
        //     i++;
        // }
        // playerData.decks.forEach(deck => {
        //     for (let x = 0; x < deck.hand.length; x++) {
        //         let oop = deck.hand[x];
        //         deck.hand[x] = compare(oop);
        //     }
        // });

        // if (playerData.hand) {
        //     let uwu = playerData.hand.carFile;
        //     playerData.hand.carFile = compare(uwu);
        // }
        playerData.settings.buttonstyle = "default";
        playerData.settings.shortenedlists = false;
        console.log("options updated");
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

client.login(process.env.BOT_TOKEN);

function compare(carFile) {
    if (carFile === "toyota sienna xle awd (2009).json") {
        console.log("merc done");
        return "toyota sienna xle limtied awd (2009).json";
    }
    else {
        return carFile;
    }
}