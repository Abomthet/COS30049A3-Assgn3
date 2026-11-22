// W120 to W130: no message a reader sees names an environment variable, the README, a requirements file or "this service".
// The server's own messages are checked in backend/tests/test_screen_messages.py; this file checks the browser's side: the
// error panels for every status, the service status words, the offline banner and the mock's copies of the server's messages.
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ApiError, type ApiErrorBody } from '../src/api/types';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { ErrorState } from '../src/components/ErrorState';
import { ServiceStatus } from '../src/components/ServiceStatus';
import { ServiceStatusProvider } from '../src/hooks/useServiceStatus';
import { mockApi, mockControls } from '../src/api/mock/mockApi';
import ex from '../src/api/mock/fixtures/examples.json';

const SETUP_TEXT = /EXPLORER_|README|requirements|this service|explorer service|\.pt\b|\.joblib|PyTorch/i;

const BODIES: ApiErrorBody[] = [
  { status: 'invalid', message: 'Check the address for a typo.', hint: 'Check the value and try again.' },
  { status: 'unsupported', message: 'This address is not one of the 28 in the snapshot.', examples: [], canLookupLive: false } as ApiErrorBody,
  { status: 'not_found', message: "This transaction isn't in the snapshot for this address.", hint: 'Pick one from the list.' },
  { status: 'network', message: "Can't reach the Explorer." },
  { status: 'timeout', message: 'x' },
  { status: 'rate_limited', message: 'Another fetch is running.', retryAfterSeconds: 5 } as ApiErrorBody,
  { status: 'upstream_error', message: "It sent something we can't read.", hint: "Try again in a minute, or pick a snapshot address." },
  { status: 'upstream_timeout', message: 'The public blockchain service did not answer in time.', hint: 'Try again in a minute, or pick a snapshot address.' },
  { status: 'unavailable', message: 'The Explorer is still starting.', hint: 'Try again in a few seconds.' },
  { status: 'server_error', message: 'Something went wrong on our side.', requestId: 'abc123def456' } as ApiErrorBody,
  { status: 'disabled', message: 'Fetching new addresses is turned off. Pick an address from the list.' } as ApiErrorBody,
];

describe('error panels', () => {
  test.each(BODIES.map((b) => [b.status, b] as const))('the %s panel names no setup text', (_status, body) => {
    const { container } = render(<ErrorState error={new ApiError(500, body)} onRetry={() => {}} />);
    expect(container.textContent).not.toMatch(SETUP_TEXT);
  });

  test('network, upstream and 500 panels read as the approved rows say', () => {
    const { rerender } = render(<ErrorState error={new ApiError(0, BODIES[3])} onRetry={() => {}} />);
    expect(screen.getByRole('heading', { name: "Can't reach the Explorer" })).toBeInTheDocument();
    expect(screen.getByText('Check your connection. This page retries by itself, or press Try again.')).toBeInTheDocument();
    rerender(<ErrorState error={new ApiError(502, BODIES[6])} onRetry={() => {}} />);
    expect(screen.getByRole('heading', { name: "The blockchain service didn't answer" })).toBeInTheDocument();
    expect(screen.getByText("It sent something we can't read. Try again in a minute, or pick a snapshot address.")).toBeInTheDocument();
    rerender(<ErrorState error={new ApiError(0, BODIES[4])} onRetry={() => {}} />);
    expect(screen.getByText('The Explorer took too long. Try again.')).toBeInTheDocument();
    rerender(<ErrorState error={new ApiError(500, BODIES[9])} onRetry={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByText('abc123def456')).toBeInTheDocument();
  });
});

describe('the shell texts', () => {
  test('the service status words and the offline banner name no setup text', () => {
    const { container } = render(
      <ServiceStatusProvider>
        <ServiceStatus />
        <OfflineBanner />
      </ServiceStatusProvider>,
    );
    expect(container.textContent).not.toMatch(SETUP_TEXT);
  });
});

describe("the mock's copies of the server's messages", () => {
  test('the refusals it can give carry no setup text', async () => {
    const messages: string[] = [];
    const grab = async (call: Promise<unknown>) => {
      try {
        await call;
      } catch (error) {
        if (error instanceof ApiError) messages.push(error.body.message, 'hint' in error.body ? String(error.body.hint ?? '') : '');
      }
    };
    mockControls.latencyMs = 0;
    await grab(mockApi.startLiveLookup('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')); // live lookup off
    await grab(mockApi.forgetAddress(ex.mainAddress));
    await grab(mockApi.lookup(ex.typo));
    await grab(mockApi.lookup(ex.unsupported));
    expect(messages.filter(Boolean).length).toBeGreaterThanOrEqual(4);
    for (const message of messages) expect(message).not.toMatch(SETUP_TEXT);
  });
});
