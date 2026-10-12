import { useState } from 'react';

import { ActionGroup, Item } from '@keystar/ui/action-group';
import { ActionButton, Button, ButtonGroup } from '@keystar/ui/button';
import {
  Dialog,
  DialogContainer,
  useDialogContainer,
} from '@keystar/ui/dialog';
import { FileTrigger } from '@keystar/ui/drag-and-drop';
import { Icon } from '@keystar/ui/icon';
import { uploadIcon } from '@keystar/ui/icon/icons/uploadIcon';
import { xIcon } from '@keystar/ui/icon/icons/xIcon';
import { Box, Flex } from '@keystar/ui/layout';
import { TextLink } from '@keystar/ui/link';
import { Notice } from '@keystar/ui/notice';
import { Picker } from '@keystar/ui/picker';
import { ProgressCircle } from '@keystar/ui/progress';
import { SearchField } from '@keystar/ui/search-field';
import { Content } from '@keystar/ui/slots';
import { css, tokenSchema } from '@keystar/ui/style';
import { TextArea, TextField } from '@keystar/ui/text-field';
import { toastQueue } from '@keystar/ui/toast';
import { Heading, Text } from '@keystar/ui/typography';

import { useEventCallback } from '../../form/fields/markdoc/editor/utils';
import { useCurrentBranch, useTree } from '../shell/data';
import { branchHref, useDraftsContext } from './draft-data';
import {
  dimsText,
  ImageCard,
  imageGrid,
  ImagePreview,
  usePreview,
} from './image-card';
import {
  ClashChoice,
  DONE,
  ImageDropArea,
  toUpload,
  Upload,
  UploadList,
} from './image-uploads';
import {
  ACCEPTED,
  ALT_FILE,
  altKey,
  clashMessage,
  contentType,
  extension,
  formatSize,
  freePath,
  LibraryImage,
  planUploads,
  withAlt,
  stem,
  uploadProblem,
} from './images';
import { PageUse, useImageCommit, useLibrary } from './images-data';

const pane = css({
  borderInlineStart: `${tokenSchema.size.border.regular} solid ${tokenSchema.color.border.muted}`,
  flex: '0 0 340px',
  overflowY: 'auto',
});

export function PageList(props: { pages: PageUse[]; base: string }) {
  return (
    <Flex elementType="ul" direction="column" gap="regular">
      {props.pages.map(p => (
        <Flex elementType="li" key={p.slug} gap="regular" alignItems="baseline">
          <TextLink
            href={`${props.base}/collection/${encodeURIComponent(
              p.collection
            )}/item/${encodeURIComponent(p.slug)}`}
          >
            {p.title}
          </TextLink>
          <Text size="small" color="neutralSecondary">
            {p.languages.join(', ')}
          </Text>
        </Flex>
      ))}
    </Flex>
  );
}

function RemoveImageDialog(props: {
  image: LibraryImage;
  pages: PageUse[];
  base: string;
  // The draft a removal on the live site starts.
  newDraft: string;
  onRemove: () => Promise<void>;
}) {
  const dialog = useDialogContainer();
  const drafts = useDraftsContext();
  const branch = useCurrentBranch();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftName = drafts?.title(drafts.onLive ? props.newDraft : branch);
  const n = props.pages.length;
  return (
    <Dialog size={n ? 'medium' : 'small'}>
      <Heading>{`Remove “${props.image.name}”?`}</Heading>
      <Content>
        <Flex direction="column" gap="xlarge">
          <Text color="neutralSecondary">
            It stays on the site until you publish. Until then you can undo it.
          </Text>
          {n > 0 && (
            <>
              <Notice tone="caution">
                <Flex direction="column" gap="regular">
                  <Text>
                    <strong>
                      {n === 1
                        ? '1 page uses this image.'
                        : `${n} pages use this image.`}
                    </strong>{' '}
                    They show a broken picture after you publish, and they're
                    listed when you review the draft.
                  </Text>
                  <PageList pages={props.pages} base={props.base} />
                </Flex>
              </Notice>
              <Text>
                To change the picture and keep those pages working, use{' '}
                <strong>Replace file</strong> instead.
              </Text>
            </>
          )}
          <Text>
            {drafts?.onLive ? (
              <>
                This starts a new draft, <strong>{draftName}</strong>. Inside a
                draft, it joins that draft instead.
              </>
            ) : (
              <>
                It goes into your draft, <strong>{draftName}</strong>.
              </>
            )}
          </Text>
          {error && <Notice tone="critical">{error}</Notice>}
        </Flex>
      </Content>
      <ButtonGroup>
        <Button onPress={dialog.dismiss} isDisabled={working}>
          Cancel
        </Button>
        <Button
          tone="critical"
          prominence="high"
          isDisabled={working}
          onPress={async () => {
            setWorking(true);
            setError(null);
            try {
              await props.onRemove();
              dialog.dismiss();
            } catch (e) {
              setError((e as Error).message);
              setWorking(false);
            }
          }}
        >
          {working ? 'Removing…' : 'Remove in draft'}
        </Button>
      </ButtonGroup>
    </Dialog>
  );
}

