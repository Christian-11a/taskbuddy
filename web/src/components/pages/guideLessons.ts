export type GuideTrack = "clients" | "providers";

export interface GuideLesson {
  id: string;
  title: string;
  summary: string;
  /** Placeholder until the real videos are recorded. */
  duration: string;
  /** Path to the video file; empty until recorded. */
  video?: string;
  poster?: string;
}

export const TRACK_LABELS: Record<GuideTrack, string> = {
  clients: "For clients",
  providers: "For providers",
};

export const GUIDE_TRACKS: Record<GuideTrack, GuideLesson[]> = {
  clients: [
    { id: "create-your-account", title: "Create your account", summary: "Sign up as a client and get ready to post your first job.", duration: "1:00", video: "" },
    { id: "your-home-screen", title: "Your Home screen", summary: "Find your way around the Home screen and see what each part does.", duration: "1:00", video: "" },
    { id: "post-a-job", title: "Post a job", summary: "Describe the work you need done so providers can send you offers.", duration: "1:00", video: "" },
    { id: "compare-offers-and-hire", title: "Compare offers and hire", summary: "Look over the offers you receive and hire the provider you prefer.", duration: "1:00", video: "" },
    { id: "track-confirm-and-review", title: "Track, confirm and review", summary: "Follow the job, confirm it is finished and leave a review.", duration: "1:00", video: "" },
  ],
  providers: [
    { id: "provider-create-account", title: "Create your account", summary: "Sign up as a provider and set up your profile.", duration: "1:00", video: "" },
    { id: "provider-get-verified", title: "Get verified", summary: "Submit your details so clients can trust who they are hiring.", duration: "1:00", video: "" },
    { id: "provider-your-feed", title: "Your Feed", summary: "Browse jobs from clients that match the work you do.", duration: "1:00", video: "" },
    { id: "provider-send-an-offer", title: "Send an offer", summary: "Reply to a job with an offer the client can accept.", duration: "1:00", video: "" },
    { id: "provider-do-the-job", title: "Do the job", summary: "Work through the tasks and keep the client updated until they confirm the job is done.", duration: "1:00", video: "" },
    { id: "provider-get-paid", title: "Get paid", summary: "See how payment reaches you once the client confirms the job.", duration: "1:00", video: "" },
  ],
};

export function trackOf(lessonId: string): GuideTrack | null {
  for (const track of Object.keys(GUIDE_TRACKS) as GuideTrack[]) {
    if (GUIDE_TRACKS[track].some((l) => l.id === lessonId)) return track;
  }
  return null;
}
