use std::io::{self, Read, Write};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use wolfram_parser::{
    issue::{Issue, Severity},
    source::{CharacterSpan, LineColumnSpan, Source, SpanKind},
    ParseOptions,
};

fn main() -> Result<()> {
    let mut buffer = String::new();
    io::stdin()
        .read_to_string(&mut buffer)
        .context("failed to read diagnostics request")?;

    if buffer.trim().is_empty() {
        bail!("empty diagnostics request");
    }

    let request: DiagnosticRequest =
        serde_json::from_str(&buffer).context("invalid diagnostics request")?;

    let opts = ParseOptions::default();
    let parse_result =
        wolfram_parser::parse_bytes_cst_seq(request.text.as_bytes(), &opts);

    let mut issues = parse_result.fatal_issues;
    issues.extend(parse_result.non_fatal_issues);

    let index = LineIndex::new(&request.text);

    let diagnostics: Vec<Diagnostic> = issues
        .into_iter()
        .filter_map(|issue| issue_to_diagnostic(issue, &request, &index))
        .collect();

    let response = DiagnosticResponse { diagnostics };

    serde_json::to_writer(io::stdout(), &response)
        .context("failed to serialize diagnostics response")?;
    io::stdout().flush().ok();

    Ok(())
}

#[derive(Deserialize)]
struct DiagnosticRequest {
    text: String,
    uri: Option<String>,
}

#[derive(Serialize)]
struct DiagnosticResponse {
    diagnostics: Vec<Diagnostic>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Diagnostic {
    range: Range,
    severity: Option<u32>,
    code: Option<String>,
    source: String,
    message: String,
    related_information: Option<Vec<DiagnosticRelatedInformation>>,
}

#[derive(Serialize, Clone)]
struct Range {
    start: Position,
    end: Position,
}

#[derive(Serialize, Clone)]
struct Position {
    line: u32,
    character: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticRelatedInformation {
    location: Location,
    message: String,
}

#[derive(Serialize)]
struct Location {
    uri: String,
    range: Range,
}

fn issue_to_diagnostic(
    issue: Issue,
    request: &DiagnosticRequest,
    index: &LineIndex,
) -> Option<Diagnostic> {
    let range = source_to_range(&issue.src, index)?;
    let severity = Some(map_severity(issue.sev));
    let code = Some(issue.tag.as_str().to_string());
    let mut message = issue.msg.clone();

    if !issue.additional_descriptions.is_empty() {
        let extras = issue.additional_descriptions.join("\n");
        if !extras.is_empty() {
            if !message.is_empty() {
                message.push_str("\n\n");
            }
            message.push_str(&extras);
        }
    }

    let related_information = build_related_information(&issue, request, index);

    Some(Diagnostic {
        range,
        severity,
        code,
        source: "codeparser".to_string(),
        message,
        related_information,
    })
}

fn build_related_information(
    issue: &Issue,
    request: &DiagnosticRequest,
    index: &LineIndex,
) -> Option<Vec<DiagnosticRelatedInformation>> {
    let uri = match &request.uri {
        Some(uri) if !uri.is_empty() => uri.clone(),
        _ => return None,
    };

    let entries: Vec<DiagnosticRelatedInformation> = issue
        .additional_sources
        .iter()
        .filter_map(|source| source_to_range(source, index))
        .map(|range| DiagnosticRelatedInformation {
            location: Location {
                uri: uri.clone(),
                range,
            },
            message: issue.msg.clone(),
        })
        .collect();

    if entries.is_empty() {
        None
    } else {
        Some(entries)
    }
}

fn map_severity(severity: Severity) -> u32 {
    match severity {
        Severity::Fatal | Severity::Error => 1,
        Severity::Warning => 2,
        Severity::Remark => 3,
        Severity::Formatting => 4,
    }
}

fn source_to_range(source: &Source, index: &LineIndex) -> Option<Range> {
    match source {
        Source::Span(span) => match span.kind() {
            SpanKind::LineColumnSpan(line_span) => {
                Some(line_column_to_range(line_span))
            },
            SpanKind::CharacterSpan(char_span) => {
                index.range_from_character_span(char_span)
            },
        },
        Source::Box(_) | Source::Unknown => None,
    }
}

fn line_column_to_range(span: LineColumnSpan) -> Range {
    let start_line = span.start.line().get().saturating_sub(1);
    let start_character = span.start.column().get().saturating_sub(1);
    let end_line = span.end.line().get().saturating_sub(1);
    let end_character = span.end.column().get().saturating_sub(1);

    Range {
        start: Position {
            line: start_line,
            character: start_character,
        },
        end: Position {
            line: end_line,
            character: end_character,
        },
    }
}

struct LineIndex {
    line_starts: Vec<usize>,
}

impl LineIndex {
    fn new(text: &str) -> Self {
        let mut line_starts = vec![0usize];
        let mut offset = 0usize;

        for ch in text.chars() {
            offset += 1;
            if ch == '\n' {
                line_starts.push(offset);
            }
        }

        LineIndex { line_starts }
    }

    fn range_from_character_span(&self, span: CharacterSpan) -> Option<Range> {
        let start = span.0.checked_sub(1)?;
        let end = span.1.checked_sub(1)?;

        let start_offset = usize::try_from(start).ok()?;
        let end_offset = usize::try_from(end).ok()?;

        Some(Range {
            start: self.offset_to_position(start_offset),
            end: self.offset_to_position(end_offset.max(start_offset)),
        })
    }

    fn offset_to_position(&self, offset: usize) -> Position {
        if self.line_starts.is_empty() {
            return Position {
                line: 0,
                character: offset as u32,
            };
        }

        let line_index = match self.line_starts.binary_search(&offset) {
            Ok(index) => index,
            Err(index) => index.saturating_sub(1),
        };

        let line_start = *self.line_starts.get(line_index).unwrap_or(&0);
        Position {
            line: line_index as u32,
            character: (offset - line_start) as u32,
        }
    }
}
