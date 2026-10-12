import { BasicFormField } from '../../api';
import { FieldDataError } from '../error';
import { basicFormFieldWithSimpleReaderParse } from '../utils';
import {
  MenuOrderFieldInput,
  MenuSectionFieldInput,
} from '#field-ui/menuSection';

// Plus fork: options come from a singleton on the branch being edited, so a
// section added in a draft can be picked in that draft.
export function menuSection({
  label,
  singleton,
  defaultValue = '',
  description,
}: {
  label: string;
  /** A singleton whose JSON is `{ sections: [{ id, label: { <language>: text } }] }`. */
  singleton: string;
  defaultValue?: string;
  description?: string;
}): BasicFormField<string> & { menuSections: { singleton: string } } {
  const field = basicFormFieldWithSimpleReaderParse<string, string>({
    label,
    Input(props) {
      return (
        <MenuSectionFieldInput
          label={label}
          description={description}
          {...props}
        />
      );
    },
    defaultValue() {
      return defaultValue;
    },
    parse(value) {
      if (value === undefined) return defaultValue;
      if (typeof value !== 'string') {
        throw new FieldDataError('Must be a string');
      }
      return value;
    },
    validate(value) {
      if (!value) throw new FieldDataError(`${label} is required`);
      return value;
    },
    serialize(value) {
      return { value: value || undefined };
    },
  });
  return { ...field, menuSections: { singleton } };
}

// Plus fork: the page's position within its menu section. With a
// menuSection field beside it, writers drag the page into place.
export function menuOrder({
  label,
  defaultValue = 100,
  description,
}: {
  label: string;
  defaultValue?: number;
  description?: string;
}): BasicFormField<number> & { menuOrder: true } {
  const field = basicFormFieldWithSimpleReaderParse<number, number>({
    label,
    Input(props) {
      return (
        <MenuOrderFieldInput
          label={label}
          description={description}
          {...props}
        />
      );
    },
    defaultValue() {
      return defaultValue;
    },
    parse(value) {
      if (value === undefined) return defaultValue;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new FieldDataError('Must be a number');
      }
      return value;
    },
    validate(value) {
      return value;
    },
    serialize(value) {
      return { value };
    },
  });
  return { ...field, menuOrder: true };
}
