/*
 __  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/

const Discord = require("discord.js-light");
const Canvas = require("canvas");

module.exports = {
    name: "ping",
    usage: "(no arguments required)",
    args: 0,
    adminOnly: false,
	cooldown: 10,
    description: "I wonder what this does...",
    async execute(message) {
        message.channel.send("bruh y u ping me");

        const handPlacement = [{x: 287, y: 964}, {x: 658, y: 964}, {x: 1029, y: 964}, {x: 1400, y: 964}, {x: 1771, y: 964}];
        const canvas = Canvas.createCanvas(2135, 1200);
        const ctx = canvas.getContext("2d");

        const background = await Canvas.loadImage("https://cdn.discordapp.com/attachments/716917404868935691/723837799991869470/stage_10_hollywood_usa.jpg");
        const testHud = await Canvas.loadImage("https://cdn.discordapp.com/attachments/718097267621363744/734411117274857503/Arteonstock.png");
        ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

        for (i = 0; i < 5; i++) {
            ctx.drawImage(testHud, handPlacement[i].x, handPlacement[i].y, 334, 203);
        }

        const attachment = new Discord.MessageAttachment(canvas.toBuffer(), 'test.png');
        message.channel.send(attachment);
    }
}