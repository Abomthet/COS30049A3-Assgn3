import { useCallback, useEffect, useState } from 'react';

/** What the replay does with time: how many transactions are shown, whether it is running, and how fast. */
export function useReplay(total: number, speeds: number[], reducedMotion: boolean) {
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(speeds.includes(5) ? 5 : speeds[0]);

  // One timer while it runs. Leaving the screen unmounts the component, which clears it.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setPosition((p) => Math.min(p + 1, total)), 1000 / speed);
    return () => clearInterval(timer);
  }, [playing, speed, total]);

  // It stops by itself at the last transaction, and never runs when motion is reduced.
  useEffect(() => {
    if (playing && (position >= total || reducedMotion)) setPlaying(false);
  }, [playing, position, total, reducedMotion]);

  const play = useCallback(() => {
    // Playing from the end starts again.
    setPosition((p) => (p >= total ? 0 : p));
    setPlaying(true);
  }, [total]);
  const pause = useCallback(() => setPlaying(false), []);
  const step = useCallback(() => {
    setPlaying(false);
    setPosition((p) => Math.min(p + 1, total));
  }, [total]);
  const restart = useCallback(() => {
    setPlaying(false);
    setPosition(0);
  }, []);

  return { position, playing, speed, setSpeed, play, pause, step, restart };
}
