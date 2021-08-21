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
const mongoose = require("mongoose");
const { DateTime, Interval } = require("luxon");
const { ErrorMessage, InfoMessage, sendMessage } = require("./commands/sharedfiles/primary.js");
const profileModel = require("./models/profileSchema.js");

const client = new Discord.Client({
	intents: [
		Discord.Intents.FLAGS.GUILDS,
		Discord.Intents.FLAGS.GUILD_MESSAGES,
		Discord.Intents.FLAGS.GUILD_MEMBERS,
		Discord.Intents.FLAGS.DIRECT_MESSAGES
	],
	partials: ["CHANNEL"]
});
client.commands = new Discord.Collection();
const cooldowns = new Discord.Collection();
client.execList = {};
let awakenTime = 0;

const commandFiles = fs.readdirSync("./commands").filter(file => file.endsWith(".js"));
const starterGarage = [
	{
		carID: "c00552",
		"000": 1,
		"333": 0,
		"666": 0,
		"996": 0,
		"969": 0,
		"699": 0
	},
	{
		carID: "c01032",
		"000": 1,
		"333": 0,
		"666": 0,
		"996": 0,
		"969": 0,
		"699": 0
	},
	{
		carID: "c01134",
		"000": 1,
		"333": 0,
		"666": 0,
		"996": 0,
		"969": 0,
		"699": 0
	},
	{
		carID: "c00943",
		"000": 1,
		"333": 0,
		"666": 0,
		"996": 0,
		"969": 0,
		"699": 0
	},
	{
		carID: "c00335",
		"000": 1,
		"333": 0,
		"666": 0,
		"996": 0,
		"969": 0,
		"699": 0
	}
];

const allowedCommands = ["carinfo", "calculate", "garage", "carinfo", "reload"];
commandFiles.forEach(function (file) {
	if (allowedCommands.includes(file)) {
		let command = require(`./commands/${file}`);
		client.commands.set(command.name, command);
	}
});

mongoose.connect(process.env.MONGO_PW, {
	useNewUrlParser: true,
	useUnifiedTopology: true,
	useFindAndModify: false,
})
	.then(() => {
		console.log("database connect successful!");
	})
	.catch(error => {
		console.log(error);
	});

client.once("ready", async () => {
	console.log("Bote Ready!");
	awakenTime = Date.now();
	const guild = await client.guilds.fetch("711769157078876305"); //don't mind me lmao
	const members = await guild.members.fetch();
	members.forEach(async user => {
		await newUser(user);
	});

	client.user.setActivity("over everyone's garages", { type: "WATCHING" });
});

client.login(process.env.BOT_TOKEN);

client.on("messageCreate", async message => {
	processCommand(message);
});

client.on("guildMemberAdd", async member => {
	//await newUser(member);
});

client.on("messageUpdate", (oldMessage, newMessage) => {
	if (awakenTime < oldMessage.createdTimestamp) {
		processCommand(newMessage);
	}
});

//loop thingy
// setInterval(async () => {
// 	const events = await client.db.get("events");
// 	for (const [key, value] of Object.entries(events)) {
// 		if (key.startsWith("evnt") && value.timeLeft !== "unlimited" && value.isActive === true) {
// 			if (Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(value.deadline)).invalid !== null) {
// 				await client.db.delete(`events.evnt${value.id}`);
// 				client.channels.cache.get("798776756952629298").send(`**The ${value.name} event has officially finished. Thanks for playing!**`);
// 			}
// 		}
// 	}

// 	const offers = await client.db.get("limitedOffers");
// 	for (let i = 0; i < offers.length; i++) {
// 		if (offers[i].timeLeft !== "unlimited" && offers[i].isActive === true) {
// 			if (Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(offers[i].deadline)).invalid !== null) {
// 				client.channels.cache.get("798776756952629298").send(`**The ${offers[i].name} offer has officially ended.**`);
// 				offers.splice(i, 1);
// 			}
// 		}
// 	}
// 	await client.db.set("limitedOffers", offers);

// 	const challenge = await client.db.get("challenge");
// 	if (challenge.timeLeft !== "unlimited" && challenge.isActive === true) {
// 		if (Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(challenge.deadline)).invalid !== null) {
// 			client.channels.cache.get("798776756952629298").send(`**The ${challenge.name} challenge has officially finished. Thanks for playing!**`);
// 			challenge.isActve = false;
// 			challenge.players = {};
// 			challenge.timeLeft = "unlimited";
// 			challenge.deadline = "idk";
// 		}
// 	}
// 	await client.db.set("challenge", challenge);

