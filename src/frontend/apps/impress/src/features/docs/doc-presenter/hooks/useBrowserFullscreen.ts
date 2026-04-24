import { useCallback, useEffect, useState } from 'react';

const isCurrentlyFullscreen = () =>
  typeof document !== 'undefined' && !!document.fullscreenElement;

export const useBrowserFullscreen = () => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    isCurrentlyFullscreen,
  );

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const handleChange = () => setIsFullscreen(isCurrentlyFullscreen());
    document.addEventListener('fullscreenchange', handleChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
    };
  }, []);

  const enter = useCallback(async () => {
    if (typeof document === 'undefined') {
      return;
    }
    if (isCurrentlyFullscreen()) {
      return;
    }
    if (!document.documentElement.requestFullscreen) {
      return;
    }
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Browsers reject the request when not triggered by a user gesture
      // or when the API is unavailable. The presenter remains usable
      // without fullscreen, so we swallow the rejection silently.
    }
  }, []);

  const exit = useCallback(async () => {
    if (typeof document === 'undefined') {
      return;
    }
    if (!isCurrentlyFullscreen()) {
      return;
    }
    if (!document.exitFullscreen) {
      return;
    }
    try {
      await document.exitFullscreen();
    } catch {
      // Ignore: nothing actionable if exit fails.
    }
  }, []);

  const toggle = useCallback(async () => {
    if (isCurrentlyFullscreen()) {
      await exit();
    } else {
      await enter();
    }
  }, [enter, exit]);

  return { isFullscreen, enter, exit, toggle };
};
