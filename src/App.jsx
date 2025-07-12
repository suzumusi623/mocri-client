import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

// サーバーのURLに合わせてね
const socket = io('https://mocri-clone-production.up.railway.app');

export default function SimpleCall() {
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const [, setPeersState] = useState({});

  useEffect(() => {
    let localStream;

    const start = async () => {
      // 音声だけ取得
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (localStreamRef.current) {
        localStreamRef.current.srcObject = localStream;
      }

      // すでに"main"ルームにjoinはサーバー側で固定

      // 他のユーザーが来た時の処理
      socket.on('user-joined', async (id) => {
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
          audio.play().catch(() => console.warn('自動再生ブロック'));
        };

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit('signal', { to: id, data: { sdp: offer } });

        peersRef.current[id] = peer;
        setPeersState({ ...peersRef.current });
      });

      // シグナル受信処理
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
            audio.play().catch(() => console.warn('自動再生ブロック'));
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

      // ユーザー退出処理
      socket.on('user-left', (id) => {
        if (peersRef.current[id]) {
          peersRef.current[id].close();
          delete peersRef.current[id];
          setPeersState({ ...peersRef.current });
        }
      });
    };

    start();

    return () => {
      Object.values(peersRef.current).forEach(peer => peer.close());
      peersRef.current = {};
      socket.disconnect();
    };
  }, []);

  return (
    <div>
      <h2>シンプル通話ルーム</h2>
      <p>同じURLを開いている人と通話できるよ！</p>
      <audio ref={localStreamRef} autoPlay muted />
    </div>
  );
}
