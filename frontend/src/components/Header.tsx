function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

interface HeaderProps {
  darkMode: boolean;
  onThemeToggle: () => void;
  navLabel: string;
  onNavigate: () => void;
}

export default function Header({ darkMode, onThemeToggle, navLabel, onNavigate }: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 dark:bg-vsc-surface dark:border-vsc-border px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-vsc-text">Docs Assistant</h1>
        <button
          onClick={onNavigate}
          className="text-sm text-purple-600 hover:text-purple-700 dark:text-vsc-link dark:hover:text-vsc-link-hover hover:underline"
        >
          {navLabel}
        </button>
      </div>
      <button
        onClick={onThemeToggle}
        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:text-vsc-text-muted dark:hover:text-vsc-text hover:bg-gray-100 dark:hover:bg-vsc-hover transition-colors"
        aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
      >
        {darkMode ? <SunIcon /> : <MoonIcon />}
      </button>
    </header>
  );
}
