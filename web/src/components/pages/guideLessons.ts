export type GuideTrack = "clients" | "providers";

export interface GuideLesson {
  id: string;
  title: string;
  summary: string;
  /** Length of the video, m:ss. */
  duration: string;
  /** Path to the video file. */
  video?: string;
  poster?: string;
}

export const TRACK_LABELS: Record<GuideTrack, string> = {
  clients: "For clients",
  providers: "For providers",
};

export const GUIDE_TRACKS: Record<GuideTrack, GuideLesson[]> = {
  clients: [
    { id: "create-your-account", title: "Create your account", summary: "Sign up as a client in about a minute.", duration: "0:40", video: "/guide/create-your-account.mp4", poster: "/guide/create-your-account.jpg" },
    { id: "your-home-screen", title: "Your Home and My Jobs", summary: "Find your way around the Home screen and see all your jobs in one place.", duration: "0:30", video: "/guide/your-home-screen.mp4", poster: "/guide/your-home-screen.jpg" },
    { id: "post-a-job", title: "Post a job", summary: "Pick a service, add the address and tasks, choose when and a price, then post.", duration: "0:40", video: "/guide/post-a-job.mp4", poster: "/guide/post-a-job.jpg" },
    { id: "compare-proposals-and-hire", title: "Compare proposals and hire", summary: "Compare providers, hire the one you like and pay safely.", duration: "0:41", video: "/guide/compare-proposals-and-hire.mp4", poster: "/guide/compare-proposals-and-hire.jpg" },
    { id: "chat-and-reschedule", title: "Chat and change the date or time", summary: "Message your provider and ask to move the job to a new time.", duration: "0:33", video: "/guide/chat-and-reschedule.mp4", poster: "/guide/chat-and-reschedule.jpg" },
    { id: "track-confirm-and-review", title: "Confirm the job and leave a review", summary: "Follow the tasks, confirm the job is done and rate your provider.", duration: "0:37", video: "/guide/track-confirm-and-review.mp4", poster: "/guide/track-confirm-and-review.jpg" },
    { id: "cancel-or-report", title: "Cancel a job or report a problem", summary: "What to do when plans change or something goes wrong.", duration: "0:37", video: "/guide/cancel-or-report.mp4", poster: "/guide/cancel-or-report.jpg" },
    { id: "payments-and-settings", title: "Payments, notifications and settings", summary: "Find your payment history, notifications and app settings.", duration: "0:31", video: "/guide/payments-and-settings.mp4", poster: "/guide/payments-and-settings.jpg" },
  ],
  providers: [
    { id: "provider-create-account", title: "Create your account", summary: "Sign up as a provider and choose your skill.", duration: "0:33", video: "/guide/provider-create-account.mp4", poster: "/guide/provider-create-account.jpg" },
    { id: "provider-get-verified", title: "Get verified", summary: "Add your ID, a selfie and a certificate for your service.", duration: "0:56", video: "/guide/provider-get-verified.mp4", poster: "/guide/provider-get-verified.jpg" },
    { id: "provider-payout-account", title: "Link your payout account", summary: "Add the GCash, Maya or bank account your pay goes to.", duration: "0:26", video: "/guide/provider-payout-account.mp4", poster: "/guide/provider-payout-account.jpg" },
    { id: "provider-your-feed", title: "Your Feed and availability", summary: "Find open jobs near you and control when clients can invite you.", duration: "0:25", video: "/guide/provider-your-feed.mp4", poster: "/guide/provider-your-feed.jpg" },
    { id: "provider-send-a-proposal", title: "Send a proposal", summary: "Read a job, see what you receive and send a proposal.", duration: "0:38", video: "/guide/provider-send-a-proposal.mp4", poster: "/guide/provider-send-a-proposal.jpg" },
    { id: "provider-do-the-job", title: "Do the job", summary: "Start the job and tick each task with a proof photo.", duration: "0:33", video: "/guide/provider-do-the-job.mp4", poster: "/guide/provider-do-the-job.jpg" },
    { id: "provider-decline-or-reschedule", title: "Decline a booking or change the time", summary: "What to do when you can't make a booking.", duration: "0:27", video: "/guide/provider-decline-or-reschedule.mp4", poster: "/guide/provider-decline-or-reschedule.jpg" },
    { id: "provider-get-paid", title: "Get paid", summary: "See how your pay arrives after the client confirms, and where to find it in Earnings.", duration: "0:26", video: "/guide/provider-get-paid.mp4", poster: "/guide/provider-get-paid.jpg" },
    { id: "provider-services-portfolio", title: "Services, certificates and portfolio", summary: "Add another service and show photos of your past work.", duration: "0:31", video: "/guide/provider-services-portfolio.mp4", poster: "/guide/provider-services-portfolio.jpg" },
  ],
};

export function trackOf(lessonId: string): GuideTrack | null {
  for (const track of Object.keys(GUIDE_TRACKS) as GuideTrack[]) {
    if (GUIDE_TRACKS[track].some((l) => l.id === lessonId)) return track;
  }
  return null;
}
