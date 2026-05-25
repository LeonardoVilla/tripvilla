import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef } from 'react';

type FocusAction = () => void | Promise<void>;

const MIN_INTERVAL_MS = 90_000;

export function useFocusRefresh(action: FocusAction) {
  const isFocused = useIsFocused();
  const actionRef = useRef(action);
  const lastRunRef = useRef<number>(0);
  actionRef.current = action;

  useEffect(() => {
    if (!isFocused) return;
    const now = Date.now();
    if (now - lastRunRef.current < MIN_INTERVAL_MS) return;
    lastRunRef.current = now;
    void actionRef.current();
  }, [isFocused]);
}
