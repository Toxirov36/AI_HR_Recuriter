ALTER TABLE "Vacancy"
  ADD COLUMN "department" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "workModel" TEXT,
  ADD COLUMN "employmentType" TEXT,
  ADD COLUMN "seniority" TEXT,
  ADD COLUMN "metadataReviewRequired" BOOLEAN NOT NULL DEFAULT false;

-- Only the exact four-line prefix written by the old editor is migrated.
-- Other description text is kept verbatim.
WITH legacy AS (
  SELECT id, description,
    regexp_match(description, E'^Department: ([^\\n]+)\\nLocation: ([^\\n]+)\\nEmployment type: ([^\\n]+)\\nSeniority: ([^\\n]+)\\n\\n') AS fields
  FROM "Vacancy"
)
UPDATE "Vacancy" AS v SET
  "department" = nullif(btrim(legacy.fields[1]), ''),
  "location" = nullif(btrim(regexp_replace(legacy.fields[2], ' · (Hybrid|On-site|Remote)$', '')), ''),
  "workModel" = CASE WHEN legacy.fields[2] ~ ' · (Hybrid|On-site|Remote)$'
    THEN substring(legacy.fields[2] FROM ' · (Hybrid|On-site|Remote)$') END,
  "employmentType" = nullif(btrim(legacy.fields[3]), ''),
  "seniority" = nullif(btrim(legacy.fields[4]), ''),
  "metadataReviewRequired" = btrim(legacy.fields[1]) = 'Engineering'
    OR btrim(legacy.fields[2]) = 'Tashkent · Hybrid',
  "description" = regexp_replace(legacy.description,
    E'^Department: [^\\n]+\\nLocation: [^\\n]+\\nEmployment type: [^\\n]+\\nSeniority: [^\\n]+\\n\\n', '')
FROM legacy
WHERE v.id = legacy.id AND legacy.fields IS NOT NULL;
