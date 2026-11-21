import { shortAddress } from '../lib/format';

/**
 * A link whose visible text is a shortened address. Its accessible name starts with that visible text
 * ("36V7afbhZnvp…2vtHDB6L, full address 36V7…"), so a voice-control user who says what they see can activate it
 * (WCAG 2.5.3 Label in Name), and a screen-reader user still hears the whole address. The old `aria-label` held only
 * the full address, which did not contain the visible text. The extra words are a visually hidden span, so nothing
 * changes on screen.
 */
export function AddressLink({ address, href, head = 12, tail = 8, className }: { address: string; href: string; head?: number; tail?: number; className?: string }) {
  const short = shortAddress(address, head, tail);
  return (
    <a className={className} href={href}>
      {short}
      {short === address ? null : <span className="sr-only">, full address {address}</span>}
    </a>
  );
}
