import { useCallback, useEffect, useRef, useState } from 'react';
import type { SlideModule } from './sdk';
import { loadSlide, slideChangeIncludes } from './slides';

export function useSlideModule(slideId: string) {
  const [slide, setSlide] = useState<SlideModule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadSeqRef = useRef(0);

  const reload = useCallback(
    (reset: boolean) => {
      const seq = ++loadSeqRef.current;
      if (reset) setSlide(null);
      setError(null);
      loadSlide(slideId)
        .then((mod) => {
          if (seq === loadSeqRef.current) setSlide(mod);
        })
        .catch((e) => {
          if (seq === loadSeqRef.current) setError(String(e?.message ?? e));
        });
    },
    [slideId],
  );

  useEffect(() => {
    reload(true);
  }, [reload]);

  useEffect(() => {
    if (!__OSD_HOT__) return;
    let cancelled = false;
    const handler = (data: unknown) => {
      if (slideChangeIncludes(data, slideId)) {
        queueMicrotask(() => {
          if (!cancelled) reload(false);
        });
      }
    };
    __OSD_HOT__.on('open-slide:slide-changed', handler);
    return () => {
      cancelled = true;
      __OSD_HOT__?.off('open-slide:slide-changed', handler);
    };
  }, [slideId, reload]);

  return { slide, error };
}
