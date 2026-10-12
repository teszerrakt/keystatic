import { DragEvent, KeyboardEvent, useRef, useState } from 'react';

import { ActionButton } from '@keystar/ui/button';
import { Icon } from '@keystar/ui/icon';
import { arrowDownIcon } from '@keystar/ui/icon/icons/arrowDownIcon';
import { arrowUpIcon } from '@keystar/ui/icon/icons/arrowUpIcon';
import { gripVerticalIcon } from '@keystar/ui/icon/icons/gripVerticalIcon';
import { css, tokenSchema } from '@keystar/ui/style';

import { insertAt } from './menu-sections';

const list = css({
  background: tokenSchema.color.background.surfaceSecondary,
  borderRadius: tokenSchema.size.radius.large,
  display: 'flex',
  flexDirection: 'column',
  gap: tokenSchema.size.space.xsmall,
  padding: tokenSchema.size.space.small,
});

const text = {
  fontFamily: tokenSchema.typography.fontFamily.base,
  fontSize: tokenSchema.typography.text.regular.size,
};

const fixed = css(text, {
  alignItems: 'center',
  color: tokenSchema.color.foreground.neutralSecondary,
  display: 'flex',
  minHeight: tokenSchema.size.element.small,
  paddingInline: tokenSchema.size.space.regular,
});

const card = css(text, {
  alignItems: 'center',
  background: tokenSchema.color.background.canvas,
  border: `${tokenSchema.size.border.medium} solid ${tokenSchema.color.border.accent}`,
  borderRadius: tokenSchema.size.radius.medium,
  boxShadow: `${tokenSchema.size.shadow.medium} ${tokenSchema.color.shadow.regular}`,
  color: tokenSchema.color.foreground.accent,
  cursor: 'grab',
  display: 'flex',
  fontWeight: tokenSchema.typography.fontWeight.semibold,
  gap: tokenSchema.size.space.small,
  minHeight: tokenSchema.size.element.medium,
  paddingInline: tokenSchema.size.space.small,
  '&[data-dragging=true]': { opacity: 0.5 },
  '&:focus-visible': {
    outline: `${tokenSchema.size.alias.focusRing} solid ${tokenSchema.color.alias.focusRing}`,
    outlineOffset: tokenSchema.size.alias.focusRingGap,
  },
});

const label = css({ flex: 1, minWidth: 0, overflowWrap: 'anywhere' });

// One item placed among fixed ones: drag it, use the arrows, or ↑↓ on the card.
export function PlaceList(props: {
  'aria-labelledby'?: string;
  items: { key: string; label: string }[];
  moving: { label: string; note?: string };
  index: number;
  onMove: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const { index, onMove } = props;
  const last = props.items.length;
  const rows = insertAt<{ key: string; label: string } | null>(
    props.items,
    null,
    index
  );

  const onDragOver = (e: DragEvent) => {
    if (!dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const others = ref.current?.querySelectorAll('[data-fixed]') ?? [];
    let to = 0;
    others.forEach(el => {
      const box = el.getBoundingClientRect();
      if (e.clientY > box.top + box.height / 2) to++;
    });
    if (to !== index) onMove(to);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      onMove(index - 1);
    }
    if (e.key === 'ArrowDown' && index < last) {
      e.preventDefault();
      onMove(index + 1);
    }
  };

  return (
    <div
      ref={ref}
      className={list}
      role="list"
      aria-labelledby={props['aria-labelledby']}
      onDragOver={onDragOver}
      onDrop={e => e.preventDefault()}
    >
      {rows.map(row =>
        row ? (
          <div key={row.key} className={fixed} role="listitem" data-fixed>
            {row.label}
          </div>
        ) : (
          <div
            key="__moving"
            role="listitem"
            tabIndex={0}
            className={card}
            draggable
            data-dragging={dragging}
            aria-label={`${props.moving.label}, position ${index + 1} of ${
              last + 1
            }. Use the up and down arrow keys to move it.`}
            onDragStart={e => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', props.moving.label);
              setDragging(true);
            }}
            onDragEnd={() => setDragging(false)}
            onKeyDown={onKeyDown}
          >
            <Icon src={gripVerticalIcon} color="neutralTertiary" />
            <span className={label}>
              {props.moving.label}
              {props.moving.note && (
                <span
                  className={css({
                    fontWeight: tokenSchema.typography.fontWeight.regular,
                  })}
                >
                  {` · ${props.moving.note}`}
                </span>
              )}
            </span>
            <ActionButton
              aria-label="Move up"
              isDisabled={index === 0}
              onPress={() => onMove(index - 1)}
            >
              <Icon src={arrowUpIcon} />
            </ActionButton>
            <ActionButton
              aria-label="Move down"
              isDisabled={index === last}
              onPress={() => onMove(index + 1)}
            >
              <Icon src={arrowDownIcon} />
            </ActionButton>
          </div>
        )
      )}
    </div>
  );
}
