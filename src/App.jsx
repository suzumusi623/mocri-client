import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const socket = io('https://mocri-clone-production.up.railway.app');

export default function App() {
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const [, setPeersState] = useState({});
  const localStream = useRef(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullyMuted, setIsFullyMuted] = useState(false);
  const remoteAudioRefs = useRef({});

  useEffect(() => {
    const init = async () => {
      try {
        localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (localStreamRef.current) localStreamRef.current.srcObject = localStream.current;

        socket.emit('join', 'default-room');

        socket.on('user-joined', async (id) => {
          const peer = new RTCPeerConnection();
          localStream.current.getTracks().forEach(track => peer.addTrack(track, localStream.current));

          peer.onicecandidate = (e) => {
            if (e.candidate) {
              socket.emit('signal', { to: id, data: { candidate: e.candidate } });
            }
          };

          peer.ontrack = (e) => {
            if (!remoteAudioRefs.current[id]) {
              const audio = new Audio();
              audio.srcObject = e.streams[0];
              audio.autoplay = true;
              audio.muted = isFullyMuted;
              remoteAudioRefs.current[id] = audio;
            } else {
              remoteAudioRefs.current[id].srcObject = e.streams[0];
              remoteAudioRefs.current[id].muted = isFullyMuted;
            }
            remoteAudioRefs.current[id].play().catch(() => {
              console.warn('自動再生ブロック');
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
            localStream.current.getTracks().forEach(track => peer.addTrack(track, localStream.current));

            peer.onicecandidate = (e) => {
              if (e.candidate) {
                socket.emit('signal', { to: from, data: { candidate: e.candidate } });
              }
            };

            peer.ontrack = (e) => {
              if (!remoteAudioRefs.current[from]) {
                const audio = new Audio();
                audio.srcObject = e.streams[0];
                audio.autoplay = true;
                audio.muted = isFullyMuted;
                remoteAudioRefs.current[from] = audio;
              } else {
                remoteAudioRefs.current[from].srcObject = e.streams[0];
                remoteAudioRefs.current[from].muted = isFullyMuted;
              }
              remoteAudioRefs.current[from].play().catch(() => {
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
          if (remoteAudioRefs.current[id]) {
            remoteAudioRefs.current[id].pause();
            delete remoteAudioRefs.current[id];
          }
        });

      } catch (err) {
        console.error('マイク取得エラー:', err);
      }
    };

    init();

    return () => {
      socket.disconnect();
      Object.values(peersRef.current).forEach(peer => peer.close());
      peersRef.current = {};
      Object.values(remoteAudioRefs.current).forEach(audio => audio.pause());
      remoteAudioRefs.current = {};
    };
  }, []);

  const toggleMute = () => {
    if (!localStream.current) return;
    localStream.current.getAudioTracks().forEach(track => {
      track.enabled = !track.enabled;
    });
    setIsMuted(prev => !prev);
  };

  const toggleFullMute = () => {
    if (!localStream.current) return;
    localStream.current.getAudioTracks().forEach(track => {
      track.enabled = false;
    });
    setIsMuted(true);

    const newFullMute = !isFullyMuted;
    Object.values(remoteAudioRefs.current).forEach(audio => {
      audio.muted = newFullMute;
    });
    setIsFullyMuted(newFullMute);
  };

return (
  <div style={{
    height: '100vh',
    width: '100vw',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f2f2f2',
    boxSizing: 'border-box',
    padding: '20px'
  }}>
    <div style={{
      width: '100%',
      maxWidth: '400px',
      backgroundColor: '#fff',
      borderRadius: '12px',
      padding: '24px',
      boxShadow: '0 0 10px rgba(0,0,0,0.1)',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      <h1 style={{ marginBottom: 12 }}>ぱくり</h1>
      <p style={{ marginBottom: 8 }}>別タブで開けば通話できます</p>
      <p style={{ marginBottom: 20 }}>同時にリンクを踏んでね</p>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '100%'
      }}>
        <button onClick={toggleMute} style={buttonStyle}>
          {isMuted ? 'マイクON' : 'ミュート'}
        </button>
        <button onClick={toggleFullMute} style={buttonStyle}>
          {isFullyMuted ? '完全ミュート解除' : '完全ミュート'}
        </button>
      </div>
    </div>
    <audio ref={localStreamRef} autoPlay muted />
  </div>
);


const buttonStyle = {
  padding: '12px 16px',
  backgroundColor: '#4caf50',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '16px',
  width: '100%'
};
