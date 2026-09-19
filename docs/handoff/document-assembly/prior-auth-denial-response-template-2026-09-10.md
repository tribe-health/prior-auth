# Prior Authorization Denial Response — Base Template

**Version:** 1.0 · **Scope:** Payer-agnostic (commercial/ERISA, Medicare Advantage, Medicare FFS prior auth programs, Medicaid managed care)

This template produces a response to an adverse prior authorization determination. Depending on the payer, that response might be called a reconsideration, an appeal, or a resubmission. The core letter stays the same across carriers. Only the opening paragraph (see **Variant Blocks**) and the procedural rights section change.

---

## How to Use This Template

- **Placeholders** use `{{ variable_name }}` syntax. **Conditionals and loops** use `{% if %}` / `{% for %}`. The syntax works with any Jinja-family engine, including MiniJinja and Tera (Rust), Jinja2 (Python), and Nunjucks (TypeScript).
- **Payer-specific values** such as deadlines, addresses, and the payer's own name for the determination belong in variables, never hardcoded. Timelines differ by plan type and state.
- **Policy criteria are always quoted verbatim** from the payer's policy in effect on the anticipated date of service. The letter argues against the payer's own words.
- **Every clinical fact must trace to a dated source document** that is included as an exhibit.

### Criterion Status Vocabulary

| Status | Meaning | Letter treatment |
|---|---|---|
| `MET` | The criterion was satisfied, and evidence was in the original submission. | Cite the original evidence and state that it was overlooked or misread. |
| `GAP_CLOSED` | The criterion was undocumented at the time of denial, but documentation now exists. | Enclose the new evidence and state plainly that it is newly supplied. |
| `NOT_APPLICABLE` | The criterion does not apply to this patient or procedure. | Explain why it doesn't apply, citing policy language where possible. |
| `DISPUTED` | The payer misapplied the criterion, or applied the wrong policy. | Quote the correct policy language and explain the discrepancy. |
| `VOID` | The criterion cannot be satisfied (a hard exclusion or non-covered service). | **Do not generate a letter.** Flag for human review: consider an alternative service, a clinical exception request, or patient financial counseling. |

---

## The Letter

```text
{{ practice_name }}
{{ practice_address }}
Phone: {{ practice_phone }} · Fax: {{ practice_fax }}
NPI: {{ practice_npi }}{% if practice_tin %} · TIN: {{ practice_tin }}{% endif %}

{{ letter_date }}

Sent via {{ delivery_method }} to:
{{ payer_name }} — {{ payer_appeals_department }}
{{ payer_appeals_address }}
{% if payer_appeals_fax %}Fax: {{ payer_appeals_fax }}{% endif %}
```

**RE: {{ request_type_label }}**{% if is_expedited %} — **EXPEDITED REVIEW REQUESTED**{% endif %}

| Field | Value |
|---|---|
| Member name | {{ patient_name }} |
| Date of birth | {{ patient_dob }} |
| Member ID | {{ member_id }} |
| Group / plan | {{ group_number }} / {{ plan_name }} |
| Authorization / reference # | {{ auth_reference_number }} |
| Date of determination | {{ determination_date }} |
| Requested service | {{ procedure_description }} ({{ cpt_hcpcs_codes }}) |
| Diagnosis | {{ icd10_codes_with_descriptions }} |
| Site of service | {{ site_of_service }} |
| Requesting provider | {{ requesting_provider_name }}, NPI {{ requesting_provider_npi }} |
| Rendering provider / facility | {{ rendering_provider_or_facility }} |
| Anticipated date of service | {{ anticipated_dos }} |

Dear {{ salutation | default("Appeals Reviewer") }},

On behalf of my patient, {{ patient_name }}, I am writing to request {{ request_action }} of the {{ determination_term }} dated {{ determination_date }} for {{ procedure_description }}. The requested service is medically necessary and meets each applicable criterion of {{ policy_name }} ({{ policy_id }}, effective {{ policy_effective_date }}), as detailed below. I respectfully request that the determination be reversed and the service authorized.

