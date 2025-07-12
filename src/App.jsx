import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const SOCKET_URL = 'https://mocri-server.onrender.com';

export default function App() {
  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomInput, setRoomInput] = useState('');

  // 通話用のrefsとstate
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const [, setPeersState] = useState({});
  const socketRef = useRef(null);

  useEffect(() => {
    if (!currentRoom) return;

    socketRef.current = io(SOCKET_URL);

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (localStreamRef.current) localStreamRef.current.srcObject = stream;

        socketRef.current.emit('join', currentRoom);

        socketRef.current.on('user-joined', async (id) => {
          const peer = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          });

          stream.getTracks().forEach(track => peer.addTrack(track, stream));

          peer.onicecandidate = (e) => {
            if (e.candidate) {
              socketRef.current.emit('signal', { to: id, data: { candidate: e.candidate } });
            }
          };

          peer.ontrack = (e) => {
            const audio = new Audio();
            audio.srcObject = e.streams[0];
            audio.play().catch(() => {});
          };

          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          socketRef.current.emit('signal', { to: id, data: { sdp: offer } });

          peersRef.current[id] = peer;
          setPeersState({ ...peersRef.current });
        });

        socketRef.current.on('signal', async ({ from, data }) => {
          let peer = peersRef.current[from];
          if (!peer) {
            peer = new RTCPeerConnection({
              iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
            });
            stream.getTracks().forEach(track => peer.addTrack(track, stream));

            peer.onicecandidate = (e) => {
              if (e.candidate) {
                socketRef.current.emit('signal', { to: from, data: { candidate: e.candidate } });
              }
            };

            peer.ontrack = (e) => {
              const audio = new Audio();
              audio.srcObject = e.streams[0];
              audio.play().catch(() => {});
            };

            peersRef.current[from] = peer;
            setPeersState({ ...peersRef.current });
          }

          if (data.sdp) {
            await peer.setRemoteDescription(new RTCSessionDescription(data.sdp));
            if (data.sdp.type === 'offer') {
              const answer = await peer.createAnswer();
              await peer.setLocalDescription(answer);
              socketRef.current.emit('signal', { to: from, data: { sdp: answer } });
            }
          } else if (data.candidate) {
            await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
        });

        socketRef.current.on('user-left', (id) => {
          if (peersRef.current[id]) {
            peersRef.current[id].close();
            delete peersRef.current[id];
            setPeersState({ ...peersRef.current });
          }
        });

      } catch (e) {
        console.error('メディアデバイス取得エラー:', e);
      }
    };

    init();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      Object.values(peersRef.current).forEach(peer => peer.close());
      peersRef.current = {};
    };
  }, [currentRoom]);

  if (!currentRoom) {
    // ロビー画面
    return (
      <div>
        <h2>ロビー</h2>
        <input
          type="text"
          placeholder="ルーム名を入力"
          value={roomInput}
          onChange={e => setRoomInput(e.target.value)}
        />
        <button
          onClick={() => {
            if (roomInput.trim() !== '') {
              setCurrentRoom(roomInput.trim());
            } else {
              alert('ルーム名を入力してね');
            }
          }}
        >
          ルームに入る
        </button>
      </div>
    );
  }

  // 通話画面
  return (
    <div>
      <h2>ルーム: {currentRoom}</h2>
      <button onClick={() => setCurrentRoom(null)}>退出してロビーへ戻る</button>
      <audio ref={localStreamRef} autoPlay muted />
    </div>
  );
}
