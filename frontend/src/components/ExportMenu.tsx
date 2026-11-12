import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { api } from '../api/client';
import type { ExportFormat, TransactionQuery } from '../api/types';
import { downloadText } from '../charts/chartTable';
import { runRequest } from '../hooks/useRequest';
import { useToasts } from '../hooks/useToasts';
import { plural } from '../lib/format';

// The export menu of V2's transactions tab (plan section 8): the transactions the filters let through,
// as a CSV or JSON file from E10. It asks the service for the file with the same filters as the table,
// so the file holds the rows the table pages through; the file's name is the one the service gives it.
// The entries are worded like the chart tools ("Download PNG", "Download CSV") and confirm the same way.

const FORMATS: Array<{ format: ExportFormat; label: string; type: string }> = [
  { format: 'csv', label: 'Download CSV', type: 'text/csv;charset=utf-8' },
  { format: 'json', label: 'Download JSON', type: 'application/json' },
];

interface Props {
  address: string;
  /** E6's filters and sort, as the table sends them (the page does not apply to a file). */
  query: Omit<TransactionQuery, 'page' | 'pageSize'>;
  /** How many rows match, for the confirmation. */
  rows: number;
}

export function ExportMenu({ address, query, rows }: Props) {
  const { notify } = useToasts();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  async function download({ format, type }: (typeof FORMATS)[number]) {
    setOpen(false);
    setBusy(true);
    const answer = await runRequest(() => api.exportFile(address, format, query));
    setBusy(false);
    if (answer.ok) {
      downloadText(answer.data.filename, answer.data.text, type);
      notify({ message: `Exported ${plural(rows, 'row')} to ${answer.data.filename}`, tone: 'success' });
    } else {
      notify({ message: `The export could not be made. ${answer.error.message}`, tone: 'error' });
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      setOpen(false);
      trigger.current?.focus();
    }
  }
  // Leaving the menu by Tab or by a click elsewhere closes it.
  const onBlur = (event: FocusEvent) => {
    if (!root.current?.contains(event.relatedTarget)) setOpen(false);
  };

  return (
    <div className="export-menu" ref={root} onKeyDown={onKeyDown} onBlur={onBlur}>
      <button ref={trigger} type="button" className="btn btn-secondary" aria-expanded={open} aria-haspopup="true" aria-controls="export-entries" disabled={busy} onClick={() => setOpen(!open)}>
        {busy ? 'Exporting…' : 'Export'}
      </button>
      <div id="export-entries" className="export-entries" hidden={!open}>
        {FORMATS.map((entry) => (
          <button key={entry.format} type="button" className="btn btn-secondary" onClick={() => download(entry)}>
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  );
}
