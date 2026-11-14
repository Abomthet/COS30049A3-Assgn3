// Decision D-W-10: the flag line has one source. settings.json's `baseline.flagAbsZ` (3.5) is
// Assignment 1's untuned default; the line the Explorer applies is the tuned one E2 reports (5.0).
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { CONFIG } from '../src/api/mock/fixtures';
import { mockControls } from '../src/api/mock/mockApi';
import { SettingsProvider, useSettings } from '../src/hooks/useSettings';
import { ServiceStatusProvider } from '../src/hooks/useServiceStatus';
import { BUNDLED_SETTINGS, settings } from '../src/lib/settings';

function Probe() {
  const { settings: s, origin } = useSettings();
  return (
    <p>
      {origin}: flag line {s.thresholds ? s.thresholds.flagAbsZ : 'none'}, features {s.features.map((f) => `${f.id} ${f.unit}`).join(', ') || 'none'}
    </p>
  );
}

const renderProbe = () =>
  render(
    <ServiceStatusProvider>
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    </ServiceStatusProvider>,
  );

describe('where the flag line comes from', () => {
  test('the bundled settings carry no threshold and no feature list', () => {
    expect(BUNDLED_SETTINGS.thresholds).toBeNull();
    expect(BUNDLED_SETTINGS.features).toEqual([]);
    // The values they would otherwise have shown are the untuned ones.
    expect(settings.baseline.flagAbsZ).toBe(3.5);
    expect(CONFIG.thresholds.flagAbsZ).toBe(5);
  });

  test('once E2 answers, its tuned flag line and its feature units are what the views read', async () => {
    renderProbe();
    expect(await screen.findByText(/^service: flag line 5, features F1 BTC, F2 count, F3 hours, F4 ratio$/)).toBeInTheDocument();
  });

  test('with the service unreachable there is no flag line and no units', async () => {
    mockControls.offline = true;
    renderProbe();
    expect(await screen.findByText('bundled: flag line none, features none')).toBeInTheDocument();
  });
});
