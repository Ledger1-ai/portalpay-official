import type { Metadata } from 'next';
import Link from 'next/link';
import { getBrandConfig } from '@/config/brands';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://surge.basalthq.com';

const FAQS = [
  {
    question: 'What is PortalPay?',
    answer:
      'PortalPay is a modern crypto payment gateway that lets businesses accept payments in stablecoins (USDC, USDT), ETH, and supported tokens via QR codes or onramp. It features unified billing, instant receipts, real-time analytics, and white-label branding at 0.5-1% per transaction with no monthly fees.',
  },
  {
    question: 'How are fees calculated?',
    answer:
      'PortalPay charges 0.5-1% per transaction depending on configuration. There are no monthly software fees. Compared to traditional processors that charge 2.9% + $0.30 and additional monthly costs, most merchants save 70%+ on processing.',
  },
  {
    question: 'Do I need a bank account to use PortalPay?',
    answer:
      'No. PortalPay supports settlement directly to your crypto wallet, making it suitable for merchants without bank accounts or in underbanked regions. Customers can still pay with cards through onramp, which automatically converts to crypto behind the scenes.',
  },
  {
    question: 'Can customers pay with cards, Apple Pay, or Google Pay?',
    answer:
      'Yes. Customers can use cards and popular wallets via onramp. Funds are converted to crypto and settled to your wallet while you maintain low processing fees and offer flexible payment options.',
  },
  {
    question: 'What tokens can I accept?',
    answer:
      'PortalPay supports USDC, USDT, ETH, and compatible tokens such as cbBTC and cbXRP where available. You can set default tokens and reserve ratios to auto-rotate based on preferred distribution.',
  },
  {
    question: 'How does QR code payment work?',
    answer:
      'Your POS prints QR codes on receipts. Customers scan the code to open a payment portal with their itemized receipt, connect a wallet or use onramp, and complete payment. You get instant confirmation and analytics.',
  },
  {
    question: 'Is PortalPay secure?',
    answer:
      'Yes. PortalPay uses secure SDKs, EIP-712 signing where applicable, and best-practice sanitization and validation. Structured receipts and real-time audit trails give visibility across transactions.',
  },
  {
    question: 'Does PortalPay support branding and white-label?',
    answer:
      'Yes. You can set theme colors, logos, favicon, and brand name. The live portal preview inherits your brand theme so customers see a consistent experience.',
  },
  {
    question: 'Do you offer analytics and reporting?',
    answer:
      'Yes. The admin dashboard provides transaction analytics, fee tracking, trends, and insights. You can monitor volume, value, savings, and more.',
  },
  {
    question: 'What industries do you support?',
    answer:
      'PortalPay supports restaurants, hotels, retail, salons, gyms, and dozens more. Industry landing pages explain benefits and use cases with cost calculators and setup checklists.',
  },
  {
    question: 'How do I get started?',
    answer:
      'Visit the Admin page to configure your business settings, set your reserve wallet, choose preferred tokens, and generate QR codes for receipts. Most merchants are live within minutes.',
  },
  {
    question: 'Where can I find developer documentation?',
    answer:
      'Developer documentation and public API references are being rolled out. In the meantime, contact support for integration guidance and examples.',
  },
];

export async function generateMetadata(): Promise<Metadata> {
  const brand = getBrandConfig();
  const title = `${brand.name} FAQ • Crypto Payments, 0.5-1% Fees, No Monthly Cost`;
  const description =
    `Answers to common questions about ${brand.name}: fees, tokens, onramp, QR codes, security, branding, analytics, and setup. Learn how to accept crypto and card payments with instant settlement.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/faq`,
      siteName: getBrandConfig().name,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    alternates: {
      canonical: `${BASE_URL}/faq`,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default function FAQPage() {
  const brand = getBrandConfig();
  const faqs = FAQS.map((f) => ({
    ...f,
    question: f.question.replaceAll('PortalPay', brand.name),
    answer: f.answer.replaceAll('PortalPay', brand.name),
  }));
  return (
    <div className="min-h-screen">
      {/* FAQPage Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqs.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: faq.answer,
              },
            })),
          }),
        }}
      />

      <div className="max-w-5xl mx-auto px-4 py-10">
        <nav className="text-sm mb-6 text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          {' / '}
          <span className="text-foreground">FAQ</span>
        </nav>

        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            {brand.name} Frequently Asked Questions
          </h1>
          <p className="mt-3 text-muted-foreground">
            Learn how {brand.name} helps you accept crypto and card payments with low fees,
            instant settlement, and powerful analytics.
          </p>
        </header>

        <section className="space-y-4">
          {faqs.map((faq, idx) => (
            <details key={idx} className="glass-pane rounded-lg border p-5">
              <summary className="font-semibold cursor-pointer hover:text-[var(--primary)]">
                {faq.question}
              </summary>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
            </details>
          ))}
        </section>

        <section className="mt-10 text-center">
          <Link
            href="/admin"
            className="px-6 py-3 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold hover:opacity-90 transition"
          >
            Get Started Free
          </Link>
        </section>
      </div>
    </div>
  );
}
