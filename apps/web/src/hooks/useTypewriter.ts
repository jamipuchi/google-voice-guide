import { useEffect, useRef, useState } from 'react';

type UseTypewriterOptions = {
  speed?: number; // ms per character
  onComplete?: () => void;
};

export function useTypewriter(
  targetValue: string,
  animate: boolean,
  options?: UseTypewriterOptions
) {
  const speed = options?.speed ?? 30;
  const onComplete = options?.onComplete;
  const [displayValue, setDisplayValue] = useState(targetValue);
  const [isTyping, setIsTyping] = useState(false);
  const prevTargetRef = useRef(targetValue);
  const timerRef = useRef<number | null>(null);
  const indexRef = useRef(0);

  useEffect(() => {
    // If target changed and we should animate
    if (targetValue !== prevTargetRef.current && animate) {
      prevTargetRef.current = targetValue;

      // Clear any ongoing animation
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }

      setIsTyping(true);
      indexRef.current = 0;
      setDisplayValue('');

      timerRef.current = window.setInterval(() => {
        indexRef.current += 1;
        const next = targetValue.slice(0, indexRef.current);
        setDisplayValue(next);

        if (indexRef.current >= targetValue.length) {
          if (timerRef.current) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setIsTyping(false);
          onComplete?.();
        }
      }, speed);
    } else if (!animate) {
      // No animation — just update immediately
      prevTargetRef.current = targetValue;
      setDisplayValue(targetValue);
    }

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [targetValue, animate, speed, onComplete]);

  return { displayValue, isTyping };
}
