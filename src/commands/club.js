const { InfoMessage } = require("../util/classes/classes.js");

module.exports = {
    name: "club",
    usage: "",
    args: 0,
    category: "Misc",
    description: "Sends a link to Cloned Drives Club (essentially a database website) for easy access.",
    async execute(message) {
        const infoMessage = new InfoMessage({
            channel: message.channel,
            title: "Cloned Drives Club - A Useful Database Tool for Cloned Drives",
            desc: `If you're an avid Top Drives player, you may be familiar with Top Drives Club, that database website for every single car in the game. Well, we have our own version of that website here!
            
            **Click [here](https://cloneddrives.club) to go to this website.**
            Special thanks to <@!200895853626392576> for developing this!`,
            author: message.author,
            footer: "never expected anyone to make this yet here we are lol"
        });
        return infoMessage.sendMessage();
    }
};