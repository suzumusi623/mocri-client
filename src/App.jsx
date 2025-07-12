import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const socket = io('https://mocri-clone-production.up.railway.app');

export default function App() {
  const [roomId, setRoomId] = useState('test-room'); // 固定ルーム名でOK
  const [connected, setConnected] = useState(false);
  const localStreamRef = useRef(null);
  const peersRef = useRef({});

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      setConnected(true);
      socket.emit('joinRoom', roomId);
    });

    let localStream;

    const start = async () => {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (localStreamRef.current) localStreamRef.current.srcObject = localStream;
    };

    start();

    socket.on('user-joined', async (id) => {
      console.log('User joined:', id);
      const peer = new RTCPeerConnection();

      localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

      peer.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit('signal', { to: id, data: { candidate: e.candidate } });
        }
      };

      peer.ontrack = (e) => {
        const audio = new Audio();
        audio.srcObject = e.streams[0];
        audio.play().catch(() => console.warn('Audio autoplay blocked'));
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit('signal', { to: id, data: { sdp: offer } });

      peersRef.current[id] = peer;
    });

    socket.on('signal', async ({ from, data }) => {
      let peer = peersRef.current[from];
      if (!peer) {
        peer = new RTCPeerConnection();
        localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

        peer.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit('signal', { to: from, data: { candidate: e.candidate } });
          }
        };

        peer.ontrack = (e) => {
          const audio = new Audio();
          audio.srcObject = e.streams[0];
          audio.play().catch(() => console.warn('Audio autoplay blocked'));
        };

        peersRef.current[from] = peer;
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
      }
    });

    return () => {
      socket.disconnect();
      Object.values(peersRef.current).forEach(peer => peer.close());
      peersRef.current = {};
    };
  }, [roomId]);

  return (
    <div>
      <h1>通話テスト</h1>
      <p>部屋: {roomId}</p>
      <p>{connected ? '接続済み' : '接続中...'}</p>
      <audio ref={localStreamRef} autoPlay muted />
    </div>
  );
}
