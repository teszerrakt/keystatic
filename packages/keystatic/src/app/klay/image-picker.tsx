import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { Button, ButtonGroup } from '@keystar/ui/button';
import { Dialog, useDialogContainer } from '@keystar/ui/dialog';
import { Box, Flex } from '@keystar/ui/layout';
import { TextLink } from '@keystar/ui/link';
import { ProgressCircle } from '@keystar/ui/progress';
import { SearchField } from '@keystar/ui/search-field';
import { Content, Footer } from '@keystar/ui/slots';
import { css, tokenSchema } from '@keystar/ui/style';
import { Item, TabList, TabPanels, Tabs } from '@keystar/ui/tabs';
import { TextField } from '@keystar/ui/text-field';
import { toastQueue } from '@keystar/ui/toast';
import { Heading, Text } from '@keystar/ui/typography';

import {
  ImageLibrary,
  ImageLibraryContext,
} from '../../form/fields/markdoc/editor/image-library';
import { useEventCallback } from '../../form/fields/markdoc/editor/utils';
import { useConfig } from '../shell/context';
import {
  useBranches,
  useCurrentBranch,
  useRepoInfo,
  useTree,
} from '../shell/data';
import { fetchBlob } from '../useItemData';
import { isDraftsOnly } from './drafts';
import { Dims, dimsText, ImageCard, imageGrid, usePreview } from './image-card';
import { ClashChoice, ImageDropArea, Upload, UploadRow } from './image-uploads';
import {
  baseName,
  clashMessage,
  formatSize,
  freePath,
  LibraryImage,
  planUploads,
  usageLabel,
} from './images';
import { useImageDirectory, useLibrary } from './images-data';
import { CommitExtras } from './page-form';

type Staged = { path: string; bytes: Uint8Array };

// Pictures uploaded from the editor ride along with the page's next save,
// so an upload never reloads the page and loses unsaved edits.
const StagedContext = createContext<{
  staged: Staged[];
  add: (staged: Staged) => void;
}>({ staged: [], add: () => {} });

export function ImageLibraryProvider(props: {
  extras: CommitExtras;
  children: ReactNode;
}) {
  const config = useConfig();
  const dir = useImageDirectory();
  return isDraftsOnly(config) && dir ? (
    <LibraryProvider dir={dir} extras={props.extras}>
      {props.children}
    </LibraryProvider>
  ) : (
    props.children
  );
}

function LibraryProvider(props: {
  dir: string;
  extras: CommitExtras;
  children: ReactNode;
}) {
  const config = useConfig();
  const trees = useTree();
  const repoInfo = useRepoInfo();
  const branches = useBranches();
  const branch = useCurrentBranch();
  const [staged, setStaged] = useState<Staged[]>([]);
  const { extras, dir } = props;
  const current =
    trees.current.kind === 'loaded' ? trees.current.data.entries : null;
  const head = branches.get(branch)?.commitSha ?? '';

  useEffect(() => {
    if (!staged.length) return;
    extras.set('images', () =>
      staged.map(s => ({ path: s.path, contents: s.bytes }))
    );
    return () => extras.set('images', null);
  }, [staged, extras]);

  const add = useEventCallback((next: Staged) =>
    setStaged(prev => [...prev.filter(s => s.path !== next.path), next])
  );
  const load = useEventCallback(async (path: string) => {
    const waiting = staged.find(s => s.path === path);
    if (waiting) return waiting.bytes;
    const entry = current?.get(path);
    if (!entry) throw new Error(`${path} is not in this draft.`);
    return fetchBlob(config, entry.sha, path, head, repoInfo);
  });
  // Drop and paste have no room to ask about a clash: they keep both.
  const stage = useEventCallback(async (file: File) => {
    const taken = (p: string) =>
      !!current?.has(p) || staged.some(s => s.path === p);
    const [plan] = planUploads([file], dir, taken);
    if (plan.status === 'refused') {
      toastQueue.critical(`${file.name}: ${plan.message}`, { timeout: 8000 });
      return null;
    }
    const next = {
      path: plan.status === 'clash' ? freePath(plan.path, taken) : plan.path,
      bytes: new Uint8Array(await file.arrayBuffer()),
    };
    add(next);
    return next;
  });
  const library = useMemo(
    (): ImageLibrary => ({ load, stage, Picker: ImagePicker }),
    [load, stage]
  );
  return (
    <StagedContext.Provider value={{ staged, add }}>
      <ImageLibraryContext.Provider value={library}>
        {props.children}
      </ImageLibraryContext.Provider>
    </StagedContext.Provider>
  );
}

