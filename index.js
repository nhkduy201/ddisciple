import fs from 'fs';
import got from 'got';
import client from 'soundoftext-js';
import { Client, Intents } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } from '@discordjs/voice';
const bot = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES,
     Intents.FLAGS.GUILD_MESSAGE_REACTIONS, Intents.FLAGS.GUILD_VOICE_STATES],
  partials: ['MESSAGE', 'CHANNEL', 'REACTION']
});
const botToken = 'OTY4ODQ3MDIwMzQ3NTEwODY1.GP7oMM.ndVdeUbCp3R_n8v4bMC63NPeZp1CJmGdgCy17k';

let player = createAudioPlayer();
let mp3Files;
let resource;
let connection;
let playMessage;
let preVolume = 1;
let resourceStack = [];

const play = (input) => {
  resource = createAudioResource(input, { inlineVolume: true });
  player.play(resource);
}

const loopResourceListener = (oldState, newState) => {
  play();
}

const loopResource = () => {
  player.on(AudioPlayerStatus.Idle, loopResourceListener);
}

const noLoopResource = () => {
  player.removeListener(AudioPlayerStatus.Idle, loopResourceListener);
}

const initConnection = () => {
  connection = joinVoiceChannel({
    channelId: '974291777500639255',
    guildId: '974291776993108059',
    adapterCreator: bot.channels.cache.find(channel => channel.id === '974291777500639255').guild.voiceAdapterCreator,
  });
  connection.subscribe(player);
}

const readMp3Files = () => {
  fs.readdir('mp3/', (err, files) => {
    if (err)
      console.log(err.message);
    else
      mp3Files = files.filter((file) => file.endsWith('.mp3'));
  });
}

const sendInValid = (message) => message.channel.send('Invalid command!');
const sendOutOfRange = (message) => message.channel.send('Number must be in range!');
const sendNoFile = (message) => message.channel.send('Sorry there\'s no files!');
const sendPlayInfo = (message, whatPlaying) => message.channel.send('Playing: ' + whatPlaying);

const volumeControl = (reaction, user) => {
  if (resource.started && !resource.ended && playMessage
    && user.id != '968847020347510865' && reaction.message.id === playMessage.id) {
    if (reaction.emoji.name === '🔊') {
      if(resource.volume.volume + 0.25 <= 1) {
        resource.volume.volume += 0.25;
        preVolume = null;
      }
    }
    if (reaction.emoji.name === '🔉') {
      if(resource.volume.volume - 0.25 >= 0) {
        resource.volume.volume -= 0.25;
        preVolume = null;
      }
    }
    if (reaction.emoji.name === '🔇') {
      if (resource.volume.volume == 0) {
          resource.volume.volume = preVolume || 0.25;
      } else {
        preVolume = resource.volume.volume;
        resource.volume.volume = 0;
      }
    }
  }
}

const bulkDelete = () => setInterval(() => bot.channels.cache.find(channel => channel.id == '982529141477875781').bulkDelete(100), 2000);

bot.on('ready', () => {
  readMp3Files();
})
  .on('messageReactionAdd', volumeControl).on('messageReactionRemove', volumeControl)
  .on('messageCreate', async message => {
    if (message.content.startsWith('$play')) {
      let playPara = message.content.replace(/\s\s+/g, ' ').split(' ').splice(1).join(' ');
      if(!playPara.length) {
        sendInValid(message);
        return;
      }
      // check if number, play mp3
      let fileNumber = parseInt(playPara, 10);
      let playObj = {};
      if (!connection || connection.state.status === 'destroyed') {
        initConnection();
      }
      if (!isNaN(fileNumber)) {
        if (!mp3Files.length) {
          sendNoFile(message);
          return;
        }
        if (fileNumber < 1 || fileNumber > mp3Files.length) {
          sendOutOfRange(message);
          return;
        }
        playObj.info = mp3Files[fileNumber - 1];
        playObj.input = fs.createReadStream('mp3/' + playObj.info);
      } else if(playPara.startsWith('http') && playPara.endsWith('.mp3')){
        playObj.info = playPara.substring(playPara.lastIndexOf('/') + 1);
        playObj.input = got.stream(playPara);
      } else {
        playPara = playPara.replace(/^m\s+|\s+m\s+/g,' mày ');
        let soundUrl = await client.sounds.create({ text: playPara, voice: 'vi-VN' });
        playObj.input = got.stream(soundUrl);
        let infoLen = Math.max(parseInt(playPara.length / 3), 10);
        playObj.info = playPara.substring(0, infoLen) + '...';
      }
      sendPlayInfo(message, playObj.info).then(afterMess => {
        playMessage = afterMess;
        playMessage.react('🔊');
        playMessage.react('🔉');
        playMessage.react('🔇');
      });
      play(playObj.input);
    }
    if (message.content == '$stop') {
      player.stop();
    }
    if (message.content == '$list') {
      message.channel.send(mp3Files
        .map((file, idx) => `${(idx + 1).toString()}. ${file}`)
        .join('\n'));
    }
    if (message.content == '$status') {
      console.log("Connection status:", connection.state.status);
      console.log("Player status:", player.state.status);
    }
    if (message.content == '$loop') {
      loopResource();
    }
    if (message.content == '$noloop') {
      noLoopResource();
    }
    if (message.content == '$bye') {
      player.stop();
      if (connection) connection.destroy();
    }
  })
  .login(botToken);