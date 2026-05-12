import { GripVertical, Sparkles } from 'lucide-react';

export function CompactIsland({ dateTime, onToggle }) {
  return (
    <div className="compact" role="group">
      <button className="signal compact-toggle" type="button" data-no-window-drag="true" onClick={onToggle} title="展开">
        <Sparkles size={18} />
      </button>
      <span className="now">{dateTime}</span>
      <span className="compact-grip" aria-hidden="true">
        <GripVertical size={18} strokeWidth={2.4} />
      </span>
    </div>
  );
}
