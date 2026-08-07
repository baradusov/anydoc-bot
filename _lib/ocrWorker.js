// Runs as a child process, one per picture: reads the file from stdin, writes
// Markdown to stdout, writes the reason to stderr and exits 1 when there is
// nothing to read. See ocr.js for why it is a separate process.
import { LiteParse } from '@llamaindex/liteparse';

const { language, dpi, maxPages, workers, maxPixels } = JSON.parse(process.argv[2]);

// pageArea is in PDF points, 72 to the inch. What the parser has to hold is
// the raster it renders at dpi, so the limit applies to that. Images are sized
// from their header in imageGuard.js, before any of this runs.
const rasterPixels = (pageArea) => pageArea * (dpi / 72) ** 2;

/**
 * A page of a scan has an empty text layer, and the renderer writes that layer
 * out as a fenced block regardless — so a scanned PDF opens with a blank code
 * block and a rule before its first word. Both are dropped here, where the
 * shape of the output is still known, rather than in the file somebody reads.
 */
const tidy = (markdown) =>
  markdown
    .replace(/^```[\w-]*\n\s*```$/gm, '')
    .replace(/^(?:[ \t]*-{3,}[ \t]*\n){2,}/gm, '-----\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^(?:\s*-{3,}\s*)+/, '')
    .replace(/(?:\s*-{3,}\s*)+$/, '')
    .trim();

const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}

const bytes = Buffer.concat(chunks);

try {
  // A text layer means the file only looks like a scan. The check reads the
  // layer and nothing else — milliseconds against half a minute of pointless
  // OCR — and it is the same verdict that sent the file here.
  const pages = await new LiteParse({ ocrEnabled: false, quiet: true }).isComplex(bytes);

  const biggest = Math.max(0, ...pages.map((page) => rasterPixels(page.pageArea ?? 0)));

  if (pages.length > 0 && !pages.some((page) => page.needsOcr)) {
    process.stderr.write('no_ocr_needed');
    process.exitCode = 1;
  } else if (biggest > maxPixels) {
    process.stderr.write('too_complex');
    process.exitCode = 1;
  } else {
    const result = await new LiteParse({
      ocrEnabled: true,
      ocrLanguage: language,
      dpi,
      maxPages,
      numWorkers: workers,
      outputFormat: 'markdown',
      quiet: true,
    }).parse(bytes);

    process.stdout.write(tidy(result.text ?? ''));

    // How the read went, for the parent to turn into words. Read on exit 0
    // only, where nothing else uses stderr.
    const scores = result.pages
      .flatMap((page) => page.textItems ?? [])
      .map((item) => item.confidence)
      .filter((score) => score != null);

    process.stderr.write(
      JSON.stringify({
          pages: pages.length,
        confidence: scores.length
          ? scores.reduce((sum, score) => sum + score, 0) / scores.length
          : null,
      })
    );
  }
} catch (error) {
  process.stderr.write(error?.message || String(error));
  // Not process.exit: that would cut stdout off mid-flush.
  process.exitCode = 1;
}
