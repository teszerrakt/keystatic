import { useEffect, useId, useState } from 'react';

import { ActionButton } from '@keystar/ui/button';
import { DialogContainer } from '@keystar/ui/dialog';
import { FieldDescription, FieldLabel } from '@keystar/ui/field';
import { Icon } from '@keystar/ui/icon';
import { plusIcon } from '@keystar/ui/icon/icons/plusIcon';
import { Flex } from '@keystar/ui/layout';
import { NumberField } from '@keystar/ui/number-field';
import { Item, Picker } from '@keystar/ui/picker';
import { ProgressCircle } from '@keystar/ui/progress';
import { Text } from '@keystar/ui/typography';

import { FormFieldInputProps } from '../../form/api';
import {
  compareRows,
  insertAt,
  OrderRow,
  placeOrders,
  sectionLabel,
  sectionOptions,
  sortRows,
  withFrontmatterValue,
} from './menu-sections';
import {
  MenuSetup,
  useMenuPages,
  useMenuSections,
  useMenuSetup,
} from './menu-sections-data';
import { usePageForm } from './page-form';
import { pageTitleFrom } from './page-title';
import { useLanguages } from './pages-data';
import { PlaceList } from './place-list';
import { NewSectionDialog } from './section-dialog';

export const SECTION_IN_PAGE_DRAFT =
  "Part of this page's draft. It shows on the site once a page in it is published.";

export function MenuSectionFieldInput(
  props: FormFieldInputProps<string> & {
    label: string;
    description: string | undefined;
  }
) {
  const form = usePageForm();
  const data = useMenuSections();
  const languages = useLanguages().map(l => l.language);
  const main = languages[0] ?? '';
  const [adding, setAdding] = useState(false);
  const sections = form?.sections ?? data.sections;
  const options = sections ? sectionOptions(sections, main) : [];
  const known = !sections || options.some(o => o.value === props.value);
  const { onChange } = props;

  return (
    <Flex direction="column" gap="regular">
      <FieldLabel elementType="span">{props.label}</FieldLabel>
      <Flex gap="regular" alignItems="start" wrap>
        <Picker
          aria-label={props.label}
          items={options}
          selectedKey={known && props.value ? props.value : null}
          onSelectionChange={key => {
            if (key !== null) onChange(String(key));
          }}
          placeholder={
            !sections
              ? 'Loading sections…'
              : options.length
              ? 'Choose a section'
              : 'No sections yet'
          }
          errorMessage={
            !known || (props.forceValidation && !props.value)
              ? 'Choose a menu section.'
              : undefined
          }
          autoFocus={props.autoFocus}
          flex
          width="auto"
          minWidth="scale.2000"
        >
          {item => <Item key={item.value}>{item.label}</Item>}
        </Picker>
        {form && sections && (
          <ActionButton onPress={() => setAdding(true)}>
            <Icon src={plusIcon} />
            <Text>New section</Text>
          </ActionButton>
        )}
      </Flex>
      {props.description && (
        <FieldDescription>{props.description}</FieldDescription>
      )}
      <DialogContainer onDismiss={() => setAdding(false)}>
        {adding && form && sections && (
          <NewSectionDialog
            sections={sections}
            languages={languages}
            footer={SECTION_IN_PAGE_DRAFT}
            onAdd={(list, id) => {
              form.setSections(list);
              onChange(id);
            }}
          />
        )}
      </DialogContainer>
    </Flex>
  );
}

export function MenuOrderFieldInput(
  props: FormFieldInputProps<number> & {
    label: string;
    description: string | undefined;
  }
) {
  const form = usePageForm();
  const setup = useMenuSetup();
  if (!form || !setup?.orderPath || form.collection !== setup.collection) {
    return (
      <NumberField
        label={props.label}
        description={props.description}
        value={props.value}
        onChange={v => props.onChange(Number.isFinite(v) ? v : 0)}
        autoFocus={props.autoFocus}
      />
    );
  }
  return <PlaceInMenu {...props} setup={setup} />;
}

