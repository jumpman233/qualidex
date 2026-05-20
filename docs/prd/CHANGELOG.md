# Qualidex PRD Changelog

## V1.5 changed split files

Compared with split PRD V1.4. Only changed split PRD files are included.

### Changed files

- `00-overview.md`
- `01-user-flows.md`
- `02-archive-rules.md`
- `03-query-export.md`
- `04-review-crud.md`
- `05-ai-ocr-rules.md`
- `06-data-model.md`
- `07-ui-design.md`
- `08-mvp-roadmap.md`

### Main update

- Added complete ID card number requirements: local SQLite stores `id_card_number`, optional `id_card_number_encrypted`, `id_card_hash`, and `masked_display`.
- Clarified privacy boundary: UI defaults to masked ID display; cloud AI input must use masked values or hash and must not include complete ID card numbers.
- Clarified archive naming: folders continue using name + ID last four digits or system ID, never complete ID card numbers.
- Added `export_full_id_card` rule: Excel export defaults to masked ID and exports complete ID only after explicit user choice.
- Clarified that MVP does not support multiple ID card numbers per person; conflicting complete IDs enter review.
- Added one-person-multiple-licenses requirements across import, review, query, export, and conflict display.
- Added folder-level secondary merge requirements for grouping files in the same folder and producing review items on conflict.
- Clarified multi-person file behavior: link to all involved people, archive only under `_多人员资料`, and show warnings in detail/export.
- Added post-import/post-processing CTA rules: go to review when review items exist, otherwise proceed to archive preview, then query/export.
- Added P0/P1 annotations for the updated requirements.
- Added P1 dynamic category configuration requirements while keeping the MVP default category list.

## V1.4 changed split files

Compared with split PRD V1.3. Only changed split PRD files are included.

### Changed files

- `00-overview.md`
- `02-archive-rules.md`
- `03-query-export.md`
- `04-review-crud.md`
- `05-ai-ocr-rules.md`
- `06-data-model.md`
- `07-ui-design.md`
- `08-mvp-roadmap.md`

### Main update

- Added path semantic parsing as an explicit design module.
- Added `relative_path`, `path_segments`, `path_parse_result`, `path_confidence` to `files`.
- Added path/OCR conflict review types and acceptance criteria.
- Added path semantic parsing risks and P0/P1 scope.
