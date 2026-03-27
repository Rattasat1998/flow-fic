# Spellcheck Service (PyThaiNLP)

Python service for Thai spellcheck used by `POST /api/spellcheck/chapter` in the Next.js app.

## Run locally

```bash
cd services/spellcheck-pythainlp
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Health check:

```bash
curl http://localhost:8000/healthz
```

## Environment

- `SPELLCHECK_SERVICE_TOKEN` optional shared secret header (`X-Spellcheck-Token`)
- `SPELLCHECK_MAX_FIELDS` default `120`
- `SPELLCHECK_MAX_TOTAL_CHARS` default `60000`
- `SPELLCHECK_MAX_SUGGESTIONS_PER_FIELD` default `6`
- `SPELLCHECK_MAX_EXAMPLES_PER_FIELD` default `3`
- `SPELLCHECK_TOKENIZE_ENGINE` default `newmm`

## Endpoint

`POST /v1/spellcheck/chapter`

Request:

```json
{
  "fields": [
    { "id": "textarea-1", "label": "เนื้อหา 1", "text": "ตัวอย่างข้อความ..." }
  ],
  "language": "th"
}
```

Response:

```json
{
  "checkedFields": 1,
  "totalMatches": 2,
  "fields": [
    {
      "id": "textarea-1",
      "label": "เนื้อหา 1",
      "matches": 2,
      "suggestions": ["ตัวอย่าง", "ข้อความ"],
      "examples": ["…ตัวอย่างข้อความ…"]
    }
  ]
}
```
