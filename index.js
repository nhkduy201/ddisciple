//TODO: create every connection for every guild
//TODO: do replay
//TODO: use youtube-sr instead of got the search url https://www.npmjs.com/package/youtube-sr
//TODO: do rewind and forward the track
import runServer from "./server.js";
import usm from "./user-send-message.js";
import Queue from "./queue.js";
import ffmpegStatic from "ffmpeg-static";
import { exec } from "child_process";
import {
  createReadStream,
  createWriteStream,
  unlinkSync,
  existsSync,
  writeFile,
} from "fs";
import got from "got";
import sotClient from "soundoftext-js";
// import { Client, Intents, MessageEmbed } from 'discord.js'
import pkg from "discord.js";
const { Client, GatewayIntentBits, MessageEmbed } = pkg;
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
} from "@discordjs/voice";
import dotenv from "dotenv";
dotenv.config();
import ytdl from "ytdl-core";
import { default as YouTube } from "youtube-sr";
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: ["MESSAGE", "CHANNEL", "REACTION"],
});
const fullFile = "./full.mp3";
const cutFile = "./cut.mp3";
let myUsm = usm.setToken(process.env.MY_TOKEN);
let player = createAudioPlayer();
let curInfo;
let connection;
let startTime;
let queue = new Queue();

client
  .on("ready", () => {
    console.log("client is ready");
  })
  .on("messageCreate", async (message) => {
    if (checkCmd(message, `${process.env.COMMAND_PREFIX}p`)) {
      if (isBotBusy(message)) return;
      let plPara = cleanCmdParas(message);
      if (!plPara.length) {
        sendInValid(message);
        return;
      }
      if (!connection || connection.state.status === "destroyed")
        if (!initConnection(message)) {
          sendConnectionError(message);
          return;
        }
      sendMessage(message, "Loading...");
      getPlayData(message, plPara);
    }
    if (checkCmd(message, `${process.env.COMMAND_PREFIX}mp3`)) {
      if (isBotBusy(message)) return;
      let mp3Para = cleanCmdParas(message);
      if (!mp3Para.length) {
        sendInValid(message);
        return;
      }
      if (!connection || connection.state.status === "destroyed")
        if (!initConnection(message)) {
          sendConnectionError(message);
          return;
        }
      if (mp3Para.startsWith("http") && mp3Para.endsWith(".mp3"))
        handlePlayMp3(message, mp3Para);
      else sendInValid(message);
    }
    // TODO: fix first time, not play but get queued
    if (checkCmd(message, `${process.env.COMMAND_PREFIX}sp`)) {
      if (isBotBusy(message)) return;
      let spkPara = cleanCmdParas(message);
      if (!spkPara.length) {
        sendInValid(message);
        return;
      }
      if (!connection || connection.state.status === "destroyed")
        if (!initConnection(message)) {
          sendConnectionError(message);
          return;
        }
      await handleSpeak(message, spkPara);
    }
    if (checkCmd(message, `${process.env.COMMAND_PREFIX}sk`)) {
      if (isBotBusy(message)) return;
      player.stop();
      play();
    }
    if (checkCmd(message, `${process.env.COMMAND_PREFIX}pa`)) {
      if (isBotBusy(message)) return;
      player.pause();
    }
    if (checkCmd(message, `${process.env.COMMAND_PREFIX}re`)) {
      if (isBotBusy(message)) return;
      player.unpause();
    }
    if (checkCmd(message, `${process.env.COMMAND_PREFIX}st`)) {
      if (isBotBusy(message)) return;
      stop();
    }
    if (checkCmd(message, `${process.env.COMMAND_PREFIX}in`)) {
      if (isBotBusy(message)) return;
      sendEmbed(message, curInfo);
    }
    if (checkCmd(message, `${process.env.COMMAND_PREFIX}clrque`)) {
      if (isBotBusy(message)) return;
      queue.clear();
    }
    if (checkCmd(message, `${process.env.COMMAND_PREFIX}clrtxt`)) {
      if (isBotBusy(message)) return;
      let hasPermission = message.guild.members.cache
        .get(client.user.id)
        .permissions.has("MANAGE_MESSAGES");
      if (hasPermission) while ((await message.channel.bulkDelete(100)).size) {}
      else
        message.channel.send(
          "Can't use this command cause bot don't have this permission!"
        );
    }
    if (checkCmd(message, `${process.env.COMMAND_PREFIX}help`)) {
      if (isBotBusy(message)) return;
      let helpEmbed = new MessageEmbed();
      helpEmbed.setDescription(`
        ${process.env.COMMAND_PREFIX}p ***keyword***: search the ***keyword*** and play
        ${process.env.COMMAND_PREFIX}mp3 ***url***: play mp3 from ***url***
        ${process.env.COMMAND_PREFIX}sp ***paragraph***: google translator speak ***paragraph***
        ${process.env.COMMAND_PREFIX}sk: skip current track
        ${process.env.COMMAND_PREFIX}pa: pause current track
        ${process.env.COMMAND_PREFIX}re: resume current track
        ${process.env.COMMAND_PREFIX}st: bot leave
        ${process.env.COMMAND_PREFIX}in: show current track info
        ${process.env.COMMAND_PREFIX}clrque: clear queue
        ${process.env.COMMAND_PREFIX}clrtxt: clear all text in this channel
        `);
      message.channel.send({ embeds: [helpEmbed] });
    }
  })
  .login(process.env.BOT_TOKEN);

