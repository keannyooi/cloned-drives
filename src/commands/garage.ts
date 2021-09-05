/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const { sendMessage } = require("./sharedfiles/primary.js");
const { ErrorMessage } = require("./sharedfiles/classes.js");
const { search, sortCars, filterCheck, listDisplay } = require("./sharedfiles/secondary.js");
const profileModel = require("../models/profileSchema.js");

module.exports = {
	name: "garage",
	aliases: ["g"],
	usage: "(all optional) <username goes here> | <page number>",
	args: 0,
	category: "Configuration",
	description: "Shows your (or other people's) garage.",
	async execute(message, args) {
		let user = message.author;
		let sort = "rq";

		if (!args.length || (args[0] === "-s" && args[1])) {
			if (args[0] === "-s" && args[1]) {
				sort = args[1].toLowerCase();
			}
			loop(user, 1, sort);
		}
		else {
			if (isNaN(args[0])) {
				let page = 1;
				let userName;
				if (isNaN(args[args.length - 1])) {
					userName = args.map(i => i.toLowerCase());
				}
				else {
					userName = args.slice(0, args.length - 1).map(i => i.toLowerCase());
					page = parseInt(args[args.length - 1]);
				}
				if (args[args.length - 2] === "-s" && args[args.length - 1]) {
					sort = args[args.length - 1].toLowerCase();
				}

				if (message.mentions.users.first()) {
					if (!message.mentions.users.first().bot) {
						loop(message.mentions.users.first(), page, sort);
					}
					else {
						const errorMessage = new ErrorMessage(
							"user requested is a bot.",
							"Bots can't play Cloned Drives."
						);
						return sendMessage(message, errorMessage.create(message));
					}
				}
				else {
					const userSaves = await profileModel.find({});
					let availableUsers = await message.guild.members.fetch();
					availableUsers.filter(user => userSaves.find(f => f.userID = user.id));
					userName = [args[0].toLowerCase()];

					let test = new Promise(resolve => resolve(search(message, userName, Array.from(availableUsers), "user")));
					test.then(async hmm => {
						if (!Array.isArray(hmm)) return;
						let [result, currentMessage] = hmm;
						await loop(result[1].user, page, sort, currentMessage)
					});
				}
			}
			else {
				if (args[args.length - 2] === "-s" && args[args.length - 1]) {
					sort = args[args.length - 1].toLowerCase();
				}
				loop(user, parseInt(args[0]), sort);
			}
		}

		async function loop(user, page, sort, currentMessage) {
			const filter = button => button.user.id === message.author.id;
			const playerData = await profileModel.findOne({ userID: user.id });
			let garage = playerData.garage;

			if (playerData.filter !== undefined && playerData.settings.filtergarage === true) {
				garage.filter(car => filterCheck(car, playerData.filter));
			}
		
			const totalPages = Math.ceil(garage.length / 10);
			switch (sort) {
				case "rq":
				case "handling":
				case "weight":
				case "mra":
				case "ola":
				case "mostowned":
					break;
				case "topspeed":
					sort = "topSpeed";
					break;
				case "accel":
					sort = "0to60";
					break;
				default:
					const errorMessage = new ErrorMessage(
						"sorting criteria not found.",
						`Here is a list of sorting criterias. 
                                         \`-s topspeed\` - Sort by top speed. 
                                         \`-s accel\` - Sort by acceleration. 
                                         \`-s handling\` - Sort by handling. 
                                         \`-s weight\` - Sort by weight. 
                                         \`-s mra\` - Sort by mid-range acceleraion. 
                                         \`-s ola\` - Sort by off-the-line acceleration.
										 \`-s mostowned\` - Sort by how many copies of the car owned.`,
						sort
					)
					return sendMessage(message, errorMessage.create(message), null, false, currentMessage);
			}
			garage = sortCars(message, garage, sort, playerData.settings.sortorder);

			if (page < 1 || totalPages < page) {
				const errorMessage = new ErrorMessage(
					"page number requested invalid.",
					`This garage ends at page ${totalPages}.`
					`\`${page}\``
				);
				return sendMessage(message, errorMessage.create(message), null, false, currentMessage);
			}
			let { listMessage, embed } = await listDisplay(message, user, page, garage, sort, playerData, currentMessage);

			const collector = message.channel.createMessageComponentCollector({ filter, time: 60000 });
			collector.on("collect", async button => {
				switch (button.customId) {
					case "first_page":
						page = 1;
						break;
					case "prev_page":
						page -= 1;
						break;
					case "next_page":
						page += 1;
						break;
					case "last_page":
						page = totalPages;
						break;
					default:
						break;
				}
				garageMessage = await listDisplay(message, user, page, garage, sort, playerData, listMessage);
				await button.reply.defer();
			});

			collector.on("end", () => {
				return listMessage.edit({ embeds: [embed], components: [] });
			});
		}
	}
}