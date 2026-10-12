import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestProvider } from '@keystar/ui/core';
import { Item, Menu } from '@keystar/ui/menu';
import { expect, vi, describe, it } from 'vitest';

import { SplitButton } from '..';

function renderSplit(props: { isDisabled?: boolean } = {}) {
  const onPress = vi.fn();
  const onAction = vi.fn();
  const utils = render(
    <SplitButton
      {...props}
      prominence="high"
      onPress={onPress}
      menuLabel="More save options"
      menu={
        <Menu onAction={onAction}>
          <Item key="save">Save</Item>
          <Item key="now">Publish now</Item>
        </Menu>
      }
    >
      Save
    </SplitButton>,
    { wrapper: TestProvider }
  );
  return { ...utils, onPress, onAction };
}

describe('button/SplitButton', () => {
  it('runs the main action from the main half', async () => {
    const { getByRole, onPress } = renderSplit();
    await userEvent.click(getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('opens the menu from the chevron half', async () => {
    const { getByRole, onAction, onPress } = renderSplit();
    const chevron = getByRole('button', { name: 'More save options' });
    expect(chevron).toHaveAttribute('aria-haspopup', 'true');
    await userEvent.click(chevron);
    await userEvent.click(getByRole('menuitem', { name: 'Publish now' }));
    expect(onAction.mock.calls[0][0]).toBe('now');
    expect(onPress).not.toHaveBeenCalled();
  });

  it('disables both halves', () => {
    const { getAllByRole } = renderSplit({ isDisabled: true });
    for (const button of getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });
});
