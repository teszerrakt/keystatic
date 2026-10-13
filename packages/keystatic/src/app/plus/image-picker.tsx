import { ReactNode, useEffect, useMemo, useState } from 'react';

import { Button, ButtonGroup } from '@keystar/ui/button';
import {
  Dialog,
  DialogContainer,
  useDialogContainer,
} from '@keystar/ui/dialog';
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
  libraryFilesIn,
  PickedImage,
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
import { branchHref } from './draft-data';
import { hasPlusUi } from './drafts';
import {
  ImageCard,
  imageGrid,
  ImagePreview,
  sizeLine,
  usePreview,
} from './image-card';
import {
  ClashChoice,
  ImageDropArea,
  toUpload,
  Upload,
  UploadRow,
} from './image-uploads';
import {
  altKey,
  baseName,
  clashMessage,
  emptyListText,
  freePath,
  LibraryImage,
  planUploads,
} from './images';
import { useImageDirectory, useLibrary } from './images-data';
import { CommitExtras } from './page-form';

type Staged = { path: string; bytes: Uint8Array };
type PickOptions = Parameters<ImageLibrary['pick']>[0];

export function ImageLibraryProvider(props: {
  extras: CommitExtras;
  // The page's form state: a save writes only uploads it still shows.
  state: Record<string, unknown>;
  children: ReactNode;
}) {
  const dir = useImageDirectory();
  // Any storage mode: the field's `library` option alone makes references.
  return dir ? (
    <LibraryProvider dir={dir} extras={props.extras} state={props.state}>
      {props.children}
    </LibraryProvider>
  ) : (
    props.children
  );
}

