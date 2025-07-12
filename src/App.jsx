import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const SOCKET_URL = 'https://mocri-clone-production.up.railway.app';
const ROOM_ID = 'test-room'; // ここは固定でテスト用

export default function App() {
  const socketRef = useRef();
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    socketRef.current = io(SOCKET_URL);

    socketRef.current.on('connect', () => {
      console.log('Socket接続:', socketRef.current.id);
      setConnected(true);
      socketRef.current.emit('joinRoom', ROOM_ID);
    });

    let localStream;

    const setupMedia = async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (localStreamRef.current) localStreamRef.current.srcObject = localStream;
      } catch (e) {
        console.error('マイクアクセスエラー:', e);
      }
    };

    setupMedia();

    socketRef.current.on('user-joined', async (id) => {
      console.log('user-joined:', id);
      const peer = new RTCPeerConnection();

      localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

      peer.onicecandidate = (e) => {
        if (e.candidate) {
          socketRef.current.emit('signal', { to: id, data: { candidate: e.candidate } });
        }
      };

      peer.ontrack = (e) => {
        const audio = new Audio();
        audio.srcObject = e.streams[0];
        audio.play().catch(() => console.warn('再生ブロック'));
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socketRef.current.emit('signal', { to: id, data: { sdp: offer } });

      peersRef.current[id] = peer;
    });

    socketRef.current.on('signal', async ({ from, data }) => {
      let peer = peersRef.current[from];
      if (!peer) {
        peer = new RTCPeerConnection();
        localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

        peer.onicecandidate = (e) => {
          if (e.candidate) {
            socketRef.current.emit('signal', { to: from, data: { candidate: e.candidate } });
          }
        };

        peer.ontrack = (e) => {
          const audio = new Audio();
          audio.srcObject = e.streams[0];
          audio.play().catch(() => console.warn('再生ブロック'));
        };

        peersRef.current[from] = peer;
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
      }
    });

    return () => {
      socketRef.current.disconnect();
      Object.values(peersRef.current).forEach(peer => peer.close());
      peersRef.current = {};
    };
  }, []);

  return (
    <div>
      <h1>通話テスト</h1>
      <p>{connected ? '接続中' : '接続待機中...'}</p>
      <audio ref={localStreamRef} autoPlay muted />
    </div>
  );
}