runServer();

player
  .on("error", (err) => {
    writeFile("./error.log", JSON.stringify(err.resource.playStream, null, 2));
  })
  .on(AudioPlayerStatus.Idle, (oldState, newState) => {
    play();
  });

async function getGifUrl() {
  let gifObj = await got.get(
    `https://api.giphy.com/v1/gifs/random?api_key=${process.env.GIPHY_API_KEY}`
  );
  return JSON.parse(gifObj.body).data.images.original.url;
}

function sendError(error) {
  client.channels.cache
    .get("986311591484096582")
    .send(JSON.stringify(error, null, 2));
}

function stop() {
  player.stop();
  if (connection) connection.destroy();
}

function play(message = null) {
  if (player.state.status === AudioPlayerStatus.Idle && !queue.isEmpty) {
    let next = queue.dequeue();
    curInfo = next.info;
    player.play(createAudioResource(next.stream));
    if (message) {
      sendEmbed(message, curInfo);
    }
  } else if (player.state.status === AudioPlayerStatus.Idle) {
    stop();
  }
}

function initConnection(message) {
  let channelId;
  if (message.member.voice.channel) channelId = message.member.voice.channel.id;
  else {
    let firstVoiceChannel = client.channels.cache.find(
      (channel) => channel.type === "GUILD_VOICE"
    );
    if (firstVoiceChannel) channelId = firstVoiceChannel.id;
    else return false;
  }
  connection = joinVoiceChannel({
    channelId: channelId,
    guildId: message.guild.id,
    adapterCreator: message.guild.voiceAdapterCreator,
  });
  connection.subscribe(player);
  return true;
}

function sendInValid(message) {
  message.channel.send("Invalid command!");
}
function sendConnectionError(message) {
  message.channel.send(
    "Connection error! If your server has no voice channel, please create one."
  );
}

function sendEmbed(message, data) {
  let embed = new MessageEmbed()
    .setDescription(`**[${data.title}](${data.url})**`)
    .setImage(data.image);
  sendMessage(message, { embeds: [embed] });
}

function sendMessage(message, content) {
  message.channel.send(content);
}

async function handlePlayMp3(message, playPara) {
  let mp3FileName = playPara.substring(message, playPara.lastIndexOf("/") + 1);
  let imgUrl = await getGifUrl();
  queue.enqueue({
    info: {
      title: mp3FileName,
      url: playPara,
      image: imgUrl,
    },
    stream: got.stream(playPara),
  });
  play(message);
}

function shortenSpeakPara(para) {
  if (para.length < 30) return para;
  return (
    para.substring(0, 10) +
    "..." +
    para.substring(para.length - 10, para.length)
  );
}

