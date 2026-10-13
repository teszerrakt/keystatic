import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';

import { ImageLibraryProvider } from './image-picker';
import { MenuSection, serializeSections } from './menu-sections';
import { useMenuSetup } from './menu-sections-data';
import { useLanguages } from './pages-data';

export type ExtraFile = { path: string; contents: Uint8Array };

// Files a page's fields add to the page's own save commit, and files the
// save keeps although the page no longer lists them.
export type CommitExtras = {
  set(key: string, files: (() => ExtraFile[]) | null): void;
  files(): ExtraFile[];
  keep(test: ((path: string) => boolean) | null): void;
  kept(path: string): boolean;
};

function createExtras(): CommitExtras {
  const parts = new Map<string, () => ExtraFile[]>();
  let keep: ((path: string) => boolean) | null = null;
  return {
    set(key, files) {
      if (files) parts.set(key, files);
      else parts.delete(key);
    },
    files() {
      return [...parts.values()].flatMap(f => f());
    },
    keep(test) {
      keep = test;
    },
    kept(path) {
      return !!keep?.(path);
    },
  };
}

export function useCommitExtras() {
  const [extras] = useState(createExtras);
  return extras;
}

type PageForm = {
  collection: string;
  // The saved page; undefined while creating one.
  slug: string | undefined;
  state: Record<string, unknown>;
  extras: CommitExtras;
  // The menu with sections added here, until the page is saved.
  sections: MenuSection[] | null;
  setSections: (sections: MenuSection[]) => void;
};

const PageFormContext = createContext<PageForm | null>(null);

export function usePageForm() {
  return useContext(PageFormContext);
}

export function PageFormProvider(props: {
  collection: string;
  slug: string | undefined;
  state: Record<string, unknown>;
  extras: CommitExtras;
  children: ReactNode;
}) {
  const setup = useMenuSetup();
  const languages = useLanguages();
  const [sections, setSections] = useState<MenuSection[] | null>(null);
  const { extras } = props;
  const names = languages.map(l => l.language).join('\n');
  const path = setup?.path;
  useEffect(() => {
    if (!sections || !path) return;
    const contents = new TextEncoder().encode(
      serializeSections(sections, names.split('\n'))
    );
    extras.set('sections', () => [{ path, contents }]);
    return () => extras.set('sections', null);
  }, [sections, path, extras, names]);
  return (
    <PageFormContext.Provider
      value={{
        collection: props.collection,
        slug: props.slug,
        state: props.state,
        extras,
        sections,
        setSections,
      }}
    >
      <ImageLibraryProvider extras={extras}>
        {props.children}
      </ImageLibraryProvider>
    </PageFormContext.Provider>
  );
}
