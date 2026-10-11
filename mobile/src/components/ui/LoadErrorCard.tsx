import React from 'react';
import { CircleAlert } from 'lucide-react-native';
import EmptyCard from './EmptyCard';
import EmptyRow from './EmptyRow';

export type LoadErrorCardProps = {
  /** What failed to load, in the screen's words, e.g. "Couldn't load your jobs". */
  title: string;
  /** The error string the load returned, shown as the body. */
  message?: string | null;
  /** The screen's existing reload. Without one the card has no action. */
  onRetry?: () => void;
};

/**
 * A load that failed and left nothing to show: the same card as an empty state, with a CircleAlert tile,
 * the error as the body and Try again when there is something to re-run.
 */
export default function LoadErrorCard({ title, message, onRetry }: LoadErrorCardProps) {
  return (
    <EmptyCard testID="error-card">
      <EmptyRow
        icon={CircleAlert}
        title={title}
        body={message ?? undefined}
        actionLabel={onRetry ? 'Try again' : undefined}
        onAction={onRetry}
      />
    </EmptyCard>
  );
}
