// Runs as a child process, one per document: reads the file from stdin,
// writes Markdown to stdout, writes the reason to stderr and exits 1 when the
// document cannot be read. See convert.js for why it is a separate process.
import { toMarkdownBytes } from '@firecrawl/anydoc';

const format = process.argv[2] || undefined;

const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}

try {
  process.stdout.write(await toMarkdownBytes(Buffer.concat(chunks), format));
} catch (error) {
  process.stderr.write(error?.message || String(error));
  // Not process.exit: that would cut stdout off mid-flush.
  process.exitCode = 1;
}
