import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import CoachPage from './routes/CoachPage';
import StackPage from './routes/StackPage';
import ContactDetailPage from './routes/ContactDetailPage';

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-full px-4 py-2 text-sm font-semibold transition',
    isActive ? 'bg-ink text-white' : 'text-ink/70 hover:bg-white/70 hover:text-ink'
  ].join(' ');

export default function App() {
  const location = useLocation();
  const isFullBleed = location.pathname === '/';

  if (isFullBleed) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<ContactDetailPage />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-8 lg:px-10">
      <header className="mb-8 flex flex-col gap-6 rounded-[2rem] border border-black/5 bg-white/60 p-6 shadow-panel backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.28em] text-teal">
            Real-Time Call Copilot
          </p>
          <h1 className="text-4xl font-black tracking-tight text-ink sm:text-5xl">
            Live voice coaching with React, Node, Tailwind, and Google ADK.
          </h1>
        </div>
        <nav className="flex flex-wrap gap-3">
          <NavLink to="/stack" className={navLinkClassName}>
            Stack
          </NavLink>
          <NavLink to="/coach-debug" className={navLinkClassName}>
            Debug
          </NavLink>
        </nav>
      </header>

      <main className="flex-1">
        <Routes>
          <Route path="/stack" element={<StackPage />} />
          <Route path="/coach-debug" element={<CoachPage />} />
        </Routes>
      </main>
    </div>
  );
}
