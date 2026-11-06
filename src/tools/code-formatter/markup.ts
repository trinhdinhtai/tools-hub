/**
 * HTML and XML made short by a scanner over code a parser has already accepted: comments go, whitespace inside tags
 * shrinks, and so does whitespace between them where it never shows.
 */

/** Minifies what is inside a <script> or <style>; throws on code it cannot read, which is then kept as it is. */
export interface EmbeddedMinifiers {
  javascript(code: string, module: boolean): Promise<string>;
  css(code: string): Promise<string>;
}

type Token =
  | { kind: "text"; text: string }
  /** Kept as it is: CDATA, and what is inside <pre>, <textarea>, <script> and <style>. */
  | { kind: "raw"; text: string }
  /** A tag, declaration or processing instruction, already shortened; `name` is lower case in HTML. */
  | { kind: "tag"; text: string; name: string };

// Whitespace in HTML: never U+00A0, which shows as a space that does not break.
const SPACE = /[ \t\n\r\f]+/g;
const NAME_START = /[A-Za-z_:]/;

/** Whitespace around these elements does not show, so it goes; around others (span, a, b) one space stays. */
const BLOCKS = new Set(
  (
    "html head body title meta link base script style noscript template div p ul ol li dl dt dd table caption " +
    "colgroup col thead tbody tfoot tr td th section article header footer nav main aside h1 h2 h3 h4 h5 h6 form " +
    "fieldset legend hr blockquote figure figcaption pre address details summary dialog menu option optgroup " +
    "!doctype ?xml"
  ).split(" "),
);

/** Elements whose content is kept as it is in HTML (and minified as code, for <script> and <style>). */
const RAW_CONTENT = new Set(["script", "style", "pre", "textarea"]);

const JAVASCRIPT_TYPES = new Set(["", "text/javascript", "application/javascript", "module"]);

/** Index just past `end` from `from`, or the end of `text` when it never comes. */
function indexAfter(text: string, end: string, from: number): number {
  const at = text.indexOf(end, from);
  return at === -1 ? text.length : at + end.length;
}

/** Index just past the `>` that ends the tag or declaration starting at `from`, skipping quoted values and [ ]. */
function tagEnd(text: string, from: number): number {
  let quote = "";
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "[") depth++;
    else if (char === "]") depth = Math.max(0, depth - 1);
    else if (char === ">" && depth === 0) return i + 1;
  }
  return text.length;
}

/** A tag with one space between its parts, none around `=` or before its `>`. */
function shortenTag(tag: string, xml: boolean): string {
  let out = "";
  let quote = "";
  for (let i = 0; i < tag.length; i++) {
    const char = tag[i]!;
    if (quote) {
      out += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    if (/\s/.test(char)) {
      if (!out.endsWith(" ")) out += " ";
      continue;
    }
    if (char === "=") {
      out = `${out.trimEnd()}=`;
      while (/\s/.test(tag[i + 1] ?? "")) i++;
      continue;
    }
    out += char;
  }
  // In HTML an unquoted value may end in "/", so the space before "/>" goes only after a quote or in XML.
  return out.replace(/ (\/?>)$/, (match, end: string, offset: number) =>
    end === ">" || xml || /["']$/.test(out.slice(0, offset)) ? end : match,
  );
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? (match[2] ?? match[3] ?? match[4] ?? "") : undefined;
}

function tokenize(text: string, xml: boolean): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const push = (token: Token) => {
    const last = tokens.at(-1);
    if (token.kind === "text" && last?.kind === "text") last.text += token.text;
    else tokens.push(token);
  };
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt === -1) {
      push({ kind: "text", text: text.slice(i) });
      break;
    }
    if (lt > i) push({ kind: "text", text: text.slice(i, lt) });
    i = lt;
    if (text.startsWith("<!--", i)) {
      const end = indexAfter(text, "-->", i + 4);
      // Conditional comments (<!--[if IE]>…<![endif]-->) are read by browsers, so they stay.
      if (!xml && /^<!--(\[if\b|<!)/.test(text.slice(i, i + 9))) push({ kind: "tag", text: text.slice(i, end), name: "!--" });
      i = end;
    } else if (text.startsWith("<![CDATA[", i)) {
      const end = indexAfter(text, "]]>", i);
      push({ kind: "raw", text: text.slice(i, end) });
      i = end;
    } else if (text.startsWith("<?", i)) {
      const end = indexAfter(text, "?>", i);
      const body = text.slice(i, end);
      push({ kind: "tag", text: body, name: `?${body.slice(2).split(/[\s?]/)[0]!.toLowerCase()}` });
      i = end;
    } else if (text.startsWith("<!", i)) {
      const end = tagEnd(text, i);
      const body = text.slice(i, end).replace(SPACE, " ");
      push({ kind: "tag", text: body, name: body.slice(1).split(/[\s>]/)[0]!.toLowerCase() });
      i = end;
    } else if (text[i + 1] === "/" || NAME_START.test(text[i + 1] ?? "")) {
      const end = tagEnd(text, i);
      const raw = text.slice(i, end);
      const short = shortenTag(raw, xml);
      const closing = short[1] === "/";
      const tagName = /^<\/?\s*([^\s/>]+)/.exec(short)?.[1] ?? "";
      const name = xml ? tagName : tagName.toLowerCase();
      push({ kind: "tag", text: short, name });
      i = end;
      if (!xml && !closing && !short.endsWith("/>") && RAW_CONTENT.has(name)) {
        const close = text.toLowerCase().indexOf(`</${name}`, i);
        const contentEnd = close === -1 ? text.length : close;
        push({ kind: "raw", text: text.slice(i, contentEnd) });
        i = contentEnd;
      }
    } else {
      push({ kind: "text", text: "<" });
      i++;
    }
  }
  return tokens;
}

