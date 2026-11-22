// Three small inline icons: the unusual-flag triangle and the watch star (outline and filled). Decorative by default
// (aria-hidden): the text beside the flag says what it means, and the star's button has its own accessible name.

export type IconName = 'flag' | 'star' | 'star-filled';

const PATHS: Record<IconName, string> = {
  flag: 'M12 3 22 20H2Z',
  star: 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8ZM12 6.6l-1.7 3.6-3.9.5 2.9 2.7-.8 3.9 3.5-2 3.5 2-.8-3.9 2.9-2.7-3.9-.5Z',
  'star-filled': 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8Z',
};

/** An inline SVG icon by name; it is hidden from screen readers unless it has a title. */
export function Icon({ name, className, title }: { name: IconName; className?: string; title?: string }) {
  return (
    <svg
      className={`icon icon-${name}${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name]} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
