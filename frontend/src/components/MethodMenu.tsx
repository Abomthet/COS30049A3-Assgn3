import { useId } from 'react';
import type { MethodId } from '../api/types';
import { useMethodLabels } from '../hooks/useMethods';
import { usePreferences } from '../hooks/usePreferences';
import { DEFAULT_METHOD, METHODS, withMethod } from '../lib/methods';
import { navigate } from '../lib/router';

// The method menu (plan section 8, V2's header; S-01): the nine methods by their E11 names, the
// default marked. A choice rewrites the address bar (the link keeps it; the default is left out) and
// is remembered, so the next address opens with it. The screens read the method from the link and ask
// the service again, so the menu itself holds nothing.

export function MethodMenu({ method, updating }: { method: MethodId; updating: boolean }) {
  const id = useId();
  const labels = useMethodLabels();
  const [, remember] = usePreferences();

  const choose = (next: MethodId) => {
    remember({ method: next });
    navigate(withMethod(window.location.hash, next), { replace: true });
  };

  return (
    <div className="method-menu">
      <label htmlFor={id}>Deciding method</label>
      <select id={id} className="text-input" value={method} onChange={(e) => choose(e.target.value as MethodId)}>
        {METHODS.map((m) => (
          <option key={m.id} value={m.id}>
            {labels[m.id].name}
            {m.id === DEFAULT_METHOD ? ' (default)' : ''}
          </option>
        ))}
      </select>
      <span className="method-status" role="status">
        {updating ? 'Updating…' : ''}
      </span>
    </div>
  );
}
