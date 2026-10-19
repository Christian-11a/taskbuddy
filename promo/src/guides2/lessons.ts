import type React from 'react';
import { SU } from '../hero/Signup';
import { K } from '../hero/story';
import { CUSTOM } from './screens';
import { CUSTOM2 } from './screens2';

export type PhoneSrc =
  | { kind: 'hero'; role: 'c' | 'p'; from: number; to: number }
  | { kind: 'signup'; role: 'client' | 'provider'; from: number; to: number }
  | { kind: 'screen'; render: (f: number, dur: number) => React.ReactNode };
export type GStep = { headline: string; body: string; say: string; phone: PhoneSrc; spot?: { x: number; y: number; w: number; h: number; at?: number }; zoom?: { y: number; s: number } };
export type GLesson = {
  id: string; track: 'clients' | 'providers'; n: number; group: string; title: string; summary: string;
  intro: string; outro: string; endLine: string; next?: string; steps: GStep[];
};

const hc = (from: number, to: number): PhoneSrc => ({ kind: 'hero', role: 'c', from, to });
const hp = (from: number, to: number): PhoneSrc => ({ kind: 'hero', role: 'p', from, to });
const su = (role: 'client' | 'provider', from: number, to: number): PhoneSrc => ({ kind: 'signup', role, from, to });
const ALL = { ...CUSTOM, ...CUSTOM2 };
const scr = (name: keyof typeof ALL): PhoneSrc => ({ kind: 'screen', render: ALL[name] });

