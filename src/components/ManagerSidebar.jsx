import { Sparkles } from 'lucide-react';

export function ManagerSidebar({ activeSection, navItems, onSelect }) {
  return (
    <aside className="manager-sidebar">
      <button className="sidebar-brand" type="button" onClick={() => onSelect('home')}>
        <span className="brand-mark"><Sparkles size={18} /></span>
        <strong>Windowsill</strong>
      </button>
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const NavIcon = item.icon;
          return (
            <button
              className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
              type="button"
              key={item.id}
              onClick={() => onSelect(item.id)}
            >
              <NavIcon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
