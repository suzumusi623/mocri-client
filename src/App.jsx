import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const socket = io('https://mocri-server.onrender.com');

const [userCount, setUserCount] = useState(1); // 自分を含む初期値

useEffect(() => {
  const init = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (localStreamRef.current) localStreamRef.current.srcObject = stream;

    socket.emit('join', 'default-room');

    socket.on('room-user-count', (count) => {
      console.log('👥 参加人数:', count);
      setUserCount(count);
    });

    // ...既存のuser-joined / signal などの処理はそのままでOK
  };

  init();
}, []);


export default function App() {
  const localStreamRef = useRef(null);
  const peersRef = useRef({});  // peersをミュータブルに管理
  const [, setPeersState] = useState({}); // UI更新用（オブジェクトの中身は直接使わない）

  useEffect(() => {
    const init = async () => {
      // マイク取得
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (localStreamRef.current) localStreamRef.current.srcObject = stream;

      socket.emit('join', 'default-room');

      socket.on('user-joined', async (id) => {
        console.log(`user-joined: ${id}`);

        const peer = new RTCPeerConnection();

        // ローカルストリームをpeerに追加
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
            console.warn('自動再生がブロックされました。ユーザー操作を促してください。');
          });
        };

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit('signal', { to: id, data: { sdp: offer } });

        // peers管理
        peersRef.current[id] = peer;
        setPeersState({ ...peersRef.current });
      });

      socket.on('signal', async ({ from, data }) => {
        console.log(`signal from ${from}`, data);
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
              console.warn('自動再生がブロックされました。ユーザー操作を促してください。');
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

    // クリーンアップ
    return () => {
      socket.disconnect();
      Object.values(peersRef.current).forEach(peer => peer.close());
    };
  }, []);

  return (
    <div>
      <h1>もくり風 クローン（通話ルーム）</h1>
      <p>現在の参加人数: {userCount}人</p>
      <p>別タブや別端末で開いて通話できるのよ！</p>
      <audio ref={localStreamRef} autoPlay muted />
    </div>
  );
}