export const LESSONS: GLesson[] = [
  // ── Clients ──────────────────────────────────────────────────────────────
  {
    id: 'create-your-account', track: 'clients', n: 1, group: 'Getting started', title: 'Create your account',
    summary: 'Sign up as a client in about a minute.', intro: 'Here is how to create your TaskBuddy account.',
    outro: "That's it. You're ready to post your first job.", endLine: "You're all set.", next: 'Your Home and My Jobs',
    steps: [
      { headline: 'Choose “I need help at home”', body: 'On Create account, pick the client role, then tap Continue. You can’t switch roles later.', say: 'Tap Create account, choose I need help at home, then tap Continue. You can’t switch roles later, so pick the one that fits.', phone: su('client', 0, SU.details - 2) },
      { headline: 'Fill in your details', body: 'Enter your full name, email and a password with 8 to 72 characters, a letter and a number.', say: 'Fill in your full name and email, then make a password with eight to seventy-two characters, including a letter and a number.', phone: su('client', SU.details - 2, SU.scroll) },
      { headline: 'Agree, then Create account', body: 'Tick the two consent boxes, then tap Create account.', say: 'Scroll down, tick both consent boxes, and tap Create account.', phone: su('client', SU.scroll, SU.code - 2) },
      { headline: 'Verify your email', body: 'Enter the 6-digit code we sent to your email, then tap Verify Email.', say: 'Check your email for a six-digit code, type it in, and tap Verify Email.', phone: su('client', SU.code - 2, SU.welcome) },
      { headline: 'Welcome to TaskBuddy', body: 'A short welcome shows what you can do. Tap Next, or Skip.', say: 'A short welcome tour shows you around. Tap Next to read it, or Skip.', phone: su('client', SU.welcome, SU.end) },
    ],
  },
  {
    id: 'post-a-job', track: 'clients', n: 3, group: 'The main job', title: 'Post a job',
    summary: 'Tell providers what you need, step by step.', intro: "Let's post a job.",
    outro: 'Your job is live. Providers near you can now send proposals.', endLine: 'Your job is posted.', next: 'Compare proposals and hire',
    steps: [
      { headline: 'Tap Post a job', body: 'On Home, tap Post a job. You can also tap “What do you need done?”.', say: 'On your Home screen, tap Post a job.', phone: hc(96, 146), spot: { x: 18, y: 228, w: 375, h: 178, at: 6 } },
      { headline: 'Choose a service', body: 'Pick the kind of work, like Plumbing or Cleaning, then tap Next.', say: 'Choose the service you need, like plumbing or cleaning, then tap Next.', phone: hc(146, 175) },
      { headline: 'Add the address', body: 'Type where the work happens. You’ll see Location confirmed when we find it.', say: 'Type the address where the work will happen. When it shows Location confirmed, tap Next.', phone: hc(175, 211) },
      { headline: 'Tick the tasks', body: 'Pick every task you need done. Your provider ticks them off as they work.', say: 'Tick the tasks you need done. Your provider will tick them off as they work.', phone: hc(211, 249) },
      { headline: 'When, and how much?', body: 'Choose how soon, a date and time, then one of three estimated prices.', say: 'Choose how soon you need it, a date and a time. Then pick one of the three estimated prices.', phone: hc(249, 297), zoom: { y: 560, s: 1.12 } },
      { headline: 'Check your job, then Post job', body: 'Look over every detail. Tap Edit to change one, then tap Post job.', say: 'Check every detail. Tap Edit if something is wrong, then tap Post job.', phone: hc(297, 346) },
    ],
  },
  {
    id: 'compare-proposals-and-hire', track: 'clients', n: 4, group: 'The main job', title: 'Compare proposals and hire',
    summary: 'Pick a provider and pay safely.', intro: "Here's how to choose a provider and hire them.",
    outro: 'Done. Your provider is booked, and your money is held safely.', endLine: 'Your provider is booked.', next: 'Chat and change the date or time',
    steps: [
      { headline: 'Open your proposals', body: 'When a provider applies, Job details shows “1 proposal waiting”. Tap Review proposals.', say: "When a provider applies, your job shows proposal waiting. Tap Review proposals.", phone: hc(450, 511) },
      { headline: 'Compare the providers', body: 'Check each rating, Verified and Certified badges, and their message. Tap View profile for more.', say: "Compare each provider's rating, their Verified and Certified badges, and their message.", phone: hc(511, 512), spot: { x: 20, y: 258, w: 371, h: 228, at: 4 } },
      { headline: 'Tap Hire', body: 'Tap Hire on the provider you want. Your payment option opens.', say: 'Tap Hire on the provider you want.', phone: hc(511, 528) },
      { headline: 'Confirm and pay', body: 'Pay with GCash, Maya, card or bank. Your money is held until you confirm the job is done.', say: 'Choose GCash, Maya, card or bank, and tap Confirm and hire. Your money is held safely until you confirm the job is done.', phone: hc(528, 567), zoom: { y: 760, s: 1.1 } },
      { headline: 'You’re booked', body: 'Job details shows Booked with the date. Message your provider any time.', say: 'Your job now shows Booked, with the date and time. You can message your provider any time.', phone: hc(567, 620) },
    ],
  },
  {
    id: 'track-confirm-and-review', track: 'clients', n: 6, group: 'The main job', title: 'Confirm the job and leave a review',
    summary: 'Follow the tasks, confirm, and rate your provider.', intro: "Here's how to finish a job.",
    outro: 'Thanks for rating. It helps the next client choose.', endLine: 'Job done.', next: 'Cancel a job or report a problem',
    steps: [
      { headline: 'Follow the tasks', body: 'Job details shows how many tasks are done. Each one comes with a proof photo.', say: 'While your provider works, Job details shows how many tasks are done. Each task comes with a proof photo.', phone: hc(748, 820) },
      { headline: 'Confirm job is done', body: 'When all tasks are done, check the work, then tap Confirm job is done. Something wrong? Tap Report a problem first.', say: "When every task is done, check the work and tap Confirm job is done. If something is wrong, tap Report a problem instead.", phone: hc(816, 834) },
      { headline: 'Yes, Mark Complete', body: 'Confirming releases your payment to the provider right away.', say: 'Tap Yes, Mark Complete. Your payment is released to the provider right away.', phone: scr('confirmDialog') },
      { headline: 'Leave a review', body: 'Tap Leave a review, tap the stars, pick what went well and add a comment.', say: 'Tap Leave a review. Choose your stars, pick what went well, add a comment, and tap Submit review.', phone: hc(900, 1010) },
    ],
  },
  // ── Providers ────────────────────────────────────────────────────────────
  {
    id: 'provider-create-account', track: 'providers', n: 1, group: 'Getting started', title: 'Create your account',
    summary: 'Sign up as a provider.', intro: 'Here is how to create your provider account.',
    outro: 'Your account is ready. Next, get verified.', endLine: "You're signed up.", next: 'Get verified',
    steps: [
      { headline: 'Choose “I want to work”', body: 'On Create account, pick the provider role, then tap Continue.', say: 'Tap Create account, choose I want to work, then tap Continue.', phone: su('provider', 0, SU.details - 2) },
      { headline: 'Fill in your details', body: 'Enter your name, email, a password, and choose your skill category.', say: 'Enter your full name, email and a password. Then choose your skill category, like plumbing.', phone: su('provider', SU.details - 2, SU.scroll) },
      { headline: 'Agree, then Create account', body: 'Tick both consent boxes and tap Create account.', say: 'Tick both consent boxes and tap Create account.', phone: su('provider', SU.scroll, SU.code - 2) },
      { headline: 'Verify your email', body: 'Type the 6-digit code from your email and tap Verify Email.', say: 'Type the six-digit code from your email and tap Verify Email.', phone: su('provider', SU.code - 2, SU.welcome) },
      { headline: 'Welcome to TaskBuddy', body: 'The welcome slides explain how you find jobs and get paid.', say: 'The welcome slides explain how you find jobs and get paid.', phone: su('provider', SU.welcome, SU.end) },
    ],
  },
  {
    id: 'provider-get-verified', track: 'providers', n: 2, group: 'Getting started', title: 'Get verified',
    summary: 'Your ID, a selfie and a certificate for your service.', intro: 'Clients only see verified providers. Here is how to get verified.',
    outro: "Once you're approved, open jobs near you show up in your Feed.", endLine: "You're verified.", next: 'Link your payout account',
    steps: [
      { headline: 'Tap Verify your ID', body: 'Your Feed shows Finish setting up. Tap Verify your ID.', say: 'On your Feed, under Finish setting up, tap Verify your ID.', phone: hp(0, 17), spot: { x: 20, y: 380, w: 371, h: 300, at: 2 } },
      { headline: 'Choose your ID', body: 'Pick the ID you will use, like your PhilSys National ID, then tap Continue.', say: 'Choose the ID you will use, then tap Continue. Use your original, valid ID.', phone: hp(17, 45) },
      { headline: 'Take a photo of your ID', body: 'Check that the name and photo are sharp and all 4 corners show. Tap Use this photo.', say: 'Take a photo of your ID. Make sure it is sharp and all four corners show, then tap Use this photo.', phone: hp(45, 69) },
      { headline: 'Take a selfie', body: 'Face a bright light, without glasses, hat or mask. Tap Continue.', say: 'Now take a quick selfie. Face a bright light, and take off glasses, hats or masks.', phone: hp(69, 95) },
      { headline: 'Add your certificate', body: 'Choose the type, add a photo, the certificate name and who issued it. Tap Upload certificate.', say: 'Add the certificate for your service. Choose the type, add a photo, the certificate name and the issuer, then tap Upload certificate.', phone: hp(95, 123) },
      { headline: 'Review and send', body: 'Check your photos, tick the box, and tap Continue to secure check.', say: 'Check your photos, tick the box to agree, and tap Continue to secure check.', phone: hp(123, 149) },
      { headline: 'Wait for review', body: 'The check usually takes a few minutes. We’ll notify you when you’re verified.', say: "That's it. The check usually takes a few minutes, and we'll notify you when you're verified.", phone: hp(149, 186) },
    ],
  },
  {
    id: 'provider-send-a-proposal', track: 'providers', n: 5, group: 'The main job', title: 'Send a proposal',
    summary: 'Apply to a job near you.', intro: 'Here is how to send a proposal.',
    outro: "Now wait for the client. We'll notify you the moment they decide.", endLine: 'Proposal sent.', next: 'Do the job',
    steps: [
      { headline: 'Open a job', body: 'New jobs near you show up in your Feed. Tap one to open it.', say: 'New jobs near you appear in your Feed. Tap one to open it.', phone: hp(330, 371) },
      { headline: 'Read the job', body: 'Check the date, the address, and what the job includes. Then tap Send proposal.', say: 'Read the job: the date, the address, and the tasks it includes. Then tap Send proposal.', phone: hp(371, 401) },
      { headline: 'See what you receive', body: 'The job price, the platform fee and what you receive are shown before you send.', say: 'Before you send, you see the job price, the platform fee, and exactly what you receive.', phone: hp(401, 402), zoom: { y: 420, s: 1.15 } },
      { headline: 'Write your message, then send', body: 'Say when you can come and what you’ll bring. Tap Send proposal.', say: "Write a short message: when you can come, and what you'll bring. Then tap Send proposal.", phone: hp(402, 451) },
      { headline: 'Wait for the client', body: 'The job shows Your proposal is in. You can withdraw it while you wait.', say: 'The job now shows Your proposal is in. You can withdraw it while the client decides.', phone: hp(451, 490) },
    ],
  },
  {
    id: 'provider-do-the-job', track: 'providers', n: 6, group: 'The main job', title: 'Do the job',
    summary: 'Start the job and tick each task with a photo.', intro: 'Here is how to do a job in TaskBuddy.',
    outro: 'When the client confirms, your payment is released.', endLine: 'Job done.', next: 'Decline a booking or change the time',
    steps: [
      { headline: 'You’re booked', body: 'You get a Booking confirmed notification. The job shows where to go and when.', say: 'When a client hires you, you get a Booking confirmed notification, and the job shows where to go and when.', phone: hp(590, 632) },
      { headline: 'Tap Start job', body: 'When you arrive, tap Start job.', say: 'When you arrive, tap Start job.', phone: scr('startJob') },
      { headline: 'Tick a task', body: 'Finished a task? Tap its box. A sheet asks for a proof photo.', say: 'When you finish a task, tap its box.', phone: hp(752, 766) },
      { headline: 'Add a photo, then Mark as done', body: 'Add 1 to 4 photos of the finished task, then tap Mark as done.', say: 'Add at least one photo of the finished work, then tap Mark as done.', phone: hp(766, 796), zoom: { y: 760, s: 1.1 } },
      { headline: 'Wait for the client', body: 'When every task is ticked, the client is asked to confirm.', say: 'When every task is ticked, the client is asked to confirm the job is done.', phone: hp(796, 830) },
    ],
  },
  {
    id: 'provider-get-paid', track: 'providers', n: 8, group: 'The main job', title: 'Get paid',
    summary: 'Know what you receive and where it goes.', intro: "Here's how you get paid in TaskBuddy.",
    outro: 'Your pay goes straight to your GCash, Maya or bank account.', endLine: 'Paid.', next: 'Services, certificates and portfolio',
    steps: [
      { headline: 'Know what you receive', body: 'Every job shows the job price, the platform fee and what you receive before you apply.', say: 'Every job shows the price, the platform fee, and what you receive, before you even apply.', phone: hp(401, 402), zoom: { y: 420, s: 1.15 } },
      { headline: 'Paid when the client confirms', body: 'The client’s payment is held until they confirm. Then it’s released to you.', say: "The client's payment is held safely. When they confirm the job is done, it's released to you.", phone: hp(836, 872) },
      { headline: 'Check Earnings', body: 'Profile → Earnings lists what was released to you and what is on its way.', say: 'Open Earnings from your profile to see what was released to you, and what is on its way.', phone: hp(872, 904), spot: { x: 18, y: 300, w: 375, h: 118, at: 8 } },
    ],
  },
  // ── Added guides ─────────────────────────────────────────────────────────
  {
    id: 'your-home-screen', track: 'clients', n: 2, group: 'Getting started', title: 'Your Home and My Jobs',
    summary: 'Find your way around the app.', intro: 'Here is a quick tour of your Home screen and My Jobs.',
    outro: 'That is everything you need to find your way around.', endLine: 'You know your way around.', next: 'Post a job',
    steps: [
      { headline: 'Start from Home', body: 'Post a job, book a service, and see your active jobs. The bell opens your notifications.', say: 'Home is where you start. Post a job, pick a service, and see your active jobs. The bell at the top opens your notifications.', phone: scr('homeTour') },
      { headline: 'All your jobs in My Jobs', body: 'My Jobs lists every job, grouped by what needs you, this week, waiting and finished.', say: 'Tap My Jobs to see every job you posted, grouped by what needs you, this week, waiting, and finished.', phone: scr('myJobsOpen') },
      { headline: 'Filter what needs you', body: 'Tap a filter like Needs you to see only the jobs waiting on you.', say: 'Tap a filter like Needs you, to see only the jobs waiting for your action.', phone: scr('myJobs'), spot: { x: 90, y: 144, w: 118, h: 40, at: 8 } },
    ],
  },
  {
    id: 'chat-and-reschedule', track: 'clients', n: 5, group: 'The main job', title: 'Chat and change the date or time',
    summary: 'Talk to your provider and move the schedule.', intro: 'Here is how to chat with your provider, and change the date or time.',
    outro: 'Your job now has the new schedule.', endLine: 'Rescheduled.', next: 'Confirm the job and leave a review',
    steps: [
      { headline: 'Message your provider', body: 'On Job details, tap Message. Keep payments in TaskBuddy so they stay protected.', say: 'On your job, tap Message to chat with your provider. Keep payments inside TaskBuddy, so they stay protected.', phone: scr('openChat') },
      { headline: 'Open the menu', body: 'Need a new time? Tap the menu (⋮) on Job details, then Change date or time.', say: 'Need a different time? Tap the menu on Job details, then Change date or time.', phone: scr('menuChangeC') },
      { headline: 'Pick the new time', body: 'Choose a new date and time, add a reason, then tap Send request.', say: 'Pick the new date and time, add a short reason, and tap Send request.', phone: scr('changeSheetC') },
      { headline: 'Wait for an answer', body: 'Your provider can accept or decline. You can withdraw the request while you wait.', say: 'Your provider can accept or decline it. Until then, you can withdraw your request.', phone: scr('requestSent') },
    ],
  },
  {
    id: 'cancel-or-report', track: 'clients', n: 7, group: 'When plans change', title: 'Cancel a job or report a problem',
    summary: 'What to do when plans change or something goes wrong.', intro: 'Here is what to do when plans change, or something goes wrong.',
    outro: 'An admin reviews every report, and your payment stays held until it is settled.', endLine: 'We have your back.', next: 'Payments, notifications and settings',
    steps: [
      { headline: 'Cancel from the menu', body: 'On Job details, tap the menu (⋮), then Cancel job.', say: 'To cancel, tap the menu on Job details, then Cancel job.', phone: scr('cancelMenu') },
      { headline: 'Confirm the cancel', body: 'Before you hire, cancelling takes the job down. After hiring, the provider is asked to agree first.', say: 'Tap Cancel Job to confirm. Before you hire, the job simply comes down. After hiring, your provider is asked to agree, and your money comes back.', phone: scr('cancelDialog') },
      { headline: 'Report a problem', body: 'Something wrong with the work? Tap Report a problem and choose what went wrong.', say: 'If something is wrong with the work, tap Report a problem, and choose what went wrong.', phone: scr('reportReason') },
      { headline: 'Tell us, then send', body: 'Describe what happened, add photos if you can, and tap Send report.', say: 'Describe what happened, add photos if you can, and tap Send report.', phone: scr('reportDetails') },
    ],
  },
  {
    id: 'payments-and-settings', track: 'clients', n: 8, group: 'Your account', title: 'Payments, notifications and settings',
    summary: 'Your payment history and your app settings.', intro: 'Here is where to find your payments, notifications and settings.',
    outro: 'That is your account, all in one place.', endLine: 'All set.',
    steps: [
      { headline: 'Open your profile', body: 'Tap Profile, then Payments.', say: 'Tap Profile, then Payments.', phone: scr('profile') },
      { headline: 'See every payment', body: 'Payments shows what you paid, what is on hold until a job is done, and any refunds.', say: 'Payments shows what you paid, what is on hold until a job is done, and any refunds.', phone: scr('payments') },
      { headline: 'Check notifications', body: 'Tap the bell to see bookings, proposals and job updates. Tap one to open it.', say: 'Tap the bell to see your bookings, proposals and job updates. Tap one to open it.', phone: scr('notifications') },
      { headline: 'Change your settings', body: 'In Settings, turn notifications or dark mode on or off, change your password, or delete your account.', say: 'In Settings, you can turn notifications or dark mode on or off, change your password, or delete your account.', phone: scr('settings') },
    ],
  },
  {
    id: 'provider-payout-account', track: 'providers', n: 3, group: 'Getting started', title: 'Link your payout account',
    summary: 'Where your pay goes.', intro: 'You need a payout account before you can send proposals. Here is how to link one.',
    outro: 'Done. Your pay will go straight to this account.', endLine: 'Payouts linked.', next: 'Your Feed and availability',
    steps: [
      { headline: 'Open Payout account', body: 'From your setup list, or from Profile, open Payout account.', say: 'From your setup list, or from Profile, open Payout account.', phone: scr('payoutOpen') },
      { headline: 'Choose and fill in', body: 'Pick GCash, Maya or Bank, then enter the account holder name and number.', say: 'Choose GCash, Maya or bank. Then enter the account holder name and the number.', phone: scr('payoutForm') },
      { headline: 'Payouts go here', body: 'Tap Save account. You can change or remove it any time.', say: 'Tap Save account. You can change or remove it at any time.', phone: scr('payoutSaved') },
    ],
  },
  {
    id: 'provider-your-feed', track: 'providers', n: 4, group: 'The main job', title: 'Your Feed and availability',
    summary: 'Find jobs near you and control when you get invites.', intro: 'Here is how your Feed works.',
    outro: 'Keep your availability on to get the most jobs.', endLine: 'Ready for work.', next: 'Send a proposal',
    steps: [
      { headline: 'Jobs near you', body: 'Your Feed lists open jobs near you. New ones show up at the top.', say: 'Your Feed lists open jobs near you. New ones show up at the top.', phone: scr('feedTour') },
      { headline: 'Search and filter', body: 'Search open jobs, or tap All, Urgent, Normal or Flexible.', say: 'Search for a job, or tap a filter like Urgent or Flexible.', phone: hp(300, 330), spot: { x: 18, y: 420, w: 375, h: 110, at: 6 } },
      { headline: 'Available for jobs', body: 'Turn it off when you are busy. While it is on, clients within 10 km can invite you.', say: 'Use Available for jobs to control invites. While it is on, clients within ten kilometres can invite you.', phone: scr('availability') },
    ],
  },
  {
    id: 'provider-decline-or-reschedule', track: 'providers', n: 7, group: 'When plans change', title: 'Decline a booking or change the time',
    summary: 'What to do when you cannot make it.', intro: "Here is what to do when you can't make a booking.",
    outro: 'The client is told right away.', endLine: 'Handled.', next: 'Get paid',
    steps: [
      { headline: 'Can’t make it?', body: 'On a booked job, tap “Can’t make it? Decline booking”.', say: "On a booked job, tap Can't make it? Decline booking.", phone: scr('bookedDecline'), spot: { x: 80, y: 874, w: 251, h: 26, at: 10 } },
      { headline: 'Choose a reason, then decline', body: 'Pick a reason, add a note if you want, and tap Decline Booking.', say: 'Pick a reason, add a note if you like, and tap Decline Booking.', phone: scr('decline') },
      { headline: 'Or ask for a new time', body: 'Tap the menu (⋮), then Change date or time.', say: 'Or, ask for a new time. Tap the menu, then Change date or time.', phone: scr('menuChangeP') },
      { headline: 'Send your request', body: 'Pick a new date and time, give a reason, and tap Send request.', say: 'Pick a new date and time, give a reason, and tap Send request.', phone: scr('changeSheetP') },
    ],
  },
  {
    id: 'provider-services-portfolio', track: 'providers', n: 9, group: 'Your account', title: 'Services, certificates and portfolio',
    summary: 'Add a service and show your past work.', intro: 'Here is how to add a service, and show your past work.',
    outro: 'A full profile helps clients choose you.', endLine: 'Profile complete.',
    steps: [
      { headline: 'Open My services', body: 'On Profile, tap My services.', say: 'On your profile, tap My services.', phone: scr('toServices') },
      { headline: 'Request another service', body: 'Choose Add another service, pick it, say why you’re qualified, and tap Send request.', say: "Choose Add another service, pick the service, say why you're qualified, and tap Send request.", phone: scr('services') },
      { headline: 'Wait for approval', body: 'An admin reviews it. Once approved, add a certificate for it in Certifications.', say: 'An admin reviews your request. Once it is approved, add a certificate for that service in Certifications.', phone: scr('underReview') },
      { headline: 'Add to your portfolio', body: 'Open Portfolio, add photos of past work and a short caption.', say: 'Open Portfolio, add photos of your past work, and a short caption.', phone: scr('portfolio') },
    ],
  },
];
