/**
 * Minimal RFC 4180 CSV reader.
 *
 * The two upstreams differ: the city signage file quotes fields (and its
 * descriptions contain commas), while the AMD files are unquoted. One parser
 * that honours quotes handles both correctly.
 */

export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ',') {
      fields.push(field);
      field = '';
    } else field += char;
  }

  fields.push(field);
  return fields;
}

/** Parse a whole CSV document into row objects keyed by header name. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (const [i, header] of headers.entries()) {
      row[header] = (values[i] ?? '').trim();
    }
    return row;
  });
}
