import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

const socket = io('https://mocri-clone-production.up.railway.app');

export default function App() {
  const localStreamRef = useRef(null);
  const peersRef = useRef({});  // peersをミュータブルに管理
  const [, setPeersState] = useState({}); // UI更新用（オブジェクトの中身は直接使わない）
  const localStream = useRef(null);
  const [isMuted, setIsMuted] = useState(false);          // 自分の音声を相手に送るかどうか
  const [isFullyMuted, setIsFullyMuted] = useState(false); // 自分の音声も相手の音声もOFF

  // 再生中の相手音声のaudio要素を管理（複数想定）
  const remoteAudioRefs = useRef({}); // { socketId: HTMLAudioElement }

  useEffect(() => {
    const init = async () => {
      try {
        localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (localStreamRef.current) localStreamRef.current.srcObject = localStream.current;

        socket.emit('join', 'default-room');

        socket.on('user-joined', async (id) => {
          console.log(`user-joined: ${id}`);

          const peer = new RTCPeerConnection();

          localStream.current.getTracks().forEach(track => peer.addTrack(track, localStream.current));

          peer.onicecandidate = (e) => {
            if (e.candidate) {
              socket.emit('signal', { to: id, data: { candidate: e.candidate } });
            }
          };

          peer.ontrack = (e) => {
            // 相手の音声を管理するaudioタグを作成
            if (!remoteAudioRefs.current[id]) {
              const audio = new Audio();
              audio.srcObject = e.streams[0];
              audio.autoplay = true;
              audio.muted = isFullyMuted; // 完全ミュートなら相手音声もミュート
              remoteAudioRefs.current[id] = audio;
            } else {
              // 既にあるaudioタグに新ストリームセット
              remoteAudioRefs.current[id].srcObject = e.streams[0];
              remoteAudioRefs.current[id].muted = isFullyMuted;
            }
            // 再生開始トライ
            remoteAudioRefs.current[id].play().catch(() => {
              console.warn('自動再生がブロックされました。ユーザー操作を促してください。');
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
          if (remoteAudioRefs.current[id]) {
            remoteAudioRefs.current[id].pause();
            delete remoteAudioRefs.current[id];
          }
        });

      } catch (err) {
        console.error('マイクの取得でエラー:', err);
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

  // 自分の音声だけミュート/解除切替
  const toggleMute = () => {
    if (!localStream.current) return;
    localStream.current.getAudioTracks().forEach(track => {
      track.enabled = !track.enabled;
    });
    setIsMuted(prev => !prev);
  };

  // 完全ミュート（自分の音声も相手の音声もミュート）切替
  const toggleFullMute = () => {
    if (!localStream.current) return;

    // 自分の音声はミュート（off）に固定（本当はtrack.enabled = false）
    localStream.current.getAudioTracks().forEach(track => {
      track.enabled = false;
    });
    setIsMuted(true);

    // 相手音声の再生音をミュート or ミュート解除
    const newFullMute = !isFullyMuted;
    Object.values(remoteAudioRefs.current).forEach(audio => {
      audio.muted = newFullMute;
    });
    setIsFullyMuted(newFullMute);
  };

  return (
    <div>
      <h1>もくり風 クローン（通話ルーム）</h1>
      <p>別タブや別端末で開いて通話できるのよおおお！</p>
      <button onClick={toggleMute}>{isMuted ? 'マイク解除' : 'ミュート'}</button>
      <button onClick={toggleFullMute}>{isFullyMuted ? '完全ミュート解除' : '完全ミュート'}</button>
      <audio ref={localStreamRef} autoPlay muted />
    </div>
  );
}
