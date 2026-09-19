use std::path::Path;

use aso_document_assembly::contract::AssembleRequest;
use aso_document_assembly::packages::{Catalog, seed_root};
use clinical_docs::{Assembly, AssemblyInput, EngineError, assemble};
use serde_json::{Value, json};

fn fixture(name: &str) -> AssembleRequest {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("fixtures")
        .join(name);
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn render(request: &AssembleRequest) -> Result<Assembly, EngineError> {
    let catalog = Catalog::load(&seed_root()).unwrap();
    let kind = catalog.kinds.get(&request.kind).unwrap();
    assemble(&AssemblyInput {
        kind,
        package: catalog.package_for(kind).unwrap(),
        claims: &request.claims,
        required_criteria: &request.required_criteria,
        evidence: &request.evidence,
        context: request.context.clone(),
        checks: request.checks.clone(),
    })
}

#[test]
fn canonical_correspondence_does_not_embed_mutable_workflow_status() {
    for name in [
        "initial_request_lumbar_fusion.json",
        "denial_response_clinical_appeal.json",
    ] {
        let body = render(&fixture(name)).unwrap().canonical_markdown;
        assert!(!body.contains("DRAFT — NOT SIGNED"), "{name}");
    }
}

#[test]
fn template_boilerplate_never_asserts_clinical_or_regulatory_conclusions() {
    for name in [
        "initial_request_lumbar_fusion.json",
        "denial_response_clinical_appeal.json",
    ] {
        let mut request = fixture(name);
        for criterion in request.context["criteria"].as_array_mut().unwrap() {
            criterion["text"] = json!("UNCITED_POLICY_CLAUSE");
        }
        for diagnosis in request.context["request"]["icd10"].as_array_mut().unwrap() {
            diagnosis["description"] = json!("UNCITED_DIAGNOSIS");
        }
        if name.starts_with("denial") {
            request.context["determination"]["reason_text"] = json!("UNCITED_PAYER_REASON");
        }
        for payer in [
            "commercial",
            "medicaid",
            "medicare_advantage",
            "medicare_ffs_opd",
        ] {
            request.context["payer_type"] = json!(payer);
            let body = render(&request).unwrap().canonical_markdown;
            for uncited in [
                "The service is medically necessary and meets each applicable criterion",
                "The determination misapplied",
                "no clinical position",
                "Every criterion in that policy is addressed",
                "UNCITED_POLICY_CLAUSE",
                "UNCITED_DIAGNOSIS",
                "UNCITED_PAYER_REASON",
                "C.F.R.",
                "CMS-0057-F",
                "within 7 calendar days",
                "within 15 days",
                "within 30 days",
                "72 hours",
                "within the plan's appeal window",
                "within the plan's internal appeal window",
            ] {
                assert!(
                    !body.contains(uncited),
                    "{name}/{payer} rendered uncited boilerplate: {uncited}"
                );
            }
        }
    }
}

#[test]
fn determination_reason_is_a_rendered_source_claim_in_both_response_modes() {
    let mut request = fixture("denial_response_clinical_appeal.json");
    let ordinal = request.context["determination"]["claim_ordinal"]
        .as_u64()
        .expect("fixture names source claim") as u32;
    let determination = request
        .claims
        .iter()
        .find(|claim| claim.ordinal == ordinal)
        .unwrap();
    let expected_citation = clinical_docs::cite(&determination.provenance);
    for mode in ["clinical_appeal", "corrected_resubmission"] {
        request.context["response_mode"] = json!(mode);
        let result = render(&request).unwrap();
        assert!(
            result
                .rendered_claims
                .iter()
                .any(|claim| claim.ordinal == ordinal)
        );
        assert!(result.canonical_markdown.contains(&expected_citation));
        assert!(result.canonical_markdown.contains("2026-0827-A1"));
        if mode == "corrected_resubmission" {
            assert!(result.canonical_markdown.contains("Corrected Resubmission"));
            assert!(
                !result
                    .canonical_markdown
                    .contains("Determination Being Appealed")
            );
        } else {
            assert!(result.canonical_markdown.contains("Second-level appeal"));
        }
    }
}

#[test]
fn a_response_without_a_source_claim_or_known_mode_is_refused() {
    let mut request = fixture("denial_response_clinical_appeal.json");
    request.context["determination"]
        .as_object_mut()
        .unwrap()
        .remove("claim_ordinal");
    assert!(
        render(&request).is_err(),
        "a reason cannot be taken from uncited context"
    );
    let mut request = fixture("denial_response_clinical_appeal.json");
    request.context["response_mode"] = json!("unknown_mode");
    assert!(
        render(&request).is_err(),
        "unknown mode cannot silently become an appeal"
    );
}

#[test]
fn host_uuid_criteria_render_without_narrative_group_tags() {
    let mut request = fixture("initial_request_lumbar_fusion.json");
    request.claims.retain(|claim| {
        claim
            .criterion_id
            .as_ref()
            .is_some_and(|id| id.starts_with('C'))
    });
    for criterion in request.context["criteria"].as_array_mut().unwrap() {
        let old = criterion["id"].as_str().unwrap().to_owned();
        let id = format!(
            "10000000-0000-4000-8000-{:012}",
            old[1..].parse::<u32>().unwrap()
        );
        criterion["id"] = json!(id);
        request.required_criteria.remove(&old);
        request.required_criteria.insert(id.clone());
        for claim in &mut request.claims {
            if claim.criterion_id.as_deref() == Some(&old) {
                claim.criterion_id = Some(id.clone());
            }
        }
    }
    request.context["practice"] = json!({"name": "Synthetic practice"});
    request.context["payer"] = json!({"name": "Synthetic payer"});
    request.context["contacts"] = json!({});
    request.context["request"]["facility"] = json!({});
    let result = render(&request).unwrap();
    assert_eq!(result.rendered_claims.len(), request.claims.len());
    assert!(!result.canonical_markdown.contains("Clinical Summary"));
    assert!(!result.canonical_markdown.contains("Medical Necessity\n"));
    assert!(!result.canonical_markdown.contains("Sent via fax"));
}

#[test]
fn package_manifest_matches_engine_catalog() {
    let catalog = Catalog::load(&seed_root()).unwrap();
    let package = catalog.packages.get("aso-prior-auth").unwrap();
    let kinds: Vec<Value> = catalog
        .kinds
        .iter()
        .filter(|kind| kind.template_package == package.name)
        .map(|kind| {
            json!({
                "key": kind.key, "version": kind.version, "class": kind.class,
                "root": kind.root, "templatePackage": kind.template_package,
                "templateDigest": package.digest(),
            })
        })
        .collect();
    let expected = json!({
        "schemaVersion": 1,
        "package": package.name,
        "templateDigest": package.digest(),
        "kinds": kinds,
    });
    println!("ASSEMBLY_PACKAGE_MANIFEST={expected}");
    let manifest_path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../docs/architecture/fixtures/web-case-to-letter/assembly-package-manifest.json");
    let frozen: Value = serde_json::from_str(
        &std::fs::read_to_string(manifest_path).expect("frozen package manifest exists"),
    )
    .unwrap();
    assert_eq!(
        frozen, expected,
        "template or kind changes require a reviewed manifest update"
    );
}
