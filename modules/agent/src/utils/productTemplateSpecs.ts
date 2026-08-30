export type ProductTemplateSpec = {
  fallbackHeading: string;
  eyebrow: string;
  intro: string;
  nav: string[];
  primaryAction: string;
  secondaryAction: string;
  filters: string[];
  metrics: Array<{ label: string; value: string; note: string }>;
  sectionKicker: string;
  sectionTitle: string;
  cards: Array<{ category: string; title: string; meta: string; description: string }>;
  panelTitle: string;
  panelCopy: string;
  panelAction: string;
  footer: string;
};

export const PRODUCT_TEMPLATE_SPECS: Record<string, ProductTemplateSpec> = {
  'saas-dashboard': {
    fallbackHeading: 'Northstar SaaS Dashboard',
    eyebrow: 'Operations workspace',
    intro: 'Turn live metrics, customer signals, and recent activity into one clear operating rhythm.',
    nav: ['Dashboard', 'Metrics', 'Activity'],
    primaryAction: 'Create report',
    secondaryAction: 'Invite team',
    filters: ['All', 'Growth', 'Revenue', 'Reliability'],
    metrics: [
      { label: 'Monthly revenue', value: '$84.2K', note: '+12.8% this month' },
      { label: 'Active accounts', value: '2,418', note: '184 upgraded' },
      { label: 'Platform uptime', value: '99.98%', note: 'All systems normal' },
    ],
    sectionKicker: 'Live workspace',
    sectionTitle: 'Recent activity',
    cards: [
      {
        category: 'Growth',
        title: 'Trial conversion climbed',
        meta: '18 minutes ago',
        description: 'Onboarding completion improved after the latest guided setup release.',
      },
      {
        category: 'Revenue',
        title: 'Enterprise renewal confirmed',
        meta: '42 minutes ago',
        description: 'Annual expansion adds twelve seats and advanced audit exports.',
      },
      {
        category: 'Reliability',
        title: 'API latency recovered',
        meta: '1 hour ago',
        description: 'The automated rollback restored p95 latency below the service objective.',
      },
    ],
    panelTitle: 'Ready for the next decision?',
    panelCopy: 'Generate a concise operator report from the metrics and activity visible on this dashboard.',
    panelAction: 'Build operator report',
    footer: 'Northstar workspace',
  },
  'marketing-site': {
    fallbackHeading: 'Make your next website impossible to ignore',
    eyebrow: 'Independent creative studio',
    intro: 'Strategy, identity, and digital experiences designed to turn attention into measurable growth.',
    nav: ['Features', 'Proof', 'Contact'],
    primaryAction: 'Get started',
    secondaryAction: 'View our work',
    filters: ['All', 'Strategy', 'Design', 'Launch'],
    metrics: [
      { label: 'Average conversion lift', value: '38%', note: 'Across recent launches' },
      { label: 'Products shipped', value: '126', note: 'In eleven markets' },
      { label: 'Client recommendation', value: '96%', note: 'Verified project feedback' },
    ],
    sectionKicker: 'Features built to convert',
    sectionTitle: 'From first impression to loyal customer',
    cards: [
      {
        category: 'Strategy',
        title: 'A sharper market position',
        meta: 'Research and narrative',
        description: 'We isolate the reason buyers should choose you and make it obvious on every screen.',
      },
      {
        category: 'Design',
        title: 'A brand people remember',
        meta: 'Identity and product design',
        description: 'Distinct visual systems carry your story from campaigns into the product itself.',
      },
      {
        category: 'Launch',
        title: 'A launch that compounds',
        meta: 'Build and optimization',
        description: 'Fast production, useful analytics, and continuous experiments protect momentum.',
      },
    ],
    panelTitle: 'Have a launch in mind?',
    panelCopy:
      'Tell us what must change for your customers and receive a focused project outline within two working days.',
    panelAction: 'Contact the studio',
    footer: 'Fieldwork Studio',
  },
  'commerce-catalog': {
    fallbackHeading: 'Field and Form Product Catalog',
    eyebrow: 'Objects for considered living',
    intro: 'A tightly edited store of durable tools, warm materials, and products made to earn their place.',
    nav: ['Product', 'Catalog', 'Cart'],
    primaryAction: 'Shop new arrivals',
    secondaryAction: 'View collection',
    filters: ['All', 'Home', 'Desk', 'Travel'],
    metrics: [
      { label: 'Complimentary delivery', value: '$75+', note: 'Tracked carbon-neutral shipping' },
      { label: 'Returns', value: '30 days', note: 'Simple prepaid returns' },
      { label: 'Catalog rating', value: '4.9/5', note: 'From verified customers' },
    ],
    sectionKicker: 'Product collection',
    sectionTitle: 'Useful things, selected slowly',
    cards: [
      {
        category: 'Home',
        title: 'Ripple carafe',
        meta: '$68',
        description: 'Hand-finished recycled glass with a balanced silhouette and soft fluted grip.',
      },
      {
        category: 'Desk',
        title: 'Arc task light',
        meta: '$142',
        description: 'Warm dimmable light, tactile controls, and a compact weighted base.',
      },
      {
        category: 'Travel',
        title: 'Weekender carry',
        meta: '$118',
        description: 'Weather-resistant canvas with a structured opening and repairable hardware.',
      },
    ],
    panelTitle: 'Your cart is ready',
    panelCopy: 'Review selected products, confirm delivery, and complete a secure checkout when you are ready.',
    panelAction: 'Continue to checkout',
    footer: 'Field and Form market',
  },
  portfolio: {
    fallbackHeading: 'Mara Vale Product Portfolio',
    eyebrow: 'Independent product designer',
    intro:
      'I turn complex systems into calm, credible products through research, prototypes, and close engineering partnership.',
    nav: ['About', 'Projects', 'Contact'],
    primaryAction: 'Explore projects',
    secondaryAction: 'Download profile',
    filters: ['All', 'Product', 'Research', 'Systems'],
    metrics: [
      { label: 'Products launched', value: '24', note: 'Web, mobile, and platform' },
      { label: 'Design experience', value: '9 years', note: 'From zero to scale' },
      { label: 'Recent impact', value: '+31%', note: 'Average activation lift' },
    ],
    sectionKicker: 'Selected projects',
    sectionTitle: 'Case studies with the decisions left in',
    cards: [
      {
        category: 'Product',
        title: 'A clearer path through healthcare',
        meta: 'Patient platform',
        description: 'Reframed a fragmented booking journey into one accessible, confidence-building flow.',
      },
      {
        category: 'Research',
        title: 'Making risk visible',
        meta: 'Climate intelligence',
        description: 'Turned specialist models into scenarios that operators could compare and act on.',
      },
      {
        category: 'Systems',
        title: 'One language for a growing team',
        meta: 'Design system',
        description: 'Built shared primitives and governance that reduced product delivery time.',
      },
    ],
    panelTitle: 'Let us make the difficult thing feel simple',
    panelCopy: 'I am available for product strategy, interface design, and embedded design leadership.',
    panelAction: 'Contact Mara',
    footer: 'Mara Vale portfolio',
  },
};
