import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box, Text } from '@/components';
import { useEditorStore } from '@/docs/doc-editor/stores';
import { Doc } from '@/docs/doc-management';

import { PRESENTER_WINDOW_RADIUS } from '../constants';
import { useBrowserFullscreen } from '../hooks/useBrowserFullscreen';
import { usePresenterShortcuts } from '../hooks/usePresenterShortcuts';
import { useSlides } from '../hooks/useSlides';

import { PresenterFloatingBar } from './PresenterFloatingBar';
import { PresenterSlide } from './PresenterSlide';

interface PresenterOverlayProps {
  doc: Doc;
  onClose: () => void;
}

const overlayCss = css`
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: #f2f3f5;
  display: flex;
  flex-direction: column;
`;

const labelCss = css`
  position: fixed;
  top: 0.75rem;
  left: 1rem;
  color: var(--c--theme--colors--greyscale-500, #8a8a8a);
  font-size: 0.8125rem;
  pointer-events: none;
`;

const slideAreaCss = css`
  flex: 1;
  /* Plain block layout — flex centering breaks vertical scrolling
     for content taller than the container. */
  display: block;
  overflow: hidden;
  padding: 2rem 2rem 6rem;
`;

const slideFrameCss = css`
  width: 100%;
  height: 100%;
  margin: 0 auto;
  background: white;
  border-radius: 0.25rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  /* The slide frame is the vertical scroll container. */
  overflow-y: auto;
  overflow-x: hidden;
`;

const slideWrapperCss = css`
  width: 100%;
  /* min-height ensures short slides still fill the frame so the editor
     can compute its 100%-height layout, but tall slides expand and scroll. */
  min-height: 100%;
  padding: 3rem 0;
  box-sizing: border-box;
`;

export const PresenterOverlay = ({
  doc: _doc,
  onClose,
}: PresenterOverlayProps) => {
  const { t } = useTranslation();
  const editor = useEditorStore((state) => state.editor);

  // Snapshot the editor's blocks once at mount. Subsequent collaborator
  // edits do not affect the ongoing presentation (by design).
  const snapshotRef = useRef<unknown[] | null>(null);
  if (snapshotRef.current === null) {
    snapshotRef.current = editor ? [...editor.document] : [];
  }
  const snapshotBlocks = snapshotRef.current;

  const slides = useSlides(snapshotBlocks as { type: string }[]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const total = slides.length;
  const clamp = useCallback(
    (i: number) => Math.max(0, Math.min(i, total - 1)),
    [total],
  );

  const goPrev = useCallback(
    () => setCurrentIndex((i) => clamp(i - 1)),
    [clamp],
  );
  const goNext = useCallback(
    () => setCurrentIndex((i) => clamp(i + 1)),
    [clamp],
  );
  const goFirst = useCallback(() => setCurrentIndex(0), []);
  const goLast = useCallback(
    () => setCurrentIndex(clamp(total - 1)),
    [clamp, total],
  );

  const { isFullscreen, exit, toggle } = useBrowserFullscreen();

  // Leave fullscreen on unmount if the user entered it via the bar.
  useEffect(() => {
    return () => {
      void exit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  usePresenterShortcuts({
    onPrev: goPrev,
    onNext: goNext,
    onFirst: goFirst,
    onLast: goLast,
    onToggleFullscreen: () => void toggle(),
    onClose,
    isFullscreen,
  });

  const mountedIndices = useMemo(() => {
    const from = Math.max(0, currentIndex - PRESENTER_WINDOW_RADIUS);
    const to = Math.min(total - 1, currentIndex + PRESENTER_WINDOW_RADIUS);
    const indices: number[] = [];
    for (let i = from; i <= to; i += 1) {
      indices.push(i);
    }
    return indices;
  }, [currentIndex, total]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <Box
      $css={overlayCss}
      role="dialog"
      aria-modal="true"
      className="toto"
      aria-label={t('Presenter mode')}
    >
      <Text as="span" $css={labelCss}>
        {t('Docs - Presenter mode')}
      </Text>

      <Box $css={slideAreaCss}>
        <Box $css={slideFrameCss}>
          {mountedIndices.map((i) => (
            <Box
              key={i}
              $css={css`
                ${slideWrapperCss};
                display: ${i === currentIndex ? 'block' : 'none'};
              `}
            >
              <PresenterSlide
                blocks={slides[i] as unknown[]}
                ariaLabel={t('Slide {{current}} of {{total}}', {
                  current: i + 1,
                  total,
                })}
              />
            </Box>
          ))}
        </Box>
      </Box>

      <PresenterFloatingBar
        index={currentIndex}
        total={total}
        isFullscreen={isFullscreen}
        onPrev={goPrev}
        onNext={goNext}
        onToggleFullscreen={() => void toggle()}
        onClose={onClose}
      />
    </Box>,
    document.body,
  );
};