// 	const guild = client.guilds.cache.get("711769157078876305");
// 	guild.members.cache.forEach(async user => {
// 		const playerData = await client.db.get(`acc${user.id}`);
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
// 					user.send("Notification: Your daily reward is now available! Claim it using `cd-daily`.")
// 						.catch(() => console.log(`unable to send notification to user ${user.id}`));
// 					await client.db.set(`acc${user.id}`, playerData);
// 				}
// 			}
// 		}
// 	});
// }, 180000);

async function processCommand(message) {
	if (!message.content.toLowerCase().startsWith(process.env.PREFIX) || message.author.bot) return;

	const args = message.content.slice(process.env.PREFIX.length).split(/ +/);
	const commandName = args.shift().toLowerCase();
	const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
	if (!command) {
		const errorMessage = new ErrorMessage(
			"404 command not found.",
			"It looks like this command doesn't exist. Try using `cd-help` to find the command you are looking for.",
			commandName,
			commandFiles.map(i => i.slice(0, -3))
		);
		return sendMessage(message, errorMessage.create(message));
	}

	let hasProfile = await profileModel.exists({ userID: message.author.id });
	if (!hasProfile) {
		const errorMessage = new ErrorMessage(
			"the bot has no record of you in the Cloned Drives discord server.",
			"Join the Discord server now to unlock access to the bot: https://discord.gg/PHgPyed"
		);
		return sendMessage(message, errorMessage.create(message));
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
	if (command.args > 0 && args.length < command.args) {
		const errorMessage = new ErrorMessage(
			"arguments provided insufficient or missing.",
			`Here's the correct syntax: \`${process.env.PREFIX}${command.name} ${command.usage}\``,
		);
		return sendMessage(message, errorMessage.create(message));
	}

	if (!cooldowns.has(command.name)) {
		cooldowns.set(command.name, new Discord.Collection());
	}
	const now = Date.now();
	const timestamps = cooldowns.get(command.name);
	const cooldownAmount = (command.cooldown || 1) * 1000;

	if (timestamps.has(message.author.id)) {
		const expTime = timestamps.get(message.author.id) + cooldownAmount;
		if (now < expTime) {
			const cooldownMessage = new InfoMessage(
				"You may not execute this command yet, there's a cooldown in place.",
				`The cooldown is there to prevent spamming. Try again in \`${Math.round((expTime - now) / 1000)}\` second(s).`,
			);
			return sendMessage(message, cooldownMessage.create(message));
		}
	}
	timestamps.set(message.author.id, now);
	setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

	try {
		if (!client.execList[message.author.id]) {
			client.execList[message.author.id] = command.name;
			await command.execute(message, args);
			setTimeout(() => {
				if (client.execList[message.author.id]) {
					delete client.execList[message.author.id];
				}
			}, 30000);
		}
		else {
			const errorMessage = new ErrorMessage(
				"you may not execute more than 1 command at a time.",
				"This will expire after the previous command has ended or after 30 seconds, whichever comes first. Please wait patiently.",
			)
			return sendMessage(message, errorMessage.create(message).addField("Currenty Executing", `\`cd-${client.execList[message.author.id]}\``));
		}
	}
	catch (error) {
		console.error(error);
		const errorMessage = new ErrorMessage(
			"failed to execute command.",
			`Something must have gone wrong. Please report this issue to the devs.
		\`${error.stack}\``
		);
		return sendMessage(message, errorMessage.create(message));
	}
}

async function newUser(user) {
	let hasProfile = await profileModel.exists({ userID: user.id });
	if (!hasProfile && !user.bot) {
		let profile = await profileModel.create({
			userID: user.id,
			money: 0,
			fuseTokens: 0,
			trophies: 0,
			garage: starterGarage,
			decks: [],
			hand: {},
			rrStats: {
				opponent: {},
				trackset: "",
				reqs: {},
				streak: 0,
				highestStreak: 0,
				usedCars: {}
			},
			dailyStats: {
				lastDaily: "",
				streak: 0,
				highestStreak: 0,
				notifSent: false,
			},
			campaignProgress: {
				chapter: 0,
				stage: 1,
				race: 1,
			},
			unclaimedRewards: {
				money: 0,
				fuseTokens: 0,
				trophies: 0,
				cars: [],
				packs: []
			},
			cooldowns: {},
			filter: {},
			settings: {},
		});
		profile.save();
		console.log(`profile created for user ${user.id}`);
	}
}

function accessDenied(message, roleID) {
	const errorMessage = new ErrorMessage(
		"it looks like you dont have access to this command.",
		`You don't have the <@&${roleID}> role, which is required to use this command.`
	);
	return sendMessage(message, errorMessage.create(message));
}