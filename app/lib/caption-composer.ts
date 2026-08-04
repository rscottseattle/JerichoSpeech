export type CaptionRun = {
  id: number;
  text: string;
};

export type CaptionLine = {
  id: number;
  runs: CaptionRun[];
  committed: boolean;
};

export type CaptionLayout = {
  maxWidth: number;
  measureText: (value: string) => number;
};

const MIN_SLIDING_OVERLAP = 16;
const SENTENCE_END = /[.!?…][\])}"'»]*$/u;
const CLAUSE_END = /[,;:][\])}"'»]*$/u;
const CONNECTOR_WORDS = new Set([
  "a",
  "al",
  "con",
  "de",
  "del",
  "el",
  "en",
  "la",
  "las",
  "los",
  "o",
  "para",
  "por",
  "que",
  "su",
  "sus",
  "un",
  "una",
  "y",
]);

function cleanCaptionText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function appendedCaptionText(previous: string, next: string) {
  if (!previous) return next;
  if (next === previous || previous.endsWith(next)) return "";
  if (next.startsWith(previous)) return next.slice(previous.length);

  const maximumOverlap = Math.min(previous.length, next.length);
  for (
    let length = maximumOverlap;
    length >= MIN_SLIDING_OVERLAP;
    length -= 1
  ) {
    if (previous.endsWith(next.slice(0, length))) {
      return next.slice(length);
    }
  }

  // A replacement rehearsal caption is a new phrase, never a visual reset.
  return ` ${next}`;
}

function lineText(line: CaptionLine) {
  return line.runs.map((run) => run.text).join("");
}

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/u).length : 0;
}

function lastWord(value: string) {
  return value
    .trim()
    .split(/\s+/u)
    .at(-1)
    ?.replace(/[^\p{L}\p{N}]+$/gu, "")
    .toLocaleLowerCase("es");
}

export class CaptionComposer {
  private previousSnapshot = "";
  private pendingText = "";
  private lines: CaptionLine[] = [];
  private nextLineId = 1;
  private nextRunId = 1;

  ingest(snapshot: string) {
    const next = cleanCaptionText(snapshot);
    const addition = appendedCaptionText(this.previousSnapshot, next);
    this.previousSnapshot = next;
    if (addition) this.pendingText += addition;

    return {
      added: Boolean(addition),
      phraseEnded: /[.!?…;:]\s*$/u.test(addition),
    };
  }

  clear() {
    this.previousSnapshot = "";
    this.pendingText = "";
    this.lines = [];
    this.nextLineId = 1;
    this.nextRunId = 1;
  }

  snapshot() {
    return this.lines.map((line) => ({
      ...line,
      runs: line.runs.map((run) => ({ ...run })),
    }));
  }

  flush({ maxWidth, measureText }: CaptionLayout) {
    const cleanPending = this.pendingText.replace(/\s+/g, " ").trim();
    if (!cleanPending || maxWidth <= 0) {
      return { lines: this.snapshot(), hasPending: Boolean(cleanPending), lineAdded: false };
    }

    const words = cleanPending.split(" ");
    const attachesToPrevious =
      this.lines.length > 0 && !/^\s/u.test(this.pendingText);
    let consumed = 0;
    let linesCreated = 0;
    let lineAdded = false;
    const batchRuns = new Map<number, CaptionRun>();

    const activeLine = () => {
      const line = this.lines.at(-1);
      return line && !line.committed ? line : null;
    };

    const createLine = () => {
      if (linesCreated >= 1) return null;
      const line: CaptionLine = {
        id: this.nextLineId,
        runs: [],
        committed: false,
      };
      this.nextLineId += 1;
      this.lines.push(line);
      linesCreated += 1;
      lineAdded = true;
      return line;
    };

    const appendToLine = (line: CaptionLine, text: string) => {
      let run = batchRuns.get(line.id);
      if (!run) {
        run = { id: this.nextRunId, text: "" };
        this.nextRunId += 1;
        line.runs.push(run);
        batchRuns.set(line.id, run);
      }
      run.text += text;
    };

    // Keep a short arriving phrase together when the current row is already
    // comfortably filled and that phrase fits naturally on the next row.
    const current = activeLine();
    const arrivingPhrase = words.join(" ");
    if (
      current &&
      words.length <= 7 &&
      measureText(arrivingPhrase) <= maxWidth * 0.94 &&
      measureText(lineText(current)) >= maxWidth * 0.62 &&
      measureText(`${lineText(current)} ${arrivingPhrase}`) > maxWidth &&
      wordCount(lineText(current)) >= 4
    ) {
      current.committed = true;
    }

    while (consumed < words.length) {
      let line = activeLine();
      if (!line) {
        line = createLine();
        if (!line) break;
      }

      const existing = lineText(line);
      const separator =
        existing && !(attachesToPrevious && consumed === 0) ? " " : "";
      const fragment = `${separator}${words[consumed]}`;
      const candidate = `${existing}${fragment}`;

      if (existing && measureText(candidate) > maxWidth) {
        line.committed = true;
        const nextLine = createLine();
        if (!nextLine) break;
        line = nextLine;
        appendToLine(line, words[consumed]);
      } else {
        appendToLine(line, fragment);
      }

      consumed += 1;

      const updatedText = lineText(line);
      const fullness = measureText(updatedText) / maxWidth;
      const wordsOnLine = wordCount(updatedText);
      const finalWord = lastWord(updatedText);
      const safeBoundary = !finalWord || !CONNECTOR_WORDS.has(finalWord);
      const shouldCommitSentence =
        SENTENCE_END.test(updatedText) &&
        fullness >= 0.58 &&
        wordsOnLine >= 4 &&
        safeBoundary;
      const shouldCommitClause =
        CLAUSE_END.test(updatedText) &&
        fullness >= 0.8 &&
        wordsOnLine >= 5 &&
        safeBoundary;

      if (shouldCommitSentence || shouldCommitClause) line.committed = true;
    }

    const remaining = words.slice(consumed);
    this.pendingText = remaining.length ? ` ${remaining.join(" ")}` : "";

    return {
      lines: this.snapshot(),
      hasPending: remaining.length > 0,
      lineAdded,
    };
  }
}
