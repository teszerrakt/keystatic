import { ComponentSchema } from '../../form/api';
import { getInitialPropsValue } from '../../form/initial-values';

// `create?duplicate=<slug>&from=<collection>` starts a translation of that page.
export function translateFrom(href: string) {
  return new URL(href, 'http://localhost').searchParams.get('from');
}

export function translateHref(
  basePath: string,
  to: string,
  from: string,
  slug: string
) {
  return `${basePath}/collection/${encodeURIComponent(
    to
  )}/create?${new URLSearchParams({ duplicate: slug, from })}`;
}

// Languages may carry different fields: keep the shared ones, default the rest.
export function translatedState(
  state: Record<string, unknown>,
  schema: Record<string, ComponentSchema>
) {
  return Object.fromEntries(
    Object.entries(schema).map(([key, field]) => [
      key,
      key in state ? state[key] : getInitialPropsValue(field),
    ])
  );
}
