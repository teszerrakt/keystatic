import { useId, useState } from 'react';

import { Button, ButtonGroup } from '@keystar/ui/button';
import { Dialog, useDialogContainer } from '@keystar/ui/dialog';
import { Flex } from '@keystar/ui/layout';
import { Notice } from '@keystar/ui/notice';
import { Content, Footer } from '@keystar/ui/slots';
import { TextField } from '@keystar/ui/text-field';
import { Heading, Text } from '@keystar/ui/typography';

import {
  insertAt,
  MenuSection,
  newSectionId,
  sectionLabel,
} from './menu-sections';
import { PlaceList } from './place-list';

// Adds a section with a name per language at a chosen place in the menu.
export function NewSectionDialog(props: {
  sections: MenuSection[];
  // Language names; the first is the main one.
  languages: string[];
  footer: string;
  onAdd: (sections: MenuSection[], id: string) => void | Promise<void>;
}) {
  const dialog = useDialogContainer();
  const placeId = useId();
  const [main, ...others] = props.languages;
  const [name, setName] = useState('');
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(props.sections.length);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filled = others.filter(l => translations[l]?.trim()).length;
  const trimmed = name.trim();

  const add = async () => {
    if (!trimmed) return;
    const id = newSectionId(trimmed, new Set(props.sections.map(s => s.id)));
    const label: Record<string, string> = { [main]: trimmed };
    for (const l of others) {
      if (translations[l]?.trim()) label[l] = translations[l].trim();
    }
    setWorking(true);
    setError(null);
    try {
      await props.onAdd(insertAt(props.sections, { id, label }, index), id);
      dialog.dismiss();
    } catch (e) {
      setError((e as Error).message);
      setWorking(false);
    }
  };

  return (
    <Dialog size="large">
      <Heading>New menu section</Heading>
      <Content>
        <Flex direction="column" gap="xlarge">
          <Text color="neutralSecondary">
            Sections group pages in the docs menu, in the same order as the Klay
            app.
          </Text>
          <Flex gap="xxlarge" wrap alignItems="start">
            <Flex direction="column" gap="xlarge" flex="1 1 280px">
              <TextField
                label={`Name · ${main}`}
                isRequired
                autoFocus
                value={name}
                onChange={setName}
                onKeyDown={e => {
                  if (e.key === 'Enter') add();
                }}
              />
              {others.length > 0 && (
                <Flex direction="column" gap="large">
                  <Flex direction="column" gap="regular">
                    <Text weight="semibold">Translations</Text>
                    <Text size="small" color="neutralSecondary">
                      {`${filled} of ${others.length} · empty ones show the ${main} name`}
                    </Text>
                  </Flex>
                  {others.map(l => (
                    <TextField
                      key={l}
                      label={l}
                      value={translations[l] ?? ''}
                      placeholder={trimmed}
                      onChange={v => setTranslations(t => ({ ...t, [l]: v }))}
                    />
                  ))}
                </Flex>
              )}
            </Flex>
            <Flex direction="column" gap="regular" flex="1 1 240px">
              <Text id={placeId} weight="semibold">
                Place in the menu
              </Text>
              <Text size="small" color="neutralSecondary" marginBottom="small">
                Drag the new section to where it belongs, or use the arrows.
              </Text>
              <PlaceList
                aria-labelledby={placeId}
                items={props.sections.map(s => ({
                  key: s.id,
                  label: sectionLabel(s, main, main),
                }))}
                moving={{ label: trimmed || 'New section', note: 'new' }}
                index={index}
                onMove={setIndex}
              />
            </Flex>
          </Flex>
          {error && <Notice tone="critical">{error}</Notice>}
        </Flex>
      </Content>
      <Footer>
        <Text color="neutralSecondary">{props.footer}</Text>
      </Footer>
      <ButtonGroup>
        <Button onPress={dialog.dismiss} isDisabled={working}>
          Cancel
        </Button>
        <Button
          prominence="high"
          isDisabled={!trimmed || working}
          onPress={add}
        >
          {working ? 'Adding…' : 'Add section'}
        </Button>
      </ButtonGroup>
    </Dialog>
  );
}
