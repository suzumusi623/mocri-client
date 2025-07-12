import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const SERVER_URL = 'https://mocri-clone-production.up.railway.app'; // ←ここ大事！

const socket = io(SERVER_URL);

function App() {
  const [currentRoom, setCurrentRoom] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [userCount, setUserCount] = useState(0);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);

  // ロビーでルーム一覧を取得
  useEffect(() => {
    socket.emit('get-rooms');
    socket.on('room-list', (roomList) => {
      setRooms(roomList);
    });

    return () => {
      socket.off('room-list');
    };
  }, []);

  // 入室後の通話処理
  useEffect(() => {
    if (!currentRoom) return;

    navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then((stream) => {
      localStreamRef.current.srcObject = stream;

      socket.emit('join', currentRoom);

      peerConnectionRef.current = new RTCPeerConnection();

      stream.getTracks().forEach((track) => {
        peerConnectionRef.current.addTrack(track, stream);
      });

      peerConnectionRef.current.ontrack = (event) => {
        remoteStreamRef.current.srcObject = event.streams[0];
      };

      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('signal', {
            to: currentRoom,
            data: { candidate: event.candidate },
          });
        }
      };

      socket.on('signal', async ({ from, data }) => {
        if (data.offer) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          socket.emit('signal', {
            to: from,
            data: { answer },
          });
        } else if (data.answer) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else if (data.candidate) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      });

      socket.on('user-joined', async (id) => {
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        socket.emit('signal', {
          to: id,
          data: { offer },
        });
      });

      socket.on('room-user-count', (count) => {
        setUserCount(count);
      });

      socket.on('user-left', () => {
        if (remoteStreamRef.current) {
          remoteStreamRef.current.srcObject = null;
        }
      });
    });

    return () => {
      socket.off('signal');
      socket.off('user-joined');
      socket.off('room-user-count');
      socket.off('user-left');
    };
  }, [currentRoom]);

  const handleJoin = (roomName) => {
    setCurrentRoom(roomName);
  };

  const handleCreate = () => {
    const newRoom = `room-${Date.now()}`;
    setCurrentRoom(newRoom);
  };

  return (
    <div style={{ padding: 20 }}>
      {!currentRoom ? (
        <div>
          <h2>📡 待機ロビー</h2>
          <h4>現在開かれているルーム:</h4>
          {rooms.length > 0 ? (
            rooms.map((room) => (
              <button key={room} onClick={() => handleJoin(room)} style={{ display: 'block', margin: 8 }}>
                {room}
              </button>
            ))
          ) : (
            <p>開かれているルームはありません</p>
          )}
          <button onClick={handleCreate}>🆕 自分でルームを作る</button>
        </div>
      ) : (
        <div>
          <h2>🎧 通話ルーム: {currentRoom}</h2>
          <p>👥 現在の人数: {userCount}</p>
          <audio ref={localStreamRef} autoPlay muted />
          <audio ref={remoteStreamRef} autoPlay />
          <p>別ユーザーで同じルームに入ると通話が始まります！</p>
        </div>
      )}
    </div>
  );
}

export default App;
