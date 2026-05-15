export type FirstPartyTemplatePack = {
  id: string;
  label: string;
  match: RegExp[];
  requiredSections: string[];
  visualDirection: string;
  smokeSignals: string[];
};

export const FIRST_PARTY_TEMPLATE_PACKS: FirstPartyTemplatePack[] = [
  {
    id: 'appointment-scheduler',
    label: 'Appointment Scheduler',
    match: [/\bappointment\b/i, /\bbooking\b/i, /\bschedule\b/i, /\bclinic\b/i, /\bdoctor\b/i],
    requiredSections: ['calendar or day-slot view', 'patient/contact details form', 'confirmation or upcoming list'],
    visualDirection: 'trustworthy healthcare operations with high-contrast form states and obvious next actions',
    smokeSignals: ['appointment', 'patient', 'schedule'],
  },
  {
    id: 'saas-dashboard',
    label: 'SaaS Dashboard',
    match: [/\bdashboard\b/i, /\banalytics\b/i, /\bmetrics\b/i, /\badmin\b/i, /\bcrm\b/i],
    requiredSections: ['KPI cards', 'recent activity or table view', 'primary action panel'],
    visualDirection: 'data-dense operator console with readable cards, tables, and resilient empty states',
    smokeSignals: ['dashboard', 'metrics', 'activity'],
  },
  {
    id: 'marketing-site',
    label: 'Marketing Website',
    match: [/\blanding\b/i, /\bmarketing\b/i, /\bwebsite\b/i, /\bagency\b/i, /\bhomepage\b/i],
    requiredSections: ['hero with conversion CTA', 'proof or feature section', 'contact or signup action'],
    visualDirection: 'high-converting brand page with bold hierarchy, proof points, and mobile-first CTAs',
    smokeSignals: ['features', 'contact', 'get started'],
  },
  {
    id: 'commerce-catalog',
    label: 'Commerce Catalog',
    match: [/\becommerce\b/i, /\bshop\b/i, /\bstore\b/i, /\bproduct\b/i, /\bcatalog\b/i],
    requiredSections: ['product grid', 'cart or checkout summary', 'filter or category controls'],
    visualDirection: 'premium storefront with product-first cards, price clarity, and strong purchase affordances',
    smokeSignals: ['product', 'cart', 'checkout'],
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    match: [/\bportfolio\b/i, /\bresume\b/i, /\bcv\b/i, /\bcase stud/i],
    requiredSections: ['profile hero', 'project/case-study cards', 'contact links'],
    visualDirection: 'distinct personal brand with credible project storytelling and accessible navigation',
    smokeSignals: ['projects', 'contact', 'about'],
  },
];

export function selectFirstPartyTemplatePack(prompt: string): FirstPartyTemplatePack | null {
  const normalizedPrompt = String(prompt || '').trim();

  if (!normalizedPrompt) {
    return null;
  }

  return (
    FIRST_PARTY_TEMPLATE_PACKS.find((pack) => pack.match.some((pattern) => pattern.test(normalizedPrompt))) || null
  );
}

export function buildFirstPartyTemplatePackInstructions(pack: FirstPartyTemplatePack | null): string {
  if (!pack) {
    return '';
  }

  return `FIRST-PARTY TEMPLATE PACK: ${pack.label}
Use this pack as the acceptance checklist for the generated app.
Required sections:
${pack.requiredSections.map((section) => `- ${section}`).join('\n')}
Visual direction: ${pack.visualDirection}.
Preview smoke signals that must be visible in the app: ${pack.smokeSignals.join(', ')}.
Do not finish until the Preview shows these signals instead of a generic starter.
---
`;
}
