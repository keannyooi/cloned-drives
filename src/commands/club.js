const Discord = require('discord.js');
const client = new Discord.Client();

client.on('message', message => {
  if (message.content === 'cd-club') {
    message.channel.send('https://cloneddrives.club');
  }
});