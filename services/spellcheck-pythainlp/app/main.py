import os
import re
from collections import Counter
from functools import lru_cache
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from pythainlp.spell import spell as thai_spell
from pythainlp.tokenize import word_tokenize

APP_NAME = "flow-fic-spellcheck-pythainlp"
APP_VERSION = "1.0.0"

MAX_FIELDS = int(os.getenv("SPELLCHECK_MAX_FIELDS", "120"))
MAX_TOTAL_CHARS = int(os.getenv("SPELLCHECK_MAX_TOTAL_CHARS", "60000"))
MAX_SUGGESTIONS_PER_FIELD = int(os.getenv("SPELLCHECK_MAX_SUGGESTIONS_PER_FIELD", "6"))
MAX_EXAMPLES_PER_FIELD = int(os.getenv("SPELLCHECK_MAX_EXAMPLES_PER_FIELD", "3"))
TOKENIZE_ENGINE = os.getenv("SPELLCHECK_TOKENIZE_ENGINE", "newmm").strip() or "newmm"
SERVICE_TOKEN = os.getenv("SPELLCHECK_SERVICE_TOKEN", "").strip()

THAI_CHAR_RE = re.compile(r"[ก-๙]")
LATIN_OR_DIGIT_RE = re.compile(r"[A-Za-z0-9]")
URL_RE = re.compile(r"^(?:https?:\/\/|www\.)", flags=re.IGNORECASE)
PUNCT_ONLY_RE = re.compile(r"^[\W_]+$", flags=re.UNICODE)

app = FastAPI(title=APP_NAME, version=APP_VERSION)


class SpellcheckFieldInput(BaseModel):
    id: str = Field(min_length=1, max_length=160)
    label: str = Field(min_length=1, max_length=220)
    text: str = Field(min_length=1, max_length=20000)


class SpellcheckRequest(BaseModel):
    fields: list[SpellcheckFieldInput] = Field(default_factory=list)
    language: str | None = None


class FieldIssue(BaseModel):
    id: str
    label: str
    matches: int
    suggestions: list[str] = Field(default_factory=list)
    examples: list[str] = Field(default_factory=list)


class SpellcheckResponse(BaseModel):
    checkedFields: int
    totalMatches: int
    fields: list[FieldIssue] = Field(default_factory=list)


@app.middleware("http")
async def add_no_store_header(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response


def normalize_fields(raw_fields: list[SpellcheckFieldInput]) -> list[SpellcheckFieldInput]:
    deduped: list[SpellcheckFieldInput] = []
    seen_ids: set[str] = set()
    total_chars = 0

    for field in raw_fields[:MAX_FIELDS]:
        field_id = field.id.strip()
        if not field_id or field_id in seen_ids:
            continue

        text = field.text.replace("\r\n", "\n").strip()
        if not text:
            continue

        total_chars += len(text)
        if total_chars > MAX_TOTAL_CHARS:
            break

        seen_ids.add(field_id)
        deduped.append(
            SpellcheckFieldInput(
                id=field_id,
                label=field.label.strip() or field_id,
                text=text,
            )
        )

    return deduped


def is_candidate_token(token: str) -> bool:
    value = token.strip()
    if len(value) < 2 or len(value) > 40:
        return False
    if URL_RE.match(value):
        return False
    if LATIN_OR_DIGIT_RE.search(value):
        return False
    if PUNCT_ONLY_RE.match(value):
        return False
    if not THAI_CHAR_RE.search(value):
        return False
    return True


def unique_limited(values: list[str], max_items: int) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()

    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        result.append(normalized)
        seen.add(normalized)
        if len(result) >= max_items:
            break

    return result


def make_example(text: str, token: str) -> str:
    index = text.find(token)
    if index < 0:
        return token

    start = max(0, index - 14)
    end = min(len(text), index + len(token) + 14)
    excerpt = text[start:end].replace("\n", " ").strip()
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(text) else ""
    return f"{prefix}{excerpt}{suffix}"


@lru_cache(maxsize=4096)
def lookup_spell_suggestions(token: str) -> tuple[str, ...]:
    try:
        raw = thai_spell(token)
    except Exception:
        return tuple()

    if not isinstance(raw, list):
        return tuple()

    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, str):
            continue
        value = item.strip()
        if not value or value in seen:
            continue
        normalized.append(value)
        seen.add(value)
        if len(normalized) >= 10:
            break

    return tuple(normalized)


def evaluate_field(field: SpellcheckFieldInput) -> FieldIssue | None:
    tokens = word_tokenize(field.text, engine=TOKENIZE_ENGINE, keep_whitespace=False)
    candidate_counts = Counter(token for token in tokens if is_candidate_token(token))
    if not candidate_counts:
        return None

    suggestions: list[str] = []
    examples: list[str] = []
    total_matches = 0

    for token, count in candidate_counts.items():
        candidates = list(lookup_spell_suggestions(token))
        if token in candidates:
            continue

        total_matches += count

        cleaned_suggestions = unique_limited(
            [candidate for candidate in candidates if candidate != token],
            MAX_SUGGESTIONS_PER_FIELD,
        )
        for suggestion in cleaned_suggestions:
            if suggestion not in suggestions:
                suggestions.append(suggestion)
                if len(suggestions) >= MAX_SUGGESTIONS_PER_FIELD:
                    break

        example = make_example(field.text, token)
        if (
            example
            and example not in examples
            and len(examples) < MAX_EXAMPLES_PER_FIELD
        ):
            examples.append(example)

    if total_matches <= 0:
        return None

    return FieldIssue(
        id=field.id,
        label=field.label,
        matches=total_matches,
        suggestions=suggestions[:MAX_SUGGESTIONS_PER_FIELD],
        examples=examples[:MAX_EXAMPLES_PER_FIELD],
    )


def require_service_token(x_spellcheck_token: str | None) -> None:
    if not SERVICE_TOKEN:
        return
    if x_spellcheck_token and x_spellcheck_token.strip() == SERVICE_TOKEN:
        return
    raise HTTPException(status_code=401, detail="Unauthorized service token")


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {"ok": True, "service": APP_NAME, "version": APP_VERSION}


@app.post("/v1/spellcheck/chapter", response_model=SpellcheckResponse)
def spellcheck_chapter(
    payload: SpellcheckRequest,
    x_spellcheck_token: str | None = Header(default=None),
) -> SpellcheckResponse:
    require_service_token(x_spellcheck_token)

    normalized_fields = normalize_fields(payload.fields)
    if not normalized_fields:
        return SpellcheckResponse(checkedFields=0, totalMatches=0, fields=[])

    issues: list[FieldIssue] = []
    for field in normalized_fields:
        issue = evaluate_field(field)
        if issue:
            issues.append(issue)

    issues.sort(key=lambda item: item.matches, reverse=True)
    total_matches = sum(item.matches for item in issues)

    return SpellcheckResponse(
        checkedFields=len(normalized_fields),
        totalMatches=total_matches,
        fields=issues,
    )
