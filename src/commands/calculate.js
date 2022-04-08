"use strict";

const { ErrorMessage, SuccessMessage } = require("../util/classes/classes.js");

module.exports = {
    name: "calculate",
    aliases: ["calc", "cal"],
    usage: [
        "handling <skidpad value>",
        "mra <0-60mph time> | <0-100mph time>",
        "ola <0-30mph time> | <0-60mph time>",
        "handlingest <original skidpad value> | <original 0-60mph time> | <new 0-60mph time> | <original weight (kg)> | <new weight (kg)>",
        "average <value 1> <value 2> <value 3> <...etc>"
    ],
    args: 2,
    category: "Miscellaneous",
    description: `This command supports 5 calculation functions and they are as follows:
    - **Handling calculation (ID: \`handling\`).** Cloned Drives calculates handling for cars from their skidpad G values (real or estmiated).
    **Formula:** \`lateral g-force * 90\`
    - **Mid-range acceleration (MRA) calculation (ID: \`mra\`).**
    **Formula:** \`100 * (0-60mph time / (0-100mph time - 0-60mph time))\`
    - **Off-the-line acceleration (OLA) calculation (ID: \`ola\`).**
    **Formula:** \`100 * (0-30mph time / (0-60mph time / 2))\`
    - **Skidpad value estimation (ID: \`handlingest\`).** This formula only works for cars that share the same chassis/platform.
    **Formula:** \`original skidpad g * (((original 0-60 time / new 0-60 time) + (original weight / new weight)) / 2) ^ (1 / 3)\`
    - **Averaging of values (ID: \`average\`).** This is self explanatory.`,
    execute(message, args) {
        const numberArgs = args.slice(1, args.length);
        let answer;

        if (numberArgs.find(i => isNaN(i))) {
            const errorMessage = new ErrorMessage({
                channel: message.channel,
                title: "Error, one or more arguments provided not a number.",
                desc: "Syntax examples are available by running `cd-help calculate`.",
                author: message.author
            });
            return errorMessage.sendMessage();
        }
        else {
            let calcFunction = args[0].toLowerCase();
            switch (calcFunction) {
                case "handling":
                    if (numberArgs[0] > 1 && numberArgs[0] <= 1.0165) {
                        answer = 90;
                    }
                    else if (numberArgs[0] > 1.0165 && numberArgs[0] <= 1.0495) {
                        answer = 91;
                    }
                    else if (numberArgs[0] > 1.0495 && numberArgs[0] <= 1.0825) {
                        answer = 92;
                    }
                    else if (numberArgs[0] > 1.0825 && numberArgs[0] <= 1.125) {
                        answer = 93;
                    }
                    else if (numberArgs[0] > 1.125 && numberArgs[0] <= 1.175) {
                        answer = 94;
                    }
                    else if (numberArgs[0] > 1.175 && numberArgs[0] <= 1.25) {
                        answer = 95;
                    }
                    else if (numberArgs[0] > 1.25 && numberArgs[0] <= 1.35) {
                        answer = 96;
                    }
                    else if (numberArgs[0] > 1.35 && numberArgs[0] <= 1.45) {
                        answer = 97;
                    }
                    else if (numberArgs[0] > 1.45 && numberArgs[0] <= 1.625) {
                        answer = 98;
                    }
                    else if (numberArgs[0] > 1.625 && numberArgs[0] <= 1.875) {
                        answer = 99;
                    }
                    else if (numberArgs[0] > 1.875 && numberArgs[0] <= 2) {
                        answer = 100;
                    }
                    else if (numberArgs[0] > 2 && numberArgs[0] <= 2.9) {
                        answer = 101;
                    }
                    else if (numberArgs[0] > 2.9 && numberArgs[0] <= 3.9) {
                        answer = 102;
                    }
                    else if (numberArgs[0] > 3.9 && numberArgs[0] <= 4.9) {
                        answer = 103;
                    }
                    else if (numberArgs[0] > 4.9 && numberArgs[0] <= 5.9) {
                        answer = 104;
                    }
                    else if (numberArgs[0] > 5.9) {
                        answer = 105;
                    }
                    else {
                        answer = Math.round(numberArgs[0] * 90);
                    }
                    break;
                case "handlingest":
                    let latG = numberArgs[0], oldAccel = numberArgs[1], newAccel = numberArgs[2];
                    let oldWeight = numberArgs[3], newWeight = numberArgs[4];
                    answer = latG * Math.cbrt(((oldAccel / newAccel) + (oldWeight / newWeight)) / 2);
                    answer = answer.toFixed(2);
                    break;
                case "mra":
                    answer = (100 * (numberArgs[0] / (numberArgs[1] - numberArgs[0]))).toFixed(2);
                    break;
                case "ola":
                    answer = (100 * (numberArgs[0] / (numberArgs[1] / 2))).toFixed(2);
                    break;
                case "average":
                    let average = numberArgs.slice(0, numberArgs.length).map(arg => Number(arg));
                    let plus = average.reduce(function (total, num) {
                        return total + num;
                    });
                    answer = plus / average.length;
                    break;
                default:
                    const errorMessage = new ErrorMessage({
                        channel: message.channel,
                        title: "Error, calculation function specified invalid.",
                        desc: `This command supports the following functions:
                        - Handling calculation (\`handling\`)
                        - Skidpad value estimation (\`handlingest\`)
                        - MRA and OLA calculation (\`mra\` & \`ola\` respectively)
                        - Averaging values (\`average\`)
                        More on them can be found by running \`cd-help calculate\`.`,
                        author: message.author
                    }).displayClosest(calcFunction);
                    return errorMessage.sendMessage();
            }

            const resultMessage = new SuccessMessage({
                channel: message.channel,
                title: "Calculation successful!",
                desc: `Result: **${answer}**`,
                author: message.author,
            });
            return resultMessage.sendMessage();
        }
    }
};