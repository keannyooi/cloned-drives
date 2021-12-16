"use strict";
//devMode switch is in config.js

require("dotenv").config();
const { readdirSync } = require("fs");
const { Collection } = require("discord.js");
const { connect } = require("mongoose");
const { DateTime, Interval } = require("luxon");
const { ErrorMessage, InfoMessage, BotError } = require("./commands/sharedfiles/classes.js");
const bot = require("./config.js");
const profileModel = require("./models/profileSchema.js");
const prefix = bot.devMode ? process.env.DEV_PREFIX : process.env.BOT_PREFIX;
const token = bot.devMode ? process.env.DEV_TOKEN : process.env.BOT_TOKEN;
// this is for testing purposes, the line below will be deleted once everything is complete
const allowedCommands = ["carinfo.js", "calculate.js", "garage.js", "ping.js", "reload.js", "statistics.js", "addcar.js", "removecar.js", "addmoney.js", "removemoney.js", "carlist.js", "testpack.js", "trackinfo.js", "packinfo.js", "changetune.js", "upgrade.js", "fuse.js", "sell.js", "help.js", "filter.js", "settings.js", "sethand.js"];
const commandFiles = readdirSync("./commands").filter(file => file.endsWith(".js"));

commandFiles.forEach(function (file) {
    if (allowedCommands.includes(file)) {
        let command = require(`./commands/${file}`);
        bot.commands.set(command.name, command);
    }
});

connect(process.env.MONGO_PW, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
})
    .then(() => console.log("database connect successful!"))
    .catch(error => console.log(error));

bot.once("ready", async () => {
    bot.devMode ? console.log("DevBote Ready!") : console.log("Bote Ready!");
    bot.awakenTime = DateTime.now();
    const guild = await bot.guilds.fetch("711769157078876305");
    const members = await guild.members.fetch();
    members.forEach(async (user) => {
        await newUser(user);
    });
    bot.devMode ? bot.user.setActivity("around with code", { type: "PLAYING" }) : bot.user.setActivity("over everyone's garages", { type: "WATCHING" });
});

bot.login(token);

bot.on("messageCreate", async (message) => {
    processCommand(message);
});

bot.on("guildMemberAdd", async (member) => {
    //await newUser(member);
});

bot.on("messageUpdate", (oldMessage, newMessage) => {
    if (bot.awakenTime < oldMessage.createdTimestamp) {
        processCommand(newMessage);
    }
});

//loop thingy
// setInterval(async () => {
// 	const events = await bot.db.get("events");
// 	for (const [key, value] of Object.entries(events)) {
// 		if (key.startsWith("evnt") && value.timeLeft !== "unlimited" && value.isActive === true) {
// 			if (Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(value.deadline)).invalid !== null) {
// 				await bot.db.delete(`events.evnt${value.id}`);
// 				bot.channels.cache.get("798776756952629298").send(`**The ${value.name} event has officially finished. Thanks for playing!**`);
// 			}
// 		}
// 	}
// 	const offers = await bot.db.get("limitedOffers");
// 	for (let i = 0; i < offers.length; i++) {
// 		if (offers[i].timeLeft !== "unlimited" && offers[i].isActive === true) {
// 			if (Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(offers[i].deadline)).invalid !== null) {
// 				bot.channels.cache.get("798776756952629298").send(`**The ${offers[i].name} offer has officially ended.**`);
// 				offers.splice(i, 1);
// 			}
// 		}
// 	}
// 	await bot.db.set("limitedOffers", offers);
// 	const challenge = await bot.db.get("challenge");
// 	if (challenge.timeLeft !== "unlimited" && challenge.isActive === true) {
// 		if (Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(challenge.deadline)).invalid !== null) {
// 			bot.channels.cache.get("798776756952629298").send(`**The ${challenge.name} challenge has officially finished. Thanks for playing!**`);
// 			challenge.isActve = false;
// 			challenge.players = {};
// 			challenge.timeLeft = "unlimited";
// 			challenge.deadline = "idk";
// 		}
// 	}
// 	await bot.db.set("challenge", challenge);
// 	const guild = bot.guilds.cache.get("711769157078876305");
// 	guild.members.cache.forEach(async user => {
// 		const playerData = await bot.db.get(`acc${user.id}`);
// 		if (playerData) {
// 			if (playerData.settings.senddailynotifs === true) {
// 				let lastDaily = playerData.lastDaily;
// 				if (!lastDaily || !isNaN(lastDaily)) {
// 					lastDaily = DateTime.fromISO("2021-01-01");
// 				}
// 				else {
// 					lastDaily = DateTime.fromISO(lastDaily);
// 				}
// 				const interval = Interval.fromDateTimes(DateTime.now(), lastDaily.plus({ days: 1 }));
// 				if (interval.invalid !== null && !playerData.notifSent) {
// 					playerData.notifSent = true;
// 					user.send(`Notification: Your daily reward is now available! Claim it using \`${prefix}-daily\`.`)
// 						.catch(() => console.log(`unable to send notification to user ${user.id}`));
// 					await bot.db.set(`acc${user.id}`, playerData);
// 				}
// 			}
// 		}
// 	});
// }, 180000);

