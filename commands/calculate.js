const Discord = require("discord.js-light");

module.exports = {
    name: "calculate",
    aliases: ["calc", "cal"],
    usage: "<what to calculate> <variables>",
    args: false,
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
            answer = args[1] * 0.9 * 100;
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