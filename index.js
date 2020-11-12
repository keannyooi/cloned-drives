/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const fs = require("fs");
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

client.commands = new Discord.Collection();
const cooldowns = new Discord.Collection();
client.db = new Database("mongodb+srv://keanny:6x6IsBae@databaseclusterthing.as94y.mongodb.net/DatabaseClusterThing?retryWrites=true&w=majority");

const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
const starterCars = ["abarth 124 spider (2017).json", "range rover classic 5-door (1984).json", "honda prelude type sh (1997).json", "chevrolet impala ss 427 (1967).json", "volkswagen beetle 2.5 (2012).json"];

for (const file of commandFiles) {
	const command = require(`./commands/${file}`);
	client.commands.set(command.name, command);
}

client.once("ready", async () => {
	console.log("Ready!");

	const guild = client.guilds.cache.get("711769157078876305"); //don't mind me lmao
	guild.members.cache.forEach(async user => {
		if (await client.db.has(`acc${user.id}`) === false) {
			console.log("creating new player's database...");
			await client.db.set(`acc${user.id}`, { money: 0, fuseTokens: 0, trophies: 0, garage: [], decks: [], campaignProgress: { chapter: 0, part: 1, race: 1 }, unclaimedRewards: { money: 0, fuseTokens: 0, trophies: 0, cars: [] } });
			var i = 0;
			while (i < 5) {
				var carFile = starterCars[i];

				await client.db.push(`acc${user.id}.garage`, { carFile: carFile, gearingUpgrade: 0, engineUpgrade: 0, chassisUpgrade: 0 });
				i++;
			}

			console.log(user.id);
		}
		//for changing stuff in the database

		if (!await client.db.get(`acc${user.id}.unclaimedRewards`)) {
			await client.db.set(`acc${user.id}.unclaimedRewards`, { money: 0, fuseTokens: 0, trophies: 0, cars: [] });
		}
		if (!await client.db.get(`acc${user.id}.campaignProgress`)) {
			await client.db.set(`acc${user.id}.campaignProgress`, { chapter: 0, part: 1, race: 1 });
		}

		const garage = await client.db.get(`acc${user.id}.garage`);
		var i = 0;
		while (i < garage.length) {
			if (garage[i].carFile === "aston martin db11 v12 (2016).json") {
				garage[i].carFile = "aston martin db11 v12 (2017).json";
			}
			i++;
		}
		client.db.set(`acc${user.id}.garage`, garage);
	})

	const catalog = await client.db.get("dealershipCatalog");
	console.log(catalog);
	var i = 0;
	while (i < catalog.length) {
		if (catalog[i].carFile === "aston martin db11 v12 (2016)") {
			catalog[i].carFile = "aston martin db11 v12 (2017)";
		}
		i++;
	}
	await client.db.set("dealershipCatalog", catalog);

	client.user.setActivity("over everyone's garages", { type: "WATCHING" });
});

client.login(token);

client.on("message", async message => {
	if (!message.content.startsWith(prefix) || message.author.bot || message.channel.type !== 'text') return;

	const args = message.content.slice(prefix.length).split(/ +/);
	const commandName = args.shift().toLowerCase();
	const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
	if (!command) {
		const errorMessage = new Discord.MessageEmbed()
			.setColor("#fc0303")
			.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
			.setTitle("Error, 404 command not found.")
			.setDescription("It looks like this command doesn't exist. Try using `cd-help` to find the command you are looking for.")
			.setTimestamp();
		return message.channel.send(errorMessage);
	}
	if (command.args && !args.length) {
		var usage = command.usage;
		if (usage === "(no arguments required)") {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, no arguments provided.")
				.setDescription(`Here's the correct syntax: \`${prefix}${command.name}\``)
				.setTimestamp();
			return message.channel.send(errorMessage);
		}
		else {
			const errorMessage = new Discord.MessageEmbed()
				.setColor("#fc0303")
				.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
				.setTitle("Error, no arguments provided.")
				.setDescription(`Here's the correct syntax: \`${prefix}${command.name} ${usage}\``)
				.setTimestamp();
			return message.channel.send(errorMessage);
		}
	}
	else if (command.adminOnly && !message.member.roles.cache.has("711790752853655563")) { //admin role
		const errorMessage = new Discord.MessageEmbed()
			.setColor("#fc0303")
			.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
			.setTitle("Error, it looks like you attempted using an Admin-only command.")
			.setDescription("You must be and Admin to use this command!")
			.setTimestamp();
		return message.channel.send(errorMessage);
	}

	if (!cooldowns.has(command.name)) {
		cooldowns.set(command.name, new Discord.Collection());
	}

	const now = Date.now();
	const timestamps = cooldowns.get(command.name);
	const cooldownAmount = (command.cooldown || 5) * 1000;

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
		await command.execute(message, args);
	}
	catch (error) {
		console.error(error);
		const errorMessage = new Discord.MessageEmbed()
			.setColor("#fc0303")
			.setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
			.setTitle("Error, failed to execute command.")
			.setDescription(`Something must have gone wrong. Please report this issure to the devs. \n\`${error}\``)
			.setTimestamp();
		return message.channel.send(errorMessage);
	}
});