{% if is_expedited %}
**Request for expedited review.** Applying the standard review timeframe could seriously jeopardize the member's life or health, or the member's ability to regain maximum function. {{ expedited_clinical_justification }} As the treating physician, I certify that expedited review is warranted.
{% endif %}

### 1. Determination Being Addressed

The {{ determination_term }} states:

> {{ denial_reason_verbatim }}

{% if payer_cited_criteria %}
The determination cites the following criteria: {{ payer_cited_criteria }}.
{% else %}
The determination does not identify the specific policy criteria relied upon. This response therefore addresses {{ policy_name }} ({{ policy_id }}), the policy applicable to the requested service. I request a copy of the specific criteria used in this determination (see Section 7).
{% endif %}

### 2. Clinical Summary

{{ patient_first_name }} is a {{ patient_age }}-year-old {{ patient_sex }} with {{ primary_diagnosis }} ({{ primary_icd10 }}), first documented on {{ diagnosis_onset_date }}. {{ symptom_summary }} These symptoms cause the following functional impairment: {{ functional_impairment_summary }}.

**Treatment history**

| Treatment | Dates | Duration / dose / frequency | Outcome | Source |
|---|---|---|---|---|
{% for t in treatments %}| {{ t.name }} | {{ t.start_date }} – {{ t.end_date }} | {{ t.detail }} | {{ t.outcome }} | Exhibit {{ t.exhibit }} |
{% endfor %}

**Relevant diagnostics**

| Study / test | Date | Key finding | Source |
|---|---|---|---|
{% for d in diagnostics %}| {{ d.name }} | {{ d.date }} | {{ d.finding }} | Exhibit {{ d.exhibit }} |
{% endfor %}

### 3. Criterion-by-Criterion Response

Each criterion below is quoted from {{ policy_name }} ({{ policy_id }}).

| # | Policy criterion (verbatim) | Status | Supporting documentation | Exhibit |
|---|---|---|---|---|
{% for c in criteria %}| {{ loop.index }} | {{ c.text }} | {{ c.status_label }} | {{ c.evidence_summary }} | {{ c.exhibit }} |
{% endfor %}

{% if has_gap_closed_criteria %}
Documentation for criteria {{ gap_closed_criteria_numbers }} was not part of the original submission and is enclosed with this request.
{% endif %}

### 4. Response to the Stated Denial Reason(s)

{% for r in denial_reasons %}
**Denial reason {{ loop.index }}:** {{ r.reason_verbatim }}

**Response:** {{ r.response }}

**Supporting documentation:** {{ r.evidence_citation }} (Exhibit {{ r.exhibit }})

{% endfor %}

> **Drafting guide.** Each response should follow one of these patterns:
> 1. **Overlooked:** The documentation was in the original submission. Cite the page and date.
> 2. **Newly supplied:** The documentation now exists. Say so directly and enclose it.
> 3. **Not applicable:** The criterion does not apply to this patient. Explain why.
> 4. **Misapplied:** The wrong policy, version, or criterion was used. Quote the correct language.
> 5. **Clinical exception:** The patient's circumstances fall outside the policy's assumptions. Explain the clinical reasoning and the risks of the policy-preferred alternative.

### 5. Medical Necessity Rationale

{{ procedure_description }} is the appropriate next step for this patient because {{ necessity_rationale }}.

**Alternatives considered:** {{ alternatives_considered_and_why_inadequate }}

**Consequences of delay or denial:** {{ consequences_of_delay }}

{% if clinical_references %}
### 6. Supporting Clinical Evidence

{% for ref in clinical_references %}
- {{ ref.full_citation }} — {{ ref.relevance }}
{% endfor %}
{% endif %}

### 7. Procedural Requests

