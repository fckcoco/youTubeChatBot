const { google } = require('googleapis');

// Put the following at the top of the file
// right below the'googleapis' import
const util = require('util');
const fs = require('fs');
const { response } = require('express');
const config = require('./config');

let liveChatId = config.testLiveChatId; // Where we'll store the id of our liveChat
let nextPage; // How we'll keep track of pagination for chat messages
const minimumChatIntervalInMilliseconds = 8000; // Miliseconds between requests to send chat messages
const maximumChatIntervalInMilliseconds = 300000; // Maximum timeout threshold
const intervals = new Map(); // variable to store and control the interval that will check messages
const updateFunctions = new Map();

const writeFilePromise = util.promisify(fs.writeFile);
const readFilePromise = util.promisify(fs.readFile);

const save = async (path, str) => {
  await writeFilePromise(path, str);
  console.log('Successfully Saved');
};

const read = async path => {
  const fileContents = await readFilePromise(path);
  return JSON.parse(fileContents);
};

let chatMessages = JSON.parse(fs.readFileSync(config.messageFile), 'utf-8');
const youtube = google.youtube('v3');
const OAuth2 = google.auth.OAuth2;

const clientId = config.clientId;
const clientSecret = config.clientSecret;
const redirectURI = config.redirectURI;

// Permissions needed to view and submit live chat comments
const scope = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl'
];

const auth = new OAuth2(clientId, clientSecret, redirectURI);
const auths = new Map();
const youtubeService = {};

youtubeService.getCode = response => {
  const authUrl = auth.generateAuthUrl({
    access_type: 'offline',
    scope
  });
  response.redirect(authUrl);
};

// Request access from tokens using code from login
youtubeService.getTokensWithCode = async code => {
  const credentials = await auth.getToken(code);
  youtubeService.authorize(credentials);
};

// Storing access tokens received from google in auth object
youtubeService.authorize = async ({ tokens }) => {
  console.log(tokens);
  let currentAuth = new OAuth2(clientId, clientSecret, redirectURI);
  currentAuth.setCredentials(tokens);
  const getMyChannelId = await youtube.channels.list({
    auth: currentAuth,
    part: 'snippet',
    mine: true
  });
  const myChannelInfo = getMyChannelId.data.items[0];
  const myChannelId = myChannelInfo.id;
  const myChannelName = myChannelInfo.snippet.title;
  tokens.name = myChannelName;
  auths.set(myChannelId, currentAuth);
  console.log('Successfully set credentials');
  console.log('tokens:', tokens);
  save('./tokens.json', JSON.stringify([...auths]));
};

youtubeService.findActiveChat = async (channelId) => {
  var liveId;
  const auth = Array.from(auths.values())[0];
  try {
    const searchRes = await youtube.search.list({
      auth,
      part: 'id',
      eventType: 'live',
      channelId: channelId,
      type: 'video'
    });
    const liveIdData = searchRes.data.items;
    if (liveIdData.length > 0) {
      liveId = liveIdData[0].id.videoId;
      console.log("Chat ID Found:", liveId);
      const response = await youtube.videos.list({
        auth,
        part: 'liveStreamingDetails',
        id: liveId
      });
      const latestChat = response.data.items[0].liveStreamingDetails.activeLiveChatId;
      if (latestChat) {
        liveChatId = latestChat;
        console.log("Chat ID Found:", liveChatId);
        return {found: true, chatId: liveChatId};
      } else {
        console.log("No Active Chat Found");
        return {found: false, chatId: null};
      }
    } else {
      console.log("No Live Stream Found");
      return {found: false, chatId: null};
    }
  } catch(err) {
    console.log(err);
    return {found: false, chatId: null};
  };
};

// Update the tokens automatically when they expire
auth.on('tokens', tokens => {
  if (tokens.refresh_token) {
    // store the refresh_token in my database!
    // save('./tokens.json', JSON.stringify(auth.tokens));
    console.log(tokens.refresh_token);
  }
  console.log(tokens.access_token);
});

