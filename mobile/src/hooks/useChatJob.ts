import { useEffect, useState } from 'react';
import { api, type Job } from '../lib/api';

/**
 * The job behind a chat, read for the pinned system line and the header. A failed read only leaves
 * those lines out. The chat itself never waits for it.
 */
export function useChatJob(jobId: string | null): Job | null {
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    let active = true;
    setJob(null);
    const id = jobId;
    if (id) {
      Promise.resolve()
        .then(() => api.getJob(id))
        .then((loaded) => {
          if (active) setJob(loaded);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [jobId]);

  return job;
}
