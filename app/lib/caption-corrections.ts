export type CaptionCorrection = {
  source: string;
  preferred: string;
  foldedSource: string;
};

const STABLE_END = /[\s.,!?;:…\-–—)\]}"'»]$/u;

function fold(value: string) {
  return value.toLocaleLowerCase("es");
}

function isTermBoundary(value: string | undefined) {
  return value === undefined || !/[\p{L}\p{N}]/u.test(value);
}

function firstStableUnitLength(value: string, force: boolean) {
  const leadingSpace = value.match(/^\s+/u);
  if (leadingSpace) return leadingSpace[0].length;

  const space = value.search(/\s/u);
  if (space >= 0) {
    const trailing = value.slice(space).match(/^\s+/u)?.[0].length ?? 1;
    return space + trailing;
  }

  if (STABLE_END.test(value) || force) return value.length;
  return 0;
}

export function parseCaptionCorrections(value: string): CaptionCorrection[] {
  const bySource = new Map<string, CaptionCorrection>();

  for (const rawLine of value.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;

    const separator = line.includes("→") ? "→" : "=";
    const separatorIndex = line.indexOf(separator);
    if (separatorIndex < 1) continue;

    const source = line.slice(0, separatorIndex).trim();
    const preferred = line.slice(separatorIndex + separator.length).trim();
    if (!source || !preferred) continue;

    const foldedSource = fold(source);
    bySource.set(foldedSource, { source, preferred, foldedSource });
  }

  return [...bySource.values()].sort(
    (left, right) => right.source.length - left.source.length,
  );
}

export function drainCaptionCorrections(
  value: string,
  corrections: readonly CaptionCorrection[],
  force = false,
) {
  let pending = value;
  let emitted = "";

  while (pending) {
    const leadingSpace = pending.match(/^\s+/u);
    if (leadingSpace) {
      emitted += leadingSpace[0];
      pending = pending.slice(leadingSpace[0].length);
      continue;
    }

    const foldedPending = fold(pending);
    const fullMatch = corrections.find(
      (entry) =>
        foldedPending.startsWith(entry.foldedSource) &&
        isTermBoundary(pending[entry.source.length]) &&
        (pending.length > entry.source.length || force),
    );

    if (fullMatch) {
      emitted += fullMatch.preferred;
      pending = pending.slice(fullMatch.source.length);
      continue;
    }

    const couldBecomeCorrection = corrections.some((entry) =>
      entry.foldedSource.startsWith(foldedPending),
    );
    if (couldBecomeCorrection && !force) break;

    const unitLength = firstStableUnitLength(pending, force);
    if (!unitLength) break;

    emitted += pending.slice(0, unitLength);
    pending = pending.slice(unitLength);
  }

  return { emitted, pending };
}

export function applyCaptionCorrections(
  value: string,
  corrections: readonly CaptionCorrection[],
) {
  return drainCaptionCorrections(value, corrections, true).emitted;
}
