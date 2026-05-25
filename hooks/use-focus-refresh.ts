import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef } from 'react';

type FocusAction = () => void | Promise<void>;

export function useFocusRefresh(action: FocusAction) {
  const isFocused = useIsFocused();
  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => {
    if (isFocused) {
      void actionRef.current();
    }
  }, [isFocused]);
}
