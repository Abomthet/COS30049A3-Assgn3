// The service's explanation of a flagged transaction (E7 `explanation`) is plain text: a heading
// line, then lines that start with "- ", and on a flagged item the limitation line last. The screen
// shows the limitation line in its own place, so it is left out here.

export type ExplanationBlock = { kind: 'text'; text: string } | { kind: 'list'; items: string[] };

/** Splits the service's plain-text explanation into paragraphs and bullet lists, leaving out the limitation line, which is shown separately. */
export function explanationBlocks(explanation: string, limitation: string): ExplanationBlock[] {
  const blocks: ExplanationBlock[] = [];
  for (const line of explanation.split('\n').map((l) => l.trim())) {
    if (line === '' || line === limitation) continue;
    const last = blocks[blocks.length - 1];
    if (line.startsWith('- ')) {
      if (last?.kind === 'list') last.items.push(line.slice(2));
      else blocks.push({ kind: 'list', items: [line.slice(2)] });
    } else {
      blocks.push({ kind: 'text', text: line });
    }
  }
  return blocks;
}
