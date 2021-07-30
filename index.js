/*
__  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

require("dotenv").config();
const fs = require("fs");
const Discord = require("discord.js");
const disbut = require("discord-buttons");
const {
    Database
} = require("quickmongo");
const {
    DateTime,
    Interval
} = require("luxon");
const stringSimilarity = require("string-similarity");

class ErrorMessage {
    constructor(title, desc, received, checkArray) {
        this.title = title;
        this.desc = desc;
        this.received = received;
        this.checkArray = checkArray;
    }
    error(message) {
        let errorMessage = new Discord.MessageEmbed()
            .setColor("#fc0303")
            .setAuthor(message.author.tag, message.author.displayAvatarURL({
                format: "png",
                dynamic: true
            }))
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

const client = new Discord.Client();
client.commands = new Discord.Collection();
const cooldowns = new Discord.Collection();
client.db = new Database(process.env.MONGO_PW);
client.execList = {};
disbut(client);

const commandFiles = fs.readdirSync("./commands").filter(file => file.endsWith(".js"));
const starterGarage = [{
        carFile: "honda s2000 (1999).json",
        "000": 1,
        "333": 0,
        "666": 0,
        "996": 0,
        "969": 0,
        "699": 0
    },
    {
        carFile: "peugeot 405 mi16 (1989).json",
        "000": 1,
        "333": 0,
        "666": 0,
        "996": 0,
        "969": 0,
        "699": 0
    },
    {
        carFile: "range rover county (1989).json",
        "000": 1,
        "333": 0,
        "666": 0,
        "996": 0,
        "969": 0,
        "699": 0
    },
    {
        carFile: "nissan leaf (2010).json",
        "000": 1,
        "333": 0,
        "666": 0,
        "996": 0,
        "969": 0,
        "699": 0
    },
    {
        carFile: "de tomaso mangusta (1967).json",
        "000": 1,
        "333": 0,
        "666": 0,
        "996": 0,
        "969": 0,
        "699": 0
    }
];

for (const file of commandFiles) {
    let command = require(`./commands/${file}`);
    client.commands.set(command.name, command);
}

client.once("ready", async () => {
    console.log("Bote Ready!");
    const guild = client.guilds.cache.get("711769157078876305"); //don't mind me lmao
    guild.members.cache.forEach(async user => {
        await newUser(user);
    });

    client.user.setActivity("over everyone's garages", {
        type: "WATCHING"
    });
});

client.login(process.env.BOT_TOKEN);

client.on("message", message => {
    processCommand(message);
});

client.on("guildMemberAdd", async member => {
    await newUser(member);
});

client.on("messageUpdate", (oldMessage, newMessage) => {
    processCommand(newMessage);
});

//loop thingy
setInterval(async () => {
    const events = await client.db.get("events");
    for (const [key, value] of Object.entries(events)) {
        if (key.startsWith("evnt") && value.timeLeft !== "unlimited" && value.isActive === true) {
            if (Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(value.deadline)).invalid !== null) {
                await client.db.delete(`events.evnt${value.id}`);
                client.channels.cache.get("798776756952629298").send(`**The ${value.name} event has officially finished. Thanks for playing!**`);
            }
        }
    }

    const offers = await client.db.get("limitedOffers");
    for (let i = 0; i < offers.length; i++) {
        if (offers[i].timeLeft !== "unlimited" && offers[i].isActive === true) {
            if (Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(offers[i].deadline)).invalid !== null) {
                client.channels.cache.get("798776756952629298").send(`**The ${offers[i].name} offer has officially ended.**`);
                offers.splice(i, 1);
            }
        }
    }
    await client.db.set("limitedOffers", offers);

    const challenge = await client.db.get("challenge");
    if (challenge.timeLeft !== "unlimited" && challenge.isActive === true) {
        if (Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(challenge.deadline)).invalid !== null) {
            client.channels.cache.get("798776756952629298").send(`**The ${challenge.name} challenge has officially finished. Thanks for playing!**`);
            challenge.isActve = false;
            challenge.players = {};
            challenge.timeLeft = "unlimited";
            challenge.deadline = "idk";
        }
    }
    await client.db.set("challenge", challenge);

    const guild = client.guilds.cache.get("711769157078876305");
    guild.members.cache.forEach(async user => {
        const playerData = await client.db.get(`acc${user.id}`);
        if (playerData) {
            if (playerData.settings.senddailynotifs === true) {
                let lastDaily = playerData.lastDaily;
                if (!lastDaily || !isNaN(lastDaily)) {
                    lastDaily = DateTime.fromISO("2021-01-01");
                } else {
                    lastDaily = DateTime.fromISO(lastDaily);
                }

                const interval = Interval.fromDateTimes(DateTime.now(), lastDaily.plus({
                    days: 1
                }));
                if (interval.invalid !== null && !playerData.notifSent) {
                    playerData.notifSent = true;
                    user.send("Notification: Your daily reward is now available! Claim it using `cd-daily`.")
                        .catch(() => console.log(`unable to send notification to user ${user.id}`));
                    await client.db.set(`acc${user.id}`, playerData);
                }
            }
        }
    });
}, 180000);

function processCommand(message) {
    if (!message.content.toLowerCase().startsWith(process.env.PREFIX) || message.author.bot) return;

    const args = message.content.slice(process.env.PREFIX.length).split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
    if (!command) {
        return notFound(message, commandName, commandFiles.map(i => i.slice(0, -3)));
    }

    checkPermissions(command, message.author);
    if (command.args > 0 && args.length < command.args) {
        return missingArgs(message, command.name, command.usage);
    }
    cooldown(message, command);
    executeCommand(message, command, args);
}

async function newUser(user) {
    if (await client.db.has(`acc${user.id}`) === false && user.guild.id === "711769157078876305") {
        console.log("creating new player's database...");
        await client.db.set(`acc${user.id}`, {
            money: 0,
            fuseTokens: 0,
            trophies: 0,
            garage: starterGarage,
            decks: [],
            campaignProgress: {
                chapter: 0,
                part: 1,
                race: 1
            },
            unclaimedRewards: {
                money: 0,
                fuseTokens: 0,
                trophies: 0,
                cars: [],
                packs: []
            },
            settings: {
                enablegraphics: true,
                senddailynotifs: false,
                filtercarlist: true,
                filtergarage: true,
                showbmcars: false,
                unitpreference: "british",
                sortingorder: "descending",
                buttonstyle: "default",
                shortenedlists: false
            }
        });
        console.log(user.id);
    }
}

async function checkPermissions(command, message) {
    if (await client.db.has(`acc${message.author.id}`) === false) {
        return noRecord(message);
    }
    switch (command.category) {
        case "Admin":
            if (!message.member.roles.cache.has("711790752853655563")) {
                return accessDenied(message, "711790752853655563");
            }
            break;
        case "Community Management":
            if (!message.member.roles.cache.has("802043346951340064")) {
                return accessDenied(message, "802043346951340064");
            }
            break;
        default:
            break;
    }
}

function cooldown(message, command) {
    if (!cooldowns.has(command.name)) {
        cooldowns.set(command.name, new Discord.Collection());
    }

    const now = Date.now();
    const timestamps = cooldowns.get(command.name);
    const cooldownAmount = (command.cooldown || 1) * 1000;

    if (timestamps.has(message.author.id)) {
        const expTime = timestamps.get(message.author.id) + cooldownAmount;
        if (now < expTime) {
            const timeLeft = (expTime - now) / 1000;
            const infoScreen = new Discord.MessageEmbed()
                .setColor("#34aeeb")
                .setAuthor(message.author.tag, message.author.displayAvatarURL({
                    format: "png",
                    dynamic: true
                }))
                .setTitle("It looks like the cooldown for this command is not over yet.")
                .setDescription(`Try again in ${Math.round(timeLeft) + 1} seconds!`)
                .setTimestamp();
            return message.channel.send(infoScreen);
        }
    }
    timestamps.set(message.author.id, now);
    setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);
}

async function executeCommand(message, command, args) {
    try {
        if (!client.execList[message.author.id]) {
            client.execList[message.author.id] = command.name;
            await command.execute(message, args);
            setTimeout(() => {
                if (client.execList[message.author.id]) {
                    delete client.execList[message.author.id];
                }
            }, 30000);
        } else {
            return multiExec(message, client.execList[message.author.id]);
        }
    } catch (error) {
        return execFailed(message, error);
    }
}

function notFound(message, command, commandList) {
    const errorMessage = new ErrorMessage(
        "404 command not found.",
        "It looks like this command doesn't exist. Try using `cd-help` to find the command you are looking for.",
        command,
        commandList
    )
    console.log(errorMessage);
    return message.channel.send(errorMessage.error(message));
}

function accessDenied(message, roleID) {
    const errorMessage = new ErrorMessage(
        "it looks like you dont have access to this command.",
        `You don't have the <@&${roleID}> role, which is required to use this command.`
    )
    return message.channel.send(errorMessage.error(message));
}

function noRecord(message) {
    const errorMessage = new ErrorMessage(
        "the bot has no record of you in the Cloned Drives discord server.",
        "Join the Discord server now to unlock access to the bot: https://discord.gg/PHgPyed"
    )
    return message.channel.send(errorMessage.error(message));
}

function missingArgs(message, commandName, usage) {
    const errorMessage = new ErrorMessage(
        "arguments provided insufficient or missing.",
        `Here's the correct syntax: \`${process.env.PREFIX}${commandName} ${usage}\``,
    )
    return message.channel.send(errorMessage.error(message));
}

function multiExec(message, currentCommand) {
    const errorMessage = new ErrorMessage(
        "you may not execute more than 1 command at a time.",
        `This will expire after the previous command has ended or after 30 seconds, whichever comes first. Please wait patiently.
		Currenty Executing: \`cd-${currentCommand.name}\``,
    )
    return message.channel.send(errorMessage.error(message));
}

function execFailed(message, error) {
    console.error(error);
    delete client.execList[message.author.id];
    const errorMessage = new ErrorMessage(
        "failed to execute command.",
        `Something must have gone wrong. Please report this issue to the devs.
		\`${error.stack}\``,
    )
    return message.channel.send(errorMessage.error(message));
}