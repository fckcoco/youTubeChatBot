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
const maximumChatIntervalInMilliseconds = 300000;
let interval; // variable to store and control the interval that will check messages
let chatMessages = [];

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
youtubeService.authorize = ({ tokens }) => {
  auth.setCredentials(tokens);
  console.log('Successfully set credentials');
  console.log('tokens:', tokens);
  save('./tokens.json', JSON.stringify(tokens));
};

youtubeService.findActiveChat = async (channelId) => {
  var liveId;
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
    } else {
      console.log("No Active Chat Found");
    }
  } else {
    console.log("No Live Stream Found");
  }
};

// Update the tokens automatically when they expire
auth.on('tokens', tokens => {
  if (tokens.refresh_token) {
    // store the refresh_token in my database!
    save('./tokens.json', JSON.stringify(auth.tokens));
    console.log(tokens.refresh_token);
  }
  console.log(tokens.access_token);
});

// Read tokens from stored file
const checkTokens = async () => {
  const tokens = await read('./tokens.json');
  if (tokens) {
    auth.setCredentials(tokens);
    console.log('tokens set');
  } else {
    console.log('no tokens set');
  }
};

const getChatMessages = async () => {
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

youtubeService.startChatBot = () => {
  console.log("ChatBot Started");
  updateInterval2 = updateInterval(minimumChatIntervalInMilliseconds);
  interval = setTimeout(youtubeService.insertMessage, minimumChatIntervalInMilliseconds);
};

youtubeService.stopChatBot = () => {
  clearInterval(interval);
  if (chatMessages.length != 0)
    save(`./chat_${new Date().toJSON()}.log`, JSON.stringify(chatMessages));
  chatMessages = [];
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
var updateInterval2 = updateInterval(minimumChatIntervalInMilliseconds);

youtubeService.insertMessage = async () => {
  try {
    await getChatMessages();
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
    console.log("Post Chat Succeeded");
    interval = setTimeout(youtubeService.insertMessage, updateInterval2(true));
  } catch (error) {
    console.log("Post Chat Failed Due To " + error);
    let newInterval = updateInterval2(false);
    if (newInterval > maximumChatIntervalInMilliseconds) {
      youtubeService.stopChatBot();
    } else {
      interval = setTimeout(youtubeService.insertMessage, newInterval);
    }
  }
};

checkTokens();

module.exports = youtubeService;
