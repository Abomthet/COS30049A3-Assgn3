// The corner panel for trying the empty-watchlist looks. Temporary: removed once the owner chooses.
import type { PlaySettings } from './playSettings';

interface Props {
  settings: PlaySettings;
  update: (patch: Partial<PlaySettings>) => void;
}

export function EmptyPlayground({ settings, update }: Props) {
  return (
    <div className="ew-play" role="group" aria-label="Empty watchlist playground">
      <label>
        Art
        <select value={settings.art} onChange={(e) => update({ art: Number(e.target.value) as PlaySettings['art'] })}>
          <option value="0">0 None (current)</option>
          <option value="1">1 Stacked cards</option>
          <option value="2">2 Empty list</option>
          <option value="3">3 Folder</option>
        </select>
      </label>
      <label>
        Align
        <select value={settings.align} onChange={(e) => update({ align: e.target.value as PlaySettings['align'] })}>
          <option value="center">Centre</option>
          <option value="left">Left</option>
        </select>
      </label>
      <label>
        Size
        <select value={settings.size} onChange={(e) => update({ size: e.target.value as PlaySettings['size'] })}>
          <option value="s">Small</option>
          <option value="m">Medium</option>
          <option value="l">Large</option>
        </select>
      </label>
      <label>
        Suggestions
        <select value={settings.suggest} onChange={(e) => update({ suggest: e.target.value as PlaySettings['suggest'] })}>
          <option value="off">Off</option>
          <option value="3">3</option>
          <option value="5">5</option>
        </select>
      </label>
      <label className="ew-play-check">
        <input type="checkbox" checked={settings.empty} onChange={(e) => update({ empty: e.target.checked })} />
        Pretend it is empty
      </label>
    </div>
  );
}