client.on("guildMemberAdd", async member => {
	if (await client.db.has(`acc${member.id}`) === false) {
		console.log("creating new player's database...");
		await client.db.set(`acc${member.id}`, { money: 0, fuseTokens: 0, trophies: 0, garage: [], decks: [], campaignProgress: { chapter: 0, part: 1, race: 1 }, unclaimedRewards: { money: 0, fuseTokens: 0, trophies: 0, cars: [] } });
		var i = 0;
		while (i < 5) {
			var carFile = starterCars[i];

			await client.db.push(`acc${member.id}.garage`, { carFile: carFile, gearingUpgrade: 0, engineUpgrade: 0, chassisUpgrade: 0 });
			i++;
		}

		console.log(member.id);
	}
	if (!await client.db.get(`acc${user.id}.unclaimedRewards`)) {
		await client.db.set(`acc${user.id}.unclaimedRewards`, { money: 0, fuseTokens: 0, trophies: 0, cars: [] });
	}
	if (!await client.db.get(`acc${user.id}.campaignProgress`)) {
		await client.db.set(`acc${user.id}.campaignProgress`, { chapter: 0, part: 1, race: 1 });
	}
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
	if (!newMessage.content.startsWith(prefix) || newMessage.author.bot || newMessage.channel.type !== 'text') return;

	const args = newMessage.content.slice(prefix.length).split(/ +/);
	const commandName = args.shift().toLowerCase();

	const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
	if (!command) {
		const errorMessage = new Discord.MessageEmbed()
			.setColor("#fc0303")
			.setAuthor(newMessage.author.author.tag, newMessage.author.author.displayAvatarURL({ format: "png", dynamic: true }))
			.setTitle("Error, 404 command not found.")
			.setDescription("It looks like this command doesn't exist. Try using `cd-help` to find the command you are looking for.")
			.setTimestamp();
		return newMessage.channel.send(errorMessage);
	}
	if (command.args && !args.length) {
		var usage = command.usage;
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
	else if (command.adminOnly && !newMessage.member.roles.cache.has("711790752853655563")) { //admin role
		const errorMessage = new Discord.MessageEmbed()
			.setColor("#fc0303")
			.setAuthor(newMessage.author.tag, newMessage.author.displayAvatarURL({ format: "png", dynamic: true }))
			.setTitle("Error, it looks like you attempted using an Admin-only command.")
			.setDescription("You must be and Admin to use this command!")
			.setTimestamp();
		return newMessage.channel.send(errorMessage);
	}

	try {
		await command.execute(newMessage, args);
	}
	catch (error) {
		console.error(error);
		const errorMessage = new Discord.MessageEmbed()
			.setColor("#fc0303")
			.setAuthor(newMessage.author.tag, newMessage.author.displayAvatarURL({ format: "png", dynamic: true }))
			.setTitle("Error, failed to execute command.")
			.setDescription("Something must have gone wrong. Please report this issure to the devs.")
			.setTimestamp();
		return newMessage.channel.send(errorMessage);
	}
});