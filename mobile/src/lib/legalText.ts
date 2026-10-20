/**
 * The Terms & Conditions and Privacy Policy as shown in the app.
 *
 * TERMS_VERSION must match CURRENT_TERMS_VERSION in
 * backend/src/auth/terms.ts. Bump both when the terms change: every account
 * on an older version is asked to accept again.
 *
 * This text is a product draft. Have it reviewed by counsel before release:
 * Philippine law (RA 7394, the Consumer Act, and RA 11967, the Internet
 * Transactions Act) limits how far a platform can exclude liability.
 */
export const TERMS_VERSION = 3;
export const TERMS_UPDATED = 'October 17, 2026';

export type LegalSection = { heading?: string; body: string };
export type LegalDoc = { title: string; sections: LegalSection[]; acceptLabel: string };

export const TERMS_CONTENT: LegalDoc = {
  title: 'Terms & Conditions',
  sections: [
    {
      body: 'These Terms govern your use of TaskBuddy. By creating an account or continuing to use the platform, you agree to them. Please read Sections 4 to 7 carefully: they explain how payments are held and released, and that a released payment is final.',
    },
    {
      heading: '1. Nature of the platform',
      body: 'TaskBuddy is an online marketplace that connects clients with independent service providers. Service providers are not employees, agents, contractors or partners of TaskBuddy. Each engagement is a contract solely between the client and the service provider. TaskBuddy facilitates the booking, collects and holds payment through its payment processor, and provides a complaint process; it does not perform, direct, supervise, inspect or guarantee any service.',
    },
    {
      heading: '2. Accounts, verification and credentials',
      body: 'You must provide accurate information and keep your account secure. Service providers may verify their identity through Stripe Identity and may submit certificates such as TESDA National Certificates or PRC licences. A "Verified" or "Certified" badge only means a document was reviewed when it was submitted. It is not a representation, warranty or guarantee by TaskBuddy of a provider\'s identity at any later time, qualifications, skill, conduct or the quality of their work. Clients remain responsible for choosing a provider.',
    },
    {
      heading: '3. Pricing and urgency levels',
      body: 'When posting a job, the client sets a starting budget. Where a comparable local task and scope are available, TaskBuddy may show a suggested labor range as guidance; it is not the final price. Each provider submits a total quote, which may equal the starting budget or differ from it. Before hiring, the client sees the selected quote and provider payout, then accepts the quoted charge by choosing Hire and pay. The paid quote becomes the agreed job price. After hire, the price may change only through a change request accepted in the app by both parties.',
    },
    {
      heading: '4. Payment and holding of funds',
      body: 'The client pays the full agreed price when hiring a provider, through TaskBuddy\'s payment processor (Xendit). TaskBuddy does not keep a stored balance or issue any in-app currency. The payment is held for the job while the work is carried out and is not paid to the provider before the client confirms completion. TaskBuddy\'s service fee is deducted from the amount paid to the provider. The payment processor\'s own terms also apply.',
    },
    {
      heading: '5. Confirmation of completion and immediate release',
      body: 'When the client marks a job as complete, the client confirms that the service has been performed to their satisfaction and authorises TaskBuddy to release the payment. The payment is then released to the service provider immediately, with no holding or warranty period. Clients must inspect the work and raise any concern through "Report a problem" before marking the job complete. If a complaint is already open when the job is marked complete, the payment stays held until a TaskBuddy administrator resolves it under Section 7.',
    },
    {
      heading: '6. Finality of released payments and disclaimer',
      body: 'A released payment is final and irreversible. Once a payment has been released, TaskBuddy, its officers, administrators, employees and agents have no obligation to refund, reimburse, reverse, recover or compensate any amount, and accept no responsibility or liability for the quality, timeliness, safety, workmanship, legality or outcome of the service, or for any loss, damage, injury or cost arising from it. Any claim after release, including claims for defective or incomplete work, must be pursued directly between the client and the service provider. Where permitted by law, TaskBuddy may share the parties\' contact details for this purpose and will cooperate with lawful requests from the proper authorities.',
    },
    {
      heading: '7. Complaints and disputes before release',
      body: 'While a payment is still held, either party may raise a complaint with supporting statements and photo evidence. An open complaint prevents the payment from being released until a TaskBuddy administrator reviews it and decides whether the held amount is released to the provider, refunded to the client, or apportioned between them. The decision concerns only the held amount and is not a determination of any wider legal claim between the parties.',
    },
    {
      heading: '8. Cancellations and refunds',
      body: 'A job may be cancelled before work is completed. If the provider withdraws, the client is refunded in full. If the client cancels after hiring, the refund may require the provider\'s agreement or an administrator\'s decision. Refunds are returned to the original payment method. No refund is available once a payment has been released under Section 5.',
    },
    {
      heading: '9. Payments outside TaskBuddy',
      body: 'Payments made or received outside the platform are not covered by these Terms. TaskBuddy cannot hold, release, refund or review any amount that was not paid through the app.',
    },
    {
      heading: '10. Limitation of liability',
      body: 'To the fullest extent permitted by Philippine law, TaskBuddy\'s total liability arising from or relating to any job is limited to the service fee TaskBuddy received for that job, and TaskBuddy is not liable for any indirect, incidental, consequential or punitive damages. Nothing in these Terms excludes or limits any liability or consumer right that cannot be excluded or limited under applicable law, including the Consumer Act of the Philippines (RA 7394) and the Internet Transactions Act of 2023 (RA 11967).',
    },
    {
      heading: '11. Conduct',
      body: 'You must not post false jobs, reviews or evidence, harass other users, submit another person\'s documents, or use TaskBuddy for any unlawful purpose. TaskBuddy may suspend or close accounts that breach these Terms.',
    },
    {
      heading: '12. Changes to these Terms',
      body: 'When these Terms change, the app shows the new version and asks you to accept it before you continue. If you do not accept the new version, you may not continue to use TaskBuddy; you may contact support to close your account.',
    },
  ],
  acceptLabel: 'I agree to the Terms & Conditions',
};

export const PRIVACY_CONTENT: LegalDoc = {
  title: 'Privacy Policy',
  sections: [
    {
      heading: 'What We Collect',
      body: 'We collect the personal information you provide when creating an account (name, email, phone) and information generated through your use of the platform (job history, messages, location when sharing is enabled).',
    },
    {
      heading: 'How We Use Your Data',
      body: 'Your data is used to match clients with service providers, process payments, deliver notifications, and improve the TaskBuddy platform. We do not sell your personal information to third parties.',
    },
    {
      heading: 'Data Storage & Security',
      body: 'Data is stored securely using industry-standard encryption. Service provider identity documents and certificates are stored in private, access-controlled storage and are only visible to TaskBuddy administrators.',
    },
    {
      heading: 'Your Rights (RA 10173)',
      body: 'Under the Data Privacy Act of 2012, you have the right to access, correct, and request deletion of your personal data. Contact our Data Protection Officer at privacy@taskbuddy.ph.',
    },
    {
      heading: 'Retention',
      body: 'Account data is retained for the duration of your account and for up to 2 years after account closure for compliance purposes. Identity verification documents are deleted after the review is complete.',
    },
  ],
  acceptLabel: 'I agree to the Privacy Policy',
};
