// Audio synthesizer using Web Audio API for zero-dependency chimes

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export type ChimeType = 'urgent' | 'reminder' | 'success' | 'focus';

export function playChime(type: ChimeType = 'reminder') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (type === 'urgent') {
      // Two-tone warning chime (higher pitch, rapid)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5

      osc2.frequency.setValueAtTime(880, now + 0.15);
      osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.35); // D6

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.45);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.45);
    } else if (type === 'success') {
      // Pleasant major chord chime (C5 -> E5 -> G5)
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + index * 0.08;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.15, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.4);
      });
    } else if (type === 'focus') {
      // Deep focus gong / resonant bowl tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(432, now); // 432 Hz calming focus

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 1.2);
    } else {
      // Standard gentle notification chime
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    }
  } catch (err) {
    console.warn('Audio chime playback was inhibited or unsupported:', err);
  }
}

export type AmbientSoundType = 'none' | 'rain' | 'white' | 'binaural';

let activeAmbientNodes: { stop: () => void } | null = null;
let activeAmbientGain: GainNode | null = null;

export function stopAmbientSound() {
  try {
    if (activeAmbientGain && audioCtx) {
      activeAmbientGain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);
    }
    setTimeout(() => {
      if (activeAmbientNodes) {
        try {
          activeAmbientNodes.stop();
        } catch {}
        activeAmbientNodes = null;
      }
      if (activeAmbientGain) {
        try {
          activeAmbientGain.disconnect();
        } catch {}
        activeAmbientGain = null;
      }
    }, 250);
  } catch {}
}

export function startAmbientSound(type: AmbientSoundType, volume: number = 0.25) {
  stopAmbientSound();
  if (type === 'none') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(Math.max(0.05, Math.min(volume, 0.5)), ctx.currentTime + 0.4);
    activeAmbientGain = gain;

    if (type === 'white') {
      const bufferSize = ctx.sampleRate * 3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        data[i] = (b0 + b1 + b2 + white * 0.08) * 0.12;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      noise.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
      activeAmbientNodes = { stop: () => noise.stop() };
    } else if (type === 'rain') {
      const bufferSize = ctx.sampleRate * 3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.18;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 750;

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
      activeAmbientNodes = { stop: () => noise.stop() };
    } else if (type === 'binaural') {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.value = 196;
      osc2.frequency.value = 204; // 8Hz Alpha beat

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc1.start();
      osc2.start();
      activeAmbientNodes = {
        stop: () => {
          try {
            osc1.stop();
            osc2.stop();
          } catch {}
        },
      };
    }
  } catch (err) {
    console.warn('Ambient focus sound error:', err);
  }
}
