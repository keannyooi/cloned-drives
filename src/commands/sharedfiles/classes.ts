/*
__  ___  _______     ___      .__   __. .__   __. ____    ____ 
|  |/  / |   ____|   /   \     |  \ |  | |  \ |  | \   \  /   / 
|  '  /  |  |__     /  ^  \    |   \|  | |   \|  |  \   \/   /  
|    <   |   __|   /  /_\  \   |  . `  | |  . `  |   \_    _/   
|  .  \  |  |____ /  _____  \  |  |\   | |  |\   |     |  |     
|__|\__\ |_______/__/     \__\ |__| \__| |__| \__|     |__| 	(this is a watermark that proves that these lines of code are mine)
*/
import { findBestMatch } from "string-similarity";
import { Message, MessageEmbed, TextBasedChannels, MessageActionRow, ColorResolvable } from "discord.js";

interface StarterMessageArgs {
    channel: TextBasedChannels,
    title: string,
    description: string,
    author: {
        name: string,
        iconURL: string
    },
    color?: ColorResolvable,
    thumbnail?: {
        url: string
    },
    image?: {
        url: string
    },
    fields?: Array<{
        name: string,
        value: string,
        inline?: boolean
    }>,
    footer?: {
        text: string
    }
}

interface FunctionArgsTemp {
    message: Message;
}

interface SendMessageArgs extends FunctionArgsTemp {
    preserve?: boolean;
    buttons?: Array<MessageActionRow>;
    editMessage?: Message;
}

interface displayClosestArgs {
    received: string;
    checkArray?: Array<string>;
}

class BotMessage {
    public readonly channel: TextBasedChannels;
    public embed: MessageEmbed;
    constructor(args: StarterMessageArgs) {
        this.channel = args.channel;
        this.embed = new MessageEmbed(args).setTimestamp();
    }
    sendMessage(args: SendMessageArgs) {
        const components = args.buttons;
        const contents = { embeds: [this.embed], components: components };
        if (args.preserve === false) {
            delete args.message.client.execList[args.message.author.id];
        }
        
        return args.editMessage ? args.editMessage.edit(contents) : args.message.channel.send(contents);
    }
}

class SuccessMessage extends BotMessage {
    constructor(args: StarterMessageArgs) {
        super(args);
        this.embed.setColor("#03fc24");
    }
}

class ErrorMessage extends BotMessage {
    constructor(args: StarterMessageArgs) {
        super(args);
        this.embed.setColor("#fc0303");
    }
    displayClosest(args: displayClosestArgs) {
        this.embed.addField("Value Received", `\`${args.received}\``, true);
        if (args.checkArray) {
            let matches = findBestMatch(args.received, args.checkArray);
            this.embed.addField("You may be looking for", `\`${matches.bestMatch.target}\``, true);
        }
        return this;
    }
}

class InfoMessage extends BotMessage {
    constructor(args: StarterMessageArgs) {
        super(args);
        this.embed.setColor("#34aeeb");
    }
}

export {
    SuccessMessage,
    InfoMessage,
    ErrorMessage,
    FunctionArgsTemp
};