import { useEffect, useMemo, useState } from 'react';
import { api, type Job } from '../lib/api';
import { countPendingProposals, proposalLookupIds, type ProposalCounts } from '../lib/proposalCounts';

/** Each looked-up job's answer: its pending count, or null when its lookup failed. No entry yet means still loading. */
type Answers = Readonly<Record<string, number | null>>;

/**
 * Pending provider proposals for the homeowner's newest open jobs, and whether
 * any of those lookups is still out. Loads after the jobs and never holds up
 * rendering them. A lookup that fails leaves its job without a count (the job
 * lists show it as waiting), but that lookup has answered, so it is not loading.
 * Looks again whenever `jobs` is replaced by a reload.
 */
export function useProposalCountsStatus(jobs: readonly Job[]): { counts: ProposalCounts; loading: boolean } {
  const [answers, setAnswers] = useState<Answers>({});
  const lookupIds = useMemo(() => proposalLookupIds(jobs), [jobs]);

  useEffect(() => {
    if (lookupIds.length === 0) return undefined;
    let active = true;
    Promise.allSettled(lookupIds.map((id) => api.jobApplications(id))).then((results) => {
      if (!active) return;
      const next: Record<string, number | null> = {};
      results.forEach((result, index) => {
        next[lookupIds[index]] = result.status === 'fulfilled' ? countPendingProposals(result.value) : null;
      });
      setAnswers(next);
    });
    return () => {
      active = false;
    };
  }, [lookupIds]);

  const counts = useMemo(() => {
    const known: Record<string, number> = {};
    for (const [id, answer] of Object.entries(answers)) {
      if (answer !== null) known[id] = answer;
    }
    return known;
  }, [answers]);
  // Includes a job a reload has just added, whose lookup is not back yet.
  const loading = lookupIds.some((id) => answers[id] === undefined);
  return { counts, loading };
}

/** The pending-proposal counts on the homeowner's newest open jobs; see useProposalCountsStatus. */
export function useProposalCounts(jobs: readonly Job[]): ProposalCounts {
  return useProposalCountsStatus(jobs).counts;
}
