-- Raw uploads enter the document lifecycle as queued bytes. Typed extraction
-- is not available until processing completes, so NULL is the only valid
-- pre-processing payload. Once data exists, the document type schema remains
-- mandatory.
CREATE OR REPLACE FUNCTION aso.validate_document_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  type_schema jsonb;
  type_name text;
BEGIN
  IF NEW.document_type_id IS NULL OR NEW.data IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT document_type.schema, document_type.name
    INTO type_schema, type_name
    FROM aso.document_types document_type
   WHERE document_type.id = NEW.document_type_id;

  IF NOT aso.jsonschema_basic_check(type_schema, NEW.data) THEN
    RAISE EXCEPTION
      'data does not conform to the JSON Schema for document type "%"', type_name
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER documents_validate_data ON aso.documents;
CREATE TRIGGER documents_validate_data
BEFORE INSERT OR UPDATE ON aso.documents
FOR EACH ROW EXECUTE FUNCTION aso.validate_document_payload();
