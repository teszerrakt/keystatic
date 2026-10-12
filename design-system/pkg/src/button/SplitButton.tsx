import { ReactElement, ReactNode } from 'react';

import { Icon } from '@keystar/ui/icon';
import { chevronDownIcon } from '@keystar/ui/icon/icons/chevronDownIcon';
import { MenuTrigger } from '@keystar/ui/menu';
import {
  classNames,
  css,
  filterStyleProps,
  tokenSchema,
  useStyleProps,
} from '@keystar/ui/style';

import { Button } from './Button';
import { ButtonElementProps } from './types';
import { buttonClassList } from './useButtonStyles';

export type SplitButtonProps = Omit<ButtonElementProps, 'children'> & {
  /** The label of the main action. */
  children: ReactNode;
  /** The `Menu` that the chevron half opens. */
  menu: ReactElement;
  /** The accessible label of the chevron half. */
  menuLabel: string;
  /** Handler that is called when the menu opens or closes. */
  onOpenChange?: (isOpen: boolean) => void;
};

const root = buttonClassList.selector('root');
const flatEnd = {
  borderStartEndRadius: 0,
  borderEndEndRadius: 0,
};
const flatStart = {
  borderStartStartRadius: 0,
  borderEndStartRadius: 0,
};

const splitClassName = css({
  display: 'inline-flex',
  flexShrink: 0,
  [`& > ${root}:first-child`]: {
    ...flatEnd,
    '&::after': flatEnd,
  },
  [`& > ${root}:last-child`]: {
    ...flatStart,
    '&::after': flatStart,
    // The divider takes the half's own text colour, so it suits every tone.
    borderInlineStart: `${tokenSchema.size.border.regular} solid color-mix(in srgb, currentColor 35%, transparent)`,
    paddingInline: 0,
  },
});

/**
 * A button with a main action, and a chevron half that opens a menu of
 * related actions.
 */
export function SplitButton(props: SplitButtonProps) {
  const {
    children,
    menu,
    menuLabel,
    onOpenChange,
    prominence,
    tone,
    isDisabled,
    ...otherProps
  } = props;
  const styleProps = useStyleProps(otherProps);
  const shared = { prominence, tone, isDisabled };
  // Style props place the pair; they would misplace the main half.
  const mainProps = filterStyleProps(otherProps) as ButtonElementProps;
  return (
    <div
      className={classNames(splitClassName, styleProps.className)}
      style={styleProps.style}
    >
      <Button {...mainProps} {...shared}>
        {children}
      </Button>
      <MenuTrigger align="end" onOpenChange={onOpenChange}>
        <Button {...shared} aria-label={menuLabel}>
          <Icon src={chevronDownIcon} />
        </Button>
        {menu}
      </MenuTrigger>
    </div>
  );
}
