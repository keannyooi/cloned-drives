/*
__  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const devMode: boolean = true;
require("dotenv").config();
import fs from "fs";
import { Message, User, Collection, Intents, Client } from "discord.js";
import mongoose from "mongoose";
// import { DateTime, Interval } from "luxon";
import { ErrorMessage, InfoMessage } from "./commands/sharedfiles/classes";
import { profileModel } from "./models/profileSchema";
const prefix: string = (devMode ? process.env.DEV_PREFIX : process.env.BOT_PREFIX)!;
const token: string = (devMode ? process.env.DEV_TOKEN : process.env.BOT_TOKEN)!;
const allowedCommands = ["carinfo.ts", "calculate.ts", "garage.ts", "ping.ts"];

const client = new Client({
	intents: [
		Intents.FLAGS.GUILDS,
		Intents.FLAGS.GUILD_MESSAGES,
		Intents.FLAGS.GUILD_MEMBERS,
		Intents.FLAGS.DIRECT_MESSAGES
	],
	partials: ["CHANNEL"]
});

client.commands = new Collection();
const cooldowns = new Collection();
const execList: {
	[key: string]: string;
} = {};
client.execList = execList;
let awakenTime = 0;

const commandFiles = fs.readdirSync("./commands").filter(file => file.endsWith(".ts"));
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

commandFiles.forEach(function (file) {
	if (allowedCommands.includes(file)) {
		let command = require(`./commands/${file}`);
		client.commands.set(command.name, command);
	}
});

mongoose.connect(process.env.MONGO_PW!, {
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
	devMode ? console.log("DevBote Ready!") : console.log("Bote Ready!");
	awakenTime = Date.now();
	const guild = await client.guilds.fetch("711769157078876305"); //don't mind me lmao
	const members = await guild.members.fetch();
	members.forEach(async (user: User) => {
		await newUser(user);
	});

	devMode ? client.user.setActivity("around with code", { type: "PLAYING" }) : client.user.setActivity("over everyone's garages", { type: "WATCHING" });
});

client.login(token);

client.on("messageCreate", async (message: Message) => {
	processCommand(message);
});

// client.on("guildMemberAdd", async member => {
// 	//await newUser(member);
// });

client.on("messageUpdate", (oldMessage: Message, newMessage: Message) => {
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
// 					user.send(`Notification: Your daily reward is now available! Claim it using \`${prefix}-daily\`.`)
// 						.catch(() => console.log(`unable to send notification to user ${user.id}`));
// 					await client.db.set(`acc${user.id}`, playerData);
// 				}
// 			}
// 		}
// 	});
// }, 180000);

async function processCommand(message: Message) {
	if (!message.content.toLowerCase().startsWith(prefix) || message.author.bot) return;
	if (devMode && !message.member!.roles.cache.has("711790752853655563")) return;

	const args: Array<string> = message.content.slice(prefix.length).split(/ +/);
	const commandName = args.shift()!.toLowerCase();
	const command = client.commands.get(commandName) || client.commands.find((cmd: { aliases: Array<string> }) =>
		cmd.aliases && cmd.aliases.includes(commandName));
	if (!command) {
		const errorMessage = new ErrorMessage({
			channel: message.channel,
			title: "Error, 404 command not found.",
			description: `It looks like this command doesn't exist. Try using \`${prefix}-help\` to find the command you are looking for.`,
			author: {
				name: message.author.tag,
				iconURL: message.author.displayAvatarURL()
			}
		})
			.displayClosest({
				received: commandName,
				checkArray: commandFiles.map(i => i.slice(0, -3))
			});
		return errorMessage.sendMessage({ message: message });
	}

	let hasProfile = await profileModel.exists({ userID: message.author.id });
	if (!hasProfile) {
		const errorMessage = new ErrorMessage({
			channel: message.channel,
			title: "Error, the bot has no record of you in the Cloned Drives discord server.",
			description: "Join the Discord server now to unlock access to the bot: https://discord.gg/PHgPyed",
			author: {
				name: message.author.tag,
				iconURL: message.author.displayAvatarURL()
			}
		});
		return errorMessage.sendMessage({ message: message });
	}
	switch (command.category) {
		case "Admin":
			if (!message.member!.roles.cache.has("711790752853655563")) {
				return accessDenied(message, "711790752853655563");
			}
			break;
		case "Community Management":
			if (!message.member!.roles.cache.has("802043346951340064")) {
				return accessDenied(message, "802043346951340064");
			}
			break;
		default:
			break;
	}
	if (command.args > 0 && args.length < command.args) {
		const errorMessage = new ErrorMessage({
			channel: message.channel,
			title: "Error, arguments provided insufficient or missing.",
			description: `Here's the correct syntax: \`${prefix}${command.name} ${command.usage}\``,
			author: {
				name: message.author.tag,
				iconURL: message.author.displayAvatarURL()
			}
		});
		return errorMessage.sendMessage({ message: message });
	}

	if (!cooldowns.has(command.name)) {
		cooldowns.set(command.name, new Collection());
	}
	const now = Date.now();
	const timestamps = cooldowns.get(command.name);
	const cooldownAmount = (command.cooldown || 1) * 1000;

	if (timestamps.has(message.author.id)) {
		const expTime = timestamps.get(message.author.id) + cooldownAmount;
		if (now < expTime) {
			const cooldownMessage = new InfoMessage({
				channel: message.channel,
				title: "You may not execute this command yet, there's a cooldown in place.",
				description: `The cooldown is there to prevent spamming. Try again in \`${Math.round((expTime - now) / 1000)}\` second(s).`,
				author: {
					name: message.author.tag,
					iconURL: message.author.displayAvatarURL()
				}
			});
			return cooldownMessage.sendMessage({
				message: message
			});
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
			const errorMessage = new ErrorMessage({
				channel: message.channel,
				title: "Error, you may not execute more than 1 command at a time.",
				description: "This will expire after the previous command has ended or after 30 seconds, whichever comes first. Please wait patiently.",
				fields: [
					{ name: "Currently Executing", value: client.execList[message.author.id] }
				],
				author: {
					name: message.author.tag,
					iconURL: message.author.displayAvatarURL()
				}
			});
			return errorMessage.sendMessage({
				message: message
			});
		}
	}
	catch (error) {
		console.error(error);
		const errorMessage = new ErrorMessage({
			channel: message.channel,
			title: "Error, failed to execute command.",
			description: "Something must have gone wrong. Please report this issue to the devs. \n`${error.stack}`",
			author: {
				name: message.author.tag,
				iconURL: message.author.displayAvatarURL()
			}
		});
		return errorMessage.sendMessage({ message: message });
	}
}

async function newUser(user: User) {
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

function accessDenied(message: Message, roleID: string) {
	const errorMessage = new ErrorMessage({
		channel: message.channel,
		title: "Error, it looks like you dont have access to this command.",
		description: `You don't have the <@&${roleID}> role, which is required to use this command.`,
		author: {
			name: message.author.tag,
			iconURL: message.author.displayAvatarURL()
		}
	});
	return errorMessage.sendMessage({ message: message });
}