// Read tokens from stored file
const checkTokens = async () => {
  try {
    const tokens = await read('./tokens.json');
    const tokensMap = new Map(tokens);
    tokensMap.forEach((value, key) => {
      const oAuth = new OAuth2(clientId, clientSecret, redirectURI);
      oAuth.setCredentials(value.credentials);
      auths.set(key, oAuth);
      console.log('token set for ' + value.credentials.name);
    });
  } catch(err) {
    console.log('no tokens set due to ' + err);
  }
};

const getChatMessages = async (auth) => {
  const response = await youtube.liveChatMessages.list({
    auth,
    part: 'snippet,authorDetails',
    liveChatId,
    pageToken: nextPage
  });
  const { data } = response;
  const newMessages = data.items;
  chatMessages.push(...newMessages.map(message => message.snippet.displayMessage));
  nextPage = data.nextPageToken;
  console.log('Total Chat Messages:', chatMessages.length);
};

youtubeService.startChatBot = async () => {
  auths.forEach((value, key) => {
    const myChannelId = key;
    const interval = intervals.get(myChannelId);
    clearInterval(interval);
  });
  console.log("ChatBot Started");
  for (const [key, value] of auths.entries()) {
    console.log(value.credentials.name + ": Started");
    const auth = value;
    const myChannelId = key;
    let updateFunction = updateInterval(minimumChatIntervalInMilliseconds);
    updateFunctions.set(myChannelId, updateFunction);
    let interval = setTimeout(() => youtubeService.insertMessage(value.credentials.name, myChannelId, auth), minimumChatIntervalInMilliseconds);
    intervals.set(myChannelId, interval);
    await new Promise(r => setTimeout(r, 3000));
  }
};

youtubeService.stopChatBot = () => {
  auths.forEach((value, key) => {
    const myChannelId = key;
    const interval = intervals.get(myChannelId);
    clearInterval(interval);
  });
  console.log("ChatBot Stopped")
};

const updateInterval = (initialChatInterval) => {
  var chatInterval = initialChatInterval;
  const increase = () => {
    chatInterval = chatInterval * 2;
  }
  const decrease = () => {
    if (chatInterval >= minimumChatIntervalInMilliseconds + 1000)
      chatInterval = chatInterval - 1000;
  }
  const update = (lastChatStatus) => {
    if (lastChatStatus) {
      decrease();
    } else {
      increase();
    }
    console.log("Current Chat Interval: " + chatInterval);
    return chatInterval;
  }
  return update;
}

youtubeService.insertMessage = async (name, myChannelId, auth) => {
  try {  
    // await getChatMessages(auth);
    var updateInterval = updateFunctions.get(myChannelId);
    const response = await youtube.liveChatMessages.insert({
      auth,
      part: 'snippet',
      resource: {
        snippet: {
          type: 'textMessageEvent',
          liveChatId,
          textMessageDetails: {
            messageText: chatMessages[Math.floor(Math.random() * chatMessages.length)]
          }
        }
      }
    });
    console.log(name + ": Post Chat Succeeded");
    let newInterval = updateInterval(true);
    let interval = setTimeout(() => youtubeService.insertMessage(name, myChannelId, auth), newInterval);
    intervals.set(myChannelId, interval);
  } catch (error) {
    console.log(name + ": Post Chat Failed Due To " + error);
    var updateInterval = updateFunctions.get(myChannelId);
    let newInterval = updateInterval(false);
    if (newInterval > maximumChatIntervalInMilliseconds) {
      youtubeService.stopChatBot();
    } else {
      let interval = setTimeout(() => youtubeService.insertMessage(name, myChannelId, auth), newInterval);
      intervals.set(myChannelId, interval);
    }
  }
};

checkTokens();

module.exports = youtubeService;
