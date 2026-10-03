// A small, dependency-free code highlighter (ui-kit 0.6.0).
//
// A lexer, not a parser: it splits source text into comment / string /
// number / keyword / plain tokens with each language family's comment and
// string syntax. It never changes the text (joining every token's text gives
// the input back), it is linear in the input, and it renders React text nodes
// (no HTML injection). Unknown languages render as plain text.
import React from "react";

export type CodeTokenKind = "plain" | "comment" | "string" | "number" | "keyword";
export type CodeToken = { kind: CodeTokenKind; text: string };

type Family = {
  line: string[];
  block?: [string, string];
  strings: string[];
  triple?: boolean;
  keywords: ReadonlySet<string>;
};

const words = (s: string): ReadonlySet<string> => new Set(s.split(/\s+/).filter(Boolean));

const C_LIKE = words(
  "if else for while do switch case default break continue return function const let var class extends new this super " +
    "import export from as async await try catch finally throw typeof instanceof in of void delete yield static public private " +
    "protected interface type enum implements package struct fn impl trait pub use mod mut match loop where crate self Self " +
    "func go defer chan map range select int long short char float double bool boolean string true false null nil undefined " +
    "None True False namespace using template typename virtual override final abstract sealed record val object fun when is",
);
const PYTHON = words(
  "def class return if elif else for while in not and or is import from as with try except finally raise pass break continue " +
    "lambda yield global nonlocal assert del async await None True False self match case",
);
const SHELL = words("if then else elif fi for while do done case esac in function return export local readonly set unset echo exit source");
const SQL = words(
  "select from where insert into values update set delete create table index view drop alter add join left right inner outer on " +
    "group by order having limit offset as and or not null is in like between union all distinct primary key foreign references default",
);
const DATA = words("true false null yes no on off");

const FAMILIES: Record<string, Family> = {
  c: { line: ["//"], block: ["/*", "*/"], strings: ['"', "'", "`"], keywords: C_LIKE },
  python: { line: ["#"], strings: ['"', "'"], triple: true, keywords: PYTHON },
  shell: { line: ["#"], strings: ['"', "'"], keywords: SHELL },
  sql: { line: ["--"], block: ["/*", "*/"], strings: ["'", '"'], keywords: SQL },
  data: { line: ["#"], strings: ['"', "'"], keywords: DATA },
  json: { line: [], strings: ['"'], keywords: DATA },
  css: { line: [], block: ["/*", "*/"], strings: ['"', "'"], keywords: words("") },
  markup: { line: [], block: ["<!--", "-->"], strings: ['"', "'"], keywords: words("") },
};

const BY_EXTENSION: Record<string, string> = {
  js: "c", mjs: "c", cjs: "c", jsx: "c", ts: "c", tsx: "c", java: "c", kt: "c", c: "c", h: "c", cc: "c", cpp: "c", hpp: "c",
  cs: "c", go: "c", rs: "c", swift: "c", scala: "c", dart: "c", php: "c",
  py: "python", pyi: "python", rb: "shell", sh: "shell", bash: "shell", zsh: "shell", fish: "shell", ps1: "shell",
  sql: "sql", yaml: "data", yml: "data", toml: "data", ini: "data", cfg: "data", conf: "data", env: "data",
  json: "json", jsonl: "json", css: "css", scss: "css", less: "css", html: "markup", htm: "markup", xml: "markup", svg: "markup", vue: "markup",
  javascript: "c", typescript: "c", rust: "c", python: "python", shell: "shell",
};

/** The highlighter family for a file name or a fence language ("" = plain text). */
export function codeLanguage(nameOrLang: string): string {
  const raw = String(nameOrLang || "").trim().toLowerCase();
  const base = raw.split("/").pop() || raw;
  if (base === "dockerfile" || base === "makefile") return "shell";
  const dot = base.lastIndexOf(".");
  const ext = dot >= 0 ? base.slice(dot + 1) : base;
  return BY_EXTENSION[ext] || "";
}

const isDigit = (ch: string) => ch >= "0" && ch <= "9";
const isWordStart = (ch: string) => /[A-Za-z_$]/.test(ch);
const isWord = (ch: string) => /[A-Za-z0-9_$]/.test(ch);

