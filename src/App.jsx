import { useEffect, useState } from 'react';
import io from 'socket.io-client';

const socket = io('https://mocri-clone-production.up.railway.app'); // サーバーURL

export default function App() {
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    socket.on('room-list', (availableRooms) => {
      setRooms(availableRooms);
    });

    socket.on('room-joined', (roomName) => {
      setCurrentRoom(roomName);
      setConnected(true);
    });

    socket.on('room-created', (roomName) => {
      setCurrentRoom(roomName);
      setConnected(true);
    });

    return () => {
      socket.off('room-list');
      socket.off('room-joined');
      socket.off('room-created');
    };
  }, []);

  const handleCreateRoom = () => {
    socket.emit('create-room'); // サーバー側で自動命名
  };

  const handleJoinRoom = (roomName) => {
    socket.emit('join-room', roomName);
  };

  if (connected) {
    return (
      <div>
        <h2>ルーム: {currentRoom}</h2>
        <p>通話に接続中（ここに通話処理を追加）</p>
        {/* WebRTC 通話処理用の別のコンポーネントに分離可能 */}
      </div>
    );
  }

  return (
    <div>
      <h1>もくり風ロビー</h1>
      <button onClick={handleCreateRoom}>ルームを作成</button>
      <h3>公開中のルーム</h3>
      {rooms.length === 0 ? (
        <p>現在公開中のルームはありません</p>
      ) : (
        <ul>
          {rooms.map((room) => (
            <li key={room}>
              {room} <button onClick={() => handleJoinRoom(room)}>入室</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
