import { Badge } from '@keystar/ui/badge';
import { ActionButton, Button } from '@keystar/ui/button';
import { DropZone, FileTrigger } from '@keystar/ui/drag-and-drop';
import { Icon } from '@keystar/ui/icon';
import { checkIcon } from '@keystar/ui/icon/icons/checkIcon';
import { imageIcon } from '@keystar/ui/icon/icons/imageIcon';
import { xIcon } from '@keystar/ui/icon/icons/xIcon';
import { Box, Flex } from '@keystar/ui/layout';
import { ProgressCircle } from '@keystar/ui/progress';
import { css, tokenSchema } from '@keystar/ui/style';
import { Text } from '@keystar/ui/typography';

import { useObjectURL } from '../../form/fields/image/ui';
import { contentType } from './images';

export type UploadStatus =
  | 'refused'
  | 'clash'
  | 'ready'
  | 'saving'
  | 'saved'
  | 'skipped'
  | 'failed';

export type Upload = {
  id: number;
  name: string;
  bytes: Uint8Array;
  status: UploadStatus;
  path?: string;
  message?: string;
};

type Tone = 'critical' | 'caution' | 'neutralSecondary';

export type ClashChoice = 'keep' | 'replace' | 'skip';

const thumb = css({
  background: tokenSchema.color.background.surface,
  borderRadius: tokenSchema.size.radius.small,
  display: 'grid',
  flex: 'none',
  height: 30,
  objectFit: 'cover',
  placeItems: 'center',
  width: 40,
});

const row = css({
  '& + &': {
    borderTop: `${tokenSchema.size.border.regular} solid ${tokenSchema.color.border.muted}`,
  },
});

function UploadThumb(props: { upload: Upload }) {
  const { upload } = props;
  const url = useObjectURL(
    upload.status === 'refused' ? null : upload.bytes,
    contentType(upload.name)
  );
  if (upload.status === 'refused' || upload.status === 'failed') {
    return (
      <span
        className={thumb}
        style={{ background: tokenSchema.color.background.critical }}
      >
        <Icon src={xIcon} color="critical" />
      </span>
    );
  }
  return url ? (
    <img className={thumb} src={url} alt="" />
  ) : (
    <span className={thumb} />
  );
}

export function UploadRow(props: {
  upload: Upload;
  usedBy: string;
  busy: boolean;
  onChoose: (choice: ClashChoice) => void;
}) {
  const { upload } = props;
  const status: Record<UploadStatus, [string | undefined, Tone]> = {
    refused: [upload.message, 'critical'],
    failed: [upload.message, 'critical'],
    clash: [props.usedBy, 'caution'],
    ready: ['Waiting…', 'neutralSecondary'],
    saving: ['Saving to your draft…', 'neutralSecondary'],
    saved: ['Saved to your draft', 'neutralSecondary'],
    skipped: ['Skipped', 'neutralSecondary'],
  };
  const [line, tone] = status[upload.status];

  return (
    <Flex
      direction="column"
      gap="regular"
      paddingX="large"
      paddingY="regular"
      minHeight="element.xlarge"
      justifyContent="center"
      UNSAFE_className={row}
    >
      <Flex gap="medium" alignItems="center">
        <UploadThumb upload={upload} />
        <Flex direction="column" gap="regular" flex minWidth={0}>
          <Text weight="medium" truncate>
            {upload.name}
          </Text>
          <Text size="small" color={tone}>
            {line}
          </Text>
        </Flex>
        {upload.status === 'saved' && <Icon src={checkIcon} color="positive" />}
        {upload.status === 'saving' && (
          <ProgressCircle size="small" isIndeterminate aria-label="Saving" />
        )}
      </Flex>
      {upload.status === 'clash' && (
        <Flex gap="regular" wrap paddingStart="xxlarge">
          <Button
            isDisabled={props.busy}
            onPress={() => props.onChoose('keep')}
          >
            Keep both
          </Button>
          <Button
            isDisabled={props.busy}
            onPress={() => props.onChoose('replace')}
          >
            Replace existing
          </Button>
          <Button
            prominence="low"
            isDisabled={props.busy}
            onPress={() => props.onChoose('skip')}
          >
            Skip
          </Button>
        </Flex>
      )}
    </Flex>
  );
}

const DONE: UploadStatus[] = ['refused', 'saved', 'skipped', 'failed'];

export function UploadList(props: {
  uploads: Upload[];
  usedBy: (path: string) => string;
  busy: boolean;
  onChoose: (upload: Upload, choice: ClashChoice) => void;
  onClose: () => void;
}) {
  const done = props.uploads.filter(u => DONE.includes(u.status)).length;
  const total = props.uploads.length;
  return (
    <Box
      border="muted"
      borderRadius="large"
      backgroundColor="canvas"
      overflow="hidden"
      role="region"
      aria-label="Uploads"
    >
      <Flex
        alignItems="center"
        gap="regular"
        minHeight="element.xlarge"
        paddingX="large"
        borderBottom="muted"
      >
        <Text weight="semibold" flex>
          {total === 1 ? 'Uploading 1 image' : `Uploading ${total} images`}
        </Text>
        <Badge>{`${done} of ${total} done`}</Badge>
        {done === total && (
          <ActionButton prominence="low" onPress={props.onClose}>
            Close
          </ActionButton>
        )}
      </Flex>
      {props.uploads.map(u => (
        <UploadRow
          key={u.id}
          upload={u}
          usedBy={props.usedBy(u.path ?? '')}
          busy={props.busy}
          onChoose={choice => props.onChoose(u, choice)}
        />
      ))}
    </Box>
  );
}

export const UPLOAD_HINT = 'JPG, PNG, WebP, SVG · up to 5 MB';

// Drop area with a file chooser; `multiple` for the Images page.
export function ImageDropArea(props: {
  multiple?: boolean;
  isDisabled?: boolean;
  onFiles: (files: File[]) => void;
  vertical?: boolean;
}) {
  return (
    <DropZone
      aria-label={props.multiple ? 'Drop images' : 'Drop an image'}
      onDrop={async e => {
        if (props.isDisabled) return;
        const files = await Promise.all(
          e.items.flatMap(item =>
            item.kind === 'file' ? [item.getFile()] : []
          )
        );
        props.onFiles(props.multiple ? files : files.slice(0, 1));
      }}
      UNSAFE_className={css({
        alignItems: 'center',
        backgroundColor: tokenSchema.color.background.surface,
        borderRadius: tokenSchema.size.radius.large,
        borderWidth: tokenSchema.size.border.regular,
        flexDirection: props.vertical ? 'column' : 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        padding: props.vertical
          ? tokenSchema.size.space.xxlarge
          : tokenSchema.size.space.large,
      })}
    >
      <Icon src={imageIcon} color="neutralSecondary" />
      <Text color="neutralSecondary">
        {props.multiple ? 'Drop images here, or' : 'Drop an image here, or'}
      </Text>
      <FileTrigger
        acceptedFileTypes={['image/*']}
        allowsMultiple={props.multiple}
        onSelect={list => list && props.onFiles([...list])}
      >
        <ActionButton isDisabled={props.isDisabled}>
          {props.multiple ? 'Choose files' : 'Choose file'}
        </ActionButton>
      </FileTrigger>
      <Text size="small" color="neutralSecondary">
        {props.multiple ? `${UPLOAD_HINT} each` : UPLOAD_HINT}
      </Text>
    </DropZone>
  );
}
