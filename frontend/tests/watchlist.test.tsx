// The watchlist (S-04): the star and its dialog, V6, Undo, the states of E14 and the recently opened addresses.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import ex from '../src/api/mock/fixtures/examples.json';
import { mockApi, mockControls } from '../src/api/mock/mockApi';
import { ApiError } from '../src/api/types';
import { RECENT_MAX, rememberAddress } from '../src/hooks/usePreferences';
import { settings } from '../src/lib/settings';

const banned = new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i');
const MAIN = ex.mainAddress;
const { maxLabelChars, maxNoteChars } = settings.web.watchlist;

function start(hash: string) {
  window.location.hash = hash;
  const user = userEvent.setup();
  render(<App />);
  return user;
}

afterEach(() => {
  expect(document.body.textContent ?? '').not.toMatch(banned);
});

/** Opens the star of the address on V1 and returns the dialog. */
async function openStar(user: ReturnType<typeof userEvent.setup>, name: string | RegExp) {
  await user.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog');
}

describe('the star and its dialog', () => {
  test('adds an address with a label and a note, each with its count, and the star fills', async () => {
    const user = start('#/');
    const dialog = await openStar(user, `Add ${MAIN} to the watchlist`);
    expect(dialog).toHaveAccessibleName('Add to the watchlist');
    expect(within(dialog).getByText(`0 of ${maxLabelChars} characters`)).toBeInTheDocument();
    expect(within(dialog).getByText(`0 of ${maxNoteChars} characters`)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Label'), 'Exchange <hot>');
    await user.type(within(dialog).getByLabelText('Note'), 'Seen on  7 Nov');
    expect(within(dialog).getByText(`14 of ${maxLabelChars} characters`)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add to the watchlist' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Added Exchange <hot> to the watchlist.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `On the watchlist as Exchange <hot>. Edit the entry for ${MAIN}` })).toBeInTheDocument();

    // V6 shows the label and the note as they were typed.
    window.location.hash = '#/watchlist';
    const list = (await screen.findByRole('heading', { name: 'Exchange <hot>' })).closest('ul')!;
    expect(within(list).getByRole('heading', { name: 'Exchange <hot>' })).toBeInTheDocument();
    expect(list.querySelector('.watch-note')!.textContent).toBe('Seen on  7 Nov');
    expect(within(list).getByText(/377 transactions · 367 scored/)).toBeInTheDocument();
    expect(within(list).getAllByRole('link', { name: /Open/ })[0]).toHaveAttribute('href', `#/address/${MAIN}`);
  });

  test('text over a limit shows how far over it is and cannot be saved', async () => {
    const user = start('#/');
    const dialog = await openStar(user, `Add ${MAIN} to the watchlist`);
    await user.click(within(dialog).getByLabelText('Label'));
    await user.paste('x'.repeat(maxLabelChars + 3));
    expect(within(dialog).getByText(`${maxLabelChars + 3} of ${maxLabelChars} characters`)).toBeInTheDocument();
    expect(within(dialog).getByRole('alert')).toHaveTextContent(`3 too many: label may have at most ${maxLabelChars} characters.`);
    expect(within(dialog).getByLabelText('Label')).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByRole('button', { name: 'Add to the watchlist' })).toBeDisabled();
  });

  test('is a labelled modal: focus goes in and stays in, Escape closes it and focus returns to the star', async () => {
    const user = start('#/');
    const star = await screen.findByRole('button', { name: `Add ${MAIN} to the watchlist` });
    await user.click(star);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(MAIN);
    expect(within(dialog).getByLabelText('Label')).toHaveFocus();

    const [label, note, save, cancel] = [
      within(dialog).getByLabelText('Label'),
      within(dialog).getByLabelText('Note'),
      within(dialog).getByRole('button', { name: 'Add to the watchlist' }),
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ];
    await user.tab();
    expect(note).toHaveFocus();
    await user.tab();
    expect(save).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(label).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(star).toHaveFocus();
  });

  test('V2 has a star with words; an entry is edited in the same dialog, and removing it from there offers Undo', async () => {
    const user = start(`#/address/${MAIN}`);
    await user.click(await screen.findByRole('button', { name: /^Watch/ }));
    let dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Label'), 'Mine');
    await user.click(within(dialog).getByRole('button', { name: 'Add to the watchlist' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^Watching/ }));
    dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('Edit the watchlist entry');
    expect(within(dialog).getByLabelText('Label')).toHaveValue('Mine');
    await user.type(within(dialog).getByLabelText('Note'), 'a note');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Saved the changes to Mine.')).toBeInTheDocument();
    expect((await mockApi.watchlist()).entries[0]).toMatchObject({ label: 'Mine', note: 'a note' });

    await user.click(screen.getByRole('button', { name: /^Watching/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove from the watchlist' }));
    expect(await screen.findByText('Removed Mine from the watchlist.')).toBeInTheDocument();
    expect((await mockApi.watchlist()).entries).toEqual([]);
    expect(screen.getByRole('button', { name: /^Watch/ })).toBeInTheDocument();
  });
});

describe('the states of E14', () => {
  test('a full list (409) is shown with the shared state and a way to the list; the dialog stays open', async () => {
    mockControls.watchlistCapacity = 0;
    const user = start('#/');
    const dialog = await openStar(user, `Add ${MAIN} to the watchlist`);
    await user.click(within(dialog).getByRole('button', { name: 'Add to the watchlist' }));
    const panel = await within(dialog).findByTestId('state-conflict');
    expect(panel).toHaveTextContent('The watchlist is full');
    expect(within(panel).getByRole('link', { name: 'Open the watchlist' })).toHaveAttribute('href', '#/watchlist');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(within(panel).getByRole('link', { name: 'Open the watchlist' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('an address the service cannot open (404) says so inside the dialog', async () => {
    vi.spyOn(mockApi, 'putWatchlist').mockRejectedValue(
      new ApiError(404, { status: 'unsupported', message: 'This address is not among the 28 addresses.', examples: [], canLookupLive: false }),
    );
    const user = start('#/');
    const dialog = await openStar(user, `Add ${MAIN} to the watchlist`);
    await user.click(within(dialog).getByRole('button', { name: 'Add to the watchlist' }));
    expect(await within(dialog).findByTestId('state-unsupported')).toHaveTextContent("This address isn't in the snapshot");
  });

  test('a value the service refuses (400) is named on its own field', async () => {
    vi.spyOn(mockApi, 'putWatchlist').mockRejectedValue(
      new ApiError(400, { status: 'invalid', message: 'One value needs correcting.', fields: [{ name: 'note', message: 'Must be at most 500 characters.' }] }),
    );
    const user = start('#/');
    const dialog = await openStar(user, `Add ${MAIN} to the watchlist`);
    await user.click(within(dialog).getByRole('button', { name: 'Add to the watchlist' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Must be at most 500 characters.');
    expect(within(dialog).getByLabelText('Note')).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByLabelText('Label')).not.toHaveAttribute('aria-invalid');
  });
});

describe('V6', () => {
  const add = (address: string, label: string, note = '') => mockApi.putWatchlist(address, { label, note });

  test('an empty list says so and points to the star', async () => {
    start('#/watchlist');
    const panel = await screen.findByTestId('state-empty-watchlist');
    expect(panel).toHaveTextContent('Nothing on the watchlist yet');
    expect(screen.getByRole('heading', { level: 1, name: 'Watchlist' })).toBeInTheDocument();
  });

  test('the newest entry is first; Remove takes effect at once and Undo puts it back with the same label and note', async () => {
    await add(MAIN, 'First', 'one');
    await add(ex.shortHistory, 'Second', 'two');
    const user = start('#/watchlist');
    const items = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.closest('li')!);
    expect(items.map((li) => within(li).getByRole('heading').textContent)).toEqual(['Second', 'First']);

    await user.click(within(items[0]).getByRole('button', { name: /Remove/ }));
    expect(screen.queryByRole('heading', { name: 'Second' })).not.toBeInTheDocument();
    expect(await screen.findByText('Removed Second from the watchlist.')).toBeInTheDocument();
    expect((await mockApi.watchlist()).entries.map((e) => e.label)).toEqual(['First']);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Second is back on the watchlist.')).toBeInTheDocument();
    expect((await mockApi.watchlist()).entries).toMatchObject([{ label: 'Second', note: 'two' }, { label: 'First', note: 'one' }]);
    expect(await screen.findByRole('heading', { name: 'Second' })).toBeInTheDocument();
  });

  test('an entry the service refuses to remove comes back, with the reason', async () => {
    await add(MAIN, 'Keep');
    vi.spyOn(mockApi, 'deleteWatchlist').mockRejectedValue(new ApiError(500, { status: 'server_error', message: 'The database is locked.' }));
    const user = start('#/watchlist');
    await user.click(await screen.findByRole('button', { name: /Remove/ }));
    expect(await screen.findByText('Keep could not be removed: The database is locked.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Keep' })).toBeInTheDocument();
  });

  test('an entry already gone on the service (404) is gone here too, and Undo still works', async () => {
    await add(MAIN, 'Gone');
    const user = start('#/watchlist');
    await screen.findByRole('heading', { name: 'Gone' });
    await mockApi.deleteWatchlist(MAIN);
    await user.click(screen.getByRole('button', { name: /Remove/ }));
    expect(await screen.findByText('Removed Gone from the watchlist.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Gone' })).not.toBeInTheDocument();
  });

  test('a failed load offers Try again, which loads the list', async () => {
    await add(MAIN, 'Later');
    mockControls.offline = true;
    const user = start('#/watchlist');
    expect(await screen.findByText("Couldn't reach the explorer service")).toBeInTheDocument();
    mockControls.offline = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Later' })).toBeInTheDocument();
  });

  test('Edit opens the dialog with the entry, and saving changes the list', async () => {
    await add(MAIN, 'Before', 'old');
    const user = start('#/watchlist');
    await user.click(await screen.findByRole('button', { name: /Edit/ }));
    const dialog = await screen.findByRole('dialog');
    const label = within(dialog).getByLabelText('Label');
    await user.clear(label);
    await user.type(label, 'After');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('heading', { name: 'After' })).toBeInTheDocument();
    expect(screen.getByText('old')).toBeInTheDocument();
  });
});

describe('recently opened addresses', () => {
  test('an address opened is listed on V1, newest first, without repeats and at most five', async () => {
    for (const a of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a3']) rememberAddress(a);
    expect(JSON.parse(localStorage.getItem('explorer.preferences.v1')!).recent).toEqual(['a3', 'a6', 'a5', 'a4', 'a2'].slice(0, RECENT_MAX));
  });

  test('opening an address puts it on V1 under "Recently opened", linking back to it', async () => {
    const first = start(`#/address/${MAIN}`);
    await screen.findByRole('heading', { level: 1, name: MAIN });
    await act(async () => {});
    window.location.hash = '#/';
    const section = (await screen.findByRole('heading', { name: 'Recently opened' })).closest('section')!;
    expect(within(section).getByRole('link')).toHaveAttribute('href', `#/address/${MAIN}`);
    expect(first).toBeDefined();
  });

  test('an address whose page failed to load is not remembered', async () => {
    mockControls.offline = true;
    start(`#/address/${MAIN}`);
    await screen.findByText("Couldn't reach the explorer service");
    expect(localStorage.getItem('explorer.preferences.v1')).toBeNull();
  });
});
