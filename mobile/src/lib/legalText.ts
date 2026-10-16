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
export const TERMS_VERSION = 2;
export const TERMS_UPDATED = 'October 16, 2026';

export type LegalSection = { heading: string; body: string };
export type LegalDoc = { title: string; sections: LegalSection[]; acceptLabel: string };

export const TERMS_CONTENT: LegalDoc = {
  title: 'Terms & Conditions',
  sections: [
    {
      heading: `TaskBuddy Terms of Use (version ${TERMS_VERSION}, ${TERMS_UPDATED})`,
      body: 'By creating an account or continuing to use TaskBuddy, you agree to these terms. Please read the sections on pricing, payment and payment release carefully: they explain when your money moves and what TaskBuddy can and cannot do once it has.',
    },
    {
      heading: '1. What TaskBuddy is',
      body: 'TaskBuddy is a marketplace that connects clients with independent service providers. Providers are not employees, agents or partners of TaskBuddy. When a client hires a provider, the agreement for the service is between the client and the provider. TaskBuddy facilitates the booking, holds the payment and offers a dispute process, but does not perform, supervise or guarantee the service.',
    },
    {
      heading: '2. Accounts, verification and credentials',
      body: 'You must give accurate information and keep your account secure. Providers may verify their identity through Stripe Identity and may upload certificates such as TESDA National Certificates or PRC licences. A verified or certified badge means a document was checked when it was submitted. It is not a guarantee of the provider\'s skill, conduct or the quality of their work.',
    },
    {
      heading: '3. Pricing and urgency levels',
      body: 'Clients do not set a price by hand. When posting a job, TaskBuddy estimates prices from the service, the tasks listed and how demanding they are, and the urgency level, and the client picks one of the offered prices. Urgent jobs cost more than Normal jobs, and Flexible jobs cost less, because urgency changes how fast providers must respond. The price picked is the agreed price for the job. It changes only if both client and provider accept a change request in the app.',
    },
    {
      heading: '4. Payment and holding of funds',
      body: 'The client pays the full agreed price when hiring a provider. The payment is processed by TaskBuddy\'s payment partners and held until it is released or refunded as described below. The provider is not paid while the job is in progress. TaskBuddy deducts its service commission from the provider\'s payout. Payment partners\' own terms also apply.',
    },
    {
      heading: '5. Release of payment',
      body: 'After the client marks the job complete, a 3-day warranty period starts. The payment is released to the provider when (a) the client chooses to release it early, or (b) the warranty period ends with no complaint open. A provider may ask the client to release early; the client may decline. Clients should inspect the work and raise any complaint in the app before the payment is released.',
    },
    {
      heading: '6. After payment is released',
      body: 'Once a payment has been released to the provider, by the client or automatically at the end of the warranty period, it is final. TaskBuddy, its administrators and staff are not responsible for the quality, workmanship, safety or results of the service, or for any loss or damage it causes, and will not refund, reimburse or reverse a released payment. Any claim about the service after release is between the client and the provider. Where the law allows, TaskBuddy may share the provider\'s contact details with the client and will cooperate with the proper authorities.',
    },
    {
      heading: '7. Complaints and disputes before release',
      body: 'While the payment is still held, either party can open a complaint with evidence. An administrator reviews it and decides whether the held amount is released to the provider, refunded to the client, or split. That decision covers only the held amount and is not a ruling on any wider legal claim.',
    },
    {
      heading: '8. Cancellations and refunds',
      body: 'A job can be cancelled before work starts. If the provider backs out, the client is refunded in full. If the client cancels after hiring, the refund may need the provider\'s agreement or an administrator\'s decision. Refunds go back through the original payment method.',
    },
    {
      heading: '9. Payments outside TaskBuddy',
      body: 'Paying or being paid outside the app is not covered by these terms. TaskBuddy cannot hold, release, refund or review money that did not go through the app.',
    },
    {
      heading: '10. Limitation of liability',
      body: 'To the extent allowed by Philippine law, TaskBuddy\'s total liability for any job is limited to the service commission it earned on that job. Nothing in these terms removes rights that cannot be waived under Philippine law, including the Consumer Act (RA 7394) and the Internet Transactions Act (RA 11967).',
    },
    {
      heading: '11. Conduct',
      body: 'Do not post false jobs or reviews, harass other users, share someone else\'s documents, or use TaskBuddy for anything unlawful. TaskBuddy may suspend accounts that break these rules.',
    },
    {
      heading: '12. Changes to these terms',
      body: 'When these terms change, the app shows the new version and asks you to accept it before you continue. If you do not accept the new version, you cannot keep using TaskBuddy; contact support to close your account.',
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
