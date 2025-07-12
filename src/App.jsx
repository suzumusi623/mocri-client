import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const socket = io('https://mocri-clone-production.up.railway.app');

export default function App() {
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const [, setPeersState] = useState({});
  const [messages, setMessages] = useState([]);
  const messageInputRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (localStreamRef.current) localStreamRef.current.srcObject = stream;

      socket.emit('join', 'default-room');

      socket.on('user-joined', async (id) => {
        console.log(`user-joined: ${id}`);

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
            console.warn('再生がブロックされました。ユーザー操作を促してください。');
          });
        };

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit('signal', { to: id, data: { sdp: offer } });

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
              console.warn('再生がブロックされました。ユーザー操作を促してください。');
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

      // ここでチャットメッセージ受信
      socket.on('chat-message', ({ id, text }) => {
        setMessages(prev => [...prev, { id, text }]);
      });
    };

    init();

    return () => {
      socket.disconnect();
      Object.values(peersRef.current).forEach(peer => peer.close());
    };
  }, []);

  // メッセージ送信
  const sendMessage = () => {
    const text = messageInputRef.current.value.trim();
    if (!text) return;
    socket.emit('chat-message', { id: socket.id, text });
    setMessages(prev => [...prev, { id: 'me', text }]);
    messageInputRef.current.value = '';
  };

  return (
    <div>
      <h1>もくり風 クローン（通話ルーム＋チャット）</h1>
      <p>別タブや別端末で開いて通話とチャットができるよ！</p>

      <audio ref={localStreamRef} autoPlay muted />

      <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #ccc', padding: 10, marginTop: 20 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 5, color: msg.id === 'me' ? 'blue' : 'black' }}>
            <b>{msg.id === 'me' ? 'あなた' : msg.id}:</b> {msg.text}
          </div>
        ))}
      </div>

      <textarea
        ref={messageInputRef}
        rows={3}
        style={{ width: '100%', marginTop: 10 }}
        placeholder="メッセージを入力してEnterで送信"
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
          }
        }}
      />
      <button onClick={sendMessage} style={{ marginTop: 5 }}>送信</button>
    </div>
  );
}
