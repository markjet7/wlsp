# FwlParser (Wolfram parser port)

Early-stage F# translation of the `wolfram-parser` Rust crate. The goal is API and feature parity over time; current scope is intentionally small.

## Implemented
- Core public types: positions/spans, parse options, issues/metadata, `NodeSeq`, tokens, CST/AST shells.
- UTF-8 tokenizer with BOM detection; tokens for symbols, integers/reals, strings, whitespace/newlines, basic operators (`+ - * /`), delimiters `() [] {}`, commas, colon/semicolon.
- Minimal parser:
  - Expressions with precedence/associativity for `+ - * / ^` and sequencing via `;`.
  - Parenthesized expressions.
  - Function calls using `head[args...]` (postfix call chains allowed).
  - Lists `{a, b, c}` mapped to `List[...]` calls.
  - Parse entry points mirroring the Rust crate (`tokenize*`, `parse_*`, `parse_*_seq`).

## Not yet implemented
- Full WL token vocabulary (long names, pattern tokens, box forms, infix/pre/post-fix operators, implicit times, etc.).
- Complete CST fidelity (trivia/whitespace preservation, issue generation, source tracking identical to Rust).
- Abstract CST/AST variants beyond the minimal call/leaf/error shapes.
- Diagnostics parity and recovery behavior.
- Generated data (long names, precedence tables) and LibraryLink bindings.

## Quick start
```bash
dotnet build fwlparser/fwlparser.fsproj
```

## Next steps
- Expand token kinds to cover WL operators and long-name tokens.
- Port precedence/parselet structure from Rust for accurate parsing.
- Add diagnostics mirroring Rust issues and extend metadata.
- Add unit tests against a shared corpus to track parity.
