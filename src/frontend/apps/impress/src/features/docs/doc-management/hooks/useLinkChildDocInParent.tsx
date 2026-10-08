import { useCallback } from 'react';

import { useEditorStore } from '@/docs/doc-editor/stores/useEditorStore';

import { useDocStore, useProviderStore } from '../stores';

const SYNC_TIMEOUT_MS = 3000;

type BlockWithChildren = { type: string; children?: BlockWithChildren[] };

// A sub-docs list already shows every sub-doc, new ones included: a link
// added next to it would list the new sub-doc twice.
const hasDocChildrenBlock = (blocks: BlockWithChildren[]): boolean =>
  blocks.some(
    (block) =>
      block.type === 'docChildren' || hasDocChildrenBlock(block.children ?? []),
  );

/**
 * Resolves once the server has acknowledged every local change, so the link
 * just inserted reaches it before navigating away disposes of the editor.
 * `isSynced` is not enough: Hocuspocus sets it after the first sync and does
 * not clear it on later edits, only its count of unsynced changes moves.
 */
const waitForPendingChanges = () =>
  new Promise<void>((resolve) => {
    const { provider } = useProviderStore.getState();
    if (!provider?.hasUnsyncedChanges) {
      resolve();
      return;
    }

    const onUnsyncedChanges = ({ number }: { number: number }) => {
      if (number === 0) {
        done();
      }
    };
    const done = () => {
      clearTimeout(timeout);
      provider.off('unsyncedChanges', onUnsyncedChanges);
      resolve();
    };
    const timeout = setTimeout(done, SYNC_TIMEOUT_MS);
    provider.on('unsyncedChanges', onUnsyncedChanges);
  });

/**
 * Inserts an interlink to a freshly created sub-doc in its parent, so the
 * parent content references its children. Only possible when the parent is
 * the doc currently open in an editable editor. Await it before navigating
 * to the sub-doc.
 */
export const useLinkChildDocInParent = () => {
  const { editor } = useEditorStore();
  const { currentDoc } = useDocStore();

  return useCallback(
    async (parentId: string, childId: string, position: 'cursor' | 'end') => {
      if (
        !editor?.isEditable ||
        currentDoc?.id !== parentId ||
        hasDocChildrenBlock(editor.document)
      ) {
        return;
      }

      const link = {
        type: 'interlinkingLinkInline',
        props: { docId: childId },
      } as const;

      if (position === 'cursor') {
        editor.insertInlineContent([link, ' ']);
      } else {
        const lastBlock = editor.document[editor.document.length - 1];
        const isEmptyParagraph =
          lastBlock?.type === 'paragraph' &&
          Array.isArray(lastBlock.content) &&
          lastBlock.content.length === 0;

        if (isEmptyParagraph) {
          editor.updateBlock(lastBlock, { content: [link] });
        } else {
          editor.insertBlocks(
            [{ type: 'paragraph', content: [link] }],
            lastBlock,
            'after',
          );
        }
      }

      await waitForPendingChanges();
    },
    [editor, currentDoc?.id],
  );
};
