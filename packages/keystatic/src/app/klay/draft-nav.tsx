import { Badge } from '@keystar/ui/badge';
import { ScrollView } from '@keystar/ui/layout';
import { NavItem, NavList } from '@keystar/ui/nav-list';
import { Text } from '@keystar/ui/typography';

import { useRouter } from '../router';
import { useAppState } from '../shell/context';
import { useChanged } from '../shell/data';
import { useDraftsContext } from './draft-data';
import { useLanguages } from './pages-data';

// Writers see pages, not collections: one list for every language.
export function DraftNav() {
  const { basePath } = useAppState();
  const router = useRouter();
  const drafts = useDraftsContext();
  const changed = useChanged();
  const languages = useLanguages();
  const slugs = new Set<string>();
  if (drafts && !drafts.onLive) {
    for (const l of languages) {
      const c = changed.collections.get(l.collection);
      for (const set of c ? [c.added, c.changed, c.removed] : []) {
        for (const slug of set) slugs.add(slug);
      }
    }
  }
  const path = router.pathname;
  const onPages =
    path.startsWith(`${basePath}/pages`) ||
    path.startsWith(`${basePath}/collection/`);
  return (
    <ScrollView flex paddingY="large" paddingEnd="medium">
      <NavList>
        <NavItem
          href={basePath}
          aria-current={path === basePath ? 'page' : undefined}
        >
          Home
        </NavItem>
        <NavItem
          href={`${basePath}/pages`}
          aria-current={onPages ? 'page' : undefined}
        >
          <Text>Pages</Text>
          {slugs.size > 0 && (
            <Badge tone="accent" marginStart="auto">
              {`${slugs.size} changed`}
            </Badge>
          )}
        </NavItem>
      </NavList>
    </ScrollView>
  );
}
