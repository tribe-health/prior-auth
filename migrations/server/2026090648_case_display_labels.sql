-- Publish the minimum participant labels required to identify a case in the
-- authorized browser workbench. The source identifiers remain authoritative;
-- these labels are derived display data bounded by the existing case shape.

SET search_path = aso, public;

ALTER TABLE aso.cases
  ADD COLUMN patient_name text,
  ADD COLUMN payer_name text,
  ADD COLUMN surgeon_name text;

CREATE FUNCTION aso.set_case_display_labels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  SELECT btrim(concat_ws(' ', patient.given_name, patient.family_name))
    INTO STRICT NEW.patient_name
    FROM aso.patients patient
   WHERE patient.id = NEW.patient_id
     AND patient.practice_id = NEW.practice_id;

  SELECT payer.name
    INTO STRICT NEW.payer_name
    FROM aso.payers payer
   WHERE payer.id = NEW.payer_id;

  SELECT coalesce(nullif(btrim(surgeon.display_name), ''), surgeon.full_name)
    INTO STRICT NEW.surgeon_name
    FROM aso.users surgeon
   WHERE surgeon.id = NEW.surgeon_id
     AND surgeon.practice_id = NEW.practice_id;

  IF NEW.patient_name = '' OR NEW.payer_name = '' OR NEW.surgeon_name = '' THEN
    RAISE EXCEPTION 'case display labels must not be empty';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION aso.set_case_display_labels() OWNER TO aso_case_owner;
REVOKE ALL ON FUNCTION aso.set_case_display_labels() FROM PUBLIC;

CREATE TRIGGER cases_a_display_labels
  BEFORE INSERT OR UPDATE OF patient_id, payer_id, surgeon_id, practice_id
  ON aso.cases
  FOR EACH ROW EXECUTE FUNCTION aso.set_case_display_labels();

UPDATE aso.cases target
   SET patient_name = btrim(concat_ws(' ', patient.given_name, patient.family_name)),
       payer_name = payer.name,
       surgeon_name = coalesce(nullif(btrim(surgeon.display_name), ''), surgeon.full_name)
  FROM aso.patients patient, aso.payers payer, aso.users surgeon
 WHERE patient.id = target.patient_id
   AND patient.practice_id = target.practice_id
   AND payer.id = target.payer_id
   AND surgeon.id = target.surgeon_id
   AND surgeon.practice_id = target.practice_id;

ALTER TABLE aso.cases
  ALTER COLUMN patient_name SET NOT NULL,
  ALTER COLUMN payer_name SET NOT NULL,
  ALTER COLUMN surgeon_name SET NOT NULL,
  ADD CONSTRAINT cases_patient_name_not_empty CHECK (btrim(patient_name) <> ''),
  ADD CONSTRAINT cases_payer_name_not_empty CHECK (btrim(payer_name) <> ''),
  ADD CONSTRAINT cases_surgeon_name_not_empty CHECK (btrim(surgeon_name) <> '');

COMMENT ON COLUMN aso.cases.patient_name IS
  'Derived patient display label published only with an authorized case row.';
COMMENT ON COLUMN aso.cases.payer_name IS
  'Derived payer company label published only with an authorized case row.';
COMMENT ON COLUMN aso.cases.surgeon_name IS
  'Derived surgeon display label published only with an authorized case row.';

CREATE FUNCTION aso.refresh_patient_case_labels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  UPDATE aso.cases
     SET patient_name = btrim(concat_ws(' ', NEW.given_name, NEW.family_name))
   WHERE patient_id = NEW.id
     AND practice_id = NEW.practice_id
     AND patient_name IS DISTINCT FROM btrim(concat_ws(' ', NEW.given_name, NEW.family_name));
  RETURN NULL;
END;
$$;

CREATE FUNCTION aso.refresh_payer_case_labels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  UPDATE aso.cases
     SET payer_name = NEW.name
   WHERE payer_id = NEW.id
     AND payer_name IS DISTINCT FROM NEW.name;
  RETURN NULL;
END;
$$;

