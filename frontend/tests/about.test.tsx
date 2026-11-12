import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../src/App';
import { CONFIG, HEALTH } from '../src/api/mock/fixtures';
import { mockControls } from '../src/api/mock/mockApi';
import { LIMITATION_LINE, settings } from '../src/lib/settings';

// V7 states no figure of its own: what it says about the source, snapshot, flag levels and features
// comes from E2, so these tests compare it with the recorded E2 answer.

const banned = new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i');

function open() {
  window.location.hash = '#/about';
  render(<App />);
}

afterEach(() => {
  expect(document.body.textContent ?? '').not.toMatch(banned);
});

const section = async (name: string) => within((await screen.findByRole('heading', { level: 2, name })).closest('section')!);

describe('About and help', () => {
  test('it replaces the placeholder and starts with what the Explorer does', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'About and help' })).toBeInTheDocument();
    expect(screen.queryByText('This page is not available yet')).not.toBeInTheDocument();
    expect(screen.getByText(/marks the transactions that are unusual compared with that same address's own earlier activity/)).toBeInTheDocument();
  });

  test('what it does not claim: the limitation line, and no accuracy for real transactions', async () => {
    open();
    const claims = await section('What it does not claim');
    expect(claims.getByText(LIMITATION_LINE)).toBeInTheDocument();
    expect(claims.getByText(/no accuracy is claimed/)).toBeInTheDocument();
    await waitFor(() => expect(claims.getByText(new RegExp(`covers the ${CONFIG.snapshot.addressCount} addresses`))).toBeInTheDocument());
  });

  test('the data source and snapshot are E2\'s', async () => {
    open();
    const data = await section('Where the data comes from');
    const link = await data.findByRole('link', { name: /Blockstream Esplora/ });
    expect(link).toHaveAttribute('href', CONFIG.snapshot.sourceUrl);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(data.getByText('22 Oct 2026')).toBeInTheDocument();
    expect(data.getByText('UTC')).toBeInTheDocument();
  });

  test('"unusual" is explained with E2\'s flag level, history rule and feature names', async () => {
    open();
    const unusual = await section('What "unusual" means');
    await waitFor(() => expect(unusual.getByText(new RegExp(`flag level \\(${CONFIG.thresholds.flagAbsZ}\\)`))).toBeInTheDocument());
    expect(unusual.getByText(new RegExp(`at least ${CONFIG.history.minTx} earlier transactions over at\\s+least ${CONFIG.history.minSpanDays} days`))).toBeInTheDocument();
    for (const f of CONFIG.features) {
      expect(unusual.getByText(f.name)).toBeInTheDocument();
      expect(unusual.getByText(f.description)).toBeInTheDocument();
    }
  });

  test('the charts, the keys and the method each have their own part', async () => {
    open();
    const charts = await section('How to read the charts');
    for (const name of ['Transactions per day.', 'Transactions over time.', 'How this transaction compares with usual.']) expect(charts.getByText(name)).toBeInTheDocument();
    const keys = await section('Keyboard');
    expect(keys.getByText('Tab and Shift+Tab')).toBeInTheDocument();
    expect(keys.getByText('Left and right arrows on a chart')).toBeInTheDocument();
    const method = await section('The method in one paragraph');
    await waitFor(() => expect(method.getByText(/Robust z baseline \(A1\) decides which transactions are flagged\. Alongside it, 8 further methods/)).toBeInTheDocument());
    expect(method.getByText(`Explorer service version ${HEALTH.version}.`)).toBeInTheDocument();
  });

  test('with the service unreachable the page still reads, without a figure it cannot know', async () => {
    mockControls.offline = true;
    open();
    const data = await section('Where the data comes from');
    await waitFor(() => expect(data.getByText(/The data comes from Blockstream Esplora\./)).toBeInTheDocument());
    const unusual = await section('What "unusual" means');
    expect(unusual.queryByText(/flag level \(/)).not.toBeInTheDocument();
    expect(unusual.getByText(/Scoring needs at least 10 earlier transactions/)).toBeInTheDocument();
    expect(screen.queryByText(/Explorer service version/)).not.toBeInTheDocument();
  });
});
