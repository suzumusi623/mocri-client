const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

// サーバー初期化
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// ルーム内の参加者数を取得
const getRoomUserCount = (roomId) => {
  const room = io.sockets.adapter.rooms.get(roomId);
  return room ? room.size : 0;
};

// WebSocket 接続処理（1回だけ！）
io.on('connection', (socket) => {
  console.log('⚡ 新しいユーザー接続:', socket.id);

  socket.on('join', (roomId) => {
    console.log(`🚪 ${socket.id} がルーム「${roomId}」に参加`);
    socket.join(roomId);

    // 現在の参加人数を送信
    const count = getRoomUserCount(roomId);
    console.log(`👥 現在の参加人数: ${count}`);
    io.to(roomId).emit('room-user-count', count);

    // 他の参加者に通知（WebRTC用）
    socket.to(roomId).emit('user-joined', socket.id);

    // シグナリング
    socket.on('signal', ({ to, data }) => {
      console.log(`📶 signal from ${socket.id} to ${to}`);
      io.to(to).emit('signal', { from: socket.id, data });
    });

    // 切断処理
    socket.on('disconnect', () => {
      console.log(`❌ ユーザー切断: ${socket.id}`);
      socket.to(roomId).emit('user-left', socket.id);

      // 少し遅らせて人数を更新（roomから抜ける処理が終わってから）
      setTimeout(() => {
        const updatedCount = getRoomUserCount(roomId);
        console.log(`👥 切断後の人数: ${updatedCount}`);
        io.to(roomId).emit('room-user-count', updatedCount);
      }, 100);
    });
  });
});

// サーバー起動
server.listen(3001, () => {
  console.log('✅ Server is running on http://localhost:3001');
});
