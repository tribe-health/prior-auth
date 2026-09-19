-- Local 0647 regression. Synthetic demo only; every write rolls back.
-- docker compose exec -T db psql -U flint -d flint -X -v ON_ERROR_STOP=1 < scripts/test-determination-case-progress.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$ DECLARE target_case constant uuid:='10000000-0000-4000-8000-000000000005';
 source uuid; target uuid:=gen_random_uuid(); identity uuid; receipt jsonb; decision_date date;
BEGIN
 SELECT document_id,max(decided_on) OVER()+1 INTO STRICT source,decision_date FROM aso.determinations
 WHERE case_id=target_case ORDER BY decided_on DESC,created_at DESC,id DESC LIMIT 1;
 SELECT kratos_identity_id INTO STRICT identity FROM aso.users
 WHERE id='10000000-0000-4000-8000-000000000002';
 PERFORM set_config('aso.actor_id','10000000-0000-4000-8000-000000000002',true);
 PERFORM set_config('aso.kratos_identity_id',identity::text,true);
 PERFORM set_config('aso.practice_id','10000000-0000-4000-8000-000000000001',true);
 PERFORM set_config('aso.principal','user',true);
 PERFORM set_config('aso.session_expires_at',(clock_timestamp()+interval '10 minutes')::text,true);
 UPDATE aso.cases SET status='submitted' WHERE id=target_case;
 INSERT INTO aso.determinations(id,case_id,outcome,decided_on,reason_text,document_id,created_at)
 VALUES(target,target_case,'denied',decision_date,'Synthetic state progression regression',source,clock_timestamp());
 IF (SELECT status FROM aso.cases WHERE id=target_case)<>'denial_review'
 THEN RAISE EXCEPTION 'recorded determination did not advance to denial review'; END IF;
 RAISE NOTICE 'Passed: recorded determination advances through denial review';
 receipt:=aso.confirm_determination_response_mode(target_case,gen_random_uuid(),target,'corrected_resubmission');
 IF receipt->>'mode'<>'corrected_resubmission'
  OR (SELECT status FROM aso.cases WHERE id=target_case)<>'response_drafting'
 THEN RAISE EXCEPTION 'confirmed response mode did not advance to response drafting'; END IF;
 RAISE NOTICE 'Passed: confirmed response mode advances to response drafting';
END $$;
ROLLBACK;