CREATE FUNCTION aso.refresh_surgeon_case_labels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aso, pg_temp
AS $$
DECLARE
  display_label text := coalesce(nullif(btrim(NEW.display_name), ''), NEW.full_name);
BEGIN
  UPDATE aso.cases
     SET surgeon_name = display_label
   WHERE surgeon_id = NEW.id
     AND practice_id = NEW.practice_id
     AND surgeon_name IS DISTINCT FROM display_label;
  RETURN NULL;
END;
$$;

ALTER FUNCTION aso.refresh_patient_case_labels() OWNER TO aso_case_owner;
ALTER FUNCTION aso.refresh_payer_case_labels() OWNER TO aso_case_owner;
ALTER FUNCTION aso.refresh_surgeon_case_labels() OWNER TO aso_case_owner;
REVOKE ALL ON FUNCTION aso.refresh_patient_case_labels() FROM PUBLIC;
REVOKE ALL ON FUNCTION aso.refresh_payer_case_labels() FROM PUBLIC;
REVOKE ALL ON FUNCTION aso.refresh_surgeon_case_labels() FROM PUBLIC;

CREATE TRIGGER patients_case_display_labels
  AFTER UPDATE OF given_name, family_name ON aso.patients
  FOR EACH ROW
  WHEN (ROW(OLD.given_name, OLD.family_name) IS DISTINCT FROM ROW(NEW.given_name, NEW.family_name))
  EXECUTE FUNCTION aso.refresh_patient_case_labels();

CREATE TRIGGER payers_case_display_labels
  AFTER UPDATE OF name ON aso.payers
  FOR EACH ROW
  WHEN (OLD.name IS DISTINCT FROM NEW.name)
  EXECUTE FUNCTION aso.refresh_payer_case_labels();

CREATE TRIGGER users_case_display_labels
  AFTER UPDATE OF display_name, full_name ON aso.users
  FOR EACH ROW
  WHEN (ROW(OLD.display_name, OLD.full_name) IS DISTINCT FROM ROW(NEW.display_name, NEW.full_name))
  EXECUTE FUNCTION aso.refresh_surgeon_case_labels();

-- Published label changes are observable case changes and therefore advance
-- the same row revision consumed by the entity graph.
CREATE OR REPLACE FUNCTION aso.bump_case_revisions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aso, pg_temp
AS $$
BEGIN
  IF ROW(NEW.patient_id, NEW.surgeon_id, NEW.coordinator_id, NEW.facility_id,
         NEW.payer_id, NEW.case_number, NEW.status, NEW.member_id,
         NEW.date_of_service, NEW.data, NEW.procedure_code, NEW.plan_key,
         NEW.gate_affirmed_at, NEW.gate_affirmed_by,
         NEW.patient_name, NEW.payer_name, NEW.surgeon_name)
     IS DISTINCT FROM
     ROW(OLD.patient_id, OLD.surgeon_id, OLD.coordinator_id, OLD.facility_id,
         OLD.payer_id, OLD.case_number, OLD.status, OLD.member_id,
         OLD.date_of_service, OLD.data, OLD.procedure_code, OLD.plan_key,
         OLD.gate_affirmed_at, OLD.gate_affirmed_by,
         OLD.patient_name, OLD.payer_name, OLD.surgeon_name) THEN
    NEW.revision := OLD.revision + 1;
  ELSE
    NEW.revision := OLD.revision;
  END IF;

  IF ROW(NEW.patient_id, NEW.facility_id, NEW.payer_id, NEW.member_id,
         NEW.date_of_service, NEW.procedure_code, NEW.plan_key)
     IS DISTINCT FROM
     ROW(OLD.patient_id, OLD.facility_id, OLD.payer_id, OLD.member_id,
         OLD.date_of_service, OLD.procedure_code, OLD.plan_key) THEN
    NEW.case_input_revision := OLD.case_input_revision + 1;
  ELSE
    NEW.case_input_revision := OLD.case_input_revision;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_revision := OLD.status_revision + 1;
  ELSE
    NEW.status_revision := OLD.status_revision;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION aso.bump_case_revisions() OWNER TO aso_case_owner;
