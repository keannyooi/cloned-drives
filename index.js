/*
__  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const backupMode = false;
const fs = require("fs");
const Discord = require("discord.js-light");
const disbut = require("discord-buttons");
const { Database } = require("quickmongo");
const { prefix, token } = require("./config.json");
const { DateTime, Interval } = require("luxon");
const stringSimilarity = require("string-similarity");

const client = new Discord.Client({
	cacheGuilds: true,
	cacheChannels: true,
	cacheOverwrites: false,
	cacheRoles: false,
	cacheEmojis: true,
	cachePresences: false,
	fetchAllMembers: true
});

client.commands = new Discord.Collection();
const cooldowns = new Discord.Collection();
client.db = new Database("mongodb+srv://keanny:6x6IsBae@databaseclusterthing.as94y.mongodb.net/DatabaseClusterThing?retryWrites=true&w=majority");
client.execList = [];
disbut(client);

const commandFiles = fs.readdirSync("./commands").filter(file => file.endsWith(".js"));
const starterGarage = [
	{
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
const keepAlive = require("./server.js");

for (const file of commandFiles) {
	let command = require(`./commands/${file}`);
	client.commands.set(command.name, command);
}

client.once("ready", async () => {
	console.log("Bote Ready!");
	const guild = client.guilds.cache.get("711769157078876305"); //don't mind me lmao
	guild.members.cache.forEach(async user => {
		if (await client.db.has(`acc${user.id}`) === false) {
			console.log("creating new player's database...");
			await client.db.set(`acc${user.id}`, {
				money: 0,
				fuseTokens: 0,
				trophies: 0,
				garage: starterGarage,
				decks: [],
				campaignProgress: { chapter: 0, part: 1, race: 1 },
				unclaimedRewards: { money: 0, fuseTokens: 0, trophies: 0, cars: [], packs: [] },
				settings: { enablegraphics: true, senddailynotifs: false, filtercarlist: true, filtergarage: true, showbmcars: false }
			});
			console.log(user.id);
		}

		// const garage = await client.db.get(`acc${user.id}.garage`);
		// var i = 0;
		// while (i < garage.length) {
		//  	if (garage[i].carFile === "porsche cayenne turbo coupe (2020).json") {
		//  		garage[i].carFile = "porsche cayenne turbo coupe (2019).json";
		// 		console.log("done");
		//  	}
		// 	if (garage[i].carFile === "mercedes-benz a 160 (1997).json") {
		// 		garage[i].carFile = "mercedes-benz a 160 classic (1997).json";
		// 	   console.log("done");
		// 	}
		//  	i++;
		// }
		// await client.db.set(`acc${user.id}.garage`, garage);
	});
	//await client.db.set("limitedOffers", []);

	// const catalog = await client.db.get("dealershipCatalog");
	// console.log(catalog);
	// var i = 0;
	// while (i < catalog.length) {
	//  	if (catalog[i].carFile === "lexus is300 (2003)") {
	//  		catalog[i].carFile = "lexus is 300 (2003)";
	//  	}
	//  	i++;
	// }
	// await client.db.set("dealershipCatalog", catalog);

	client.user.setActivity("over everyone's garages", { type: "WATCHING" });
});

if (backupMode) {
	keepAlive();
}
client.login(token);

client.on("message", async message => {
	if (!message.content.toLowerCase().startsWith(prefix) || message.author.bot) return;

	const args = message.content.slice(prefix.length).split(/ +/);
	const commandName = args.shift().toLowerCase();
	const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
	if (!command) {
		let matches = stringSimilarity.findBestMatch(commandName, commandFiles.map(i => i.slice(0, -3)));
		const errorMessage = new Discord.MessageEmbed()
			.setColor("#fc0303")
			.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
			.setTitle("Error, 404 command not found.")
			.setDescription("It looks like this command doesn't exist. Try using `cd-help` to find the command you are looking for.")
			.addField("You may be looking for", `\`cd-${matches.bestMatch.target}\``)
			.setTimestamp();
		return message.channel.send(errorMessage);
	}

	if (command.category === "Admin") {
		if (message.channel.type !== "text") {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, this command can only be executed in the Cloned Drives discord server.")
				.setDescription("Link to Discord server: https://discord.gg/PHgPyed")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}
		if (message.guild.id !== "711769157078876305") {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, this command can only be executed in the Cloned Drives discord server.")
				.setDescription("Link to Discord server: https://discord.gg/PHgPyed")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}
		if (!message.member.roles.cache.has("711790752853655563")) {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, it looks like you attempted using an Admin-only command.")
				.setDescription("You don't have the <@&711790752853655563> role, which is required to use this command.")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}
	}
	if (command.category === "Community Management") {
		if (message.channel.type !== "text") {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, this command can only be executed in the Cloned Drives discord server.")
				.setDescription("Link to Discord server: https://discord.gg/PHgPyed")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}
		if (message.guild.id !== "711769157078876305") {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, this command can only be executed in the Cloned Drives discord server.")
				.setDescription("Link to Discord server: https://discord.gg/PHgPyed")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}
		if (!message.member.roles.cache.has("802043346951340064")) {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, it looks like you attempted using a Community Management-only command.")
				.setDescription("You don't have the <@&802043346951340064> role, which is required to use this command.")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}
	}

	if (command.args > 0 && args.length < command.args) {
		let usage = command.usage;
		const errorMessage = new Discord.MessageEmbed()
			.setColor("#fc0303")
			.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
			.setTitle("Error, arguments provided insufficient or missing.")
			.setDescription(`Here's the correct syntax: \`${prefix}${command.name} ${usage}\``)
			.setTimestamp();
		return message.channel.send(errorMessage);
	}
	if (await client.db.has(`acc${message.author.id}`) === false) {
		const errorMessage = new Discord.MessageEmbed()
			.setColor("#fc0303")
			.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
			.setTitle("Error, the bot has no record of you in the Cloned Drives discord server.")
			.setDescription("Join the Discord server now to unlock access to the bot: https://discord.gg/PHgPyed")
			.setTimestamp();
		return message.channel.send(errorMessage);
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
			const timeLeft = (expTime - now) / 1000;
			const infoScreen = new Discord.MessageEmbed()
				.setColor("#34aeeb")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("It looks like the cooldown for this command is not over yet.")
				.setDescription(`Try again in ${Math.round(timeLeft) + 1} seconds!`)
				.setTimestamp();
			return message.channel.send(infoScreen);
		}
	}
	timestamps.set(message.author.id, now);
	setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

	try {
		if (client.execList.indexOf(message.author.id) < 0) {
			//console.log(client.execList);
			client.execList.push(message.author.id);
			await command.execute(message, args);
			setTimeout(() => {
				if (client.execList.indexOf(message.author.id) < 0) {
					client.execList = client.execList.splice([message.author.id], 1);
				}
			}, 30000);
		}
		else {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("You may not execute more than 1 command at a time.")
				.setDescription("Please wait patiently.")
				.setTimestamp();
			return message.channel.send(errorMessage);
		}
	}
	catch (error) {
		console.error(error);
		client.execList.splice(client.execList.indexOf(message.author.id), 1);
		const errorMessage = new Discord.MessageEmbed()
			.setColor("#fc0303")
			.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
			.setTitle("Error, failed to execute command.")
			.setDescription(`Something must have gone wrong. Please report this issue to the devs. \n\`${error.stack}\``)
			.setTimestamp();
		return message.channel.send(errorMessage);
	}
});

client.on("guildMemberAdd", async member => {
	if (await client.db.has(`acc${member.id}`) === false && member.guild.id === "711769157078876305") {
		console.log("creating new player's database...");
		await client.db.set(`acc${member.id}`, {
			money: 0,
			fuseTokens: 0,
			trophies: 0,
			garage: starterGarage,
			decks: [],
			campaignProgress: { chapter: 0, part: 1, race: 1 },
			unclaimedRewards: { money: 0, fuseTokens: 0, trophies: 0, cars: [], packs: [] },
			settings: { enablegraphics: true, senddailynotifs: false, filtercarlist: true, filtergarage: true, showbmcars: false }
		});
		console.log(member.id);
	}
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
	if (!newMessage.content.startsWith(prefix) || newMessage.author.bot) return;

	const args = newMessage.content.slice(prefix.length).split(/ +/);
	const commandName = args.shift().toLowerCase();

	const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
	if (!command) {
		const errorMessage = new Discord.MessageEmbed()
			.setColor("#fc0303")
			.setAuthor(newMessage.author.tag, newMessage.author.displayAvatarURL({ format: "png", dynamic: true }))
			.setTitle("Error, 404 command not found.")
			.setDescription("It looks like this command doesn't exist. Try using `cd-help` to find the command you are looking for.")
			.setTimestamp();
		return newMessage.channel.send(errorMessage);
	}
	if (command.args && !args.length) {
		let usage = command.usage;
		if (usage === "(no arguments required)") {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(newMessage.author.tag, newMessage.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, no arguments provided.")
				.setDescription(`Here's the correct syntax: \`${prefix}${command.name}\``)
				.setTimestamp();
			return newMessage.channel.send(errorMessage);
		}
		else {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(newMessage.author.tag, newMessage.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, no arguments provided.")
				.setDescription(`Here's the correct syntax: \`${prefix}${command.name} ${usage}\``)
				.setTimestamp();
			return newMessage.channel.send(errorMessage);
		}
	}
	if (!command.isExternal) {
		if (newMessage.channel.type !== "text") {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, this command can only be executed in the Cloned Drives discord server.")
				.setDescription("Link to Discord server: https://discord.gg/PHgPyed")
				.setTimestamp();
			return newMessage.channel.send(errorMessage);
		}
		else if (newMessage.guild.id !== "711769157078876305") {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, this command can only be executed in the Cloned Drives discord server.")
				.setDescription("Link to Discord server: https://discord.gg/PHgPyed")
				.setTimestamp();
			return newMessage.channel.send(errorMessage);
		}
	}
	if (command.adminOnly && !newMessage.member.roles.cache.has("711790752853655563")) { //admin role
		const errorMessage = new Discord.MessageEmbed()
			.setColor("#fc0303")
			.setAuthor(newMessage.author.tag, newMessage.author.displayAvatarURL({ format: "png", dynamic: true }))
			.setTitle("Error, it looks like you attempted using an Admin-only command.")
			.setDescription("You don't have the Admin role, which is required to use this command.")
			.setTimestamp();
		return newMessage.channel.send(errorMessage);
	}

	try {
		if (client.execList.indexOf(newMessage.author.id) < 0) {
			client.execList.push(newMessage.author.id);
			await command.execute(newMessage, args);
			setTimeout(() => {
				if (client.execList.indexOf(newMessage.author.id) < 0) {
					client.execList.splice([newMessage.author.id], 1);
				}
			}, 30000);
		}
		else {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(newMessage.author.tag, newMessage.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("You may not execute more than 1 command at a time.")
				.setDescription("Please wait patiently.")
				.setTimestamp();
			return newMessage.channel.send(errorMessage);
		}
	}
	catch (error) {
		console.error(error);
		client.execList.splice(client.execList.indexOf(newMessage.author.id), 1);
		const errorMessage = new Discord.MessageEmbed()
			.setColor("#fc0303")
			.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
			.setTitle("Error, failed to execute command.")
			.setDescription(`Something must have gone wrong. Please report this issue to the devs. \n\`${error.stack}\``)
			.setTimestamp();
		return newMessage.channel.send(errorMessage);
	}
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
				}
				else {
					lastDaily = DateTime.fromISO(lastDaily);
				}

				const interval = Interval.fromDateTimes(DateTime.now(), lastDaily.plus({ days: 1 }));
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