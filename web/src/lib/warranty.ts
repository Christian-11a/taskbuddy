// The 72-hour warranty window that opens when a job is completed. While it is
// open a timely complaint holds the provider's payment.

export const WARRANTY_HOURS = 72;

const MS_PER_HOUR = 3_600_000;

export type Warranty =
  | { state: "none" }
  | { state: "open"; closesAt: Date; hoursLeft: number }
  | { state: "closed"; closedAt: Date };

/** `none` when the job has no usable completion time, so the UI shows no line. */
export function warrantyStatus(completedAt: string | null | undefined, now: Date): Warranty {
  if (!completedAt) return { state: "none" };
  const completed = new Date(completedAt).getTime();
  if (Number.isNaN(completed)) return { state: "none" };

  const closes = new Date(completed + WARRANTY_HOURS * MS_PER_HOUR);
  if (now.getTime() < closes.getTime()) {
    return { state: "open", closesAt: closes, hoursLeft: (closes.getTime() - now.getTime()) / MS_PER_HOUR };
  }
  return { state: "closed", closedAt: closes };
}

/** "5 h left", "2 d 4 h left", "2 d left", "under 1 h left". */
export function formatHoursLeft(hours: number): string {
  if (hours < 1) return "under 1 h left";
  if (hours < 24) return `${Math.floor(hours)} h left`;
  const days = Math.floor(hours / 24);
  const rest = Math.floor(hours % 24);
  return rest === 0 ? `${days} d left` : `${days} d ${rest} h left`;
}
