const express = require('express');
const path = require('path');

const youtubeService = require('./youtubeService.js');

const server = express();

server.get('/', (req, res) =>
  res.sendFile(path.join(__dirname + '/index.html'))
);

server.get('/authorize', (request, response) => {
  youtubeService.getCode(response);
});

server.get('/callback', (req, response) => {
  const { code } = req.query;
  youtubeService.getTokensWithCode(code);
  response.redirect('/');
});

server.get('/init-active-chat/:channelId', (req, res) => {
  let channelId = req.params.channelId
  youtubeService.findActiveChat(channelId);
  res.redirect('/');
});

server.get('/start-chat-bot', (req, res) => {
  youtubeService.startChatBot();
  res.redirect('/');
});

server.get('/stop-chat-bot', (req, res) => {
  youtubeService.stopChatBot();
  res.redirect('/');
});

server.listen(12000, function() {
  console.log('Server is Ready');
});