const pickerGrid = css({
  maxHeight: 372,
  overflowY: 'auto',
  padding: 2,
});

function Details(props: {
  image: LibraryImage;
  bytes: Uint8Array | undefined;
  alt: string;
  caption: string;
  onAlt: (alt: string) => void;
  onCaption: (caption: string) => void;
}) {
  const { bytes, url } = usePreview(props.image, props.bytes);
  const [dims, setDims] = useState<Dims>();
  return (
    <Flex direction="column" gap="large">
      <Box border="neutral" borderRadius="regular" padding="regular">
        {url ? (
          <img
            src={url}
            alt=""
            className={css({
              display: 'block',
              height: 140,
              objectFit: 'contain',
              width: '100%',
            })}
            onLoad={e =>
              setDims({
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              })
            }
          />
        ) : (
          <Flex
            alignItems="center"
            justifyContent="center"
            UNSAFE_className={css({ height: 140 })}
          >
            <ProgressCircle isIndeterminate aria-label="Loading image" />
          </Flex>
        )}
      </Box>
      <Flex direction="column" gap="small">
        <Text weight="semibold">{props.image.name}</Text>
        <Text size="small" color="neutralSecondary">
          {[dimsText(dims), bytes && formatSize(bytes.byteLength)]
            .filter(Boolean)
            .join(' · ') || ' '}
        </Text>
      </Flex>
      <TextField
        label="Alt text"
        placeholder="Describe the image"
        description="Starts from the image's default. Changes apply to this page only."
        value={props.alt}
        onChange={props.onAlt}
      />
      <TextField
        label="Caption (optional)"
        value={props.caption}
        onChange={props.onCaption}
      />
    </Flex>
  );
}

