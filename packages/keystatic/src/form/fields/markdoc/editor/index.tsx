import { EditorView } from 'prosemirror-view';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { Ref, forwardRef, useId, useMemo, useState } from 'react';
import { Box } from '@keystar/ui/layout';
import { Text, useProseStyleProps } from '@keystar/ui/typography';
import {
  breakpointQueries,
  css,
  toDataAttributes,
  tokenSchema,
} from '@keystar/ui/style';

import { Toolbar } from './Toolbar';
import { prosemirrorStyles } from './utils';
import { EditorPopoverDecoration } from './popovers';
import {
  ProseMirrorEditable,
  ProseMirrorEditor,
  useEditorSchema,
  useEditorState,
} from './editor-view';
import { useImageLibrary } from './image-library';
import { AutocompleteDecoration } from './autocomplete/decoration';
import { NodeViews } from './react-node-views';
import { CellMenuPortal } from './popovers/table';
import {
  EditorContextProvider,
  getContentId,
  getRootId,
  getToolbarId,
} from './context';
import { useEntryLayoutSplitPaneContext } from '../../../../app/entry-form';
import { useContentPanelSize } from '../../../../app/shell/context';
import { yCursorPluginKey, ySyncPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';

const contentStyles = css({
  flex: 1,
  height: 'auto',
  minHeight: tokenSchema.size.scale[2000],
  minWidth: 0,
  outline: 0,
  padding: tokenSchema.size.space.medium,

  '[data-layout="main"] > div > &': {
    boxSizing: 'border-box',
    height: '100%',
    padding: 0,
    paddingTop: tokenSchema.size.space.medium,
    minHeight: 0,
    minWidth: 0,
    maxWidth: 800,
    marginInline: 'auto',

    [breakpointQueries.above.mobile]: {
      padding: tokenSchema.size.space.xlarge,
    },
    [breakpointQueries.above.tablet]: {
      padding: tokenSchema.size.space.xxlarge,
    },

    '&[data-container="wide"]': {
      padding: tokenSchema.size.scale[600],
    },
  },
});

// The Images embed: removing a library picture leaves the file alone.
function LibraryImageHint() {
  const state = useEditorState();
  const library = useImageLibrary(useEditorSchema().config);
  const { selection } = state;
  if (
    !library ||
    !(selection instanceof NodeSelection) ||
    selection.node.type !== state.schema.nodes.image
  ) {
    return null;
  }
  return (
    <Text
      size="small"
      color="neutralSecondary"
      UNSAFE_className={css({
        display: 'block',
        marginInline: 'auto',
        maxWidth: 800,
        padding: tokenSchema.size.space.medium,
      })}
    >
      Remove takes the image off this page only. It stays in Images for other
      pages.
    </Text>
  );
}

export const Editor = forwardRef(function Editor(
  {
    value: _value,
    onChange: _onChange,
    ...props
  }: {
    value: EditorState;
    onChange: (state: EditorState) => void;
  },
  ref: Ref<{ view: EditorView | null }>
) {
  const [valueWhileInCollab, setValueWhileInCollab] =
    useState<EditorState>(_value);
  if ('yjs' in _onChange) {
    const yjsFragment: Y.XmlFragment | undefined =
      ySyncPluginKey.getState(valueWhileInCollab)?.type;
    if (yjsFragment !== (_onChange as any).yjs()) {
      setValueWhileInCollab(_value);
    }
  }
  let entryLayoutPane = useEntryLayoutSplitPaneContext();
  const containerSize = useContentPanelSize();
  const styleProps = useProseStyleProps({
    size: entryLayoutPane === 'main' ? 'medium' : 'regular',
    UNSAFE_className: contentStyles,
    ...toDataAttributes({ layout: entryLayoutPane, container: containerSize }),
  });
  let value, onChange;
  if (yCursorPluginKey.getState(_value)) {
    value = valueWhileInCollab ?? _value;
    onChange = setValueWhileInCollab;
  } else {
    value = _value;
    onChange = _onChange;
  }

  const id = useId();
  const editorContext = useMemo(() => ({ id }), [id]);
  return (
    <EditorContextProvider value={editorContext}>
      <ProseMirrorEditor value={value} onChange={onChange} ref={ref}>
        <Box
          id={getRootId(id)}
          data-keystatic-editor="root"
          data-layout={entryLayoutPane}
          backgroundColor="canvas"
          minWidth={0}
          UNSAFE_className={css(prosemirrorStyles, {
            '&[data-layout="main"]': {
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
            },
            '&:not([data-layout="main"])': {
              border: `${tokenSchema.size.border.regular} solid ${tokenSchema.color.border.neutral}`,
              borderRadius: tokenSchema.size.radius.medium,
            },
          })}
        >
          <Toolbar id={getToolbarId(id)} data-keystatic-editor="toolbar" />
          <div>
            <ProseMirrorEditable
              {...props}
              {...styleProps}
              role="textbox"
              aria-multiline="true"
              id={getContentId(id)}
              data-keystatic-editor="content"
            />
            <LibraryImageHint />
          </div>
        </Box>
        <NodeViews state={value} />
        <CellMenuPortal />
        <EditorPopoverDecoration state={value} />
        <AutocompleteDecoration />
      </ProseMirrorEditor>
    </EditorContextProvider>
  );
});
