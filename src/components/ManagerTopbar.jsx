import { Aperture, PanelTopOpen } from 'lucide-react';

export function ManagerTopbar({ activeLabel, clock, fileCount, onScreenshot, onToggle }) {
  return (
    <header className="manager-topbar">
      <div>
        <strong>{activeLabel}</strong>
        <small>{clock} · {fileCount} 个暂存</small>
      </div>
      <div className="header-actions">
        <button className="icon-button" type="button" title="截图" onClick={onScreenshot}>
          <Aperture size={16} />
        </button>
        <button className="icon-button" type="button" title="收起" onClick={onToggle}>
          <PanelTopOpen size={17} />
        </button>
      </div>
    </header>
  );
}
