import * as React from "react"
import {
  createCssVariablesTheme,
  createHighlighterCore,
  type GrammarState,
  type HighlighterCore,
} from "shiki/core"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"

// Add the languages you need. Each one loads the first time it is used.
const languages = {
  bash: () => import("shiki/langs/shellscript.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  diff: () => import("shiki/langs/diff.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
}

const aliases: Record<string, keyof typeof languages> = {
  js: "javascript",
  md: "markdown",
  py: "python",
  sh: "bash",
  shell: "bash",
  shellscript: "bash",
  ts: "typescript",
  yml: "yaml",
  zsh: "bash",
}

let highlighter: Promise<HighlighterCore> | undefined

// Syntax colors remain aliases of the generated PatientGPT theme in both modes.
const syntaxColors: Record<string, string> = {
  foreground: "var(--fg)",
  background: "var(--s1)",
  "token-constant": "var(--accent)",
  "token-string": "var(--cool)",
  "token-comment": "var(--fg-2)",
  "token-keyword": "var(--accent)",
  "token-parameter": "var(--fg)",
  "token-function": "var(--cool)",
  "token-string-expression": "var(--cool)",
  "token-punctuation": "var(--fg-2)",
  "token-link": "var(--accent)",
}

// ANSI color names are terminal roles; map them to the same warm/cool/neutral
// palette rather than introducing a separate terminal color system.
for (const [name, role] of Object.entries({
  black: "fg",
  red: "accent",
  green: "cool",
  yellow: "accent",
  blue: "cool",
  magenta: "accent",
  cyan: "cool",
  white: "fg",
})) {
  for (const prefix of ["ansi-", "ansi-bright-"]) {
    syntaxColors[`${prefix}${name}`] = `var(--${role})`
    syntaxColors[`${prefix}${name}-dim`] = `var(--${role})`
  }
}

function getHighlighter() {
  highlighter ??= createHighlighterCore({
    themes: [
      createCssVariablesTheme({
        name: "patientgpt",
        variablePrefix: "--pg-syntax-",
        variableDefaults: syntaxColors,
      }),
    ],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  })

  return highlighter
}

function getLanguage(language: string) {
  const name = language.toLowerCase()

  if (name === "ansi") {
    return name
  }

  if (name in languages) {
    return name as keyof typeof languages
  }

  return aliases[name] ?? null
}

// Loads a language and returns a highlighter for it, or null for a language
// that is not listed.
export async function loadHighlighter(language: string) {
  const lang = getLanguage(language)

  if (!lang) {
    return null
  }

  const shiki = await getHighlighter()

  if (lang !== "ansi" && !shiki.getLoadedLanguages().includes(lang)) {
    await shiki.loadLanguage(languages[lang])
  }

  return {
    // Returns one React node per line, and the grammar state after the last
    // line. Pass that state back to continue where the code left off.
    highlight(code: string, state?: GrammarState) {
      const tokenize = (text: string) =>
        shiki.codeToTokens(text, {
          lang,
          theme: "patientgpt",
          ...(state === undefined ? {} : { grammarState: state }),
        }).tokens

      // ANSI has no grammar state, so each line is tokenized on its own and
      // gets the same colors whether it arrives in one piece or streams.
      const tokens =
        lang === "ansi"
          ? code.split("\n").flatMap((line) => tokenize(line))
          : tokenize(code)

      return {
        lines: tokens.map((line) =>
          line.map((token, index) => (
            <span
              key={index}
              style={{ color: token.color, ...(token.htmlStyle as React.CSSProperties) }}
            >
              {token.content}
            </span>
          ))
        ),
        state: shiki.getLastGrammarState(tokens),
      }
    },
  }
}

// Returns one React node per line, or null for a language that is not listed.
export async function highlightCode(code: string, language: string) {
  const highlighter = await loadHighlighter(language)

  return highlighter ? highlighter.highlight(code).lines : null
}