{% if request_criteria_copy %}
- Please provide copies of the specific criteria, clinical guidelines, and internal rules relied upon in this determination, along with the reviewer's credentials{% if plan_type == "erisa" %}, as provided under 29 C.F.R. § 2560.503-1{% endif %}.
{% endif %}
{% if request_same_specialty_reviewer %}
- Please ensure that this request is reviewed by a clinician in the same or a similar specialty as the requesting provider ({{ requesting_specialty }}).
{% endif %}
{% if denial_lacks_specific_reason %}
- The determination does not state a specific reason for denial. Please provide the specific clinical or administrative basis so that it can be addressed directly.
{% endif %}
- The member reserves all rights to further internal review{% if external_review_available %}, independent external review{% endif %}{% if plan_type == "medicaid" %}, and a state fair hearing{% endif %}.

### 8. Requested Action

Please authorize the following:

| CPT / HCPCS | Description | Units | Site of service | Date range |
|---|---|---|---|---|
{% for s in requested_services %}| {{ s.code }} | {{ s.description }} | {{ s.units }} | {{ s.site }} | {{ s.date_range }} |
{% endfor %}

I am available for a peer-to-peer discussion at {{ p2p_phone }} ({{ p2p_availability }}). Please direct questions about this request to {{ contact_name }} at {{ contact_phone }} or {{ contact_email }}.

Thank you for your prompt reconsideration.

Sincerely,

```text
______________________________
{{ signing_provider_name }}, {{ signing_provider_credentials }}
{{ signing_provider_specialty }}
NPI: {{ signing_provider_npi }}
```

*I attest that the information in this letter is accurate and supported by the enclosed medical records.*

**Enclosures**

| Exhibit | Document | Date | Pages |
|---|---|---|---|
{% for e in exhibits %}| {{ e.label }} | {{ e.title }} | {{ e.date }} | {{ e.pages }} |
{% endfor %}

{% if cc_patient %}cc: {{ patient_name }}{% endif %}

---

## Variant Blocks

To adapt the letter to a program, replace the opening paragraph and the `request_type_label` with the matching variant below.

### A. Medicare FFS Prior Authorization (Non-Affirmation → Resubmission)

- **`request_type_label`:** Resubmitted Prior Authorization Request — Prior UTN {{ prior_utn }}
- **Opening:** *This is a resubmission of the prior authorization request for {{ procedure_description }}, which received a non-affirmed decision on {{ determination_date }} (UTN {{ prior_utn }}). This resubmission addresses each reason for non-affirmation identified in the decision letter, and it encloses documentation not included in the original request.*
- **Notes:** A non-affirmed request is resubmitted rather than appealed, so Section 7's appeal-rights language should be omitted. Use the MAC's own non-affirmation reason codes when filling in `denial_reasons`.

### B. Medicare Advantage (Pre-Service Reconsideration)

- **`request_type_label`:** Request for Reconsideration of Organization Determination
- **Opening:** *I am requesting reconsideration of the organization determination dated {{ determination_date }} denying {{ procedure_description }} for {{ patient_name }}.*
- **Notes:** Set `is_expedited` whenever the treating physician's clinical judgment supports it. Include the plan's reconsideration deadline as `appeal_deadline`.

### C. Commercial / ERISA Group Health Plan (Internal Appeal)

- **`request_type_label`:** Level {{ appeal_level }} Internal Appeal of Adverse Benefit Determination
- **Opening:** *I am submitting this appeal on behalf of {{ patient_name }} regarding the adverse benefit determination dated {{ determination_date }}.*
- **Notes:** Set `plan_type = "erisa"` and `request_criteria_copy = true`. Set `external_review_available = true` when the plan is subject to external review requirements. If the payer requires it, enclose the member's authorized-representative form.

### D. Medicaid / Medicaid Managed Care

- **`request_type_label`:** Appeal of Adverse Benefit Determination
- **Opening:** *I am requesting an appeal of the adverse benefit determination dated {{ determination_date }} for {{ procedure_description }}.*
- **Notes:** Set `plan_type = "medicaid"`. Confirm whether the state requires member consent for a provider-filed appeal, and verify the state-specific filing window.

### E. Peer-to-Peer Request (Short Form)

> **RE: Request for Peer-to-Peer Review — {{ auth_reference_number }}**
>
> I am requesting a peer-to-peer discussion regarding the {{ determination_term }} dated {{ determination_date }} for {{ procedure_description }} ({{ cpt_hcpcs_codes }}) for member {{ patient_name }} (ID {{ member_id }}). I am available at {{ p2p_phone }} during {{ p2p_availability }}. Please have a reviewer in {{ requesting_specialty }} or a closely related specialty contact me.

