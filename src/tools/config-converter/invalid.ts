import type { Position } from "@/lib/position";

/** Thrown by a parser for Input that is not valid in its format; where, if it can tell. */
export class InvalidConfig extends Error {
  constructor(readonly at?: Position) {
    super("invalid");
  }
}
