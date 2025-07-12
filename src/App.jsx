import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const socket = io('https://mocri-server.onrender.com');

export default function App() {
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const [userCount, setUserCount] = useState(1);
  const [, setPeersState] = useState({});

  useEffect(() => {
    // 先にイベントリスナーを登録（重複防止のため初期化の外に置く）
    socket.on('room-user-count', (count) => {
      console.log('👥 参加人数（更新）:', count);
      setUserCount(count);
    });

    const init = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (localStreamRef.current) localStreamRef.current.srcObject = stream;

      socket.emit('join', 'default-room');

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
            console.warn('再生失敗。ユーザー操作が必要な場合があります');
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
              console.warn('自動再生ブロック');
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

    init();

    return () => {
      socket.disconnect();
      Object.values(peersRef.current).forEach(peer => peer.close());
    };
  }, []);

  return (
    <div>
      <h1>もくり風 クローン（通話ルーム）</h1>
      <p>現在の参加人数は・・・: {userCount}人</p>
      <audio ref={localStreamRef} autoPlay muted />
    </div>
  );
}
