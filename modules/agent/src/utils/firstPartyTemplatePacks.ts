import { PRODUCT_TEMPLATE_SPECS } from './productTemplateSpecs';

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
    id: 'calendar-planner',
    label: 'Calendar Planner',
    match: [/\bgoogle\s+calendar\b/i, /\bcalendar\b/i, /\bplanner\b/i, /\bevents?\b/i, /\bmeeting\b/i],
    requiredSections: ['week calendar grid', 'event list or agenda', 'create event affordance'],
    visualDirection:
      'polished productivity calendar with Google Calendar-inspired structure, clear dates, and roomy event cards',
    smokeSignals: ['calendar', 'agenda', 'create event'],
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

  let selected: FirstPartyTemplatePack | null = null;
  let selectedScore = 0;

  for (const pack of FIRST_PARTY_TEMPLATE_PACKS) {
    const score = pack.match.reduce(
      (total, pattern, index) => total + (pattern.test(normalizedPrompt) ? (index === 0 ? 2 : 1) : 0),
      0,
    );

    if (score > selectedScore) {
      selected = pack;
      selectedScore = score;
    }
  }

  return selected;
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

const DEFAULT_APPOINTMENT_HEADING = 'Clinic Appointment Studio';
const DEFAULT_CALENDAR_HEADING = 'Calendar Command Center';