async function handleSpeak(message, playPara) {
  playPara = playPara
    .replace(
      new RegExp(process.env.SECRET_1, "g"),
      decodeURI(process.env.SECRET_2)
    )
    .replace(
      new RegExp(process.env.SECRET_3, "g"),
      decodeURI(process.env.SECRET_4)
    );
  let urlPromises = [];
  let i = 0;
  let j;
  let infos = [];
  let txt;
  while (true) {
    j = i + 200;
    if (j >= playPara.length) {
      txt = playPara.substring(i);
      urlPromises.push(sotClient.sounds.create({ text: txt, voice: "vi-VN" }));
      infos.push(shortenSpeakPara(txt));
      break;
    }
    j = playPara.lastIndexOf(" ", j);
    if (j == -1) {
      j = playPara.length;
      continue;
    }
    txt = playPara.substring(i, j);
    urlPromises.push(sotClient.sounds.create({ text: txt, voice: "vi-VN" }));
    infos.push(shortenSpeakPara(txt));
    i = j + 1;
  }
  let imgUrl = await getGifUrl();
  Promise.all(urlPromises).then((urls) => {
    for (const [idx, url] of urls.entries()) {
      queue.enqueue({
        info: {
          title: infos[idx],
          url: url,
          image: imgUrl,
        },
        stream: got.stream(url),
      });
    }
    play(message);
  });
}

function playYt(data, message) {
  // if(!startTime) {
  //   queue.enqueue({
  //     info: data,
  //     stream: ytdl(`${data.url}`, { quality:"lowestaudio", filter: "audioonly" })
  //   })
  //   play(message)
  //   return
  // }
  if (existsSync(fullFile)) unlinkSync(fullFile);
  if (existsSync(cutFile)) unlinkSync(cutFile);
  let tmpFile = createWriteStream(fullFile);
  ytdl(`${data.url}`, { quality: "lowestaudio", filter: "audioonly" }).pipe(
    tmpFile
  );
  tmpFile.on("finish", () => {
    if (startTime === undefined || startTime < 1) {
      queue.enqueue({
        info: data,
        stream: createReadStream(fullFile),
      });
      play(message);
      startTime = undefined;
      return;
    }
    exec(
      `${ffmpegStatic} -i ${fullFile} -ss ${startTime} -c copy -map 0:a -acodec libmp3lame ${cutFile}`,
      (err, stdout, stderr) => {
        if (err) {
          sendError(err);
          return;
        }
        queue.enqueue({
          info: data,
          stream: createReadStream(cutFile),
        });
        play(message);
        startTime = undefined;
      }
    );
  });
}

async function getPlayData(message, plPara) {
  let videoData;
  if (plPara.includes("youtube.com/watch?v="))
    videoData = await YouTube.getVideo(plPara);
  else videoData = (await YouTube.search(plPara, { limit: 1 }))[0];
  if (startTime && startTime > videoData.duration / 1000) {
    sendMessage(message, "Start time is greater than video duration!");
    return;
  }
  let data = {
    url: `https://www.youtube.com/watch?v=${videoData.id}`,
    title: videoData.title,
    image: videoData.thumbnail.url,
  };
  playYt(data, message);
}
function isBotBusy(message) {
  if (!connection) return false;
  if (connection.state.status === "destroyed") return false;
  let mesMemGId = message.guild.id;
  let plMemGId = connection.joinConfig.guildId;
  return mesMemGId != plMemGId;
}

function cleanCmdParas(message) {
  startTime = null;
  if (checkCmd(message, `${process.env.COMMAND_PREFIX}p -s`)) {
    startTime = parseInt(
      message.content.replace(/\s\s+/g, " ").split(" ").splice(2, 1)[0]
    );
    return message.content
      .replace(/\s\s+/g, " ")
      .split(" ")
      .splice(3)
      .join(" ")
      .trim();
  }
  return message.content
    .replace(/\s\s+/g, " ")
    .split(" ")
    .splice(1)
    .join(" ")
    .trim();
}

function checkCmd(message, cmd) {
  return message.content.startsWith(cmd + " ") || message.content == cmd;
}