const isBlock = (token: Token | undefined) => token === undefined || (token.kind === "tag" && BLOCKS.has(token.name));

async function minifyEmbedded(open: Token | undefined, code: string, minifiers: EmbeddedMinifiers): Promise<string> {
  if (open?.kind !== "tag" || !code.trim()) return code.trim() ? code : "";
  const type = (attribute(open.text, "type") ?? "").trim().toLowerCase();
  try {
    if (open.name === "script" && JAVASCRIPT_TYPES.has(type)) return await minifiers.javascript(code, type === "module");
    if (open.name === "style" && (type === "" || type === "text/css")) return await minifiers.css(code);
  } catch {
    // Code the minifier cannot read is kept, trimmed: the page around it is still made short.
  }
  return open.name === "script" || open.name === "style" ? code.trim() : code;
}

/**
 * Whether whitespace-only text in XML is layout, to go, at each point: between elements on their own lines, but not
 * a space between words (`<b>a</b> <i>b</i>`) nor anything under `xml:space="preserve"`.
 */
function xmlWhitespaceGoes(tokens: Token[]): boolean[] {
  const preserve: boolean[] = [false];
  return tokens.map((token) => {
    if (token.kind === "tag" && /^<[^/?!]/.test(token.text)) {
      const space = attribute(token.text, "xml:space");
      const inherited = preserve.at(-1)!;
      if (!token.text.endsWith("/>")) preserve.push(space === undefined ? inherited : space === "preserve");
    } else if (token.kind === "tag" && token.text.startsWith("</") && preserve.length > 1) preserve.pop();
    return token.kind === "text" && !token.text.trim() && /[\n\r]/.test(token.text) && !preserve.at(-1);
  });
}

export async function minifyMarkup(text: string, language: "html" | "xml", minifiers: EmbeddedMinifiers): Promise<string> {
  const xml = language === "xml";
  const tokens = tokenize(text, xml);
  const goes = xml ? xmlWhitespaceGoes(tokens) : [];
  let out = "";
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.kind === "tag") out += token.text;
    else if (token.kind === "raw") out += xml ? token.text : await minifyEmbedded(tokens[i - 1], token.text, minifiers);
    else if (xml) out += goes[i] ? "" : token.text;
    else {
      let collapsed = token.text.replace(SPACE, " ");
      if (isBlock(tokens[i - 1])) collapsed = collapsed.replace(/^ /, "");
      if (isBlock(tokens[i + 1])) collapsed = collapsed.replace(/ $/, "");
      out += collapsed;
    }
  }
  return out;
}
