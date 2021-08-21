/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const { ErrorMessage, InfoMessage, sendMessage } = require("./sharedfiles/primary.js");

module.exports = {
    name: "calculate",
    aliases: ["calc", "cal"],
    usage: "<what to calculate> | <variables>",
    args: 2,
    category: "Miscellaneous",
    description: "Calculates stuff like handling value, mid-range acceleration, off-the-line acceleration and averages.",
    execute(message, args) {
        let answer;
		let average = args.slice(1, args.length).map(arg => Number(arg));

        if (args[0].toLowerCase() === "handling" && !isNaN(args[1])) {
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
            const errorMessage = new ErrorMessage(
                "arguments given invalid.",
                "Here are some syntax examples for reference."
            );
            return sendMessage(message, errorMessage.create(message));
        }
        const resultMessage = new InfoMessage(
            "Calculation successful!",
            `Result: **${answer}**`
        );
        return sendMessage(message, resultMessage.create(message));
    }
}