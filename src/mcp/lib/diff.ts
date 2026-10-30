/** Simple line-oriented change summary for MCP proposals. */
export function summarizeDiff(
  before: string,
  after: string,
): {
  unchanged: boolean;
  beforeLines: number;
  afterLines: number;
  addedLines: number;
  removedLines: number;
  preview: string;
} {
  if (before === after) {
    return {
      unchanged: true,
      beforeLines: before.split("\n").length,
      afterLines: after.split("\n").length,
      addedLines: 0,
      removedLines: 0,
      preview: "(no changes)",
    };
  }

  const beforeSet = new Set(before.split("\n"));
  const afterLines = after.split("\n");
  const beforeLines = before.split("\n");

  let added = 0;
  let removed = 0;
  const afterSet = new Set(afterLines);
  for (const line of afterLines) {
    if (!beforeSet.has(line)) added++;
  }
  for (const line of beforeLines) {
    if (!afterSet.has(line)) removed++;
  }

  const previewLines: string[] = [];
  const max = 40;
  for (const line of beforeLines) {
    if (!afterSet.has(line) && previewLines.length < max) {
      previewLines.push(`- ${line}`);
    }
  }
  for (const line of afterLines) {
    if (!beforeSet.has(line) && previewLines.length < max) {
      previewLines.push(`+ ${line}`);
    }
  }
  if (added + removed > max) {
    previewLines.push(
      `… (${added + removed - previewLines.length} more line changes)`,
    );
  }

  return {
    unchanged: false,
    beforeLines: beforeLines.length,
    afterLines: afterLines.length,
    addedLines: added,
    removedLines: removed,
    preview: previewLines.join("\n"),
  };
}
