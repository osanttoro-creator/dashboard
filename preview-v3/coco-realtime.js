/* Voz Realtime da Coco. A UI e o histórico pertencem ao app.js; este módulo
   controla somente WebRTC, microfone, áudio, eventos e encerramento. */
(function (global) {
  'use strict';
  const STATES = new Set(['IDLE','LISTENING','PROCESSING','SPEAKING','INTERRUPTED','ERROR','OFFLINE']);
  class CocoRealtime {
    constructor(callbacks) {
      this.cb = callbacks;
      this.state = 'IDLE';
      this.pc = null; this.dc = null; this.stream = null; this.audio = null;
      this.timer = null; this.muted = false; this.replyMuted = false;
      this.meterTimer = null; this.audioContext = null; this.inputMeter = null; this.outputMeter = null;
      this.mode = 'continuous'; this.pendingTranscript = new Map();
      this.outputText = ''; this.active = false; this.generation = 0;
      this.responding = false; this.handshakeController = null;
    }
    setState(next) {
      if (!STATES.has(next)) return;
      if (this.state === next) return;
      this.state = next; this.cb.onState?.(next);
    }
    send(event) {
      if (this.dc?.readyState !== 'open') return false;
      this.dc.send(JSON.stringify(event)); return true;
    }
    async start({ token, mode = 'continuous', deviceId = '', history = [] }) {
      if (this.active) this.stop();
      if (!global.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia)
        throw new Error('Este navegador não oferece voz em tempo real.');
      this.active = true; this.mode = mode; this.generation++;
      const generation = this.generation;
      this.timer = setTimeout(() => { this.cb.onLimit?.(); this.stop(); }, 10 * 60 * 1000);
      this.setState('PROCESSING');
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}), echoCancellation: true,
          noiseSuppression: true, autoGainControl: true
        } });
        if (!this.active || generation !== this.generation) throw new Error('Conexão cancelada.');
        if (this.mode === 'push') this.stream.getAudioTracks().forEach((track) => { track.enabled = false; });
        this.cb.onMic?.(this.stream.getAudioTracks().some((track) => track.enabled));
        this.pc = new RTCPeerConnection();
        this.audio = document.createElement('audio');
        this.audio.autoplay = true; this.audio.playsInline = true;
        this.audio.muted = this.replyMuted;
        this.pc.ontrack = (event) => {
          this.audio.srcObject = event.streams[0];
          if (this.audioContext && event.streams[0]) {
            try {
              this.outputMeter = this.audioContext.createAnalyser();
              this.audioContext.createMediaStreamSource(event.streams[0]).connect(this.outputMeter);
            } catch { this.outputMeter = null; }
          }
          this.audio.play().catch(() => this.cb.onPlaybackBlocked?.());
        };
        this.pc.onconnectionstatechange = () => {
          if (this.active && ['failed','disconnected','closed'].includes(this.pc?.connectionState)) {
            this.setState('OFFLINE'); this.cb.onDisconnect?.(); this.stop('OFFLINE');
          }
        };
        this.stream.getTracks().forEach((track) => this.pc.addTrack(track, this.stream));
        this.startMeter();
        this.dc = this.pc.createDataChannel('oai-events');
        this.dc.onmessage = (event) => { try { this.handle(JSON.parse(event.data)); } catch { /* evento desconhecido */ } };
        this.dc.onopen = () => {
          if (!this.active) return;
          if (this.replyMuted) this.send({ type: 'session.update', session: { output_modalities: ['text'] } });
          if (this.mode === 'push') {
            this.send({ type: 'session.update', session: { audio: { input: { turn_detection: null } } } });
            this.setInputEnabled(false);
          }
          const context = history.slice(-6).map((entry) =>
            `${entry.who === 'coco' ? 'Coco' : 'Pessoa'}: ${String(entry.text || '').slice(0, 500)}`).join('\n');
          if (context) this.send({ type: 'conversation.item.create', item: {
            type: 'message', role: 'user', content: [{ type: 'input_text',
              text: `Contexto anterior para continuidade; não responda a ele sozinho:\n${context}` }]
          } });
          this.setState('LISTENING');
        };
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.handshakeController = new AbortController();
        const handshakeTimeout = setTimeout(() => this.handshakeController?.abort(), 15000);
        let response;
        try {
          response = await fetch('https://api.openai.com/v1/realtime/calls', {
            method: 'POST', signal: this.handshakeController.signal,
            headers: { Authorization: `Bearer ${token}`,
              'Content-Type': 'application/sdp' }, body: offer.sdp
          });
        } finally { clearTimeout(handshakeTimeout); this.handshakeController = null; }
        if (!response.ok) throw new Error('Não foi possível conectar a voz em tempo real.');
        await this.pc.setRemoteDescription({ type: 'answer', sdp: await response.text() });
      } catch (error) { this.stop('ERROR'); throw error; }
    }
    setInputEnabled(enabled) {
      this.stream?.getAudioTracks().forEach((track) => { track.enabled = !!enabled && !this.muted; });
      this.cb.onMic?.(!!enabled && !this.muted);
    }
    setMuted(value) { this.muted = !!value; this.setInputEnabled(this.mode === 'continuous' || this.pushHeld); }
    async switchDevice(deviceId) {
      if (!this.active || !this.pc) return false;
      const next = await navigator.mediaDevices.getUserMedia({ audio: {
        deviceId: { exact: deviceId }, echoCancellation: true,
        noiseSuppression: true, autoGainControl: true
      } });
      const track = next.getAudioTracks()[0];
      if (!track) { next.getTracks().forEach((item) => item.stop()); return false; }
      track.enabled = !this.muted && (this.mode === 'continuous' || this.pushHeld);
      try {
        const sender = this.pc.getSenders().find((item) => item.track?.kind === 'audio');
        if (!sender) throw new Error('Microfone indisponível.');
        await sender.replaceTrack(track);
        this.stream?.getTracks().forEach((item) => item.stop());
        if (this.audioContext && this.inputMeter)
          this.audioContext.createMediaStreamSource(next).connect(this.inputMeter);
        this.stream = next; return true;
      } catch (error) { next.getTracks().forEach((item) => item.stop()); throw error; }
    }
    setReplyMuted(value) {
      this.replyMuted = !!value;
      if (this.audio) this.audio.muted = this.replyMuted;
      this.send({ type: 'session.update', session: { output_modalities: [this.replyMuted ? 'text' : 'audio'] } });
    }
    setVolume(value) { if (this.audio) this.audio.volume = Math.max(0, Math.min(1, Number(value) || 0)); }
    async resumeAudio() { if (!this.audio) return false; await this.audio.play(); return true; }
    startMeter() {
      const AudioContext = global.AudioContext || global.webkitAudioContext;
      if (!AudioContext || !this.stream) return;
      try {
        this.audioContext = new AudioContext();
        this.inputMeter = this.audioContext.createAnalyser();
        this.audioContext.createMediaStreamSource(this.stream).connect(this.inputMeter);
        this.audioContext.resume().catch(() => {});
        const sample = new Uint8Array(256);
        this.meterTimer = setInterval(() => {
          const analyser = this.state === 'SPEAKING' ? this.outputMeter : this.inputMeter;
          if (!this.active || !analyser) return;
          analyser.getByteTimeDomainData(sample);
          let total = 0;
          for (const value of sample) total += ((value - 128) / 128) ** 2;
          this.cb.onLevel?.(Math.min(1, Math.sqrt(total / sample.length) * 5));
        }, 90);
      } catch { this.audioContext?.close().catch(() => {}); this.audioContext = null; }
    }
    beginPush() {
      if (!this.active || this.mode !== 'push' || this.pushHeld || this.dc?.readyState !== 'open') return;
      this.pushHeld = true;
      this.send({ type: 'input_audio_buffer.clear' });
      if (this.responding) {
        this.send({ type: 'response.cancel' });
        this.send({ type: 'output_audio_buffer.clear' });
      }
      this.setInputEnabled(true); this.setState('LISTENING');
    }
    endPush() {
      if (!this.pushHeld) return;
      this.pushHeld = false; this.setInputEnabled(false);
      this.send({ type: 'input_audio_buffer.commit' });
      this.cb.onTurnStopped?.();
      this.send({ type: 'response.create' }); this.setState('PROCESSING');
    }
    sendText(text) {
      const clean = String(text || '').trim().slice(0, 500);
      if (!clean || !this.active || this.dc?.readyState !== 'open') return false;
      if (this.responding) {
        this.send({ type: 'response.cancel' });
        this.send({ type: 'output_audio_buffer.clear' });
      }
      this.send({ type: 'conversation.item.create', item: { type: 'message', role: 'user',
        content: [{ type: 'input_text', text: clean }] } });
      this.send({ type: 'response.create' }); this.setState('PROCESSING'); return true;
    }
    async runTool(item) {
      const callId = item?.call_id;
      if (!this.active || typeof callId !== 'string') return;
      let output;
      try {
        const args = JSON.parse(item.arguments || '{}');
        output = await this.cb.onTool?.(item.name, args);
      } catch { output = { erro: 'Ação indisponível.' }; }
      if (!this.active) return;
      this.send({ type: 'conversation.item.create', item: { type: 'function_call_output',
        call_id: callId, output: JSON.stringify(output ?? { ok: false }).slice(0, 4000) } });
      this.send({ type: 'response.create' });
    }
    handle(event) {
      if (!this.active) return;
      switch (event.type) {
        case 'input_audio_buffer.speech_started':
          this.outputText = ''; this.setState(this.state === 'SPEAKING' ? 'INTERRUPTED' : 'LISTENING'); break;
        case 'input_audio_buffer.speech_stopped': this.cb.onTurnStopped?.(); this.setState('PROCESSING'); break;
        case 'response.created': this.responding = true; this.setState('PROCESSING'); break;
        case 'conversation.item.input_audio_transcription.delta': {
          const id = event.item_id || 'current';
          const next = (this.pendingTranscript.get(id) || '') + String(event.delta || '');
          this.pendingTranscript.set(id, next); this.cb.onDraft?.(next); break;
        }
        case 'conversation.item.input_audio_transcription.completed': {
          this.pendingTranscript.delete(event.item_id || 'current');
          this.cb.onDraft?.(''); this.cb.onUser?.(String(event.transcript || '').trim()); break;
        }
        case 'response.output_audio_transcript.delta':
        case 'response.output_text.delta':
          this.outputText += String(event.delta || ''); this.cb.onDraftAnswer?.(this.outputText);
          this.setState('SPEAKING'); break;
        case 'response.output_audio_transcript.done':
        case 'response.output_text.done':
          if (!this.outputText) this.outputText = String(event.transcript || event.text || '');
          if (this.outputText.trim()) this.cb.onAnswer?.(this.outputText.trim());
          this.outputText = ''; this.cb.onDraftAnswer?.(''); break;
        case 'response.done':
          this.responding = false;
          for (const item of event.response?.output || []) {
            if (item.type === 'function_call') this.runTool(item);
          }
          if (!(event.response?.output || []).some((item) => item.type === 'function_call'))
            this.setState(this.mode === 'push' ? 'IDLE' : 'LISTENING');
          break;
        case 'error': this.cb.onError?.('A Coco não conseguiu continuar a conversa por voz.'); this.stop('ERROR'); break;
      }
    }
    stop(finalState = 'IDLE') {
      this.active = false; this.generation++;
      this.handshakeController?.abort(); this.handshakeController = null;
      clearTimeout(this.timer); this.timer = null;
      clearInterval(this.meterTimer); this.meterTimer = null;
      this.audioContext?.close().catch(() => {}); this.audioContext = null;
      this.inputMeter = null; this.outputMeter = null;
      this.dc?.close(); this.dc = null;
      this.pc?.close(); this.pc = null;
      this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null;
      if (this.audio) { this.audio.pause(); this.audio.srcObject = null; this.audio.remove(); this.audio = null; }
      this.pendingTranscript.clear(); this.outputText = ''; this.pushHeld = false;
      this.responding = false;
      this.cb.onMic?.(false); this.cb.onDraft?.(''); this.cb.onDraftAnswer?.('');
      this.setState(finalState);
    }
  }
  global.CocoRealtime = CocoRealtime;
})(window);
