import { AlertDialog } from '@keystar/ui/dialog';
import { Flex } from '@keystar/ui/layout';
import { TextLink } from '@keystar/ui/link';
import { css, tokenSchema } from '@keystar/ui/style';
import { toastQueue } from '@keystar/ui/toast';
import { Text } from '@keystar/ui/typography';

import { useDraftsContext } from './draft-data';
import { Draft } from './draft-status';
import { changeSummary } from './review';
import { useDraftReview } from './review-data';

const bigButtons = css({
  '& button': { height: 44, paddingInline: tokenSchema.size.space.xlarge },
});

// Only the open draft: its changes are the ones the shell has loaded.
export function DiscardDialog(props: { draft: Draft }) {
  const drafts = useDraftsContext()!;
  const review = useDraftReview();
  const title = drafts.title(props.draft.name);
  return (
    <AlertDialog
      UNSAFE_className={bigButtons}
      title={`Discard “${title}”?`}
      tone="critical"
      cancelLabel="Keep draft"
      primaryActionLabel="Discard draft"
      autoFocusButton="cancel"
      onPrimaryAction={() => {
        drafts.discard(props.draft).catch((e: Error) => {
          toastQueue.critical(e.message, { timeout: 8000 });
        });
      }}
    >
      <Flex direction="column" gap="large">
        <Text>
          Your changes to{' '}
          <strong>
            {review.kind === 'loaded'
              ? changeSummary(review.groups)
              : 'this draft'}
          </strong>{' '}
          are thrown away.{' '}
          <TextLink href={drafts.reviewHref}>See the changes</TextLink>
        </Text>
        <Text>The live site doesn't change. You can't undo this.</Text>
      </Flex>
    </AlertDialog>
  );
}
