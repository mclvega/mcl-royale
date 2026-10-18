/** Efectos sintetizados con WebAudio: sin archivos de sonido. */
type Efecto = 'disparo' | 'golpe' | 'muerte' | 'explosion' | 'nivel' | 'recoger' | 'boton' | 'dano';

const DEFS: Record<Efecto, { tipo: OscillatorType; f0: number; f1: number; dur: number; vol: number; ruido?: boolean }> = {
  disparo: { tipo: 'square', f0: 880, f1: 440, dur: 0.06, vol: 0.05 },
  golpe: { tipo: 'triangle', f0: 300, f1: 120, dur: 0.07, vol: 0.12 },
  muerte: { tipo: 'sawtooth', f0: 220, f1: 50, dur: 0.25, vol: 0.12 },
  explosion: { tipo: 'sawtooth', f0: 120, f1: 30, dur: 0.4, vol: 0.2, ruido: true },
  nivel: { tipo: 'sine', f0: 520, f1: 1040, dur: 0.3, vol: 0.15 },
  recoger: { tipo: 'sine', f0: 900, f1: 1400, dur: 0.08, vol: 0.08 },
  boton: { tipo: 'sine', f0: 600, f1: 700, dur: 0.05, vol: 0.08 },
  dano: { tipo: 'square', f0: 160, f1: 80, dur: 0.15, vol: 0.15 },
};

class Audio {
  private ctx: AudioContext | null = null;
  /** 0 a 1: volumen general × volumen de efectos. */
  volumen = 0.5;

  iniciar() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      this.ctx = null;
    }
  }

  /** `factor` baja el volumen (p. ej. disparos lejanos). */
  efecto(nombre: Efecto, factor = 1) {
    const ctx = this.ctx;
    if (!ctx || this.volumen <= 0 || ctx.state !== 'running') return;
    const d = DEFS[nombre];
    const t = ctx.currentTime;
    const gan = ctx.createGain();
    gan.gain.setValueAtTime(Math.max(0.0002, d.vol * this.volumen * factor), t);
    gan.gain.exponentialRampToValueAtTime(0.0001, t + d.dur);
    gan.connect(ctx.destination);
    if (d.ruido) {
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * d.dur), ctx.sampleRate);
      const datos = buf.getChannelData(0);
      for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(gan);
      src.start(t);
    }
    const osc = ctx.createOscillator();
    osc.type = d.tipo;
    osc.frequency.setValueAtTime(d.f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, d.f1), t + d.dur);
    osc.connect(gan);
    osc.start(t);
    osc.stop(t + d.dur);
  }
}

export const audio = new Audio();
