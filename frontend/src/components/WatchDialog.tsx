import { useId, useState, type FormEvent } from 'react';
import type { ApiError, FieldError, WatchlistEntry } from '../api/types';
import { entryName, saveWatchlistEntry, useRemoveWithUndo } from '../hooks/useWatchlist';
import { useSettings } from '../hooks/useSettings';
import { useToasts } from '../hooks/useToasts';
import { formatCount } from '../lib/format';
import { Dialog } from './Dialog';
import { ErrorState } from './ErrorState';
import { Icon } from './Icon';

// The dialog of S-04's star: a label and a note, each with its character count against the limit from E2, saved
// through E14. It is fetched when the first star is selected, so the first screen does not carry it.

const length = (text: string) => [...text].length;

interface Counted {
  id: string;
  label: string;
  help: string;
  value: string;
  max: number;
  /** The service's own words, when it refused the value. */
  serviceError?: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}

/** A field with its count ("12 of 40 characters"), which turns into a message once the text is over the limit. */
function CountedField({ id, label, help, value, max, serviceError, multiline, onChange }: Counted) {
  const used = length(value);
  const over = used > max;
  const error = over ? `${formatCount(used - max)} too many: ${label.toLowerCase()} may have at most ${formatCount(max)} characters.` : serviceError;
  const common = {
    id,
    className: multiline ? 'text-input text-area' : 'text-input',
    value,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': `${id}-help ${id}-count${error ? ` ${id}-error` : ''}`,
    autoComplete: 'off',
  };
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <p id={`${id}-help`} className="field-help">
        {help}
      </p>
      {multiline ? <textarea rows={4} {...common} /> : <input type="text" {...common} />}
      <p id={`${id}-count`} className={`char-count${over ? ' is-over' : ''}`}>
        {formatCount(used)} of {formatCount(max)} characters
      </p>
      {error ? (
        <p id={`${id}-error`} className="field-error" role="alert">
          <Icon name="error" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

const fieldMessage = (error: ApiError | null, name: string): string | undefined =>
  error?.body.status === 'invalid' ? (error.body.fields as FieldError[] | undefined)?.find((f) => f.name === name)?.message : undefined;

export default function WatchDialog({ address, entry, onClose }: { address: string; entry: WatchlistEntry | undefined; onClose: () => void }) {
  const { settings } = useSettings();
  const { notify } = useToasts();
  const removeWithUndo = useRemoveWithUndo();
  const { maxLabelChars, maxNoteChars } = settings.web.watchlist;
  const id = useId();
  const [label, setLabel] = useState(entry?.label ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const tooLong = length(label) > maxLabelChars || length(note) > maxNoteChars;
  // A 400 names the fields at fault; any other refusal (the list is full, the address cannot be opened) is shown as a state.
  const fieldFailure = error?.body.status === 'invalid';

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (tooLong || saving) return;
    setSaving(true);
    setError(null);
    const res = await saveWatchlistEntry(address, { label, note });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    notify({ tone: 'success', message: entry ? `Saved the changes to ${entryName(res.data)}.` : `Added ${entryName(res.data)} to the watchlist.` });
    onClose();
  }

  return (
    <Dialog title={entry ? 'Edit the watchlist entry' : 'Add to the watchlist'} describedBy={`${id}-address`} onClose={onClose}>
      <p id={`${id}-address`} className="dialog-address mono">
        {address}
      </p>
      <form onSubmit={save} noValidate className="dialog-form">
        <CountedField
          id={`${id}-label`}
          label="Label"
          help="A short name for yourself, such as “Exchange wallet”. Optional."
          value={label}
          max={maxLabelChars}
          serviceError={fieldMessage(error, 'label')}
          onChange={setLabel}
        />
        <CountedField
          id={`${id}-note`}
          label="Note"
          help="Anything worth remembering about this address. Optional."
          value={note}
          max={maxNoteChars}
          serviceError={fieldMessage(error, 'note')}
          multiline
          onChange={setNote}
        />
        {error && !fieldFailure ? <ErrorState error={error} onRetry={() => void save()} headingLevel={3} /> : null}
        <div className="dialog-actions">
          <button type="submit" className="btn btn-primary" disabled={tooLong || saving}>
            {saving ? (
              <>
                <span className="spinner spinner-inline" aria-hidden="true" /> Saving…
              </>
            ) : entry ? (
              'Save changes'
            ) : (
              'Add to the watchlist'
            )}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          {entry ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                void removeWithUndo(entry);
                onClose();
              }}
            >
              Remove from the watchlist
            </button>
          ) : null}
        </div>
      </form>
    </Dialog>
  );
}