async function processCommand(message) {
    if (!message.content.toLowerCase().startsWith(prefix) || message.author.bot) return;
    if (bot.devMode && !message.member.roles.cache.has("711790752853655563")) return;

    const args = message.content.slice(prefix.length).split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = bot.commands.get(commandName) || bot.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
    if (!command) {
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, 404 command not found.",
            desc: "It looks like this command doesn't exist. Try using \`cd-help\` to find the command you are looking for.",
            author: message.author
        }).displayClosest(commandName, commandFiles.map(i => i.slice(0, -3)));
        return errorMessage.sendMessage();
    }

    let hasProfile = await profileModel.exists({ userID: message.author.id });
    if (!hasProfile) {
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, the bot has no record of you in the Cloned Drives discord server.",
            desc: "Join the Discord server now to unlock access to the bot: https://discord.gg/PHgPyed",
            author: message.author
        });
        return errorMessage.sendMessage();
    }

    switch (command.category) {
        case "Admin":
            if (!message.member.roles.cache.has("711790752853655563")) {
                return accessDenied(message, "711790752853655563");
            }
            break;
        case "Events":
            if (!message.member.roles.cache.has("917685033995751435")) {
                return accessDenied(message, "917685033995751435");
            }
            break;
        default:
            break;
    }

    if (command.args > 0 && args.length < command.args) {
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, arguments provided insufficient.",
            desc: `Please refer to the command's syntax by running \`cd-help ${command.name}\``,
            author: message.author
        });
        return errorMessage.sendMessage();
    }
    if (!bot.cooldowns.has(command.name)) {
        bot.cooldowns.set(command.name, new Collection());
    }
    const now = Date.now();
    const timestamps = bot.cooldowns.get(command.name);
    const cooldownAmount = (command.cooldown || 1) * 1000;
    if (timestamps.has(message.author.id)) {
        const expTime = timestamps.get(message.author.id) + cooldownAmount;
        if (now < expTime) {
            const cooldownMessage = new InfoMessage({
                channel: message.channel,
                title: "You may not execute this command yet, there's a cooldown in place.",
                desc: `The cooldown is there to prevent spamming. Try again in \`${Math.round((expTime - now) / 1000)}\` second(s).`,
                author: message.author
            });
            return cooldownMessage.sendMessage();
        }
    }
    timestamps.set(message.author.id, now);
    setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

    try {
        if (!bot.execList[message.author.id]) {
            bot.execList[message.author.id] = command.name;
            await command.execute(message, args);
            setTimeout(() => {
                if (bot.execList[message.author.id]) {
                    delete bot.execList[message.author.id];
                }
            }, 30000);
        }
        else {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, you may only execute 1 command at a time.",
                desc: "This error will disappear once the currently executing command finishes or after 30 seconds, whichever comes first.",
                author: message.author,
                fields: [{ name: "Currenty Executing", value: `\`${bot.execList[message.author.id]}\`` }]
            });
            return errorMessage.sendMessage();
        }
    }
    catch (error) {
        console.error(error);
        const errorMessage = new ErrorMessage({
            channel: message.channel,
            title: "Error, failed to execute command.",
            desc: `Something must have gone wrong. Don't worry, I've already reported this issue to the devs.\n\`${error.stack}\``,
            author: message.author
        });
        await errorMessage.sendMessage();
        
        const errorReport = new BotError({
            guild: message.guild,
            channel: message.channel,
            message,
            stack: error.stack,
        });
        return errorReport.sendReport();
    }
}

async function newUser(user) {
    let params = { userID: user.id };
    let hasProfile = await profileModel.exists(params);
    if (!hasProfile && !user.bot) {
        let profile = await profileModel.create(params);
        profile.save();
        console.log(`profile created for user ${user.id}`);
    }
}

function accessDenied(message, roleID) {
    const errorMessage = new ErrorMessage({
        channel: message.channel,
        title: "Error, it looks like you dont have access to this command.",
        desc:  `You don't have the <@&${roleID}> role, which is required to use this command.`,
        author: message.author
    });
    return errorMessage.sendMessage();
}

//automatic database backup system
const { spawn } = require("child_process");
const { schedule } = require("node-cron");
schedule("59 23 * * *", () => {
    const backupProcess = spawn("mongodump", [
        `--uri=${process.env.MONGO_URI}`,
        "--gzip"
    ]);
    backupProcess.on("exit", (code, signal) => {
        if (code) {
            console.error("database backup process exited with code ", code);
        }
        else if (signal) {
            console.error("database backup process killed with signal ", signal);
        }
        else {
            console.log("database backup success!");
        }
    });
});