/** Split `text` into tokens for `language` (a `codeLanguage` result). Joining the texts returns `text`. */
export function highlightCode(text: string, language: string): CodeToken[] {
  const src = String(text ?? "");
  const family = FAMILIES[language];
  if (!family) return src ? [{ kind: "plain", text: src }] : [];
  const out: CodeToken[] = [];
  let plain = "";
  const push = (kind: CodeTokenKind, value: string) => {
    if (!value) return;
    if (kind === "plain") {
      plain += value;
      return;
    }
    if (plain) out.push({ kind: "plain", text: plain });
    plain = "";
    out.push({ kind, text: value });
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const line = family.line.find((m) => src.startsWith(m, i));
    if (line) {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      push("comment", src.slice(i, stop));
      i = stop;
      continue;
    }
    if (family.block && src.startsWith(family.block[0], i)) {
      const end = src.indexOf(family.block[1], i + family.block[0].length);
      const stop = end === -1 ? src.length : end + family.block[1].length;
      push("comment", src.slice(i, stop));
      i = stop;
      continue;
    }
    if (family.strings.includes(ch)) {
      const triple = family.triple && src.startsWith(ch.repeat(3), i) ? ch.repeat(3) : "";
      if (triple) {
        const end = src.indexOf(triple, i + 3);
        const stop = end === -1 ? src.length : end + 3;
        push("string", src.slice(i, stop));
        i = stop;
        continue;
      }
      let j = i + 1;
      while (j < src.length && src[j] !== ch && (ch === "`" || src[j] !== "\n")) j += src[j] === "\\" ? 2 : 1;
      const stop = Math.min(src.length, j + 1);
      push("string", src.slice(i, stop));
      i = stop;
      continue;
    }
    if (isDigit(ch) && !(i > 0 && isWord(src[i - 1]))) {
      let j = i + 1;
      while (j < src.length && /[0-9a-fA-FxXoObB._]/.test(src[j])) j += 1;
      push("number", src.slice(i, j));
      i = j;
      continue;
    }
    if (isWordStart(ch)) {
      let j = i + 1;
      while (j < src.length && isWord(src[j])) j += 1;
      const word = src.slice(i, j);
      const keyword = language === "sql" ? family.keywords.has(word.toLowerCase()) : family.keywords.has(word);
      push(keyword ? "keyword" : "plain", word);
      i = j;
      continue;
    }
    push("plain", ch);
    i += 1;
  }
  if (plain) out.push({ kind: "plain", text: plain });
  return out;
}

export type AfCodeBlockProps = {
  text: string;
  /** A file name ("main.py") or a language ("python"); "" renders plain text. */
  language?: string;
  /** Show line numbers (default true). */
  lineNumbers?: boolean;
  className?: string;
  ariaLabel?: string;
};

/** Highlighted, wrapped source text (long lines wrap; the block never scrolls sideways). */
export function AfCodeBlock({ text, language = "", lineNumbers = true, className, ariaLabel }: AfCodeBlockProps): React.ReactElement {
  const lang = codeLanguage(language);
  const tokens = highlightCode(text, lang);
  const lines = lineNumbers ? String(text ?? "").split("\n").length : 0;
  return (
    <pre
      className={`af-code${lineNumbers ? " af-code--numbered" : ""}${className ? ` ${className}` : ""}`}
      data-language={lang || "text"}
      aria-label={ariaLabel}
      style={lineNumbers ? ({ "--af-code-gutter": `${String(lines).length + 1}ch` } as React.CSSProperties) : undefined}
    >
      <code>
        {lineNumbers
          ? splitLines(tokens).map((lineTokens, n) => (
              <span className="af-code__line" key={n} data-line={n + 1}>
                {lineTokens.map((t, k) => renderToken(t, k))}
                {"\n"}
              </span>
            ))
          : tokens.map((t, k) => renderToken(t, k))}
      </code>
    </pre>
  );
}

function renderToken(t: CodeToken, key: number): React.ReactNode {
  return t.kind === "plain" ? (
    <React.Fragment key={key}>{t.text}</React.Fragment>
  ) : (
    <span key={key} className={`af-code__${t.kind}`}>
      {t.text}
    </span>
  );
}

/** Tokens regrouped per source line (a multi-line comment/string is split at its newlines). */
function splitLines(tokens: CodeToken[]): CodeToken[][] {
  const lines: CodeToken[][] = [[]];
  for (const t of tokens) {
    const parts = t.text.split("\n");
    parts.forEach((part, idx) => {
      if (idx > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ kind: t.kind, text: part });
    });
  }
  return lines;
}
