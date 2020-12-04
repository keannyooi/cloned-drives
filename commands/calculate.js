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
    usage: "<what to calculate> <variables>",
    args: 0,
    adminOnly: false,
    description: "Calculates stuff like handling value, mid-range acceleration and off-the-line acceleration.",
    execute(message, args) {
        args[0] = args[0].toLowerCase();

        var answer;
        if (!args.length) {
            const errorMessage = new Discord.MessageEmbed()
                .setColor('#fc0303')
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle('Error, no calculation specified.')
                .setDescription("Don't worry, here are some syntax examples for reference.")
                .addFields(
                    { name: 'Calculating Handling', value: '`cd-calculate handling (insert lateral g-force value here)`' },
                    { name: 'Calculating Mid-Range Acceleration (MRA)', value: '`cd-calculate mra (insert 0-60mph time here) (insert 0-100mph time here)`' },
                    { name: 'Calculating Off-the-Line Acceleration (OLA)', value: '`cd-calculate ola (insert 0-30mph value here) (insert 0-60 time here)`' },
                )
                .setTimestamp();
            return message.channel.send(errorMessage);
        }
        else if (args[0] === 'handling' && !isNaN(args[1])) {
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
            else if (args[1] > 1.875 && args[1] <= 2.5){
                answer = 100;
            }
            else if (args[1] > 2.5 && args[1] <= 3.5){
                answer = 101;
            }
            else if (args[1] > 3.5 && args[1] <= 4.5){
                answer = 102;
            }
            else if (args[1] > 4.5 && args[1] <= 5.5){
                answer = 103;
            }
            else if (args[1] > 5.5 && args[1] <= 6){
                answer = 104;
            }
            else if (args[1] > 6){
                answer = 105;
            }
            else {
                answer = args[1] * 90;
            }
        }
        else if (args[0] === 'mra' && !isNaN(args[1]) && !isNaN(args[2])) {
            answer = 100 * (args[1] / (args[2] - args[1]));
            answer = answer.toFixed(2);
        }
        else if (args[0] === 'ola' && !isNaN(args[1]) && !isNaN(args[2])) {
            answer = 100 * (args[1] / (args[2] / 2));
            answer = answer.toFixed(2);
        }
        else {
            const errorMessage = new Discord.MessageEmbed()
                .setColor('#fc0303')
                .setAuthor(message.author.tag, message.author.displayAvatarURL({ format: "png", dynamic: true }))
                .setTitle('Error, arguments given insufficient or not suitable.')
                .setDescription("Don't worry, here are some syntax examples for reference.")
                .addFields(
                    { name: 'Calculating Handling', value: '`cd-calculate handling (insert lateral g-force value here)`'},
                    { name: 'Calculating Mid-Ranged Acceleration (MRA)', value: '`cd-calculate mra (insert 0-60mph time here) (insert 0-100mph time here)`'},
                    { name: 'Calculating Off-the-Line Acceleration (OLA)', value: '`cd-calculate ola (insert 0-30mph value here) (insert 0-60 time here)`'},
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
                { name: 'Calculating Handling', value: '`lateral g-force * 0.9 * 100`' },
                { name: 'Calculating Mid-Ranged Acceleration (MRA)', value: '`100 * (0-60mph time / (0-100mph time - 0-60mph time))`' },
                { name: 'Calculating Off-the-Line Acceleration (OLA)', value: '`100 * (0-30mph time / (0-60mph time / 2))`' },
            )
            .setTimestamp();
        return message.channel.send(resultMessage);
    }
}