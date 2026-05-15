export type FirstPartyTemplatePack = {
  id: string;
  label: string;
  match: RegExp[];
  requiredSections: string[];
  visualDirection: string;
  smokeSignals: string[];
};

export type FirstPartyTemplatePackFile = {
  name: string;
  path: string;
  content: string;
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

function extractVisibleHeading(prompt: string): string {
  const quotedHeading = prompt.match(/visible\s+heading\s+["“]([^"”]+)["”]/i)?.[1]?.trim();

  if (quotedHeading) {
    return quotedHeading;
  }

  return 'Clinic Appointment Studio';
}

function buildAppointmentSchedulerFiles(originalRequest: string): FirstPartyTemplatePackFile[] {
  const heading = extractVisibleHeading(originalRequest);

  return [
    {
      name: 'App.tsx',
      path: 'src/App.tsx',
      content: `import './App.css';

const doctors = ['Dr. Amina Patel', 'Dr. Lucas Meyer', 'Dr. Sofia Chen'];
const slots = ['09:00', '10:30', '13:00', '15:30'];

export default function App() {
  return (
    <main className="clinic-shell">
      <section className="hero">
        <p className="eyebrow">Doctor appointment scheduling</p>
        <h1>${heading}</h1>
        <p>
          Book patient visits, assign doctors, manage calendar slots, and configure SMTP reminder settings from one
          previewable clinic dashboard.
        </p>
        <div className="hero-actions">
          <a href="#booking">Book appointment</a>
          <a href="#reminders" className="secondary">Configure reminders</a>
        </div>
      </section>

      <section className="grid">
        <div className="panel" id="booking">
          <h2>Patient booking form</h2>
          <label>
            Patient name
            <input placeholder="Jane Patient" />
          </label>
          <label>
            Email
            <input placeholder="jane@example.com" />
          </label>
          <label>
            Doctor selection
            <select>
              {doctors.map((doctor) => (
                <option key={doctor}>{doctor}</option>
              ))}
            </select>
          </label>
          <button>Confirm appointment</button>
        </div>

        <div className="panel calendar">
          <h2>Calendar slots</h2>
          <div className="slot-grid">
            {slots.map((slot, index) => (
              <button key={slot} className={index === 1 ? 'selected' : ''}>
                <span>Today</span>
                {slot}
              </button>
            ))}
          </div>
          <p className="note">Next available reminder-ready appointment: today at 10:30 with Dr. Lucas Meyer.</p>
        </div>

        <div className="panel wide" id="reminders">
          <h2>SMTP reminder settings</h2>
          <div className="reminder-row">
            <span>Reminder sender</span>
            <strong>appointments@clinic.example</strong>
          </div>
          <div className="reminder-row">
            <span>Reminder timing</span>
            <strong>24 hours and 2 hours before visit</strong>
          </div>
          <div className="reminder-row">
            <span>Delivery state</span>
            <strong className="ready">Ready to send patient reminders</strong>
          </div>
        </div>
      </section>
    </main>
  );
}
`,
    },
    {
      name: 'App.css',
      path: 'src/App.css',
      content: `:root {
  color: #11211f;
  background: #eff7f2;
}

body {
  margin: 0;
}

.clinic-shell {
  min-height: 100vh;
  padding: clamp(24px, 5vw, 64px);
  background:
    radial-gradient(circle at top left, rgba(45, 212, 191, 0.26), transparent 34rem),
    linear-gradient(135deg, #f8fff9 0%, #e4f1ec 48%, #d8e8ff 100%);
  font-family:
    Avenir Next,
    Trebuchet MS,
    sans-serif;
}

.hero {
  max-width: 920px;
  padding: clamp(24px, 5vw, 56px);
  border: 1px solid rgba(19, 78, 74, 0.18);
  border-radius: 36px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 28px 80px rgba(15, 76, 92, 0.14);
}

.eyebrow {
  margin: 0 0 12px;
  color: #0f766e;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  max-width: 760px;
  color: #062f2b;
  font-size: clamp(42px, 8vw, 92px);
  line-height: 0.9;
}

.hero p {
  max-width: 680px;
  color: #31524e;
  font-size: 1.14rem;
  line-height: 1.7;
}

.hero-actions,
.slot-grid,
.reminder-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.hero-actions a,
button {
  border: 0;
  border-radius: 999px;
  background: #0f766e;
  color: white;
  cursor: pointer;
  font-weight: 800;
  padding: 13px 18px;
  text-decoration: none;
}

.hero-actions .secondary,
.slot-grid button {
  background: #dff6ee;
  color: #0b4f49;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-top: 24px;
}

.panel {
  border: 1px solid rgba(19, 78, 74, 0.18);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.86);
  padding: 24px;
  box-shadow: 0 20px 55px rgba(15, 76, 92, 0.11);
}

.wide {
  grid-column: 1 / -1;
}

label {
  display: grid;
  gap: 8px;
  margin: 14px 0;
  color: #284c47;
  font-weight: 750;
}

input,
select {
  border: 1px solid #b7d7d0;
  border-radius: 16px;
  color: #0f2f2b;
  font: inherit;
  padding: 13px 14px;
}

.slot-grid button {
  min-width: 110px;
  display: grid;
  gap: 4px;
}

.slot-grid .selected {
  background: #0f766e;
  color: #fff;
}

.note {
  margin-top: 18px;
  color: #46635f;
}

.reminder-row {
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #d6e8e3;
  padding: 16px 0;
}

.ready {
  color: #047857;
}

@media (max-width: 760px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
`,
    },
  ];
}

export function buildFirstPartyTemplatePackFiles(
  pack: FirstPartyTemplatePack | null,
  originalRequest: string,
): FirstPartyTemplatePackFile[] {
  if (!pack) {
    return [];
  }

  if (pack.id === 'appointment-scheduler') {
    return buildAppointmentSchedulerFiles(originalRequest);
  }

  return [];
}