const SELF = '\u0000self';

function PlaceInMenu(
  props: FormFieldInputProps<number> & {
    label: string;
    description: string | undefined;
    setup: MenuSetup;
  }
) {
  const form = usePageForm()!;
  const { setup, value, onChange } = props;
  const labelId = useId();
  const pages = useMenuPages();
  const data = useMenuSections();
  const languages = useLanguages().map(l => l.language);
  const main = languages[0] ?? '';
  const [moved, setMoved] = useState<{ section: string; index: number }>();

  const section = String(form.state[setup.sectionField] ?? '');
  const sectionInfo = (form.sections ?? data.sections ?? []).find(
    s => s.id === section
  );
  const title = pageTitleFrom({ slugField: setup.slugField }, form.state, '');
  const saved = pages?.find(p => p.slug === form.slug);
  const here = saved?.section === section ? saved : undefined;
  const others = sortRows(
    (pages ?? []).filter(p => p.section === section && p.slug !== form.slug)
  );
  const home = here
    ? others.filter(o => compareRows(o, here) < 0).length
    : others.length;
  const index =
    moved?.section === section ? Math.min(moved.index, others.length) : home;
  const rows = insertAt<OrderRow>(
    others.map(o => ({ key: o.slug, title: o.title, order: o.order })),
    { key: SELF, title: title || form.slug || '', order: here?.order },
    index
  );
  const plan = pages && section ? placeOrders(rows, SELF) : undefined;
  const own = plan ? plan.get(SELF) ?? here?.order : undefined;
  const rewrites = plan ? [...plan].filter(([k]) => k !== SELF) : [];
  const rewriteKey = rewrites.map(([k, n]) => `${k}=${n}`).join(',');

  useEffect(() => {
    if (own !== undefined && own !== value) onChange(own);
  }, [own, value, onChange]);

  const { extras } = form;
  const orderPath = setup.orderPath!;
  useEffect(() => {
    if (!pages || !rewriteKey) return;
    const encoder = new TextEncoder();
    const files = rewriteKey.split(',').flatMap(entry => {
      const [slug, n] = entry.split('=');
      const page = pages.find(p => p.slug === slug);
      return page
        ? [
            {
              path: page.path,
              contents: encoder.encode(
                withFrontmatterValue(page.text, orderPath, Number(n))
              ),
            },
          ]
        : [];
    });
    extras.set('order', () => files);
    return () => extras.set('order', null);
  }, [pages, rewriteKey, orderPath, extras]);

  const name = sectionInfo ? sectionLabel(sectionInfo, main, main) : '';
  return (
    <Flex direction="column" gap="large" role="group" aria-labelledby={labelId}>
      <Flex direction="column" gap="regular">
        <FieldLabel elementType="span" id={labelId}>
          {props.label}
        </FieldLabel>
        <FieldDescription>
          {!section
            ? 'Choose a menu section first.'
            : others.length
            ? `Drag this page among the others in ${name || section}.`
            : `It is the first page in ${name || section}.`}
        </FieldDescription>
      </Flex>
      {!section ? null : !pages ? (
        <ProgressCircle size="small" isIndeterminate aria-label="Loading" />
      ) : (
        <PlaceList
          aria-labelledby={labelId}
          items={others.map(o => ({ key: o.slug, label: o.title }))}
          moving={{ label: title || 'This page' }}
          index={index}
          onMove={i => setMoved({ section, index: i })}
        />
      )}
      {rewrites.length > 0 && (
        <FieldDescription>
          {`To fit it here, saving also renumbers ${rewrites.length} other ${
            rewrites.length === 1 ? 'page' : 'pages'
          } in this section.`}
        </FieldDescription>
      )}
      {!form.slug && languages.length > 1 && (
        <FieldDescription>
          {`Written in ${main}, the main language. Other languages show this page with a “not translated yet” note until someone adds a translation from the language menu.`}
        </FieldDescription>
      )}
    </Flex>
  );
}