function ImageDetails(props: {
  image: LibraryImage;
  pages: PageUse[] | undefined;
  // undefined until the alt text file is read
  alt: string | undefined;
  base: string;
  busy: boolean;
  onClose: () => void;
  onRemove: (bytes: Uint8Array) => void;
  onRestore: (bytes: Uint8Array) => void;
  onReplace: (file: File) => void;
  onSaveAlt: (alt: string) => Promise<void>;
}) {
  const { image } = props;
  const preview = usePreview(image);
  const { bytes, dims } = preview;
  const [copied, setCopied] = useState(false);
  const [alt, setAlt] = useState<string | null>(null);
  const [savingAlt, setSavingAlt] = useState(false);
  const removed = image.draft === 'removed';
  const altValue = alt ?? props.alt ?? '';
  return (
    <Flex
      elementType="aside"
      aria-label="Image details"
      direction="column"
      gap="xlarge"
      padding="xlarge"
      UNSAFE_className={pane}
    >
      <Flex alignItems="center" gap="regular">
        <Heading elementType="h2" size="small" truncate flex>
          {image.name}
        </Heading>
        <ActionButton
          prominence="low"
          aria-label="Close details"
          onPress={props.onClose}
        >
          <Icon src={xIcon} />
        </ActionButton>
      </Flex>
      <Box border="neutral" borderRadius="regular" padding="regular">
        <ImagePreview preview={preview} alt={props.alt} height={192} />
      </Box>
      {removed && (
        <Notice tone="caution">
          It is removed in this draft. Readers still see it until you publish.
        </Notice>
      )}
      <Flex gap="regular" alignItems="end">
        <TextField
          label="Path"
          value={image.path}
          isReadOnly
          flex
          UNSAFE_className={css({
            '& input': {
              fontFamily: tokenSchema.typography.fontFamily.code,
              fontSize: tokenSchema.typography.text.small.size,
            },
          })}
        />
        <ActionButton
          onPress={() => {
            navigator.clipboard?.writeText(image.path).then(
              () => setCopied(true),
              () => {}
            );
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </ActionButton>
      </Flex>
      <Box
        elementType="dl"
        UNSAFE_className={css({
          display: 'grid',
          gap: tokenSchema.size.space.large,
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          margin: 0,
          '& dd': { margin: 0, marginTop: tokenSchema.size.space.regular },
        })}
      >
        {[
          ['Size', bytes ? formatSize(bytes.byteLength) : '—'],
          ['Dimensions', dims ? `${dimsText(dims)} px` : '—'],
          ['Type', extension(image.name).toUpperCase()],
        ].map(([term, value]) => (
          <div key={term}>
            <dt>
              <Text size="small" color="neutralSecondary">
                {term}
              </Text>
            </dt>
            <dd>
              <Text>{value}</Text>
            </dd>
          </div>
        ))}
      </Box>
      {!removed && (
        <Flex direction="column" gap="regular">
          <TextArea
            label="Default alt text"
            description="Filled in when you add this image to a page. Each page can change it."
            value={altValue}
            onChange={setAlt}
            isDisabled={props.alt === undefined}
          />
          {alt !== null && alt !== props.alt && (
            <Flex gap="regular">
              <Button
                prominence="high"
                isDisabled={savingAlt || props.busy || props.alt === undefined}
                onPress={async () => {
                  setSavingAlt(true);
                  try {
                    await props.onSaveAlt(alt);
                    setAlt(null);
                  } catch (e) {
                    toastQueue.critical((e as Error).message, {
                      timeout: 8000,
                    });
                  } finally {
                    setSavingAlt(false);
                  }
                }}
              >
                {savingAlt ? 'Saving…' : 'Save alt text'}
              </Button>
              <Button isDisabled={savingAlt} onPress={() => setAlt(null)}>
                Cancel
              </Button>
            </Flex>
          )}
        </Flex>
      )}
      <Flex direction="column" gap="medium">
        <Text weight="medium" color="neutralEmphasis">
          Used on
        </Text>
        {props.pages === undefined ? (
          <ProgressCircle
            size="small"
            isIndeterminate
            aria-label="Finding pages"
          />
        ) : props.pages.length ? (
          <PageList pages={props.pages} base={props.base} />
        ) : (
          <Text color="neutralSecondary">No page uses it yet.</Text>
        )}
      </Flex>
      <Flex gap="regular" wrap marginTop="auto">
        {removed ? (
          <Button
            isDisabled={!bytes || props.busy}
            onPress={() => bytes && props.onRestore(bytes)}
          >
            Undo remove
          </Button>
        ) : (
          <>
            <FileTrigger
              acceptedFileTypes={ACCEPTED}
              onSelect={list => list?.[0] && props.onReplace(list[0])}
            >
              <Button isDisabled={props.busy}>Replace file…</Button>
            </FileTrigger>
            <Button
              tone="critical"
              isDisabled={!bytes || props.busy}
              onPress={() => bytes && props.onRemove(bytes)}
            >
              Remove…
            </Button>
          </>
        )}
      </Flex>
    </Flex>
  );
}

let uploadIds = 0;

export function ImagesPage() {
  const branch = useCurrentBranch();
  const trees = useTree();
  const library = useLibrary();
  const { commit, draftName } = useImageCommit();
  const [search, setSearch] = useState('');
  const [usageFilter, setUsageFilter] = useState<'all' | 'used' | 'unused'>(
    'all'
  );
  const [view, setView] = useState<'all' | 'changed'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{
    image: LibraryImage;
    bytes: Uint8Array;
  } | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);

  const base = branchHref(branch);
  const current =
    trees.merged.kind === 'loaded' ? trees.merged.data.current : null;
  const exists = (path: string) => !!current?.entries.has(path);
  const loaded = library.kind === 'loaded' ? library : null;
  const images = loaded?.images ?? [];
  const onLive = loaded?.onLive ?? true;
  const present = images.filter(i => i.draft !== 'removed');
  const changed = images.filter(i => i.draft);
  const shown = onLive ? 'all' : view;

  const q = search.trim().toLowerCase();
  const visible = (shown === 'changed' ? changed : present).filter(i => {
    const n = loaded?.usersOf(i.path)?.length;
    if (usageFilter === 'used' && n === 0) return false;
    if (usageFilter === 'unused' && n) return false;
    return !q || i.name.toLowerCase().includes(q);
  });

  const selectedImage = images.find(i => i.path === selected);

  const update = (ids: number[], patch: Partial<Upload>) =>
    setUploads(prev =>
      prev.map(u => (ids.includes(u.id) ? { ...u, ...patch } : u))
    );

  // Reads the newest branch head: a save before it may have started a draft.
  const send = useEventCallback(async (batch: Upload[]) => {
    if (!batch.length) return;
    const ids = batch.map(u => u.id);
    update(ids, { status: 'saving' });
    setBusy(true);
    try {
      await commit({
        draft: 'add-images',
        headline:
          batch.length === 1
            ? `Add ${batch[0].path}`
            : `Add ${batch.length} images to ${loaded?.dir}/shared`,
        additions: batch.map(u => ({ path: u.path!, contents: u.bytes })),
      });
      update(ids, { status: 'saved' });
    } catch (e) {
      update(ids, { status: 'failed', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  });

  const addFiles = async (files: File[]) => {
    if (!loaded || !files.length) return;
    const plans = planUploads(files, loaded.dir, exists);
    const next = await Promise.all(
      files.map((file, i) => toUpload(file, plans[i], ++uploadIds))
    );
    setUploads(prev => [
      ...prev.filter(u => !DONE.includes(u.status)),
      ...next,
    ]);
    send(next.filter(u => u.status === 'ready'));
  };

  const choose = (u: Upload, choice: ClashChoice) => {
    if (choice === 'skip') return update([u.id], { status: 'skipped' });
    const path =
      choice === 'replace'
        ? u.path!
        : freePath(
            u.path!,
            p => exists(p) || uploads.some(o => o.id !== u.id && o.path === p)
          );
    const ready = { ...u, path, status: 'ready' as const };
    update([u.id], ready);
    send([ready]);
  };

  const run = async (input: Parameters<typeof commit>[0], done: string) => {
    setBusy(true);
    try {
      await commit(input);
      toastQueue.positive(done, { timeout: 5000 });
    } catch (e) {
      toastQueue.critical((e as Error).message, { timeout: 8000 });
    } finally {
      setBusy(false);
    }
  };

  // Undo runs after the removal's commit, maybe on the draft it started.
  const restore = useEventCallback((image: LibraryImage, bytes: Uint8Array) =>
    run(
      {
        draft: 'restore-image',
        headline: `Restore ${image.path}`,
        additions: [{ path: image.path, contents: bytes }],
      },
      `“${image.name}” is back in this draft.`
    )
  );

  const remove = async (image: LibraryImage, bytes: Uint8Array) => {
    await commit({
      draft: `remove-${stem(image.name)}`,
      headline: `Delete ${image.path}`,
      deletions: [image.path],
    });
    setSelected(null);
    toastQueue.neutral(`“${image.name}” is removed in this draft.`, {
      actionLabel: 'Undo',
      onAction: () => restore(image, bytes),
      shouldCloseOnAction: true,
      timeout: 10000,
    });
  };

  const replace = async (image: LibraryImage, file: File) => {
    const problem =
      uploadProblem(file) ??
      (contentType(file.name) !== contentType(image.name)
        ? `Not replaced. Choose a ${extension(
            image.name
          ).toUpperCase()} file, so the path stays the same.`
        : null);
    if (problem) {
      toastQueue.critical(problem, { timeout: 8000 });
      return;
    }
    await run(
      {
        draft: `replace-${stem(image.name)}`,
        headline: `Replace ${image.path}`,
        additions: [
          {
            path: image.path,
            contents: new Uint8Array(await file.arrayBuffer()),
          },
        ],
      },
      `“${image.name}” is replaced in this draft.`
    );
  };

  const saveAlt = async (image: LibraryImage, alt: string) => {
    if (!loaded) return;
    await commit({
      draft: 'alt-text',
      headline: `Update ${loaded.dir}/${ALT_FILE}`,
      additions: [
        {
          path: `${loaded.dir}/${ALT_FILE}`,
          contents: new TextEncoder().encode(
            withAlt(
              await loaded.readAltFile(),
              altKey(loaded.dir, image.path),
              alt
            )
          ),
        },
      ],
    });
  };

  const usedBy = (path: string) =>
    clashMessage((loaded?.usersOf(path) ?? []).map(p => p.title));

  return (
    <Flex
      elementType="main"
      direction="column"
      height="100%"
      minHeight={0}
      flex
    >
      <Box
        borderBottom="muted"
        backgroundColor="canvas"
        paddingX="xxlarge"
        paddingY="large"
      >
        <Flex alignItems="center" gap="large" wrap>
          <Heading elementType="h1" size="large">
            Images
          </Heading>
          {onLive ? (
            <Text color="neutralSecondary">
              {present.length === 1 ? '1 image' : `${present.length} images`}
            </Text>
          ) : (
            <ActionGroup
              aria-label="Which images"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[shown]}
              onSelectionChange={keys =>
                setView([...keys][0] as 'all' | 'changed')
              }
              density="compact"
            >
              <Item key="all">{`All ${present.length}`}</Item>
              <Item key="changed">{`Changed in this draft ${changed.length}`}</Item>
            </ActionGroup>
          )}
          <Box marginStart="auto">
            <FileTrigger
              acceptedFileTypes={ACCEPTED}
              allowsMultiple
              onSelect={list => list && addFiles([...list])}
            >
              <Button prominence="high" isDisabled={!loaded || busy}>
                <Icon src={uploadIcon} />
                <Text>Upload images</Text>
              </Button>
            </FileTrigger>
          </Box>
        </Flex>
      </Box>

      <Flex flex minHeight={0}>
        <Box
          flex
          minWidth={0}
          overflow="auto"
          paddingX="xxlarge"
          paddingY="xlarge"
        >
          <Flex direction="column" gap="large" maxWidth="container.large">
            <Flex gap="regular" wrap alignItems="end">
              <SearchField
                aria-label="Search images"
                placeholder="Search images"
                value={search}
                onChange={setSearch}
                width="scale.3600"
              />
              <Picker
                label="Usage"
                selectedKey={usageFilter}
                onSelectionChange={k =>
                  setUsageFilter(k as 'all' | 'used' | 'unused')
                }
                width="scale.3000"
              >
                <Item key="all">All</Item>
                <Item key="used">On pages</Item>
                <Item key="unused">Not used</Item>
              </Picker>
            </Flex>

            <ImageDropArea
              multiple
              isDisabled={!loaded || busy}
              onFiles={addFiles}
            />

            {uploads.length > 0 && (
              <UploadList
                uploads={uploads}
                usedBy={usedBy}
                busy={busy}
                onChoose={choose}
                onClose={() => setUploads([])}
              />
            )}

            {!loaded ? (
              <ProgressCircle isIndeterminate aria-label="Loading images" />
            ) : visible.length === 0 ? (
              <Box border="muted" borderRadius="large" padding="xxlarge">
                <Text color="neutralSecondary" align="center">
                  {shown === 'changed'
                    ? 'No images changed in this draft yet.'
                    : 'No images match.'}
                </Text>
              </Box>
            ) : (
              <div className={imageGrid(180)}>
                {visible.map(image => (
                  <ImageCard
                    key={image.path}
                    image={image}
                    usage={loaded.usageOf(image.path)}
                    selected={image.path === selected}
                    onSelect={() => setSelected(image.path)}
                  />
                ))}
              </div>
            )}
            {!onLive && (
              <Text color="neutralSecondary">
                Readers see none of this until you publish.
              </Text>
            )}
          </Flex>
        </Box>

        {loaded && selectedImage && (
          <ImageDetails
            key={selectedImage.path}
            image={selectedImage}
            pages={loaded.usersOf(selectedImage.path)}
            alt={loaded.alts?.[altKey(loaded.dir, selectedImage.path)]}
            base={base}
            busy={busy}
            onClose={() => setSelected(null)}
            onRemove={bytes => setRemoving({ image: selectedImage, bytes })}
            onRestore={bytes => restore(selectedImage, bytes)}
            onReplace={file => replace(selectedImage, file)}
            onSaveAlt={alt => saveAlt(selectedImage, alt)}
          />
        )}
      </Flex>

      <DialogContainer onDismiss={() => setRemoving(null)}>
        {removing && (
          <RemoveImageDialog
            image={removing.image}
            pages={loaded?.usersOf(removing.image.path) ?? []}
            base={base}
            newDraft={draftName(`remove-${stem(removing.image.name)}`)}
            onRemove={() => remove(removing.image, removing.bytes)}
          />
        )}
      </DialogContainer>
    </Flex>
  );
}
