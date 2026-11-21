import { useEffect, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

// Keep the element available for reversal during the CSS dismissal transition.
// Its caller marks it inert as soon as the logical open state changes.
export function useMotionPresence(open: boolean): boolean {
  const [present, setPresent] = useState(open);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (open || reduced) {
      setPresent(open);
      return;
    }
    if (!present) return;
    const timer = window.setTimeout(() => setPresent(false), 150);
    return () => window.clearTimeout(timer);
  }, [open, present, reduced]);
  return open || (!reduced && present);
}
