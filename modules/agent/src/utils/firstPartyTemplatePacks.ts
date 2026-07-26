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

function buildCalendarPlannerFiles(originalRequest: string): FirstPartyTemplatePackFile[] {
  const displayHeading = extractVisibleHeading(originalRequest, DEFAULT_CALENDAR_HEADING);

  return [
    {
      name: 'App.tsx',
      path: 'src/App.tsx',
      content: `import { useState } from 'react';
import './App.css';

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
            <h1>${displayHeading}</h1>
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

  return [];
}
