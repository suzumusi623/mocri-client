const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

// サーバー初期化
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
