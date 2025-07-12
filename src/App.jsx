import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

// Socket.ioサーバーのURL
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
