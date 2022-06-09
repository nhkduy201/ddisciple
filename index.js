import Queue from './queue.js';
import fs from 'fs'
import got from 'got'
import sotClient from 'soundoftext-js'
import { Client, Intents } from 'discord.js'
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } from '@discordjs/voice'
import dotenv from 'dotenv'
dotenv.config()
const client = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES,
     Intents.FLAGS.GUILD_MESSAGE_REACTIONS, Intents.FLAGS.GUILD_VOICE_STATES],
  partials: ['MESSAGE', 'CHANNEL', 'REACTION']
})

let player = createAudioPlayer()
let mp3Files
let resource
let connection
let playMessage
let preVolume = 1
let queue = new Queue()

player.on(AudioPlayerStatus.Idle, (oldState, newState) => {
  resource = undefined
  play()
})

const play = () => {
  if(player.state.status === AudioPlayerStatus.Idle && !queue.isEmpty) {
    resource = createAudioResource(queue.dequeue(), { inlineVolume: true })
    player.play(resource)
  }
}

const initConnection = () => {
  connection = joinVoiceChannel({
    channelId: process.env.VOICE_CHANNEL_ID,
    guildId: process.env.SERVER_ID,
    adapterCreator: client.channels.cache.find(channel => channel.id === process.env.VOICE_CHANNEL_ID).guild.voiceAdapterCreator,
  })
  connection.subscribe(player)
}

const sendInValid = (message) => message.channel.send('Invalid command!')
const sendOutOfRange = (message) => message.channel.send('Number must be in range!')
const sendNoFile = (message) => message.channel.send('There\'s no files!')

const volumeControl = (reaction, user) => {
  if (resource && resource.started && !resource.ended && playMessage
    && user.id != client.user.id && reaction.message.id === playMessage.id) {
    if (reaction.emoji.name === '🔊') {
      if(resource.volume.volume + 0.25 <= 1) {
        resource.volume.volume += 0.25
        preVolume = null
      }
    }
    if (reaction.emoji.name === '🔉') {
      if(resource.volume.volume - 0.25 >= 0) {
        resource.volume.volume -= 0.25
        preVolume = null
      }
    }
    if (reaction.emoji.name === '🔇') {
      if (resource.volume.volume == 0) {
          resource.volume.volume = preVolume || 0.25
      } else {
        preVolume = resource.volume.volume
        resource.volume.volume = 0
      }
    }
  }
}

const sendPlayInfo = (message, whatPlaying) => {
  message.channel.send('Playing: ' + whatPlaying).then(afterMess => {
    playMessage = afterMess
    playMessage.react('🔊')
    playMessage.react('🔉')
    playMessage.react('🔇')
  })
}

const handlePlayMp3 = (message, playPara) => {
  sendPlayInfo(playPara.substring(message, playPara.lastIndexOf('/') + 1))
  queue.enqueue(got.stream(playPara))
}

const handleSpeak = async (message, playPara) => {
  playPara = playPara.replace(new RegExp(process.env.SECRET_1, 'g'), decodeURI(process.env.SECRET_2))
  .replace(new RegExp(process.env.SECRET_3, 'g'), decodeURI(process.env.SECRET_4))
  sendPlayInfo(message, 'Speaking...')
  let urlPromises = [];
  let i = 0
  let j
  while(true) {
    j = i + 100
    if(j >= playPara.length) {
      urlPromises.push(sotClient.sounds.create({ text: playPara.substring(i), voice: 'vi-VN' }))
      break
    }
    j = playPara.lastIndexOf(' ', j)
    if(j == -1) {
      j = playPara.length
      continue
    }
    urlPromises.push(sotClient.sounds.create({ text: playPara.substring(i, j), voice: 'vi-VN' }))
    i = j + 1
  }
  Promise.all(urlPromises).then(urls => {
    for(const url of urls) {
      queue.enqueue(got.stream(url));
    }
    play();
  })
}

const bulkDelete = (channelId) => setInterval(() => client.channels.cache.find(channel => channel.id == channelId).bulkDelete(100), 2000)

client.on('ready', () => {
  console.log('client is ready')
})
  .on('messageReactionAdd', volumeControl).on('messageReactionRemove', volumeControl)
  .on('messageCreate', async message => {
    if (message.content.startsWith('$play') && message.author.id === '487623378514214925') {
      let playPara = message.content.replace(/\s\s+/g, ' ').split(' ').splice(1).join(' ').trim()
      if(!playPara.length) {
        sendInValid(message)
        return
      }
      // check if number, play mp3
      let fileNumber = parseInt(playPara, 10)
      let playObj = {}
      if (!connection || connection.state.status === 'destroyed') {
        initConnection()
      }
      if(playPara.startsWith('http') && playPara.endsWith('.mp3')) {
        handlePlayMp3(message, playPara)
      } else {
        await handleSpeak(message, playPara)
      }
      play()
    }
    if (message.content == '$pause') {
      player.pause()
    }
    if (message.content == '$resume') {
      player.unpause()
    }
    if (message.content == '$stop') {
      player.stop()
      if (connection) connection.destroy()
    }
  })
  .login(process.env.BOT_TOKEN)