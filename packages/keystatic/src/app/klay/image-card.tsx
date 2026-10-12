import { SyntheticEvent, useState } from 'react';

import { Badge } from '@keystar/ui/badge';
import { Icon } from '@keystar/ui/icon';
import { checkIcon } from '@keystar/ui/icon/icons/checkIcon';
import { Flex } from '@keystar/ui/layout';
import { ProgressCircle } from '@keystar/ui/progress';
import { classNames, css, tokenSchema } from '@keystar/ui/style';
import { Text } from '@keystar/ui/typography';

import { useObjectURL } from '../../form/fields/image/ui';
import { contentType, formatSize, LibraryImage } from './images';
import { useImageBytes } from './images-data';

export const imageGrid = (min: number) =>
  css({
    alignContent: 'start',
    display: 'grid',
    gap: tokenSchema.size.space.large,
    gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
  });

const card = css({
  background: tokenSchema.color.background.canvas,
  border: `${tokenSchema.size.border.regular} solid ${tokenSchema.color.border.muted}`,
  borderRadius: tokenSchema.size.radius.large,
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  font: 'inherit',
  overflow: 'hidden',
  padding: 0,
  position: 'relative',
  textAlign: 'start',
  '&:hover': { borderColor: tokenSchema.color.border.neutral },
  '&:focus-visible': {
    outline: `${tokenSchema.size.alias.focusRing} solid ${tokenSchema.color.alias.focusRing}`,
    outlineOffset: tokenSchema.size.alias.focusRingGap,
  },
  '&[aria-pressed="true"]': {
    borderColor: tokenSchema.color.alias.borderSelected,
    boxShadow: `0 0 0 ${tokenSchema.size.border.regular} ${tokenSchema.color.alias.borderSelected}`,
  },
});

const thumb = css({
  aspectRatio: '4 / 3',
  background: tokenSchema.color.background.surface,
  display: 'block',
  objectFit: 'contain',
  width: '100%',
});

const tick = css({
  background: tokenSchema.color.background.accentEmphasis,
  borderRadius: '50%',
  color: tokenSchema.color.foreground.onEmphasis,
  display: 'grid',
  height: 20,
  insetInlineEnd: 6,
  placeItems: 'center',
  position: 'absolute',
  top: 6,
  width: 20,
});

export type Dims = { width: number; height: number };
export const dimsText = (d: Dims | undefined) =>
  d ? `${d.width} × ${d.height}` : '';

export const sizeLine = (
  dims: Dims | undefined,
  bytes: Uint8Array | undefined
) =>
  [dimsText(dims), bytes && formatSize(bytes.byteLength)]
    .filter(Boolean)
    .join(' · ') || ' ';

// `known` holds bytes not in the tree yet: a picture waiting for a save.
export function usePreview(
  image: LibraryImage | undefined,
  known?: Uint8Array
) {
  const fetched = useImageBytes(known ? undefined : image);
  const bytes = known ?? fetched;
  const url = useObjectURL(bytes ?? null, contentType(image?.name ?? ''));
  const [dims, setDims] = useState<Dims>();
  const onLoad = (e: SyntheticEvent<HTMLImageElement>) =>
    setDims({
      width: e.currentTarget.naturalWidth,
      height: e.currentTarget.naturalHeight,
    });
  return { bytes, url, dims, onLoad };
}

export function ImagePreview(props: {
  preview: ReturnType<typeof usePreview>;
  alt?: string;
  height?: number;
  className?: string;
}) {
  const { url, onLoad } = props.preview;
  const box = classNames(
    props.className,
    props.height !== undefined &&
      css({
        display: 'block',
        height: props.height,
        objectFit: 'contain',
        width: '100%',
      })
  );
  if (url) {
    return (
      <img className={box} src={url} alt={props.alt ?? ''} onLoad={onLoad} />
    );
  }
  if (props.height === undefined) return <span className={box} />;
  return (
    <Flex
      alignItems="center"
      justifyContent="center"
      UNSAFE_className={css({ height: props.height })}
    >
      <ProgressCircle isIndeterminate aria-label="Loading image" />
    </Flex>
  );
}

export function ImageCard(props: {
  image: LibraryImage;
  usage: string;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
  bytes?: Uint8Array;
}) {
  const { image } = props;
  const preview = usePreview(image, props.bytes);
  return (
    <button
      type="button"
      className={card}
      aria-pressed={props.selected}
      onClick={props.onSelect}
    >
      <ImagePreview preview={preview} className={thumb} />
      {props.compact && props.selected && (
        <span className={tick}>
          <Icon src={checkIcon} size="small" color="inherit" />
        </span>
      )}
      <Flex
        direction="column"
        gap="regular"
        padding={props.compact ? 'regular' : 'medium'}
        width="100%"
      >
        <Text
          weight="medium"
          size={props.compact ? 'small' : undefined}
          truncate
        >
          {image.name}
        </Text>
        {!props.compact && (
          <Text size="small" color="neutralSecondary">
            {sizeLine(preview.dims, preview.bytes)}
          </Text>
        )}
        <Flex alignItems="center" gap="regular" minHeight="element.small">
          <Text
            size="small"
            color="neutralSecondary"
            UNSAFE_style={{ whiteSpace: 'nowrap' }}
          >
            {props.usage}
          </Text>
          {image.draft && !props.compact && (
            <Badge tone="accent" marginStart="auto">
              New picture
            </Badge>
          )}
        </Flex>
      </Flex>
    </button>
  );
}
