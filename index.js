//TODO: do replay
import runServer from './server.js'
import usm from './user-send-message.js'
import Queue from './queue.js'
import got from 'got'
import sotClient from 'soundoftext-js'
import { Client, Intents, MessageEmbed } from 'discord.js'
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } from '@discordjs/voice'
import dotenv from 'dotenv'
import ytdl from 'ytdl-core'
dotenv.config()
const client = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES,
     Intents.FLAGS.GUILD_MESSAGE_REACTIONS, Intents.FLAGS.GUILD_VOICE_STATES],
  partials: ['MESSAGE', 'CHANNEL', 'REACTION']
})
let myUsm = usm.setToken(process.env.MY_TOKEN)
let player = createAudioPlayer()
let resource
let connection
let playMessage
let preVolume = 1
let queue = new Queue()

player.on('error',(err) => {
  console.log(JSON.stringify(err.resource.playStream, null, 2))
})

player.on(AudioPlayerStatus.Idle, (oldState, newState) => {
  resource = undefined
  play()
})

const stop = () => {
  player.stop()
  if (connection) connection.destroy()
}

const play = () => {
  if(player.state.status === AudioPlayerStatus.Idle && !queue.isEmpty) {
    resource = createAudioResource(queue.dequeue())
    player.play(resource)
  } else if(player.state.status === AudioPlayerStatus.Idle) {
    stop()
  }
}

const initConnection = (message) => {
  let channelId
  if(message.member.voice.channel)
    channelId = message.member.voice.channel.id
  else {
    let firstVoiceChannel = client.channels.cache.find(channel => channel.type === 'GUILD_VOICE')
    if(firstVoiceChannel)
      channelId = firstVoiceChannel.id
    else
      return false
  }
  connection = joinVoiceChannel({
    channelId: channelId,
    guildId: message.guild.id,
    adapterCreator: message.guild.voiceAdapterCreator,
  })
  connection.subscribe(player)
  return true
}

const sendInValid = (message) => message.channel.send('Invalid command!')
const sendConnectionError = (message) => message.channel.send('Connection error! If your server has no voice channel, please create one.')

const sendPlayInfo = (message, embed) => {
  message.channel.send(embed)
}

const handlePlayMp3 = (message, playPara) => {
  sendPlayInfo(playPara.substring(message, playPara.lastIndexOf('/') + 1))
  queue.enqueue(got.stream(playPara))
}

const handleSpeak = async (message, playPara) => {
  playPara = playPara.replace(new RegExp(process.env.SECRET_1, 'g'), decodeURI(process.env.SECRET_2))
  .replace(new RegExp(process.env.SECRET_3, 'g'), decodeURI(process.env.SECRET_4))
  sendPlayInfo(message, 'Speaking...')
  let urlPromises = []
  let i = 0
  let j
  while(true) {
    j = i + 200
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
      queue.enqueue(got.stream(url))
    }
    play()
  })
}

const playYt = (data, message) => {
  let plEmbed = new MessageEmbed()
  plEmbed.setDescription(`**[${data.title}](${data.url})**`)
  plEmbed.setImage(data.image)
  sendPlayInfo(message, {embeds: [plEmbed]})
  queue.enqueue(ytdl(`${data.url}`, {quality: "lowestaudio",filter: 'audioonly'}))
  play()
}

const playSearch = (message, plPara) => {
  got(`https://www.youtube.com/results?search_query=${plPara.replaceAll(' ', '+')}`).then(res => {
    const firPnt = "\"videoRenderer\""
    const secPnt = ",\"longBylineText"
    const start = res.body.indexOf(firPnt) + firPnt.length + 1
    const end = res.body.indexOf(secPnt, start)
    const rawData = JSON.parse(res.body.substring(start, end) + '}')
    let data = {url: `https://www.youtube.com/watch?v=${rawData.videoId}`}
    data = {
      ...data, 
      title: rawData.title.runs ? rawData.title.runs[0].text : rawData.title.simpleText,
      image: rawData.thumbnail.thumbnails[rawData.thumbnail.thumbnails.length - 1].url
    }
    playYt(data, message)
  })
}

