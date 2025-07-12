import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

// サーバーのURLに変更してください
const socket = io('https://mocri-clone-production.up.railway.app');

function Lobby({ onJoinRoom }) {
  const [rooms, setRooms] = useState([]);

useEffect(() => {
  socket.emit('getRooms');

  // ルームリスト更新を受け取る
  socket.on('roomList', (list) => {
    console.log('roomList受信:', list);  // ←ここ追加
    setRooms(list);
  });

  // クリーンアップ
  return () => {
    socket.off('roomList');
  };
}, []);


  const handleCreateRoom = () => {
    const newRoomId = prompt('新しいルーム名を入力してください');
    if (newRoomId) {
      socket.emit('createRoom', newRoomId);
      onJoinRoom(newRoomId);
    }
  };

  return (
    <div>
      <h2>ロビー - ルーム一覧</h2>
      {rooms.length === 0 && <p>現在開かれているルームはありませんよおおおお。</p>}
      <ul>
        {rooms.map(room => (
          <li key={room.roomId}>
            {room.roomId}（{room.userCount}人）
            <button onClick={() => onJoinRoom(room.roomId)}>入室</button>
          </li>
        ))}
      </ul>
      <button onClick={handleCreateRoom}>新しいルームを作成</button>
    </div>
  );
}

function Room({ roomId, onLeave }) {
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const [, setPeersState] = useState({});
  const [userCount, setUserCount] = useState(1);

  useEffect(() => {
    let stream;

    const setup = async () => {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (localStreamRef.current) localStreamRef.current.srcObject = stream;

      socket.emit('joinRoom', roomId);

      socket.on('roomList', (list) => {
        const room = list.find(r => r.roomId === roomId);
        if (room) setUserCount(room.userCount);
      });

      socket.on('user-joined', async (id) => {
        const peer = new RTCPeerConnection();
        stream.getTracks().forEach(track => peer.addTrack(track, stream));

        peer.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit('signal', { to: id, data: { candidate: e.candidate } });
          }
        };

        peer.ontrack = (e) => {
          const audio = new Audio();
          audio.srcObject = e.streams[0];
          audio.play().catch(() => {
            console.warn('自動再生がブロックされました');
          });
        };

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit('signal', { to: id, data: { sdp: offer } });

        peersRef.current[id] = peer;
        setPeersState({ ...peersRef.current });
      });

      socket.on('signal', async ({ from, data }) => {
        let peer = peersRef.current[from];
        if (!peer) {
          peer = new RTCPeerConnection();
          stream.getTracks().forEach(track => peer.addTrack(track, stream));

          peer.onicecandidate = (e) => {
            if (e.candidate) {
              socket.emit('signal', { to: from, data: { candidate: e.candidate } });
            }
          };

          peer.ontrack = (e) => {
            const audio = new Audio();
            audio.srcObject = e.streams[0];
            audio.play().catch(() => {
              console.warn('自動再生がブロックされました');
            });
          };

          peersRef.current[from] = peer;
          setPeersState({ ...peersRef.current });
        }

        if (data.sdp) {
          await peer.setRemoteDescription(new RTCSessionDescription(data.sdp));
          if (data.sdp.type === 'offer') {
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            socket.emit('signal', { to: from, data: { sdp: answer } });
          }
        } else if (data.candidate) {
          await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      });

      socket.on('user-left', (id) => {
        if (peersRef.current[id]) {
          peersRef.current[id].close();
          delete peersRef.current[id];
          setPeersState({ ...peersRef.current });
        }
      });
    };

    setup();

    return () => {
      socket.emit('leaveRoom', roomId);
      Object.values(peersRef.current).forEach(peer => peer.close());
      peersRef.current = {};
    };
  }, [roomId]);

  return (
    <div>
      <h2>ルーム: {roomId}</h2>
      <p>現在の参加人数: {userCount}人</p>
      <button onClick={onLeave}>ルームを退出する</button>
      <audio ref={localStreamRef} autoPlay muted />
    </div>
  );
}

export default function App() {
  const [currentRoom, setCurrentRoom] = useState(null);

  return (
    <div>
      {!currentRoom ? (
        <Lobby onJoinRoom={setCurrentRoom} />
      ) : (
        <Room roomId={currentRoom} onLeave={() => setCurrentRoom(null)} />
      )}
    </div>
  );
}
const broadcastRoomList = () => {
  const roomList = [];
  for (const [roomId, sockets] of rooms.entries()) {
    roomList.push({ roomId, userCount: sockets.size });
  }
  console.log('📢 broadcastRoomList:', roomList);  // ←追加
  io.emit('roomList', roomList);
};