---

## AI Drafting Rules

Apply these rules whenever a model generates or fills this template.

1. **Source of truth.** Policy criteria come verbatim from the payer policy in effect on the anticipated date of service. Clinical facts come only from the patient's record. The model never introduces a clinical fact, date, measurement, or score that is not in a source document.
2. **Traceability.** Every factual clinical statement cites an exhibit. A statement without a source is deleted, not softened.
3. **No fabricated citations.** Clinical references must be real, verifiable, and checked by a human before sending. If no verified reference is available, omit Section 6.
4. **Honest status.** A criterion is never marked `MET` or `GAP_CLOSED` without evidence. Any `VOID` criterion halts letter generation and routes the case to human review.
5. **Complete coverage.** Every stated denial reason receives an explicit response in Section 4, and every policy criterion receives a row in Section 3.
6. **Tone.** The letter is factual, concise, and courteous. It does not speculate about the payer's motives and does not use emotional appeals.
7. **Minimum necessary PHI.** Include only the clinical information relevant to the criteria and the denial reasons.
8. **Human sign-off.** A licensed clinician reviews and signs every letter. The attestation line is never auto-signed.
9. **Length.** Aim for 1–3 pages of letter body. The exhibits carry the detail.

---

## Pre-Send Checklist

- [ ] The submission deadline has been confirmed and the letter falls within it.
- [ ] The member ID, reference number, and determination date match the denial letter exactly.
- [ ] The policy version matches the anticipated date of service.
- [ ] Every stated denial reason is addressed in Section 4.
- [ ] Every criterion row in Section 3 has a status and an exhibit reference.
- [ ] No criterion carries a `VOID` status.
- [ ] Exhibits are labeled, paginated, and referenced correctly in the letter.
- [ ] If expedited review is requested, the justification is clinical and specific.
- [ ] The signing clinician has reviewed the letter and signed it.
- [ ] Delivery confirmation (fax receipt, portal confirmation, or tracking number) is retained.

---

## Template Variable Reference

| Variable | Type | Notes |
|---|---|---|
| `request_type_label` | string | Taken from the matching variant block. |
| `request_action` | string | For example "reconsideration", "review of this resubmitted request", or "a first-level appeal". |
| `determination_term` | string | The payer's own term, such as "denial", "non-affirmation", or "adverse benefit determination". |
| `plan_type` | enum | One of `commercial`, `erisa`, `medicare_advantage`, `medicare_ffs`, `medicaid`. |
| `is_expedited` | bool | When true, `expedited_clinical_justification` is required. |
| `denial_reason_verbatim` | string | Quoted exactly from the determination letter. |
| `policy_name`, `policy_id`, `policy_effective_date` | string | The payer policy or LCD/NCD that governs the service. |
| `criteria[]` | list | `text`, `status`, `status_label`, `evidence_summary`, `exhibit` |
| `denial_reasons[]` | list | `reason_verbatim`, `response`, `evidence_citation`, `exhibit` |
| `treatments[]` | list | `name`, `start_date`, `end_date`, `detail`, `outcome`, `exhibit` |
| `diagnostics[]` | list | `name`, `date`, `finding`, `exhibit` |
| `requested_services[]` | list | `code`, `description`, `units`, `site`, `date_range` |
| `exhibits[]` | list | `label`, `title`, `date`, `pages` |
| `clinical_references[]` | list, optional | `full_citation`, `relevance`; must be human-verified before sending. |
| `has_gap_closed_criteria`, `gap_closed_criteria_numbers` | bool, string | Computed from `criteria[]`. |
| `request_criteria_copy`, `request_same_specialty_reviewer`, `denial_lacks_specific_reason`, `external_review_available` | bool | Toggle the procedural requests in Section 7. |
| `appeal_deadline`, `appeal_level`, `prior_utn` | string | Program-specific values used by the variant blocks. |
