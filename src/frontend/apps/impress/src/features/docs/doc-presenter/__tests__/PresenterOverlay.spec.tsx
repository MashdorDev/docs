import { fireEvent, render, screen } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';

import { AppWrapper } from '@/tests/utils';

const requestFullscreen = vi.fn(async () => {});
const exitFullscreen = vi.fn(async () => {});

vi.mock('@/docs/doc-editor/components/BlockNoteEditor', () => ({
  blockNoteSchema: {},
}));

vi.mock('@/docs/doc-editor/styles', () => ({
  cssEditor: '',
}));

vi.mock('@blocknote/mantine', () => ({
  BlockNoteView: ({ editor: _editor }: { editor: unknown }) => (
    <div data-testid="blocknote-view" />
  ),
}));

vi.mock('@blocknote/react', () => ({
  useCreateBlockNote: () => ({}),
}));

const editorDocument = [
  { type: 'heading', content: [{ type: 'text', text: 'Slide 1' }] },
  { type: 'divider' },
  { type: 'paragraph', content: [{ type: 'text', text: 'Slide 2 body' }] },
  { type: 'divider' },
  { type: 'paragraph', content: [{ type: 'text', text: 'Slide 3 body' }] },
  { type: 'divider' },
  // Empty group between two dividers — must be dropped.
  { type: 'paragraph', content: [{ type: 'text', text: '   ' }] },
];

vi.mock('@/docs/doc-editor/stores', () => ({
  useEditorStore: (selector: (s: unknown) => unknown) =>
    selector({ editor: { document: editorDocument } }),
}));

import { PresenterOverlay } from '../components/PresenterOverlay';

describe('PresenterOverlay', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => null,
    });
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    });
    requestFullscreen.mockClear();
    exitFullscreen.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const doc = { id: 'd1', deleted_at: null } as never;

  test('renders 3 slides (empty group dropped) and starts at slide 1/3', () => {
    render(
      <AppWrapper>
        <PresenterOverlay doc={doc} onClose={vi.fn()} />
      </AppWrapper>,
    );
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  test('ArrowRight navigates to the next slide', () => {
    render(
      <AppWrapper>
        <PresenterOverlay doc={doc} onClose={vi.fn()} />
      </AppWrapper>,
    );
    fireEvent.keyDown(window, { code: 'ArrowRight' });
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  test('clicking close invokes onClose', () => {
    const onClose = vi.fn();
    render(
      <AppWrapper>
        <PresenterOverlay doc={doc} onClose={onClose} />
      </AppWrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close presenter' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('next is disabled on the last slide', () => {
    render(
      <AppWrapper>
        <PresenterOverlay doc={doc} onClose={vi.fn()} />
      </AppWrapper>,
    );
    fireEvent.keyDown(window, { code: 'End' });
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    expect(
      (screen.getByRole('button', { name: 'Next slide' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  test('mounting does NOT auto-enter fullscreen', () => {
    render(
      <AppWrapper>
        <PresenterOverlay doc={doc} onClose={vi.fn()} />
      </AppWrapper>,
    );
    expect(requestFullscreen).not.toHaveBeenCalled();
  });

  test('clicking the fullscreen toggle calls requestFullscreen on documentElement', () => {
    render(
      <AppWrapper>
        <PresenterOverlay doc={doc} onClose={vi.fn()} />
      </AppWrapper>,
    );
    requestFullscreen.mockClear();
    fireEvent.click(
      screen.getByRole('button', { name: 'Enter fullscreen' }),
    );
    expect(requestFullscreen).toHaveBeenCalled();
  });
});
