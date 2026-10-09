/* Voz Realtime da Coco. A UI e o histórico pertencem ao app.js; este módulo
   controla somente WebRTC, microfone, áudio, eventos e encerramento. */
(function (global) {
  'use strict';
  const STATES = new Set(['IDLE','LISTENING','PROCESSING','SPEAKING','INTERRUPTED','ERROR','OFFLINE']);
  class CocoRealtime {
    constructor(callbacks) {
      this.cb = callbacks || {};
      this.state = 'IDLE';
      this.pc = null; this.dc = null; this.stream = null; this.audio = null;
      this.timer = null; this.muted = false; this.replyMuted = false;
      this.meterTimer = null; this.audioContext = null; this.inputMeter = null; this.outputMeter = null;
      this.mode = 'continuous'; this.inputText = ''; this.outputText = '';
      this.inputFlushTimer = null; this.outputFlushTimer = null;
      this.active = false; this.generation = 0; this.sessionId = null;
      this.responding = false; this.handshakeController = null;
      this.readyTimer = null; this.sessionReady = false; this.eventSequence = 0; this.lastOutputAt = 0;
      this.events = new Set(); this.calls = new Set(); this.batches = new Map(); this.delegations = new Map();
      this.inputSource = null; this.outputSource = null;
    }
    setState(next) {
      if (!STATES.has(next)) return;
      if (this.state === next) return;
      this.state = next; this.cb.onState?.(next);
    }
    send(event) {
      if (!this.sessionReady || this.dc?.readyState !== 'open') return false;
      try { this.dc.send(JSON.stringify({ event_id: 'coco_event_' + (++this.eventSequence), ...event })); return true; }
      catch { return false; }
    }
    idleState() { return this.mode === 'continuous' || this.pushHeld ? 'LISTENING' : 'IDLE'; }
    async waitForIce(pc, signal) {
      if (pc.iceGatheringState === 'complete') return;
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timeout); pc.removeEventListener('icegatheringstatechange', changed);
          signal.removeEventListener('abort', aborted);
        };
        const changed = () => { if (pc.iceGatheringState === 'complete') { cleanup(); resolve(); } };
        const aborted = () => { cleanup(); reject(new Error('Conexão cancelada.')); };
        const timeout = setTimeout(() => { cleanup(); reject(new Error('A conexão por voz demorou demais.')); }, 8000);
        pc.addEventListener('icegatheringstatechange', changed); signal.addEventListener('abort', aborted, { once: true });
        if (signal.aborted) aborted(); else changed();
      });
    }
    async start({ connect, mode = 'continuous', deviceId = '', history = [] }) {
      if (this.active) this.stop();
      if (!global.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia)
        throw new Error('Este navegador não oferece voz em tempo real.');
      this.active = true; this.mode = mode; this.generation++;
      const generation = this.generation;
      const current = () => this.active && generation === this.generation;
      const controller = new AbortController(); this.handshakeController = controller;
      this.events.clear(); this.calls.clear(); this.batches.clear(); this.delegations.clear();
      this.setState('PROCESSING');
      try {
        const audioOptions = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId
            ? { ...audioOptions, deviceId: { exact: deviceId } } : audioOptions });
        } catch (error) {
          // O identificador de um microfone pode mudar após reconectar o aparelho.
          if (!deviceId || !['NotFoundError', 'OverconstrainedError'].includes(error?.name)) throw error;
          stream = await navigator.mediaDevices.getUserMedia({ audio: audioOptions });
          this.cb.onDeviceFallback?.();
        }
        if (!current()) { stream.getTracks().forEach((track) => track.stop()); throw new Error('Conexão cancelada.'); }
        this.stream = stream;
        if (this.mode === 'push') this.stream.getAudioTracks().forEach((track) => { track.enabled = false; });
        this.cb.onMic?.(this.stream.getAudioTracks().some((track) => track.enabled));
        const pc = new RTCPeerConnection(); this.pc = pc;
        const audio = document.createElement('audio'); this.audio = audio;
        this.audio.autoplay = true; this.audio.playsInline = true;
        this.audio.muted = this.replyMuted;
        this.pc.ontrack = (event) => {
          if (!current()) return;
          audio.srcObject = event.streams[0];
          if (this.audioContext && event.streams[0]) {
            try {
              this.outputMeter = this.audioContext.createAnalyser();
              this.outputMeter.fftSize = 256; this.outputSource?.disconnect();
              this.outputSource = this.audioContext.createMediaStreamSource(event.streams[0]);
              this.outputSource.connect(this.outputMeter);
            } catch { this.outputMeter = null; }
          }
          audio.play().catch(() => this.cb.onPlaybackBlocked?.());
        };
        this.pc.onconnectionstatechange = () => {
          if (current() && ['failed','disconnected','closed'].includes(pc.connectionState)) {
            this.setState('OFFLINE'); this.cb.onDisconnect?.(); this.stop('OFFLINE');
          }
        };
        this.stream.getTracks().forEach((track) => this.pc.addTrack(track, this.stream));
        this.startMeter();
        this.dc = this.pc.createDataChannel('oai-events');
        this.dc.onmessage = (event) => { if (current()) { try { this.handle(JSON.parse(event.data)); } catch { /* evento desconhecido */ } } };
        this.dc.onclose = () => { if (current()) { this.cb.onDisconnect?.(); this.stop('OFFLINE'); } };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await this.waitForIce(pc, controller.signal);
        if (!current()) throw new Error('Conexão cancelada.');
        const handshakeTimeout = setTimeout(() => controller.abort(), 15000);
        let response;
        try {
          if (typeof connect !== 'function') throw new Error('Servidor de voz indisponível.');
          const safeHistory = (Array.isArray(history) ? history : []).slice(-6).map((entry) => ({
            role: entry.who === 'coco' || entry.role === 'assistant' ? 'assistant' : 'user',
            text: String(entry.text || '').slice(0, 500)
          }));
          response = await Promise.race([
            connect(pc.localDescription?.sdp || offer.sdp, safeHistory, { signal: controller.signal }),
            new Promise((_, reject) => controller.signal.addEventListener('abort',
              () => reject(new Error('A conexão por voz demorou demais.')), { once: true }))
          ]);
        } finally { clearTimeout(handshakeTimeout); this.handshakeController = null; }
        if (!current()) throw new Error('Conexão cancelada.');
        if (!response?.sdp) throw new Error('Não foi possível conectar a voz em tempo real.');
        this.sessionId = response.sessionId || null;
        await pc.setRemoteDescription({ type: 'answer', sdp: response.sdp });
        if (!current()) throw new Error('Conexão cancelada.');
        if (!this.sessionReady) this.readyTimer = setTimeout(() => {
          if (current() && !this.sessionReady) { this.cb.onError?.('A sessão de voz não iniciou. Tente novamente.'); this.stop('ERROR'); }
        }, 12000);
        this.timer = setTimeout(() => { this.cb.onLimit?.(); this.stop(); }, 10 * 60 * 1000);
      } catch (error) { if (generation === this.generation) this.stop('ERROR'); throw error; }
    }
    setInputEnabled(enabled) {
      this.stream?.getAudioTracks().forEach((track) => { track.enabled = !!enabled && !this.muted; });
      this.cb.onMic?.(!!enabled && !this.muted);
      if (this.sessionReady) this.send({ type: enabled && !this.muted ? 'session.input_audio.unmute' : 'session.input_audio.mute' });
    }
    setMuted(value) { this.muted = !!value; this.setInputEnabled(this.mode === 'continuous' || this.pushHeld); }
    async switchDevice(deviceId) {
      if (!this.active || !this.pc) return false;
      const generation = this.generation, pc = this.pc;
      const next = await navigator.mediaDevices.getUserMedia({ audio: {
        deviceId: { exact: deviceId }, echoCancellation: true,
        noiseSuppression: true, autoGainControl: true
      } });
      if (!this.active || generation !== this.generation) { next.getTracks().forEach((item) => item.stop()); return false; }
      const track = next.getAudioTracks()[0];
      if (!track) { next.getTracks().forEach((item) => item.stop()); return false; }
      track.enabled = !this.muted && (this.mode === 'continuous' || this.pushHeld);
      try {
        const sender = pc.getSenders().find((item) => item.track?.kind === 'audio');
        if (!sender) throw new Error('Microfone indisponível.');
        await sender.replaceTrack(track);
        if (!this.active || generation !== this.generation) { next.getTracks().forEach((item) => item.stop()); return false; }
        this.stream?.getTracks().forEach((item) => item.stop());
        this.inputSource?.disconnect();
        if (this.audioContext && this.inputMeter) {
          this.inputSource = this.audioContext.createMediaStreamSource(next); this.inputSource.connect(this.inputMeter);
        }
        this.stream = next; return true;
      } catch (error) { next.getTracks().forEach((item) => item.stop()); throw error; }
    }
    setReplyMuted(value) {
      this.replyMuted = !!value;
      if (this.audio) this.audio.muted = this.replyMuted;
      if (this.replyMuted && this.state === 'SPEAKING') this.setState(this.responding ? 'PROCESSING' : this.idleState());
    }
    setVolume(value) { if (this.audio) this.audio.volume = Math.max(0, Math.min(1, Number(value) || 0)); }
    async resumeAudio() { if (!this.audio) return false; await this.audioContext?.resume(); await this.audio.play(); return true; }
    readLevel(analyser) {
      if (!analyser) return 0;
      const sample = new Uint8Array(analyser.fftSize || 256); analyser.getByteTimeDomainData(sample);
      let total = 0; for (const value of sample) total += ((value - 128) / 128) ** 2;
      return Math.sqrt(total / sample.length);
    }
    sampleMeters() {
      if (!this.active) return;
      const output = !this.replyMuted && !this.audio?.paused && this.audio?.volume !== 0 ? this.readLevel(this.outputMeter) : 0;
      if (output > 0.012) { this.lastOutputAt = Date.now(); this.setState('SPEAKING'); }
      else if (this.state === 'SPEAKING' && Date.now() - this.lastOutputAt > 350)
        this.setState(this.responding ? 'PROCESSING' : this.idleState());
      const level = this.state === 'SPEAKING' ? output : this.readLevel(this.inputMeter);
      this.cb.onLevel?.(Math.min(1, level * 5));
    }
    startMeter() {
      const AudioContext = global.AudioContext || global.webkitAudioContext;
      if (!AudioContext || !this.stream) return;
      try {
        this.audioContext = new AudioContext();
        this.inputMeter = this.audioContext.createAnalyser();
        this.inputMeter.fftSize = 256;
        this.inputSource = this.audioContext.createMediaStreamSource(this.stream); this.inputSource.connect(this.inputMeter);
        this.audioContext.resume().catch(() => {});
        this.meterTimer = setInterval(() => this.sampleMeters(), 90);
      } catch { this.audioContext?.close().catch(() => {}); this.audioContext = null; }
    }
    beginPush() {
      if (!this.active || !this.sessionReady || this.mode !== 'push' || this.pushHeld || this.dc?.readyState !== 'open') return;
      this.pushHeld = true;
      this.setInputEnabled(true); this.setState('LISTENING');
    }
    endPush() {
      if (!this.pushHeld) return;
      this.pushHeld = false; this.setInputEnabled(false);
      this.cb.onTurnStopped?.();
      if (this.state !== 'SPEAKING') this.setState('PROCESSING');
    }
    async sendText(text) {
      const clean = String(text || '').trim().slice(0, 500);
      if (!clean || !this.active || !this.sessionReady) return false;
      const queued = this.send({ type: 'response.item.create', item: {
        type: 'message', role: 'user', content: [{ type: 'input_text', text: clean }]
      } });
      if (!queued) return false;
      if (!this.responding && ![...this.batches.values()].some((batch) => batch.calls.length && !batch.continued))
        this.send({ type: 'response.create' });
      this.setState('PROCESSING'); return true;
    }
    collectTool(item, batch) {
      const callId = item?.call_id;
      if (!this.active || typeof callId !== 'string' || this.calls.has(callId)) return;
      this.calls.add(callId); const generation = this.generation;
      const result = (async () => {
        let output;
        try {
          if (!['consultar_financas','analisar_dividas','navegar_oaze'].includes(item.name)
            || typeof item.arguments !== 'string' || item.arguments.length > 4000) throw new Error('ferramenta_invalida');
          const args = JSON.parse(item.arguments);
          if (!args || Array.isArray(args) || typeof args !== 'object') throw new Error('argumentos_invalidos');
          output = await this.cb.onTool?.(item.name, args);
        } catch { output = { erro: 'Ação indisponível.' }; }
        let serialized;
        try { serialized = JSON.stringify(output ?? { ok: false }); } catch { serialized = '{"erro":"Resposta inválida."}'; }
        if (serialized.length > 14000) serialized = '{"erro":"A consulta excedeu o limite. Solicite um período menor."}';
        return { callId, output: serialized, generation };
      })();
      batch.calls.push(result);
    }
    async continueBatch(batch) {
      if (!batch.completed || batch.continued || !batch.calls.length) return;
      batch.continued = true; const generation = this.generation, results = await Promise.all(batch.calls);
      if (!this.active || generation !== this.generation) return;
      for (const result of results) {
        if (result.generation !== generation) return;
        if (!this.send({ type: 'response.item.create', item: {
          type: 'function_call_output', call_id: result.callId, output: result.output
        } })) return;
      }
      this.send({ type: 'response.create' });
    }
    scheduleTranscript(kind) {
      const timer = kind === 'input' ? 'inputFlushTimer' : 'outputFlushTimer';
      clearTimeout(this[timer]);
      this[timer] = setTimeout(() => this.flushTranscript(kind), kind === 'input' ? 900 : 1200);
    }
    flushTranscript(kind) {
      const key = kind === 'input' ? 'inputText' : 'outputText', value = String(this[key] || '').trim();
      if (value) (kind === 'input' ? this.cb.onUser : this.cb.onAnswer)?.(value);
      this[key] = ''; if (kind === 'input') this.cb.onDraft?.(''); else this.cb.onDraftAnswer?.('');
    }
    handle(event) {
      if (!this.active) return;
      if (event.event_id) {
        if (this.events.has(event.event_id)) return;
        if (this.events.size > 2000) this.events.clear();
        this.events.add(event.event_id);
      }
      switch (event.type) {
        case 'session.started':
          clearTimeout(this.readyTimer); this.readyTimer = null; this.sessionReady = true;
          this.sessionId = event.session?.id || this.sessionId;
          this.setInputEnabled(this.mode === 'continuous'); this.setState(this.idleState()); break;
        case 'session.input_transcript.delta':
          this.inputText += String(event.delta || ''); this.cb.onDraft?.(this.inputText);
          this.setState('LISTENING'); this.scheduleTranscript('input'); break;
        case 'session.output_transcript.delta':
          this.outputText += String(event.delta || ''); this.cb.onDraftAnswer?.(this.outputText);
          this.scheduleTranscript('output'); break;
        case 'session.delegation.created': this.setState('PROCESSING'); break;
        case 'response.event': {
          const nested = event.event || {};
          const responseId = nested.response_id || nested.response?.id || event.response_id;
          if (event.delegation_id && responseId) this.delegations.set(event.delegation_id, responseId);
          const key = responseId || this.delegations.get(event.delegation_id) || event.delegation_id || 'current';
          let batch = this.batches.get(key);
          if (!batch) { batch = { calls: [], completed: false, continued: false }; this.batches.set(key, batch); }
          if (nested.type === 'response.created') this.responding = true;
          if (nested.type === 'response.output_item.done' && nested.item?.type === 'function_call')
            this.collectTool(nested.item, batch);
          if (nested.type === 'response.completed' || nested.type === 'response.done') {
            this.responding = false;
            for (const item of nested.response?.output || []) if (item.type === 'function_call') this.collectTool(item,batch);
            batch.completed = true; this.continueBatch(batch);
            if (this.state === 'PROCESSING') this.setState(this.mode === 'push' ? 'IDLE' : 'LISTENING');
          }
          if (['response.failed','response.error','response.incomplete'].includes(nested.type)) {
            this.responding = false; this.cb.onError?.('Não consegui concluir a consulta. Tente novamente.');
            this.setState(this.idleState());
          }
          break;
        }
        case 'session.closed': this.stop('IDLE'); break;
        case 'input_audio_buffer.speech_started':
          this.outputText = ''; this.setState(this.state === 'SPEAKING' ? 'INTERRUPTED' : 'LISTENING'); break;
        case 'input_audio_buffer.speech_stopped': this.cb.onTurnStopped?.(); this.setState('PROCESSING'); break;
        case 'response.created': this.responding = true; this.setState('PROCESSING'); break;
        case 'conversation.item.input_audio_transcription.delta': {
          this.inputText += String(event.delta || ''); this.cb.onDraft?.(this.inputText); break;
        }
        case 'conversation.item.input_audio_transcription.completed': {
          this.inputText = ''; this.cb.onDraft?.(''); this.cb.onUser?.(String(event.transcript || '').trim()); break;
        }
        case 'response.output_audio_transcript.delta':
        case 'response.output_text.delta':
          this.outputText += String(event.delta || ''); this.cb.onDraftAnswer?.(this.outputText);
          break;
        case 'response.output_audio_transcript.done':
        case 'response.output_text.done':
          if (!this.outputText) this.outputText = String(event.transcript || event.text || '');
          if (this.outputText.trim()) this.cb.onAnswer?.(this.outputText.trim());
          this.outputText = ''; this.cb.onDraftAnswer?.(''); break;
        case 'response.done': {
          this.responding = false;
          const key = event.response?.id || 'current';
          let batch = this.batches.get(key);
          if (!batch) { batch = { calls: [], completed: false, continued: false }; this.batches.set(key,batch); }
          for (const item of event.response?.output || []) {
            if (item.type === 'function_call') this.collectTool(item,batch);
          }
          batch.completed = true; this.continueBatch(batch);
          if (!(event.response?.output || []).some((item) => item.type === 'function_call'))
            this.setState(this.mode === 'push' ? 'IDLE' : 'LISTENING');
          break;
        }
        case 'error': this.cb.onError?.('A Coco não conseguiu continuar a conversa por voz.'); this.stop('ERROR'); break;
      }
    }
    stop(finalState = 'IDLE') {
      this.send({ type: 'session.close' });
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
      clearTimeout(this.inputFlushTimer); clearTimeout(this.outputFlushTimer);
      this.inputFlushTimer = null; this.outputFlushTimer = null;
      this.inputText = ''; this.outputText = ''; this.pushHeld = false; this.sessionId = null;
      this.responding = false;
      clearTimeout(this.readyTimer); this.readyTimer = null; this.sessionReady = false;
      this.batches.clear(); this.calls.clear(); this.events.clear(); this.delegations.clear();
      this.cb.onMic?.(false); this.cb.onDraft?.(''); this.cb.onDraftAnswer?.('');
      this.setState(finalState);
    }
  }
  global.CocoRealtime = CocoRealtime;
})(window);