function ImagePicker(props: {
  directory: string;
  current?: { path: string; alt: string; title: string };
  onPick(image: {
    path: string;
    bytes: Uint8Array;
    alt: string;
    title: string;
  }): void;
}) {
  const dialog = useDialogContainer();
  const library = useLibrary();
  const branch = useCurrentBranch();
  const { staged, add } = useContext(StagedContext);
  const trees = useTree();
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(props.current?.path ?? null);
  const [alt, setAlt] = useState(props.current?.alt ?? '');
  const [caption, setCaption] = useState(props.current?.title ?? '');
  const [upload, setUpload] = useState<Upload | null>(null);
  const loaded = library.kind === 'loaded' ? library : null;
  const current =
    trees.current.kind === 'loaded' ? trees.current.data.entries : null;
  const taken = (p: string) =>
    !!current?.has(p) || staged.some(s => s.path === p);

  const images = useMemo(() => {
    const inTree = (loaded?.images ?? []).filter(
      i => i.draft !== 'removed' && i.path.startsWith(`${props.directory}/`)
    );
    const waiting: LibraryImage[] = staged
      .filter(s => !inTree.some(i => i.path === s.path))
      .map(s => ({
        path: s.path,
        name: baseName(s.path),
        sha: '',
        draft: 'new',
      }));
    return [...waiting, ...inTree];
  }, [loaded, staged, props.directory]);
  const q = search.trim().toLowerCase();
  const visible = images.filter(i => !q || i.name.toLowerCase().includes(q));
  const image = images.find(i => i.path === selected);
  const stagedBytes = (path: string) =>
    staged.find(s => s.path === path)?.bytes;
  const { bytes } = usePreview(image, image && stagedBytes(image.path));

  const pick = (path: string) => {
    setSelected(path);
    if (path === props.current?.path) {
      setAlt(props.current.alt);
      setCaption(props.current.title);
    } else {
      setAlt(loaded?.alts[path.slice(props.directory.length + 1)] ?? '');
      setCaption('');
    }
  };

  const accept = (u: Upload, path: string) => {
    add({ path, bytes: u.bytes });
    setUpload(null);
    setTab('library');
    setSearch('');
    pick(path);
  };
  const onFiles = async ([file]: File[]) => {
    if (!file) return;
    const [plan] = planUploads([file], props.directory, taken);
    const u: Upload = {
      id: 0,
      name: file.name,
      bytes:
        plan.status === 'refused'
          ? new Uint8Array()
          : new Uint8Array(await file.arrayBuffer()),
      status: plan.status,
      ...(plan.status === 'refused'
        ? { message: plan.message }
        : { path: plan.path }),
    };
    if (plan.status === 'ready') accept(u, plan.path);
    else setUpload(u);
  };
  const choose = (choice: ClashChoice) => {
    if (!upload?.path) return;
    if (choice === 'skip') return setUpload(null);
    accept(
      upload,
      choice === 'replace' ? upload.path : freePath(upload.path, taken)
    );
  };
  const usersOf = (path: string) => loaded?.usage?.get(path) ?? [];

  return (
    <Dialog size="large">
      <Heading>Insert image</Heading>
      <Content>
        <Tabs
          aria-label="Image source"
          selectedKey={tab}
          onSelectionChange={k => setTab(k as 'library' | 'upload')}
        >
          <TabList marginBottom="large">
            <Item key="library">From Images</Item>
            <Item key="upload">Upload new</Item>
          </TabList>
          <TabPanels>
            <Item key="library">
              <Flex gap="xlarge" wrap minHeight={0}>
                <Flex
                  direction="column"
                  gap="large"
                  minWidth={0}
                  UNSAFE_className={css({ flex: '999 1 400px' })}
                >
                  <SearchField
                    aria-label="Search images"
                    placeholder="Search images"
                    value={search}
                    onChange={setSearch}
                    width="scale.3600"
                    maxWidth="100%"
                  />
                  {!loaded ? (
                    <ProgressCircle
                      isIndeterminate
                      aria-label="Loading images"
                    />
                  ) : (
                    <div
                      role="group"
                      aria-label="Images"
                      className={`${imageGrid(128)} ${pickerGrid}`}
                    >
                      {visible.map(i => (
                        <ImageCard
                          key={i.path}
                          compact
                          image={i}
                          bytes={stagedBytes(i.path)}
                          usage={
                            stagedBytes(i.path)
                              ? 'New picture'
                              : loaded.usage
                              ? usageLabel(usersOf(i.path).length)
                              : ''
                          }
                          selected={i.path === selected}
                          onSelect={() => pick(i.path)}
                        />
                      ))}
                      {!visible.length && (
                        <Text color="neutralSecondary">No images match.</Text>
                      )}
                    </div>
                  )}
                </Flex>
                <Flex
                  direction="column"
                  UNSAFE_className={css({ flex: '1 1 240px' })}
                >
                  {image ? (
                    <Details
                      image={image}
                      bytes={stagedBytes(image.path)}
                      alt={alt}
                      caption={caption}
                      onAlt={setAlt}
                      onCaption={setCaption}
                    />
                  ) : (
                    <Flex
                      flex
                      alignItems="center"
                      justifyContent="center"
                      padding="xlarge"
                      UNSAFE_className={css({
                        border: `${tokenSchema.size.border.regular} dashed ${tokenSchema.color.border.neutral}`,
                        borderRadius: tokenSchema.size.radius.medium,
                        minHeight: 200,
                        textAlign: 'center',
                      })}
                    >
                      <Text color="neutralSecondary">
                        Pick an image to see it here and set its alt text.
                      </Text>
                    </Flex>
                  )}
                </Flex>
              </Flex>
            </Item>
            <Item key="upload">
              <Flex direction="column" gap="regular">
                <ImageDropArea vertical onFiles={onFiles} />
                {upload && (
                  <Box border="muted" borderRadius="large">
                    <UploadRow
                      upload={upload}
                      usedBy={clashMessage(
                        usersOf(upload.path ?? '').map(p => p.title)
                      )}
                      busy={false}
                      onChoose={choose}
                    />
                  </Box>
                )}
                <Text size="small" color="neutralSecondary">
                  A new upload also goes into Images, so other pages can use it.
                  It is saved with this page.
                </Text>
              </Flex>
            </Item>
          </TabPanels>
        </Tabs>
      </Content>
      <Footer>
        <TextLink
          href={`/keystatic/branch/${encodeURIComponent(branch)}/images`}
          target="_blank"
        >
          Manage images
        </TextLink>
      </Footer>
      <ButtonGroup>
        <Button onPress={dialog.dismiss}>Cancel</Button>
        <Button
          prominence="high"
          isDisabled={tab !== 'library' || !image}
          onPress={() => {
            if (!image) return;
            props.onPick({
              path: image.path,
              bytes: bytes ?? new Uint8Array(),
              alt,
              title: caption,
            });
          }}
        >
          Insert image
        </Button>
      </ButtonGroup>
    </Dialog>
  );
}
