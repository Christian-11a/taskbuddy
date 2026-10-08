import { useEffect, useState } from 'react';
import { api, type Job } from '../lib/api';
import { countPendingProposals, proposalLookupIds, type ProposalCounts } from '../lib/proposalCounts';

/**
 * Pending provider proposals for the homeowner's newest open jobs. Loads after
 * the jobs and never holds up rendering them: until a count arrives the job has
 * none (the job lists show it as waiting), and a lookup that fails leaves that
 * job without one. Looks again whenever `jobs` is replaced by a reload.
 */
export function useProposalCounts(jobs: readonly Job[]): ProposalCounts {
  const [counts, setCounts] = useState<ProposalCounts>({});

  useEffect(() => {
    const ids = proposalLookupIds(jobs);
    if (ids.length === 0) return undefined;
    let active = true;
    Promise.allSettled(ids.map((id) => api.jobApplications(id))).then((results) => {
      if (!active) return;
      const next: Record<string, number> = {};
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') next[ids[index]] = countPendingProposals(result.value);
      });
      setCounts(next);
    });
    return () => {
      active = false;
    };
  }, [jobs]);

  return counts;
}