// Pictures uploaded from the editor ride along with the page's next save,
// so an upload never reloads the page and loses unsaved edits.
function LibraryProvider(props: {
  dir: string;
  extras: CommitExtras;
  state: Record<string, unknown>;
  children: ReactNode;
}) {
  const config = useConfig();
  const trees = useTree();
  const repoInfo = useRepoInfo();
  const branches = useBranches();
  const branch = useCurrentBranch();
  const [staged, setStaged] = useState<Staged[]>([]);
  const [request, setRequest] = useState<
    (PickOptions & { resolve: (image: PickedImage | null) => void }) | null
  >(null);
  const { extras, dir, state } = props;
  const current =
    trees.current.kind === 'loaded' ? trees.current.data.entries : null;
  const head = branches.get(branch)?.commitSha ?? '';
  const taken = (p: string) =>
    !!current?.has(p) || staged.some(s => s.path === p);

  // Only the Images page deletes pictures: a page that drops one, even from
  // its own folder, may share it with other pages.
  useEffect(() => {
    extras.keep(path => path.startsWith(`${dir}/`));
    return () => extras.keep(null);
  }, [extras, dir]);

  // An upload whose image was removed, or undone by Reset, is not written.
  useEffect(() => {
    if (!staged.length) return;
    extras.set('images', () => {
      const shown = libraryFilesIn(state);
      return staged
        .filter(s => shown.has(s.path.slice(dir.length + 1)))
        .map(s => ({ path: s.path, contents: s.bytes }));
    });
    return () => extras.set('images', null);
  }, [staged, extras, state, dir]);

  const add = (next: Staged) =>
    setStaged(prev => [...prev.filter(s => s.path !== next.path), next]);
  const load = useEventCallback(async (path: string) => {
    const waiting = staged.find(s => s.path === path);
    if (waiting) return waiting.bytes;
    const entry = current?.get(path);
    if (!entry) throw new Error(`${path} is not in this draft.`);
    return fetchBlob(config, entry.sha, path, head, repoInfo);
  });
  // Drop and paste have no room to ask about a clash: they keep both.
  const stage = useEventCallback(async (file: File) => {
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
  const pick = useEventCallback(
    (options: PickOptions) =>
      new Promise<PickedImage | null>(resolve =>
        setRequest({ ...options, resolve })
      )
  );
  const library = useMemo(
    (): ImageLibrary => ({ load, stage, pick }),
    [load, stage, pick]
  );
  const close = (image: PickedImage | null) => {
    request?.resolve(image);
    setRequest(null);
  };
  return (
    <ImageLibraryContext.Provider value={library}>
      {props.children}
      <DialogContainer onDismiss={() => close(null)}>
        {request && (
          <ImagePicker
            directory={dir}
            current={request.current}
            staged={staged}
            add={add}
            taken={taken}
            onPick={close}
          />
        )}
      </DialogContainer>
    </ImageLibraryContext.Provider>
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
  // undefined until the default alt texts are read
  alt: string | undefined;
  caption: string;
  onAlt: (alt: string) => void;
  onCaption: (caption: string) => void;
}) {
  const preview = usePreview(props.image, props.bytes);
  return (
    <Flex direction="column" gap="large">
      <Box border="neutral" borderRadius="regular" padding="regular">
        <ImagePreview preview={preview} height={140} />
      </Box>
      <Flex direction="column" gap="regular">
        <Text weight="semibold">{props.image.name}</Text>
        <Text size="small" color="neutralSecondary">
          {sizeLine(preview.dims, preview.bytes)}
        </Text>
      </Flex>
      <TextField
        label="Alt text"
        placeholder="Describe the image"
        description="Starts from the image's default. Changes apply to this page only."
        value={props.alt ?? ''}
        onChange={props.onAlt}
        isDisabled={props.alt === undefined}
      />
      <TextField
        label="Caption (optional)"
        value={props.caption}
        onChange={props.onCaption}
      />
    </Flex>
  );
}

function ImagePicker(
  props: PickOptions & {
    directory: string;
    staged: Staged[];
    add: (staged: Staged) => void;
    taken: (path: string) => boolean;
    onPick(image: PickedImage): void;
  }
) {
  const dialog = useDialogContainer();
  const config = useConfig();
  const library = useLibrary();
  const branch = useCurrentBranch();
  const { staged, add, taken } = props;
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(props.current?.path ?? null);
  // null until the writer types: the default shows, even if it loads late.
  const [typedAlt, setAlt] = useState<string | null>(null);
  const [caption, setCaption] = useState(props.current?.title ?? '');
  const [upload, setUpload] = useState<Upload | null>(null);
  // Staged for the page's save only once it is inserted.
  const [pending, setPending] = useState<Staged | null>(null);
  const loaded = library.kind === 'loaded' ? library : null;
  const waitingFiles = [
    ...staged.filter(s => s.path !== pending?.path),
    ...(pending ? [pending] : []),
  ];

  const inTree = (loaded?.images ?? []).filter(i =>
    i.path.startsWith(`${props.directory}/`)
  );
  const images: LibraryImage[] = [
    ...waitingFiles
      .filter(w => !inTree.some(i => i.path === w.path))
      .map(w => ({
        path: w.path,
        name: baseName(w.path),
        sha: '',
        draft: 'new' as const,
      })),
    ...inTree,
  ];
  const q = search.trim().toLowerCase();
  const visible = images.filter(i => !q || i.name.toLowerCase().includes(q));
  const image = images.find(i => i.path === selected);
  const stagedBytes = (path: string) =>
    waitingFiles.find(s => s.path === path)?.bytes;
  const alt =
    typedAlt ??
    (selected === props.current?.path
      ? props.current?.alt
      : selected && loaded?.alts?.[altKey(props.directory, selected)]) ??
    (loaded?.alts ? '' : undefined);
  const { bytes } = usePreview(image, image && stagedBytes(image.path));

  const pick = (path: string) => {
    setSelected(path);
    setAlt(null);
    setCaption(path === props.current?.path ? props.current.title : '');
  };

  const accept = (u: Upload, path: string) => {
    setPending({ path, bytes: u.bytes });
    setUpload(null);
    setTab('library');
    setSearch('');
    pick(path);
  };
  const onFiles = async ([file]: File[]) => {
    if (!file) return;
    const [plan] = planUploads([file], props.directory, taken);
    const u = await toUpload(file, plan, 0);
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
                              : loaded.usageOf(i.path)
                          }
                          selected={i.path === selected}
                          onSelect={() => pick(i.path)}
                        />
                      ))}
                      {!visible.length && (
                        <Text color="neutralSecondary">
                          {emptyListText({ changedView: false, filtered: !!q })}
                        </Text>
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
                <ImageDropArea onFiles={onFiles} />
                {upload && (
                  <Box border="muted" borderRadius="large">
                    <UploadRow
                      upload={upload}
                      usedBy={clashMessage(
                        (loaded?.usersOf(upload.path ?? '') ?? []).map(
                          p => p.title
                        )
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
      {hasPlusUi(config) && (
        <Footer>
          <TextLink href={`${branchHref(branch)}/images`} target="_blank">
            Manage images
          </TextLink>
        </Footer>
      )}
      <ButtonGroup>
        <Button onPress={dialog.dismiss}>Cancel</Button>
        <Button
          prominence="high"
          isDisabled={
            tab !== 'library' || !image || !bytes || alt === undefined
          }
          onPress={() => {
            if (!image || !bytes || alt === undefined) return;
            if (pending?.path === image.path) add(pending);
            props.onPick({
              path: image.path,
              bytes,
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
