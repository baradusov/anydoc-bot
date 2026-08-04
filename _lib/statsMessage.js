import {
  summary,
  topUsers,
  topFormats,
  reasons,
  returning,
  timings,
  slowestFormats,
  queueTimings,
  sizes,
} from './stats.js';

const REASON_LABELS = {
  unsupported: 'Not a document I read',
  needs_ocr: 'Scan, needs OCR',
  malformed: 'File was broken',
  empty: 'No text inside',
  too_big: 'Over the 20 MB download limit',
  too_large: 'Markdown too big to send',
  too_complex: 'Small file, huge insides',
  timeout: 'Took too long',
  download_failed: 'Telegram would not hand it over',
  worker_crashed: 'Reader died on it',
  not_a_document: 'Not a file at all',
  photo: 'Sent as a photo',
  rate_limited: 'Sent too fast',
  poison_update: 'Kept breaking the bot, skipped',
};

const cell = (text, { header = false, align = 'left' } = {}) => {
  const c = { text: String(text), align, valign: 'middle' };
  if (header) c.is_header = true;
  return c;
};

const table = (head, rows) => ({
  type: 'table',
  is_bordered: true,
  is_striped: true,
  cells: [
    head.map((h, i) => cell(h, { header: true, align: i ? 'right' : 'left' })),
    ...rows.map((r) => r.map((v, i) => cell(v, { align: i ? 'right' : 'left' }))),
  ],
});

const heading = (text) => ({ type: 'heading', text, size: 3 });

const num = (n) => Number(n || 0).toLocaleString('en-US');

const secs = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(1) + 's');

const mb = (bytes) => (bytes == null ? '—' : (bytes / 1048576).toFixed(1) + ' MB');

export const buildStatsMessage = (period = 30) => {
  const s = summary(period);

  if (!s.requests) {
    return {
      blocks: [
        heading('Statistics'),
        {
          type: 'paragraph',
          text: `Nothing recorded in the last ${period} days.`,
        },
      ],
    };
  }

  const rate = Math.round((s.converted / s.requests) * 100);
  const perUser = s.users ? (s.requests / s.users).toFixed(1) : '0';

  const blocks = [
    heading(`Statistics · ${period} days`),
    table(
      ['Measure', 'Value'],
      [
        ['Documents', num(s.requests)],
        ['People', num(s.users)],
        ['Documents per person', perUser],
        ['Converted', num(s.converted)],
        ['Success rate', rate + '%'],
        ['Returning from last period', num(returning(period))],
      ]
    ),
  ];

  const t = timings(period);
  if (t.count) {
    blocks.push(heading('How long it takes'));
    blocks.push(
      table(
        ['Measure', 'Time'],
        [
          ['Half finish within', secs(t.median)],
          ['Nine in ten within', secs(t.p90)],
          ['Longest', secs(t.max)],
        ]
      )
    );

    const q = queueTimings(period);
    if (q.count) {
      blocks.push(
        table(
          ['Waiting in the queue', 'Time'],
          [
            ['Half', secs(q.median)],
            ['Nine in ten', secs(q.p90)],
            ['Worst percent', secs(q.p99)],
            ['Longest', secs(q.max)],
          ]
        )
      );
    }

    const slow = slowestFormats(period, 5);
    if (slow.length) {
      blocks.push(
        table(
          ['Slowest formats', 'Average'],
          slow.map((f) => [f.format, secs(f.avgMs)])
        )
      );
    }
  }

  const size = sizes(period);
  if (size.count) {
    blocks.push(heading('How big the files are'));
    blocks.push(
      table(
        ['Measure', 'Size'],
        [
          ['Half are under', mb(size.median)],
          ['Nine in ten under', mb(size.p90)],
          ['Largest', mb(size.max)],
        ]
      )
    );
  }

  const formats = topFormats(period, 10);
  if (formats.length) {
    blocks.push(heading('What people send'));
    blocks.push(
      table(
        ['Format', 'Sent', 'Converted'],
        formats.map((f) => [f.format, num(f.count), num(f.converted)])
      )
    );
  }

  const users = topUsers(period, 10);
  if (users.length) {
    blocks.push(heading('Who sends most'));
    blocks.push(
      table(
        ['Chat', 'Documents'],
        users.map((u) => [String(u.chatId), num(u.count)])
      )
    );
  }

  const why = reasons(period);
  if (why.length) {
    blocks.push(heading('Why it did not work'));
    blocks.push(
      table(
        ['Reason', 'Cases'],
        why.map((r) => [REASON_LABELS[r.reason] || r.reason, num(r.count)])
      )
    );
  }

  return { blocks };
};
