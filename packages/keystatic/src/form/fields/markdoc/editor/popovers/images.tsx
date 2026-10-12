import { ButtonGroup, Button, ActionButton } from '@keystar/ui/button';
import {
  useDialogContainer,
  Dialog,
  DialogContainer,
} from '@keystar/ui/dialog';
import { Divider, Flex } from '@keystar/ui/layout';
import { Content } from '@keystar/ui/slots';
import { TextField } from '@keystar/ui/text-field';
import { Heading, Text } from '@keystar/ui/typography';
import { useLocalizedStringFormatter } from 'react-aria/useLocalizedStringFormatter';
import { useMemo, useState } from 'react';
import { clientSideValidateProp } from '../../../../errors';
import { FormValueContentFromPreviewProps } from '../../../../form-from-preview';
import { createGetPreviewProps } from '../../../../preview-props';
import l10nMessages from '../../../../../app/l10n';
import { Icon } from '@keystar/ui/icon';
import { editIcon } from '@keystar/ui/icon/icons/editIcon';
import { fileUpIcon } from '@keystar/ui/icon/icons/fileUpIcon';
import { trash2Icon } from '@keystar/ui/icon/icons/trash2Icon';
import { TooltipTrigger, Tooltip } from '@keystar/ui/tooltip';
import { getUploadedFileObject } from '../../../image/ui';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { useEditorDispatchCommand, useEditorSchema } from '../editor-view';
import {
  libraryImageAttrs,
  libraryImagePath,
  useImageLibrary,
} from '../image-library';
import { Node } from 'prosemirror-model';

export function ImagePopover(props: {
  node: Node;
  state: EditorState;
  pos: number;
}) {
  let stringFormatter = useLocalizedStringFormatter(l10nMessages);
  const runCommand = useEditorDispatchCommand();
  const schema = useEditorSchema();
  const library = useImageLibrary(schema.config);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { attrs } = props.node;
  const setAttrs = (next: Record<string, unknown>) =>
    runCommand((state, dispatch) => {
      if (dispatch) {
        const { tr } = state;
        tr.setNodeMarkup(props.pos, undefined, { ...attrs, ...next });
        const newState = state.apply(tr);
        tr.setSelection(NodeSelection.create(newState.doc, props.pos));
        dispatch(tr);
      }
      return true;
    });
  const changeImage = async () => {
    if (library) {
      const image = await library.pick({
        current: attrs.fromLibrary
          ? {
              path: libraryImagePath(schema.config, attrs.filename),
              alt: attrs.alt,
              title: attrs.title,
            }
          : undefined,
      });
      if (image) setAttrs(libraryImageAttrs(schema.config, image));
      return;
    }
    const file = await getUploadedFileObject('image/*');
    if (file) setAttrs({ src: new Uint8Array(await file.arrayBuffer()) });
  };
  return (
    <>
      <Flex gap="regular" padding="regular">
        <Flex gap="small">
          <TooltipTrigger>
            <ActionButton prominence="low" onPress={() => setDialogOpen(true)}>
              <Icon src={editIcon} />
            </ActionButton>
            <Tooltip>{stringFormatter.format('edit')}</Tooltip>
          </TooltipTrigger>
          <TooltipTrigger>
            <ActionButton prominence="low" onPress={changeImage}>
              <Icon src={fileUpIcon} />
            </ActionButton>
            <Tooltip>{library ? 'Change image' : 'Choose file'}</Tooltip>
          </TooltipTrigger>
        </Flex>
        <Divider orientation="vertical" />
        <TooltipTrigger>
          <ActionButton
            prominence="low"
            onPress={() => {
              runCommand((state, dispatch) => {
                if (dispatch) {
                  dispatch(
                    state.tr.delete(props.pos, props.pos + props.node.nodeSize)
                  );
                }
                return true;
              });
            }}
          >
            <Icon src={trash2Icon} />
          </ActionButton>
          <Tooltip tone="critical">Remove</Tooltip>
        </TooltipTrigger>
      </Flex>
      <DialogContainer onDismiss={() => setDialogOpen(false)}>
        {dialogOpen && (
          <ImageDialog
            alt={attrs.alt}
            title={attrs.title}
            filename={attrs.fromLibrary ? undefined : attrs.filename}
            onSubmit={value => {
              setAttrs(value);
              setDialogOpen(false);
            }}
          />
        )}
      </DialogContainer>
    </>
  );
}

function ImageDialog(props: {
  alt: string;
  title: string;
  // Absent for a library picture: renaming it would break other pages.
  filename?: string;
  onSubmit: (value: { alt: string; filename?: string; title: string }) => void;
}) {
  const schema = useEditorSchema();
  const [state, setState] = useState({ alt: props.alt, title: props.title });
  const imagesSchema = useMemo(
    () => ({ kind: 'object' as const, fields: schema.config.image!.schema }),
    [schema.config.image]
  );
  const previewProps = useMemo(
    () => createGetPreviewProps(imagesSchema, setState, () => undefined),
    [imagesSchema]
  )(state);

  const [filenameWithoutExtension, filenameExtension] = splitFilename(
    props.filename ?? ''
  );
  const [forceValidation, setForceValidation] = useState(false);
  let [fileName, setFileName] = useState(filenameWithoutExtension);
  let [fileNameTouched, setFileNameTouched] = useState(false);

  let { dismiss } = useDialogContainer();
  let stringFormatter = useLocalizedStringFormatter(l10nMessages);

  return (
    <Dialog size="small">
      <form
        style={{ display: 'contents' }}
        onSubmit={event => {
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          setForceValidation(true);
          if (
            (fileName || props.filename === undefined) &&
            clientSideValidateProp(imagesSchema, state, undefined)
          ) {
            dismiss();
            props.onSubmit({
              alt: state.alt,
              title: state.title,
              ...(props.filename === undefined
                ? {}
                : { filename: [fileName, filenameExtension].join('.') }),
            });
          }
        }}
      >
        <Heading>Image details</Heading>
        <Content>
          <Flex gap="large" direction="column">
            {props.filename !== undefined && (
              <TextField
                label="File name"
                onChange={setFileName}
                onBlur={() => setFileNameTouched(true)}
                value={fileName}
                isRequired
                errorMessage={
                  (fileNameTouched || forceValidation) && !fileName
                    ? 'Please provide a file name.'
                    : undefined
                }
                endElement={
                  filenameExtension ? (
                    <Flex
                      alignItems="center"
                      justifyContent="center"
                      paddingEnd="regular"
                    >
                      <Text color="neutralTertiary">.{filenameExtension}</Text>
                    </Flex>
                  ) : null
                }
              />
            )}
            <FormValueContentFromPreviewProps
              forceValidation={forceValidation}
              autoFocus
              {...previewProps}
            />
          </Flex>
        </Content>
        <ButtonGroup>
          <Button onPress={dismiss}>{stringFormatter.format('cancel')}</Button>
          <Button prominence="high" type="submit">
            {stringFormatter.format('save')}
          </Button>
        </ButtonGroup>
      </form>
    </Dialog>
  );
}

function splitFilename(filename: string): [string, string] {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) {
    return [filename, ''];
  }
  return [filename.substring(0, dotIndex), filename.substring(dotIndex + 1)];
}
