export interface Position {
  /** 1-based. */
  line: number;
  /** 1-based, in characters (code points). */
  column: number;
}

/** The line and column of a UTF-16 offset. */
export function position(text: string, offset: number): Position {
  const before = text.slice(0, offset);
  const lineStart = Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\r")) + 1;
  return { line: before.split(/\r\n|\r|\n/).length, column: [...before.slice(lineStart)].length + 1 };
}
