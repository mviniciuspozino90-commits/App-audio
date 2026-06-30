/**
 * Plays a highly polished, professional dual-tone synthesized alert chime (bip)
 * using the Web Audio API. Fully client-side with no network dependencies.
 */
export function playAlertChime(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        resolve();
        return;
      }
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;
      
      // Tone 1: High quality ambient dual chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc1.type = 'sine';
      osc2.type = 'sine';
      
      // Pleasant harmonic dual frequency (C#5 and E5)
      osc1.frequency.setValueAtTime(554.37, now); 
      osc2.frequency.setValueAtTime(659.25, now); 
      
      // Linear attack, exponential decay for premium feel
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.25, now + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.75);
      osc2.stop(now + 0.75);
      
      // Tone 2: A slightly delayed second ding to create a realistic "ding-dong"
      const osc3 = ctx.createOscillator();
      const osc4 = ctx.createOscillator();
      const gainNode2 = ctx.createGain();
      
      osc3.type = 'sine';
      osc4.type = 'sine';
      
      // E5 and A5 frequencies, starting 180ms later
      const start2 = now + 0.18;
      osc3.frequency.setValueAtTime(659.25, start2); 
      osc4.frequency.setValueAtTime(880.00, start2); 
      
      gainNode2.gain.setValueAtTime(0, start2);
      gainNode2.gain.linearRampToValueAtTime(0.2, start2 + 0.05);
      gainNode2.gain.exponentialRampToValueAtTime(0.001, start2 + 0.7);
      
      osc3.connect(gainNode2);
      osc4.connect(gainNode2);
      gainNode2.connect(ctx.destination);
      
      osc3.start(start2);
      osc4.start(start2);
      osc3.stop(start2 + 0.75);
      osc4.stop(start2 + 0.75);
      
      // Resolve promise when the entire play duration finishes (around 950ms)
      setTimeout(() => {
        ctx.close();
        resolve();
      }, 950);
    } catch (e) {
      console.error('Failed to play synthesized alert chime:', e);
      resolve(); // always resolve so execution flow doesn't block
    }
  });
}
