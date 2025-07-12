import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const SOCKET_URL = 'https://mocri-clone-production.up.railway.app'; // ここはあなたのサーバーURLに

const socket = io(SOCKET_URL);

export default function App() {
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);

  // 通話用refs・state
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const [, setPeersState] = useState({});

  // ロビー用: ルーム一覧取得
  useEffect(() => {
    socket.emit('getRooms');

    socket.on('roomList', (list) => {
      setRooms(list);
    });

    return () => {
      socket.off('roomList');
    };
  }, []);

  // ルーム参加 or 作成時のセットアップ
  useEffect(() => {
    if (!currentRoom) return;

    const setupCall = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (localStreamRef.current) localStreamRef.current.srcObject = stream;

      socket.emit('joinRoom', currentRoom);

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

    setupCall();

    return () => {
      socket.emit('leaveRoom', currentRoom);
      Object.values(peersRef.current).forEach(peer => peer.close());
      peersRef.current = {};
      setPeersState({});
    };
  }, [currentRoom]);

  // ルーム作成
  const createRoom = () => {
    const roomId = prompt('新しいルーム名を入力してね！');
    if (roomId && roomId.trim() !== '') {
      socket.emit('createRoom', roomId);
      setCurrentRoom(roomId);
    }
  };

  return (
    <div>
      {!currentRoom ? (
        <>
          <h1>ロビー - ルーム一覧</h1>
          {rooms.length === 0 ? (
            <p>開かれているルームはまだありません〜</p>
          ) : (
            <ul>
              {rooms.map(room => (
                <li key={room.roomId}>
                  {room.roomId}（{room.userCount}人）
                  <button onClick={() => setCurrentRoom(room.roomId)}>入室</button>
                </li>
              ))}
            </ul>
          )}
          <button onClick={createRoom}>新しいルームを作成</button>
        </>
      ) : (
        <>
          <h1>ルーム: {currentRoom}</h1>
          <p>通話中だよ〜</p>
          <button onClick={() => setCurrentRoom(null)}>ロビーに戻る</button>
          <audio ref={localStreamRef} autoPlay muted />
        </>
      )}
    </div>
  );
}
