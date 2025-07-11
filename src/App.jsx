import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const socket = io('https://mocri-server.onrender.com');

const App = () => {
  const localStreamRef = useRef();
  const [peers, setPeers] = useState({});

  useEffect(() => {
    const init = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current.srcObject = stream;

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
          audio.play();
        };
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit('signal', { to: id, data: { sdp: offer } });
        setPeers(p => ({ ...p, [id]: peer }));
      });

      socket.on('signal', async ({ from, data }) => {
        let peer = peers[from];
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
            audio.play();
          };
          setPeers(p => ({ ...p, [from]: peer }));
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
        if (peers[id]) {
          peers[id].close();
          setPeers(p => {
            const copy = { ...p };
            delete copy[id];
            return copy;
          });
        }
      });
    };

    init();
  }, []);

  return (
    <div>
      <h1>もくり風 クローン（通話ルーム）</h1>
      <p>別タブでも開けば音声通話できるよ！</p>
      <audio ref={localStreamRef} autoPlay muted />
    </div>
  );
};

export default App;
