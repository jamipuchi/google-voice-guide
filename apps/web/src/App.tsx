import { NavLink, Route, Routes } from 'react-router-dom';
import HomePage from './routes/HomePage';
import StackPage from './routes/StackPage';

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-full px-4 py-2 text-sm font-semibold transition',
    isActive ? 'bg-ink text-white' : 'text-ink/70 hover:bg-white/70 hover:text-ink'
  ].join(' ');

export default function App() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-8 lg:px-10">
      <header className="mb-8 flex flex-col gap-6 rounded-[2rem] border border-black/5 bg-white/60 p-6 shadow-panel backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.28em] text-teal">
            Monorepo Starter
          </p>
          <h1 className="text-4xl font-black tracking-tight text-ink sm:text-5xl">
            React, Node, tRPC, Tailwind, and TypeScript wired together.
          </h1>
        </div>
        <nav className="flex flex-wrap gap-3">
          <NavLink to="/" className={navLinkClassName} end>
            Home
          </NavLink>
          <NavLink to="/stack" className={navLinkClassName}>
            Stack
          </NavLink>
        </nav>
      </header>

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/stack" element={<StackPage />} />
        </Routes>
      </main>
    </div>
  );
}