function extractVisibleHeading(prompt: string, fallback = DEFAULT_APPOINTMENT_HEADING): string {
  const patterns = [
    /visible\s+heading\s+["“]([^"”]+)["”]/i,
    /visible\s+heading\b[^"“”]*(?:contains?|include|with|exact\s+text|exactly)\b[^"“”]*["“]([^"”]+)["”]/i,
    /exact\s+(?:visible\s+)?(?:heading\s+)?text\s+["“]([^"”]+)["”]/i,
    /(?:visible\s+text|heading)\b[^"“”]*["“]([^"”]+)["”]/i,
  ];

  for (const pattern of patterns) {
    const quotedHeading = prompt.match(pattern)?.[1]?.trim();

    if (quotedHeading) {
      return quotedHeading;
    }
  }

  return fallback;
}

function buildAppointmentSchedulerFiles(originalRequest: string): FirstPartyTemplatePackFile[] {
  const heading = extractVisibleHeading(originalRequest);

  return [
    {
      name: 'App.tsx',
      path: 'src/App.tsx',
      content: `import './App.css';

const pageHeading = ${JSON.stringify(heading)};

const doctors = ['Dr. Amina Patel', 'Dr. Lucas Meyer', 'Dr. Sofia Chen'];
const slots = ['09:00', '10:30', '13:00', '15:30'];

export default function App() {
  return (
    <main className="clinic-shell">
      <section className="hero">
        <p className="eyebrow">Doctor appointment scheduling</p>
        <h1>{pageHeading}</h1>
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
          <h2>Schedule patient visits</h2>
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

function buildCalendarPlannerFiles(originalRequest: string): FirstPartyTemplatePackFile[] {
  const displayHeading = extractVisibleHeading(originalRequest, DEFAULT_CALENDAR_HEADING);

  return [
    {
      name: 'App.tsx',
      path: 'src/App.tsx',
      content: `import { useState } from 'react';
import './App.css';

const pageHeading = ${JSON.stringify(displayHeading)};
const days = ['Mon 24', 'Tue 25', 'Wed 26', 'Thu 27', 'Fri 28', 'Sat 29', 'Sun 30'];
const hours = ['8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM'];
const calendars = ['Personal', 'Team', 'Launch', 'Focus'];
const events = [
  { day: 'Mon 24', time: '9 AM', title: 'Design sync', calendar: 'Team', span: 2 },
  { day: 'Tue 25', time: '11 AM', title: 'Content review', calendar: 'Launch', span: 1 },
  { day: 'Wed 26', time: '1 PM', title: 'Deep work block', calendar: 'Focus', span: 2 },
  { day: 'Thu 27', time: '10 AM', title: 'Partner demo', calendar: 'Team', span: 1 },
  { day: 'Fri 28', time: '2 PM', title: 'Weekly planning', calendar: 'Personal', span: 2 },
];

export default function App() {
  const [selectedDay, setSelectedDay] = useState(days[2]);

  const selectedEvents = events.filter((event) => event.day === selectedDay);

  return (
    <main className="calendar-shell">
      <aside className="sidebar">
        <button className="create-button">+ Create event</button>
        <section className="mini-card">
          <p className="eyebrow">June 2026</p>
          <div className="mini-grid">
            {Array.from({ length: 35 }, (_, index) => (
              <button
                key={index}
                className={index === 16 ? 'today' : index === 18 ? 'selected' : ''}
                aria-label={String(index + 1)}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </section>
        <section className="calendar-list">
          <p className="eyebrow">My calendars</p>
          {calendars.map((calendar) => (
            <label key={calendar}>
              <input type="checkbox" defaultChecked />
              <span>{calendar}</span>
            </label>
          ))}
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Google Calendar style planner</p>
            <h1>{pageHeading}</h1>
          </div>
          <div className="topbar-actions">
            <button>Today</button>
            <button className="ghost">Week</button>
          </div>
        </header>

        <nav className="day-strip" aria-label="Week days">
          {days.map((day) => (
            <button key={day} className={day === selectedDay ? 'active' : ''} onClick={() => setSelectedDay(day)}>
              <span>{day.split(' ')[0]}</span>
              <strong>{day.split(' ')[1]}</strong>
            </button>
          ))}
        </nav>

        <div className="calendar-board">
          <div className="time-column">
            {hours.map((hour) => (
              <span key={hour}>{hour}</span>
            ))}
          </div>
          <div className="grid-column">
            {hours.map((hour) => (
              <div key={hour} className="time-row" />
            ))}
            {events.map((event, index) => (
              <article
                key={event.title}
                className={event.day === selectedDay ? 'event-card selected-event' : 'event-card'}
                style={{
                  top: String(hours.indexOf(event.time) * 68 + 12) + 'px',
                  height: String(event.span * 58) + 'px',
                  left: String((index % 5) * 17 + 2) + '%',
                }}
              >
                <strong>{event.title}</strong>
                <span>{event.time} - {event.calendar}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <aside className="agenda-panel">
        <p className="eyebrow">Agenda</p>
        <h2>{selectedDay}</h2>
        {selectedEvents.length > 0 ? (
          selectedEvents.map((event) => (
            <article key={event.title} className="agenda-item">
              <span>{event.time}</span>
              <strong>{event.title}</strong>
              <p>{event.calendar} calendar</p>
            </article>
          ))
        ) : (
          <article className="agenda-item empty">
            <strong>No meetings yet</strong>
            <p>Use Create event to add a focused block or team meeting.</p>
          </article>
        )}
      </aside>
    </main>
  );
}
`,
    },
    {
      name: 'App.css',
      path: 'src/App.css',
      content: `:root {
  color: #18212f;
  background: #f5f7fb;
  font-family:
    Avenir Next,
    Trebuchet MS,
    sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

button,
input {
  font: inherit;
}

.calendar-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 320px;
  gap: 18px;
  padding: 18px;
  background:
    radial-gradient(circle at top left, rgba(66, 133, 244, 0.18), transparent 32rem),
    linear-gradient(135deg, #ffffff 0%, #eef3ff 52%, #f6fff9 100%);
}

.sidebar,
.workspace,
.agenda-panel {
  border: 1px solid rgba(42, 58, 82, 0.12);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 24px 70px rgba(35, 48, 73, 0.12);
}

.sidebar,
.agenda-panel {
  padding: 18px;
}

.create-button,
.topbar-actions button {
  width: 100%;
  border: 0;
  border-radius: 999px;
  background: #1a73e8;
  color: white;
  cursor: pointer;
  font-weight: 800;
  padding: 13px 16px;
}

.mini-card,
.calendar-list,
.agenda-item {
  margin-top: 18px;
  border-radius: 22px;
  background: #f7faff;
  padding: 16px;
}

.eyebrow {
  margin: 0 0 10px;
  color: #526179;
  font-size: 0.73rem;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.mini-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}

.mini-grid button {
  aspect-ratio: 1;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #344052;
  cursor: pointer;
}

.mini-grid .today {
  background: #e8f0fe;
  color: #1a73e8;
  font-weight: 900;
}

.mini-grid .selected {
  background: #1a73e8;
  color: white;
}

.calendar-list label {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 12px 0;
  color: #344052;
  font-weight: 750;
}

.workspace {
  min-width: 0;
  overflow: hidden;
}

.topbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  padding: 22px 24px 14px;
  border-bottom: 1px solid #e5ebf5;
}

h1,
h2 {
  margin: 0;
  color: #18212f;
}

h1 {
  font-size: clamp(2rem, 5vw, 4.8rem);
  line-height: 0.95;
}

.topbar-actions {
  display: flex;
  gap: 10px;
}

.topbar-actions button {
  width: auto;
  padding-inline: 18px;
}

.topbar-actions .ghost {
  background: #eef3ff;
  color: #1a73e8;
}

.day-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #e5ebf5;
}

.day-strip button {
  display: grid;
  gap: 4px;
  border: 1px solid transparent;
  border-radius: 18px;
  background: transparent;
  color: #526179;
  cursor: pointer;
  padding: 10px;
}

.day-strip strong {
  color: #18212f;
  font-size: 1.3rem;
}

.day-strip .active {
  border-color: #bfd4ff;
  background: #e8f0fe;
}

.calendar-board {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  min-height: 620px;
  padding: 14px 16px 24px;
}

.time-column {
  display: grid;
  grid-template-rows: repeat(9, 1fr);
  color: #7d8a9e;
  font-size: 0.78rem;
}

.grid-column {
  position: relative;
  display: grid;
  grid-template-rows: repeat(9, 1fr);
  border-left: 1px solid #e5ebf5;
}

.time-row {
  border-top: 1px solid #e5ebf5;
}

.event-card {
  position: absolute;
  width: 28%;
  min-width: 145px;
  display: grid;
  align-content: start;
  gap: 6px;
  border-left: 5px solid #34a853;
  border-radius: 16px;
  background: #e6f4ea;
  color: #173b22;
  padding: 12px;
  box-shadow: 0 10px 24px rgba(52, 168, 83, 0.14);
}

.selected-event {
  border-color: #1a73e8;
  background: #e8f0fe;
  color: #12366d;
}

.event-card span,
.agenda-item p,
.agenda-item span {
  color: #526179;
}

.agenda-panel h2 {
  font-size: 2rem;
}

.agenda-item {
  display: grid;
  gap: 6px;
}

.agenda-item.empty {
  border: 1px dashed #cbd6e8;
}

@media (max-width: 1180px) {
  .calendar-shell {
    grid-template-columns: 230px minmax(0, 1fr);
  }

  .agenda-panel {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .calendar-shell {
    grid-template-columns: 1fr;
    padding: 10px;
  }

  .topbar,
  .topbar-actions {
    flex-direction: column;
  }

  .day-strip {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .calendar-board {
    min-height: 520px;
  }

  .event-card {
    width: 72%;
    left: 12px !important;
  }
}
`,
    },
  ];
}

function buildProductTemplateFiles(packId: string, originalRequest: string): FirstPartyTemplatePackFile[] {
  const spec = PRODUCT_TEMPLATE_SPECS[packId];

  if (!spec) {
    return [];
  }

  const heading = extractVisibleHeading(originalRequest, spec.fallbackHeading);

  return [
    {
      name: 'App.tsx',
      path: 'src/App.tsx',
      content: `import { useState } from 'react';
import './App.css';

const pageHeading = ${JSON.stringify(heading)};
const pack = ${JSON.stringify(spec, null, 2)};

export default function App() {
  const [activeFilter, setActiveFilter] = useState('All');
  const visibleCards = activeFilter === 'All' ? pack.cards : pack.cards.filter((card) => card.category === activeFilter);

  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="wordmark" href="#top">B/G</a>
        <nav aria-label="Primary navigation">
          {pack.nav.map((item) => <a key={item} href={'#' + item.toLowerCase().replaceAll(' ', '-')}>{item}</a>)}
        </nav>
        <button className="header-action" type="button">{pack.primaryAction}</button>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">{pack.eyebrow}</p>
          <h1>{pageHeading}</h1>
          <p className="hero-copy">{pack.intro}</p>
          <div className="hero-actions">
            <button className="primary" type="button">{pack.primaryAction}</button>
            <button className="secondary" type="button">{pack.secondaryAction}</button>
          </div>
        </div>
        <aside className="signal-card" aria-label="Project signal">
          <span>Live signal</span>
          <strong>{pack.metrics[0].value}</strong>
          <p>{pack.metrics[0].note}</p>
          <div className="signal-line" />
        </aside>
      </section>

      <section className="metrics" aria-label="Key metrics">
        {pack.metrics.map((metric, index) => (
          <article key={metric.label}>
            <span>0{index + 1}</span>
            <p>{metric.label}</p>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </article>
        ))}
      </section>

      <section className="collection" id={pack.nav[1]?.toLowerCase() || 'collection'}>
        <div className="section-heading">
          <div><p className="eyebrow">{pack.sectionKicker}</p><h2>{pack.sectionTitle}</h2></div>
          <div className="filters" aria-label="Filter collection">
            {pack.filters.map((filter) => (
              <button type="button" key={filter} className={activeFilter === filter ? 'active' : ''} onClick={() => setActiveFilter(filter)}>{filter}</button>
            ))}
          </div>
        </div>
        <div className="card-grid">
          {visibleCards.map((card, index) => (
            <article className="feature-card" key={card.title}>
              <div className={'card-art art-' + index}><span>{card.category}</span></div>
              <div className="card-content"><small>{card.meta}</small><h3>{card.title}</h3><p>{card.description}</p><button type="button">View details <span aria-hidden="true">-&gt;</span></button></div>
            </article>
          ))}
        </div>
      </section>

      <section className="action-panel" id={pack.nav.at(-1)?.toLowerCase() || 'contact'}>
        <div><p className="eyebrow">Next step</p><h2>{pack.panelTitle}</h2><p>{pack.panelCopy}</p></div>
        <button className="primary light" type="button">{pack.panelAction}</button>
      </section>

      <footer><strong>{pack.footer}</strong><span>Built with a deterministic first-party Preview pack.</span></footer>
    </main>
  );
}
`,
    },
    {
      name: 'App.css',
      path: 'src/App.css',
      content: `:root{font-family:"Trebuchet MS",Verdana,sans-serif;color:#17332d;background:#f5f0e6}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;min-width:320px;background:#f5f0e6}button,a{font:inherit}.site-shell{min-height:100vh;overflow:hidden;background:radial-gradient(circle at 82% 8%,#f3a56f55,transparent 27rem),linear-gradient(180deg,#fffaf0 0,#f3eddf 72%,#e7dfce 100%)}.site-header{min-height:76px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:28px;padding:16px clamp(20px,5vw,72px);border-bottom:1px solid #17332d24}.wordmark{width:44px;height:44px;display:grid;place-items:center;border-radius:50%;background:#17332d;color:#fff;text-decoration:none;font-weight:900}.site-header nav{display:flex;gap:30px}.site-header nav a{color:#38564f;text-decoration:none;font-size:14px;font-weight:700}.header-action{justify-self:end;border:1px solid #17332d;border-radius:999px;background:transparent;color:#17332d;padding:10px 18px;font-weight:800}.hero{max-width:1400px;margin:auto;min-height:590px;padding:clamp(60px,9vw,130px) clamp(20px,7vw,104px);display:grid;grid-template-columns:minmax(0,1.5fr) minmax(260px,.6fr);align-items:center;gap:9vw}.eyebrow{margin:0 0 14px;color:#b54c2f;font-size:12px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.hero h1,.section-heading h2,.action-panel h2{font-family:Georgia,serif;font-weight:500;letter-spacing:-.055em}.hero h1{max-width:900px;margin:0;font-size:clamp(48px,7.6vw,118px);line-height:.88}.hero-copy{max-width:690px;margin:28px 0;color:#52665f;font-size:clamp(17px,2vw,22px);line-height:1.6}.hero-actions{display:flex;flex-wrap:wrap;gap:12px}.primary,.secondary{border-radius:999px;padding:14px 22px;font-weight:900;cursor:pointer}.primary{border:1px solid #17332d;background:#17332d;color:#fff}.secondary{border:1px solid #17332d55;background:#fff9;color:#17332d}.signal-card{position:relative;min-height:310px;padding:32px;border-radius:180px 180px 24px 24px;background:#ef875a;color:#301f18;display:flex;flex-direction:column;justify-content:flex-end;box-shadow:0 30px 70px #8f4e3030}.signal-card span{position:absolute;top:34px;left:50%;transform:translateX(-50%);font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.signal-card strong{font:500 clamp(50px,7vw,94px)/1 Georgia,serif}.signal-card p{margin:8px 0 20px}.signal-line{height:54px;border-top:3px solid #301f18;border-radius:50%}.metrics{max-width:1250px;margin:0 auto 100px;padding:0 28px;display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#17332d35;border:1px solid #17332d35}.metrics article{min-height:190px;padding:24px;background:#fbf7ed;display:flex;flex-direction:column}.metrics article>span{font-size:11px;font-weight:900;color:#b54c2f}.metrics p{margin:20px 0 5px;color:#52665f}.metrics strong{font:500 clamp(32px,4vw,54px)/1 Georgia,serif}.metrics small{margin-top:auto;color:#62756f}.collection{max-width:1250px;margin:auto;padding:0 28px 110px}.section-heading{display:flex;align-items:end;justify-content:space-between;gap:30px;margin-bottom:34px}.section-heading h2,.action-panel h2{max-width:720px;margin:0;font-size:clamp(36px,5vw,68px);line-height:.98}.filters{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:7px}.filters button{border:1px solid #17332d38;background:transparent;border-radius:999px;padding:9px 14px;color:#38564f;cursor:pointer}.filters button.active{background:#17332d;color:#fff}.card-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.feature-card{overflow:hidden;border:1px solid #17332d25;border-radius:22px;background:#fffaf2;box-shadow:0 18px 40px #52665f12}.card-art{height:190px;padding:18px;display:flex;align-items:flex-start;background:linear-gradient(145deg,#ed8d62,#e8bd78)}.art-1{background:linear-gradient(145deg,#89a98b,#d8d19b)}.art-2{background:linear-gradient(145deg,#799ca3,#d9b9a4)}.card-art span{border-radius:999px;background:#fffbe8;padding:7px 11px;font-size:11px;font-weight:900;text-transform:uppercase}.card-content{padding:24px}.card-content small{color:#b54c2f;font-weight:800}.card-content h3{margin:10px 0;font:500 29px/1.05 Georgia,serif}.card-content p{min-height:76px;color:#60716c;line-height:1.55}.card-content button{border:0;background:transparent;padding:0;color:#17332d;font-weight:900;cursor:pointer}.action-panel{max-width:1194px;margin:0 auto 80px;border-radius:34px;background:#17332d;color:#fdf7e9;padding:clamp(30px,6vw,70px);display:flex;align-items:end;justify-content:space-between;gap:40px}.action-panel .eyebrow{color:#f3a56f}.action-panel p:not(.eyebrow){max-width:680px;color:#c8d5d0;line-height:1.6}.primary.light{flex:0 0 auto;border-color:#fff4df;background:#fff4df;color:#17332d}footer{padding:30px clamp(20px,7vw,104px);display:flex;justify-content:space-between;gap:20px;border-top:1px solid #17332d24;color:#52665f}button:focus-visible,a:focus-visible{outline:3px solid #e66f46;outline-offset:3px}@media(max-width:860px){.site-header{grid-template-columns:1fr auto}.site-header nav{display:none}.hero{grid-template-columns:1fr;min-height:auto}.signal-card{min-height:250px;border-radius:24px}.metrics,.card-grid{grid-template-columns:1fr}.section-heading,.action-panel{align-items:flex-start;flex-direction:column}.filters{justify-content:flex-start}.metrics article{min-height:150px}.card-content p{min-height:0}}@media(max-width:520px){.site-header{padding:12px 16px}.header-action{padding:9px 12px}.hero{padding:54px 20px}.collection{padding-left:20px;padding-right:20px}.hero-actions{align-items:stretch;flex-direction:column}.hero-actions button{width:100%}footer{flex-direction:column}}
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

  if (pack.id === 'calendar-planner') {
    return buildCalendarPlannerFiles(originalRequest);
  }

  return buildProductTemplateFiles(pack.id, originalRequest);
}
