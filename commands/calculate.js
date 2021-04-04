/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");

module.exports = {
    name: "calculate",
    aliases: ["calc", "cal"],
    usage: "<what to calculate> | <variables>",
    args: 0,
	isExternal: true,
    adminOnly: false,
    description: "Calculates stuff like handling value, mid-range acceleration, off-the-line acceleration and averages.",
    execute(message, args) {
        let answer;
		let average = args.slice(1, args.length).map(arg => Number(arg));
        if (!args.length) {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor('#fc0303')
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle('Error, no calculation specified.')
                .setDescription("Don't worry, here are some syntax examples for reference.")
                .addFields(
                    { name: "Calculating Handling", value: "`cd-calculate handling (insert lateral g-force value here)`" },
                    { name: "Calculating Mid-Range Acceleration (MRA)", value: "`cd-calculate mra (insert 0-60mph time here) (insert 0-100mph time here)`" },
                    { name: "Calculating Off-the-Line Acceleration (OLA)", value: "`cd-calculate ola (insert 0-30mph value here) (insert 0-60 time here)`" },
					{ name: "Averaging Numbers", value: "`cd-calculate average (insert numbers here)`" }
                )
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
        else if (args[0].toLowerCase() === "handling" && !isNaN(args[1])) {
            if (args[1] > 1 && args[1] <= 1.0165) {
                answer = 90;
            }
            else if (args[1] > 1.0165 && args[1] <= 1.0495){
                answer = 91;
            }
            else if (args[1] > 1.0495 && args[1] <= 1.0825){
                answer = 92;
            }
            else if (args[1] > 1.0825 && args[1] <= 1.125){
                answer = 93;
            }
            else if (args[1] > 1.125 && args[1] <= 1.175){
                answer = 94;
            }
            else if (args[1] > 1.175 && args[1] <= 1.25){
                answer = 95;
            }
            else if (args[1] > 1.25 && args[1] <= 1.35){
                answer = 96;
            }
            else if (args[1] > 1.35 && args[1] <= 1.45){
                answer = 97;
            }
            else if (args[1] > 1.45 && args[1] <= 1.625){
                answer = 98;
            }
            else if (args[1] > 1.625 && args[1] <= 1.875){
                answer = 99;
            }
            else if (args[1] > 1.875 && args[1] <= 2){
                answer = 100;
            }
            else if (args[1] > 2 && args[1] <= 2.9){
                answer = 101;
            }
            else if (args[1] > 2.9 && args[1] <= 3.9){
                answer = 102;
            }
            else if (args[1] > 3.9 && args[1] <= 4.9){
                answer = 103;
            }
            else if (args[1] > 4.9 && args[1] <= 5.9){
                answer = 104;
            }
            else if (args[1] > 5.9){
                answer = 105;
            }
            else {
                answer = Math.round(args[1] * 90);
            }
        }
		else if (args[0].toLowerCase() === "handlingest" && !isNaN(args[1]) && !isNaN(args[2]) && !isNaN(args[3]) && !isNaN(args[4]) && !isNaN(args[5])) {
			let latG = args[1];
			let oldAccel = args[2];
			let newAccel = args[3];
			let oldWeight = args[4];
			let newWeight = args[5];
			answer = latG * Math.cbrt(((oldAccel / newAccel) + (oldWeight / newWeight)) / 2);
			answer = answer.toFixed(2);
		}
        else if (args[0].toLowerCase() === "mra" && !isNaN(args[1]) && !isNaN(args[2])) {
            answer = 100 * (args[1] / (args[2] - args[1]));
            answer = answer.toFixed(2);
        }
        else if (args[0].toLowerCase() === "ola" && !isNaN(args[1]) && !isNaN(args[2])) {
            answer = 100 * (args[1] / (args[2] / 2));
            answer = answer.toFixed(2);
        }
		else if (args[0].toLowerCase() === "average" && average.includes(NaN) === false) {
            let plus = average.reduce(function (total, num) {
				return total + num;
			});
			answer = plus / average.length;
        }
        else {
			message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
            const errorMessage = new Discord.MessageEmbed()
                .setColor('#fc0303')
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle('Error, arguments given insufficient or not suitable.')
                .setDescription("Don't worry, here are some syntax examples for reference.")
                .addFields(
                    { name: 'Calculating Handling', value: '`cd-calculate handling (insert lateral g-force value here)`'},
                    { name: 'Calculating Mid-Ranged Acceleration (MRA)', value: '`cd-calculate mra (insert 0-60mph time here) (insert 0-100mph time here)`'},
                    { name: 'Calculating Off-the-Line Acceleration (OLA)', value: '`cd-calculate ola (insert 0-30mph value here) (insert 0-60 time here)`'},
					{ name: "Averaging Numbers", value: "`cd-calculate average (insert numbers here)`" }
                )
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
        const resultMessage = new Discord.MessageEmbed()
            .setColor('#03fc24')
            .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
            .setTitle(`Calculation successful! Result: ${answer}`)
            .setDescription("Wonder how the value is calculated? Here are the formulas.")
            .addFields(
                { name: 'Calculating Handling', value: '`lateral g-force * 90`' },
				{ name: 'Estimating Handling', value: '`lateral g-force * 90`' },
                { name: 'Calculating Mid-Ranged Acceleration (MRA)', value: '`100 * (0-60mph time / (0-100mph time - 0-60mph time))`' },
                { name: 'Calculating Off-the-Line Acceleration (OLA)', value: '`100 * (0-30mph time / (0-60mph time / 2))`' },
				{ name: "Averaging Numbers", value: "`if you don't know that then your mafs bad`" }
            )
            .setTimestamp();
		message.client.execList.splice(message.client.execList.indexOf(message.author.id), 1);
        return message.channel.send(resultMessage);
    }
}