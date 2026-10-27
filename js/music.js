class GameAudio {
  constructor() {
    this.context = null;
    this.timer = null;
    this.step = 0;
    this.mode = null;
    this.enabled = true;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.stopMusic();
  }

  ensureContext() {
    if (!this.enabled) return null;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    this.context ??= new AudioContext();
    this.context.resume();
    return this.context;
  }

  startMenu() { this.startSequence("menu", 520); }
  startBattle() { this.startSequence("battle", 280); }

  startSequence(mode, tempo) {
    if (this.mode === mode && this.timer) {
      this.ensureContext();
      return;
    }
    this.stopMusic();
    if (!this.ensureContext()) return;
    this.mode = mode;
    this.playMusicStep();
    this.timer = window.setInterval(() => this.playMusicStep(), tempo);
  }

  playMusicStep() {
    if (!this.context) return;
    const menuNotes = [110, 146.83, 130.81, 98, 110, 164.81, 146.83, 98];
    const battleNotes = [82.41, 82.41, 98, 73.42, 82.41, 110, 98, 73.42];
    const notes = this.mode === "battle" ? battleNotes : menuNotes;
    this.tone(notes[this.step % notes.length], this.mode === "battle" ? .035 : .025, this.mode === "battle" ? .22 : .42, this.mode === "battle" ? "square" : "triangle");
    this.step += 1;
  }

  tone(frequency, volume, duration, type) {
    const context = this.ensureContext();
    if (!context) return false;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
    return true;
  }

  stopMusic() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    this.step = 0;
    this.mode = null;
  }
}

export const gameAudio = new GameAudio();