const playUrl = (message, plPara) => {
  ytdl.getInfo(plPara).then(data => {
    data = {
      url: data.videoDetails.video_url,
      title: data.videoDetails.title,
      image: data.videoDetails.thumbnails[
        data.videoDetails.thumbnails.length - 1
      ].url
    }
    playYt(data, message)
  })
}
//TODO: create every connection for every guild
const isBotBusy = (message) => {
  if(!connection) return false
  if(connection.state.status === "destroyed") return false
  let mesMemGId = message.guild.id
  let plMemGId = connection.joinConfig.guildId
  return mesMemGId != plMemGId
} 

const cleanCmdParas = message => message.content.replace(/\s\s+/g, ' ').split(' ').splice(1).join(' ').trim()

const checkCmd = (message, cmd) => message.content.startsWith(cmd + ' ') || message.content == cmd

client.on('ready', () => {
  console.log('client is ready')
})
  .on('messageCreate', async message => {
      if (checkCmd(message, `${process.env.COMMAND_PREFIX}pl`)) {
        if(isBotBusy(message)) return
        let plPara = cleanCmdParas(message)
        if(!plPara.length) {
          sendInValid(message)
          return
        }
        if (!connection || connection.state.status === 'destroyed')
          if(!initConnection(message)) {
            sendConnectionError(message)
            return
          }
        if(plPara.includes('youtube.com/watch?v=')) {
            playUrl(message, plPara)
        }
        else
          playSearch(message, plPara)
      }
      if (checkCmd(message, `${process.env.COMMAND_PREFIX}mp3`)) {
        if(isBotBusy(message)) return
        let mp3Para = cleanCmdParas(message)
        if(!mp3Para.length) {
          sendInValid(message)
          return
        }
        if (!connection || connection.state.status === 'destroyed')
          if(!initConnection(message)) {
            sendConnectionError(message)
            return
          }
        if(mp3Para.startsWith('http') && mp3Para.endsWith('.mp3'))
          handlePlayMp3(message, mp3Para)
        else
          sendInValid(message)
        play()
      }
      // TODO: fix first time, not play but get queued
      if (checkCmd(message, `${process.env.COMMAND_PREFIX}spk`)) {
        if(isBotBusy(message)) return
        let spkPara = cleanCmdParas(message)
        if(!spkPara.length) {
          sendInValid(message)
          return
        }
        if (!connection || connection.state.status === 'destroyed')
          if(!initConnection(message)) {
            sendConnectionError(message)
            return
          }
        await handleSpeak(message, spkPara)
        play()
      }
      if(checkCmd(message, `${process.env.COMMAND_PREFIX}skp`)) {
        if(isBotBusy(message)) return
        player.stop()
        play()
      }
      if (checkCmd(message, `${process.env.COMMAND_PREFIX}pau`)) {
        if(isBotBusy(message)) return
        player.pause()
      }
      if (checkCmd(message, `${process.env.COMMAND_PREFIX}res`)) {
        if(isBotBusy(message)) return
        player.unpause()
      }
      if (checkCmd(message, `${process.env.COMMAND_PREFIX}stp`)) {
        if(isBotBusy(message)) return
        stop()
      }
      if (checkCmd(message, `${process.env.COMMAND_PREFIX}clrque`)) {
        if(isBotBusy(message)) return
        queue.clear()
      }
      if (checkCmd(message, `${process.env.COMMAND_PREFIX}clrtxt`)) {
        if(isBotBusy(message)) return
        let hasPermission = message.guild.members.cache.get(client.user.id).permissions.has('MANAGE_MESSAGES')
        if(hasPermission)
          while((await message.channel.bulkDelete(100)).size) {}
        else
          message.channel.send('Can\'t use this command cause bot don\'t have this permission!')
      }
      if (checkCmd(message, `${process.env.COMMAND_PREFIX}help`)) {
        if(isBotBusy(message)) return
        const helpEmbed = new MessageEmbed()
        helpEmbed.setDescription(`
        $pl ***keyword***: search the ***keyword*** and play
        $mp3 ***url***: play mp3 from ***url***
        $spk ***paragraph***: google translator speak ***paragraph***
        $skp: skip current track
        $pau: pause current track
        $res: resume current track
        $stp: bot leave
        `)
        message.channel.send({embeds: [helpEmbed]})
      }
  })
  .login(process.env.BOT_TOKEN)

runServer()
