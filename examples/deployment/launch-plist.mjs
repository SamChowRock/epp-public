// macOS host adapter. The input contains only strings, booleans, integers,
// arrays and dictionaries from the launchd job definitions in this chapter.
export function launchPlist(job) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n' + element(job) + '\n</plist>\n';
}

function escapeText(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function element(value) {
  if (typeof value === 'string') return '<string>' + escapeText(value) + '</string>';
  if (typeof value === 'boolean') return value ? '<true/>' : '<false/>';
  if (Number.isSafeInteger(value)) return '<integer>' + value + '</integer>';
  if (Array.isArray(value)) return '<array>\n' + value.map(element).join('\n') + '\n</array>';
  const pairs = Object.entries(value).map(([key, item]) => '<key>' + escapeText(key) + '</key>\n' + element(item));
  return '<dict>\n' + pairs.join('\n') + '\n</dict>';
}
