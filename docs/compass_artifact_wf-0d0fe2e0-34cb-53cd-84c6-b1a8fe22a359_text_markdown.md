# Prior-Authorization Management System (MVP) — Domain Research & Specification Source Material
## Advanced Spine & Orthopedics (Dr. Kevin James / Dr. Aaron Eubanks / PA Nathan Mahanirananda), Southlake TX, DFW Metroplex — EHR: AdvancedMD

## TL;DR
- **Spine prior authorization in Texas is a multi-vendor, multi-channel, medical-necessity-driven gauntlet**: for a DFW spine practice the real decision-makers are usually delegated utilization-management (UM) vendors (eviCore/Evernorth for Cigna spine and interventional pain, Carelon for many BCBS/Anthem lines, TurningPoint for several Blues/Centene lines, and Cohere for Humana MSK), not the payer's own logo. Criteria converge on a documentable core — moderate-or-worse imaging-confirmed neural compression correlating to exam, 6 weeks–6 months of failed conservative care, functional scores (ODI/VAS/NDI), and tobacco/BMI/psych gates for fusion — but differ materially at the edges (levels-of-fusion limits, disc arthroplasty at two levels, SI-joint provocative-test counts and injection thresholds, and experimental determinations).
- **The MVP must model the domain as three orthogonal matrices — payer×procedure criteria, payer×channel (submit/status/appeal), and denial→remediation — plus a lifecycle state machine** that explicitly supports the unhappy paths: RFI loops, medical-necessity denials, Texas peer-to-peer (same-specialty, Texas-licensed physician under HB 3459), internal appeals, and the Texas IRO external review, with hard timers driven by Texas Insurance Code Chapter 4201 and CMS-0057-F (72-hour expedited / 7-calendar-day standard decisions, in force since Jan 1 2026).
- **Automation is legally bounded**: administrative/documentation assembly, channel dispatch, status polling, and denial classification can be largely automated, but a physician-affirmation gate is mandatory before any letter of medical necessity — reinforced by Texas SB 1188 (AI diagnostic-use disclosure + physician review of AI-generated records; EHR data must be physically stored onshore as of Jan 1 2026) and HB 149/TRAIGA (AI healthcare-use disclosure, effective Jan 1 2026). False Claims Act exposure attaches to any AI-generated clinical assertion not supported by the chart, which is exactly why the append-only evidence receipt ledger and page/date traceability are load-bearing compliance controls, not just niceties.

---

## Key Findings

1. **Delegated UM vendors, not payers, own spine criteria.** Cigna spine surgery, interventional pain, and spinal implants are managed by eviCore (Evernorth); many Blue Cross/Anthem and some commercial lines use Carelon Medical Benefits Management (formerly AIM Specialty Health); Humana uses Cohere Health for MSK; several Blues and Centene/Ambetter/Health Net lines use TurningPoint for MSK surgical procedures. Each vendor has its own portal, its own guideline document, and its own same-specialty peer-to-peer line. The channel abstraction must key off the *administering entity*, not the card logo — and a misrouted submission "sits unprocessed and the authorization clock never starts."

2. **Criteria converge on a documentable core.** Across Aetna CPB 0743, UnitedHealthcare (InterQual-based commercial + Medicare Advantage per Novitas LCDs), eviCore/Cigna CMM, and Carelon, the recurring documentable elements are: (a) imaging (MRI/CT) showing moderate-or-worse stenosis/compression at the level that correlates with exam and symptoms; (b) failed conservative care (≥6 weeks for decompression/discectomy; 3–6 months for fusion/arthroplasty/SI/SCS); (c) neurologic findings; (d) functional scores (ODI, VAS, NDI); (e) instability metrics for fusion (≥3 mm translation, >11° angulation on flexion-extension); (f) tobacco-free status (often 6 weeks, sometimes lab-confirmed cotinine ≤10 ng/ml); (g) psychological clearance for SCS and some fusion; (h) BMI and diabetes/A1c thresholds.

3. **A handful of procedures are systematically denied as experimental/investigational or not-medically-necessary**: two-level-plus cervical/lumbar disc arthroplasty (single-level is the safe zone; Mobi-C and Prestige LP are FDA-approved for two cervical levels), posterior/hybrid non-transfixing SI joint fusion, interspinous spacers, and SCS for pain without prior surgery. These require the appeal/peer-to-peer/IRO path from day one and should be routed differently from the outset.

4. **Fax and portal still dominate; true electronic PA (X12 278) adoption is poor.** According to the 2024 CAQH Index, only 35% of medical prior authorizations are conducted fully electronically using the X12 278 transaction (the 2025 CAQH Index reports this rising to 40%). The 278 never achieved broad use because HHS never finalized an attachment standard for clinical documentation; the 275 (Additional Information) and 277 (status) never gained uptake either. CMS-0057-F pivots the industry to FHIR (Da Vinci CRD/DTR/PAS) with APIs due Jan 1 2027, but process rules (turnaround + specific denial reasons) are already in force as of Jan 1 2026. The MVP must treat fax, portal, phone, mail, and (eventually) FHIR/EDI as interchangeable adapters behind one channel abstraction.

5. **Texas layers strong provider protections** that the system must operationalize: gold-carding (HB 3459/HB 3812), same-specialty Texas-licensed peer-to-peer before adverse determination, Chapter 4201 acknowledgment/decision/appeal timers, and IRO external review binding on the UM agent. But these apply only to TDI-regulated fully-insured plans — per the Texas Medical Association, HB 3459's HMO/PPO/EPO issuers cover about 20% of Texans, and the law does not apply to Medicaid, CHIP, or ERISA self-funded plans, nor to Medicare.

---

## Details

### 1. PAYER × PROCEDURE CRITERIA MATRIX

**Common CPT scope in play:** lumbar fusion (22612, 22630, 22633, 22558, 22585, +add-on 22614); ACDF/cervical fusion (22551, 22552, 22554); posterior cervical fusion (22600); cervical disc arthroplasty (22856 first level, 22858 second level); lumbar decompression/laminectomy (63047, +63048 add-on); lumbar microdiscectomy (63030); kyphoplasty/vertebroplasty (22513–22515); SI joint fusion (27279 MIS, 27280 open); ESI (62323, 64483); facet injection (64493); SCS (63650 trial, 63685 implant); corpectomy (63081); revision/hardware (22849, 22850, 20680).

**Aetna — CPB 0743 "Spinal Surgery: Laminectomy and Fusion" (last reviewed 2026-07-30; next review 2026-08-13); CPB 0016 "Back Pain – Invasive Procedures"; CPB 0591 intervertebral disc prostheses; CPB 0194 spinal cord stimulation.** Note: Aetna delegates MSK/advanced-imaging review to eviCore on many plans, so those requests are submitted and appealed through eviCore rather than Aetna.
- *Decompression (laminectomy/discectomy):* requires (i) other pain sources ruled out including pathology at non-surgical levels; (ii) signs/symptoms of neural compression (radiculopathy, neurogenic claudication, myelopathy) at the treated level; (iii) advanced imaging showing stenosis graded *moderate, moderate-to-severe, or severe (explicitly NOT mild or mild-to-moderate)* at the corresponding level; (iv) failed ≥6 weeks conservative therapy (waivable for rapid neuro progression — foot drop, saddle anesthesia, bladder/bowel dysfunction); (v) ADLs limited by symptoms.
- *Cervical sub-axial (C2-T1) instability fusion:* requires sagittal translation ≥3 mm on flexion/extension OR relative sagittal angulation >11°, plus failed 3 months conservative care.
- *Lumbar fusion for spondylolisthesis:* requires grade II+ or documented segmental instability on dynamic films plus failed conservative care; **lumbar fusion for degenerative disc disease alone and "all other indications not listed" is not medically necessary.**
- *Pseudarthrosis:* ≥12 months since prior fusion with imaging non-union or hardware failure; if no hardware failure, nicotine-free ≥6 weeks with lab-confirmed nicotine/cotinine ≤10 ng/ml drawn within 6 weeks pre-op.
- *Corpectomy (63081):* tumor, >50% compression fracture, retropulsed fragments, or symptomatic moderate+ canal stenosis from vertebral-body pathology.
- *Scoliosis:* Cobb >40° skeletally immature / >50° with functional impairment in adults, failed 3 months conservative.
- *Lumbar disc arthroplasty (CPB 0591):* single-level DDD, age 18–60, ≤3 mm spondylolisthesis, failed ≥6 months conservative — policy revised Feb 8 2024 after a class-action settlement.
- *Spinal cord stimulation (CPB 0194, last reviewed 2026-05-21):* mandatory multidisciplinary screen INCLUDING psychological evaluation; **clearance from a psychiatrist/psychologist/qualified mental health professional required**; no untreated substance use disorder (ASAM); permanent implant (63685) requires **≥50% pain reduction over a 3-to-7-day percutaneous trial (63650)** documented by trial placement and lead pull note ("significant pain reduction (50% or more) with a 3- to 7-day trial"); failed ≥6 months conservative care including ≥3 medication classes + ≥6 weeks in-person PT; ODI ≥21%; covered diagnoses = FBSS with radicular pain, CRPS 1/2, inoperable ischemic limb pain, and last-resort neuropathic pain present ≥12 months; chronic LBP without prior surgery is experimental; failed trial does not justify a repeat trial absent extenuating circumstances.
- *SI joint fusion (CPB 0016, last reviewed 2026-02-11):* **at least 3 of 5 provocative maneuvers** — Compression, Posterior Pelvic Pain Provocation/Thigh Thrust (P4), Patrick's/FABER, Distraction, Gaenslen's — PLUS positive Fortin finger test; **improvement in lower-back-pain NRS of ≥70% after two separate fluoroscopic/CT-guided anesthetic injections** (≥1 therapeutic with steroid) within the past year; SI pain >6 months (>18 months for pregnancy-induced pelvic girdle pain); ≥6 months conservative care including ≥3 months in-person PT; baseline NRS ≥5/10; nicotine-free ≥1 year (lab-confirmed cotinine ≤10 ng/ml). **Posterior non-transfixing and "hybrid" SI fusions (and the iFuse Bedrock Granite system) are experimental/investigational/unproven; SI fusion is E/I/U for all other indications.** Open SI fusion only for infection, sacral tumor, or severe traumatic injury where an external-fixator trial relieved pain.

**UnitedHealthcare / Optum — "Spinal Fusion and Decompression" commercial medical policy; "Spine Procedures" Medicare Advantage policy (Copyright 2026).**
- Commercial coverage is **InterQual-based** (e.g., InterQual CP: Procedures for scoliosis/kyphosis surgery). Medicare Advantage defers to applicable Novitas LCDs (Texas is in Novitas jurisdiction JH); where no LCD applies, the commercial Spinal Fusion and Decompression policy governs. Medicare has no NCD for general lumbar spine surgery, so LCDs/LCAs control.
- First-line conservative therapy for lumbar stenosis explicitly listed: rest, NSAIDs, muscle relaxants, corset use, PT, and lumbar ESI; surgery considered on documented failure.
- Site-of-service review is applied as part of PA. Standard commercial decision 15 calendar days; expedited 72 hours; MA follows CMS 14-day/72-hour (now 7-day standard under CMS-0057-F). Commercial appeal window 180 days; MA 60 days.
- A dedicated "Spine Surgery Information Request Form" enumerates required clinical records, radiology reports, and technique details; completeness is emphasized to avoid denials. Submission via UHCprovider.com (returns a Decision ID) or via 278; status also checkable via Availity (Authorizations & Referrals > Authorization Inquiry). UHC offers a Texas voluntary gold-card program (see Section 5).

**Cigna (administered by eviCore/Evernorth) — Comprehensive Musculoskeletal Management (CMM) guidelines.**
- Spine services requiring PA: decompression (laminectomy/laminotomy/laminoplasty), cervical/thoracic/lumbar fusions incl. deformity, vertebroplasty/kyphoplasty, basivertebral nerve ablation, revision surgery, total disc arthroplasty, spinal implants (SCS, pain pumps).
- *Conservative management* defined as PT AND ≥1 complementary strategy; ESI requires 6 weeks conservative care; facet/medial-branch blocks and SI injections require 4 weeks. For an epidural, radiculopathy must be confirmed on imaging or EMG/NCS; for SI injection, 3 of 5 positive stress maneuvers.
- *Cervical total disc arthroplasty (CMM-602, V1.0.2025, pub 2025-03-19):* single or two contiguous levels C3-C7; symptomatic radiculopathy/myelopathy from neural compression; failed ≥6 weeks nonsurgical treatment or progressive deterioration; **two-level covered only with a device FDA-approved for two levels (Mobi-C, Prestige LP).**
- *SCS (CMM-211, V1.0.2024, eff 2024-05-01):* behavioral-health attestation (may be virtual) showing no inadequately controlled mental/behavioral condition affecting pain perception or device success; permanent implant requires **≥50% pain reduction during a short-term trial ">48 hours"**; failed ≥6 consecutive months physician-supervised conservative care; covered = FBSS with intractable neuropathic leg pain after prior same-region surgery, CRPS of extremities, critical limb ischemia, chronic stable angina CCS III/IV; HF10 proven only for FBSS; DRG stimulation not medically necessary for all indications except replacement; failed trial does not justify a repeat trial. A revised CMM-211 reportedly effective 2026-08-04 adds diabetic-peripheral-neuropathy coverage (trial ">48 hours," permanent implant ≥50% relief) — **single-sourced via a secondary summary; verify on Cigna's official posting before relying on it.**
- Urgent requests: eviCore renders decisions within 24 hours of receiving necessary clinical info when treatment is needed in <48 hours; ED procedures and 23-hour observation do not require PA.

**Carelon Medical Benefits Management (formerly AIM) — Spine Surgery and Sacroiliac Joint Fusion Clinical Appropriateness Guidelines.**
- *Documentation submitted at time of request* must include conservative management (PT + ≥1 complementary strategy), symptom severity (pain ≥3/10 with inability to perform ≥2 ADLs/IADLs), tobacco cessation ≥6 weeks (strongly recommended), and A1c ≤8% for diabetics.
- *SI joint fusion (MSK05-1125.1, eff 2025-11-15, updated 2026-01-01 for CPT revisions; CPT 27278/27279/27280, C1737):* **at least 3 of 7 provocative tests** — Long ligament test, FABER/Patrick's, Active straight leg raise, Compression, Distraction, Thigh thrust, Gaenslen — PLUS positive Fortin finger test; **≥75% pain reduction after image-guided contrast-enhanced intra-articular injection on two separate occasions**; pain ≥6 months with VAS ≥5 AND ODI ≥30; failed ≥6 months conservative care including ≥1 therapeutic intra-articular SI corticosteroid injection. **Posterior-approach percutaneous SI fusion and open SI fusion (outside sacrectomy/tumor, infection/sepsis, severe traumatic pelvic-ring disruption, or multi-segment constructs extending to the ilium) are not medically necessary.**
- *Recurrent lumbar herniated-disc discectomy:* failed ≥6 weeks conservative management (cross-references the Lumbar Laminectomy guideline).

**TurningPoint Healthcare Solutions** — manages MSK/spine/pain surgical PA for Blue Cross Blue Shield of Michigan/BCN and multiple Centene/Ambetter and Health Net lines (note: BCBSM/BCN dropped MA pain-management PA delegation to TurningPoint as of May 1 2025). Intake via web portal (myturningpoint-healthcare.com), phone, and fax; **peer-to-peer conducted by a TurningPoint physician of the same specialty**, pre- or post-determination (P2P line 800-581-3920). Post-procedural documentation submission is shared with the plan to facilitate claims payment. TurningPoint publishes an AI disclosure stating AI tools "assist — and not replace — appropriate human oversight and decision-making."

**Cohere Health** — Humana's MSK PA vendor since Jan 2021 (nationwide by 2022; cardiovascular/surgical added 2023). Episode-of-care authorization model (authorizes a full treatment pathway rather than each step). Per Cohere/Humana, the platform **auto-approves up to 90% of requests**, drives a **median approval time of 0 minutes**, enables **immediate scheduling in 89% of cases**, and carries **95% of MSK authorization requests through the digital platform**; MSK criteria are informed by American Academy of Orthopedic Surgeons (AAOS) policies.

**Medicare FFS (Novitas, Texas JH MAC).** LCD L37848 "Lumbar Spinal Fusion" governs Texas; total disc arthroplasty is NOT covered under that LCD (see NCD 150.10 for lumbar artificial disc; LCD L38033 for cervical disc replacement, which found single-level non-inferiority to ACDF). LCDs require documented history/duration of failed conservative management, a complete operative report, imaging correlation, and (per related LCD checklists) inpatient orders where the CPT is inpatient-only. Novitas removed MIS SI joint fusion (then-code 0334T) from non-covered status effective May 8 2014 — now case-by-case for Texas beneficiaries. Medicare FFS generally does not require prospective prior authorization for these surgeries but audits medical necessity retrospectively; documentation standards mirror LCD checklists.

**Medicare Advantage.** Behaves like commercial UM but must follow the applicable LCD/NCD medical-necessity content and CMS timeframes; now subject to CMS-0057-F. Per AMA, 99% of Medicare Advantage enrollees are in a plan with prior authorization on at least some services.

**Texas Medicaid.** Practice intake indicates Medicaid is not accepted; documented for completeness — Texas Medicaid managed care and FFS follow their own criteria and are subject to CMS-0057-F process rules (72-hour/7-day, specific denial reasons) but NOT the Texas gold-card law.

**Workers' Compensation (Texas DWC).** Governed by Texas Labor Code §413.014 and 28 TAC §134.600; the **Official Disability Guidelines (ODG) are the adopted treatment guidelines** (28 TAC §137.100), and MDGuidelines is required for disability/return-to-work. Treatments that exceed or are not addressed by ODG require preauthorization. Spine-surgery preauth is submitted with clinical documentation to the carrier or its agent (e.g., Texas Mutual accepts fax with supporting docs). A carrier "may not deny preauthorization or reimbursement solely because the diagnosis or treatment is not included in the DWC treatment guidelines," but may retrospectively deny non-ODG treatment with evidence-based documentation that outweighs the presumption of reasonableness. Investigational/experimental procedures (per ODG or AMA Category III codes), stimulator devices, DME over $500, and repeat diagnostics over $350 generally require preauth.

**TRICARE / VA Community Care.** Not directly documented in this research pass; both operate referral/authorization regimes distinct from commercial payers (TRICARE regional contractors; VA CCN via TriWest/Optum with standardized episodes of care). Flagged as a research gap to close before build.

### 2. SUBMISSION & RESPONSE CHANNEL MATRIX

| Channel | Submit | Status | Doc upload | P2P | Appeal | Response artifact |
|---|---|---|---|---|---|---|
| **Availity Essentials** (BCBSTX, Aetna medical precert, many payers) | Yes (guided form; sometimes real-time approval) | Authorization dashboard | Yes (medical attachments) | Often not in-portal; via denial-letter phone number | Per-payer (some not via Availity) | Portal status + payer letter |
| **UHC Provider Portal (UHCprovider.com)** | Yes; returns Decision ID | Yes | Yes | Phone | Portal/phone | Portal determination + letter |
| **CignaforHCP / eviCore portal** | eviCore portal preferred for spine | Yes, 24/7 | Yes | eviCore same-specialty P2P line | eviCore | Email notification + fax + portal |
| **Carelon ProviderPortal** | Yes, 24/7 real-time status | Yes | Yes (imaging, notes, failed-therapy records) | Carelon clinical reviewer P2P | First-level appeal window | Auth reference number + letter |
| **TurningPoint portal** | Yes | Yes | Yes (incl. post-procedural docs) | Same-specialty TurningPoint physician | Yes | Portal + fax |
| **Cohere portal** | Yes; upstream suggestions pre-submit | Yes | Yes | Yes | Yes | Frequently instant approval |
| **Novitasphere (Medicare FFS)** | Mostly retrospective | Yes | Yes | N/A prospective | Redetermination ladder | Determination/remittance |
| **Fax** | Dominant fallback for all | Via phone | Cover sheet + attachments | N/A | Fax appeal | Fax-back approval/denial letter |
| **Phone/IVR** | Urgent/expedited, status, P2P scheduling | Yes | No | Yes | Initiate | Verbal + follow-up letter |
| **Mail** | Rare inbound | No | No | No | Written appeals/decisions | Determination & appeal decision letters |
| **X12 278 / 275 / 277 / 271** | Limited adoption; some clearinghouses/UHC | 277 status; 271 eligibility | 275 attachment (poorly adopted) | N/A | N/A | 278 response |
| **FHIR Da Vinci (CRD/DTR/PAS)** | APIs due Jan 1 2027 for impacted payers | PAS tracking | DTR questionnaire package | N/A | N/A | PAS response bundle |

**EDI reality.** X12 278 (Health Care Services Review – Request/Response, currently 5010; a move to 6020 has been proposed) is the HIPAA-mandated PA transaction but adoption is "extremely poor" because HHS never finalized an attachment standard for clinical documentation; the AHA notes the missing attachment standard "has paralyzed the industry." The 275 and 277 never achieved uptake. CMS did not fix the 278; instead CMS-0057-F mandates FHIR-based Prior Authorization APIs. On Feb 28 2024, CMS's OBRHI National Standards Group announced enforcement discretion not to enforce the 278 requirement if a payer uses the FHIR PA API. Per the 2024 CAQH Index, only 35% of medical PAs are fully electronic (40% in the 2025 Index).

**CMS-0057-F.** Applies to Medicare Advantage, Medicaid/CHIP (FFS + managed care), and QHPs on the FFEs. Does NOT apply to Original Medicare, prescription drugs, ERISA employer/self-funded plans, or state-run-exchange plans. Two deadline tiers: (1) process rules effective Jan 1 2026 — decisions within 72 hours expedited / 7 calendar days standard (except QHP issuers on FFEs for the timeframe rule), a specific reason for every denial regardless of channel (portal, fax, email, mail, or phone), and public metric reporting (first metrics by Mar 31 2026 covering CY2025); (2) four FHIR APIs (Patient Access, Provider Access, Payer-to-Payer, Prior Authorization) live by Jan 1 2027. The PA API must expose documentation requirements, submission, tracking, and determination, reflect updates within 1 business day, and retain records ≥1 year after the last status change. CMS characterized the standard-decision change (from 14 to 7 days) as up to a 50% improvement for some payers.

**Da Vinci IGs.** CRD (Coverage Requirements Discovery) alerts the provider at order time whether PA is required and that documentation is needed; DTR (Documentation Templates and Rules) delivers payer questionnaires (`$questionnaire-package`, adaptive `$next-question`) inside the EHR to capture required data; PAS (Prior Authorization Support) packages the request (translating to/from X12 278 for HIPAA compliance) and returns approval, denial-with-specific-reason, or RFI. Availity positions itself as the multi-channel "front door" supporting CRD/DTR/PAS.

**Clearinghouses/aggregators.** Availity (largest real-time network; multi-payer portal + API + X12; markets AI-assisted PA), Waystar, Change Healthcare/Optum, Infinx, Rhyme (formerly PriorAuthNow), Experian Health, Myndshft, and clinical-intelligence vendors Cohere and Latent/Anterior. Each exposes different integration surfaces (portal, X12, REST/FHIR API); the channel-adapter layer should abstract these.

### 3. DENIAL TAXONOMY & REMEDIATION

| Denial category | Type | Remediation path | Automatable? |
|---|---|---|---|
| Insufficient conservative-care documentation | Administrative/medical-necessity hybrid | Supply PT/injection/medication dates → resubmit or reconsideration | Largely — gap detection + document assembly; physician affirms clinical accuracy |
| Missing/expired imaging | Administrative | Attach MRI/CT within window → resubmit | Yes — retrieval + attach |
| Imaging not correlating with symptoms | Medical necessity | Physician narrative tying findings to exam; P2P | No — physician required |
| No documented instability | Medical necessity | Provide flexion-extension measurements (≥3 mm / >11°); P2P | Partial — surface the metric; physician interprets |
| Experimental/investigational (2-level arthroplasty, posterior/hybrid SI fusion, interspinous spacers, SCS without prior surgery) | Coverage/benefit | Appeal + IRO; often benefit exclusion, low overturn | No — physician + appeals |
| Not medically necessary | Medical necessity | P2P → internal appeal → IRO | No — physician |
| Wrong site of service | Administrative | Re-request correct setting | Yes |
| Missing psych clearance (SCS/fusion) | Administrative/clinical | Obtain evaluation → resubmit | Partial — flag + track; clinician obtains |
| Tobacco use | Clinical/administrative | Cessation + lab (cotinine ≤10 ng/ml) → resubmit at eligibility date | Partial — timer + reminder |
| Benefit exclusion / non-covered | Benefit | Verify benefits; patient financial pathway | Yes — eligibility check |
| Eligibility/coverage-inactive | Administrative | Re-verify eligibility → resubmit | Yes |
| Administrative/technical (missing NPI, member-ID typo, misrouted to wrong UM entity) | Administrative | Correct + resubmit; note misroutes "sit unprocessed" | Yes |

**Administrative vs. medical-necessity distinction is the core automation boundary.** Administrative denials are fixable by correcting/completing and resubmitting (safely automatable with physician sign-off on any clinical content). Medical-necessity and experimental/investigational denials require peer-to-peer or formal appeal and always require a physician.

### 4. PEER-TO-PEER, APPEALS & EXTERNAL REVIEW (TEXAS + FEDERAL)

**Peer-to-peer.** Under HB 3459, a peer-to-peer preceding an adverse determination must be conducted by a **Texas-licensed physician of the same or similar specialty**. HB 3812 (eff Sept 1 2025) additionally prohibits the utilization-review-directing physician from holding a license to practice *administrative* medicine and adds annual TDI reporting. Delegated vendors (eviCore, Carelon, TurningPoint) run same-specialty P2P lines.

**Texas Chapter 4201 timers (UM agents).** Adverse-determination notice must state the principal reasons, the clinical basis, the source of the screening criteria used, and the appeal/IRO rights. Notice timing: hospitalized patient within 1 working day (telephone/electronic) + letter within 3 working days; non-hospitalized within 3 working days. Appeal acknowledgment letter within 5 working days; appeal decision as soon as practical but no later than **30 calendar days** after the UM agent receives the appeal. Life-threatening conditions or denial of prescription drugs/IV infusions → immediate IRO review, bypassing internal appeal.

**Texas IRO external review (Chapter 4202).** If internal appeal is denied, the enrollee may seek review by a TDI-certified Independent Review Organization; the UM agent must provide records to the IRO within 3 business days and **must comply with the IRO's determination** on medical necessity and on experimental/investigational status. IRO also handles gold-card exemption-rescission disputes (TDI form LHL011).

**ERISA self-funded plans.** Different framework (ERISA claims-procedure regulation, generally 180-day appeal window, external review under federal/plan rules); Texas gold-carding and Texas IRO do NOT apply. The system must tag each plan's regulatory regime, since "TDI" appears on fully-insured member ID cards but not self-funded ones.

**Medicare Advantage appeal ladder.** Level 1 plan reconsideration (request within 65 days; standard 30 days / expedited 72 hours / payment 60 days); if upheld, auto-forward to Level 2 Independent Review Entity (MAXIMUS Federal Services; standard 30 days / expedited 72 hours); Level 3 ALJ/OMHA (60-day filing; 2026 amount-in-controversy $200; target 90 days, backlogged); Level 4 Medicare Appeals Council; Level 5 federal district court (2026 amount-in-controversy $1,960). Over 90% of MA appeals resolve at Levels 1–2.

**Medicare FFS ladder.** Redetermination (MAC, 120-day filing) → Reconsideration (QIC) → ALJ/OMHA (60 days) → Appeals Council → federal court.

**Overturn economics.** Per the 2024 AMA survey, among denials that were appealed, **81.7% saw the initial prior authorization denial fully or partially overturned** — evidence that many initial denials are not clinically robust and that a disciplined appeal engine has high expected value.

### 5. TEXAS GOLD-CARDING

- **HB 3459 (2021):** a physician approved ≥90% of the time for a given service over the evaluation period earns a continuous exemption ("gold card") for that service; original evaluation period 6 months (began Jan 1 2022); requires ≥5 requests for the service in the period. TDI's implementing rule (28 TAC Ch. 19 Subch. R Div. 2 and §12.601) governs granting, denying, and rescinding exemptions.
- **HB 3812 (2025, eff Sept 1 2025):** extends the evaluation period from 6 months to **1 year** (for determinations issued on/after Sept 1 2025, ending no more than 12 months after the prior period); requires issuers to review a broader pool (requests to the plan and its affiliates); adds annual TDI reporting; removes administrative-medicine physicians from directing UR.
- **Scope:** applies ONLY to TDI-regulated fully-insured commercial HMO/PPO/EPO plans — members with "TDI" on the ID card, which per the Texas Medical Association and TDI cover about 20% of Texans (also certain ASO groups per BCBSTX). NOT Medicaid, NOT CHIP, NOT ERISA self-funded, NOT Medicare.
- **Mechanics (BCBSTX example):** exemptions posted in the Availity Provider Correspondence Viewer; rescission notice includes the list of claims reviewed; provider may appeal a rescission via a PA Exemption Appeal Form and/or request IRO review and file a TDI complaint. Exemption does not override benefits/eligibility.
- **Voluntary payer gold-cards** (UnitedHealthcare, Cigna, others) differ: UHC's Texas program (eff Oct 1 2022) applies to fully-insured commercial members and reviews approval rates every 12 months; these are payer-defined and revocable on their own terms.
- **What the practice must track to qualify/contest:** per-physician, per-service request counts and approval rates over rolling windows; which plans are TDI-regulated; exemption grant/rescission notices; and the underlying claim list for any rescission dispute.

### 6. WORKFLOW REALITY & BURDEN DATA

**Who does it:** typically a prior-authorization coordinator and/or surgery scheduler, with biller support; physician/PA pulled in for P2P and appeals.

**Sequence:** surgical decision → eligibility/benefit verification (identify administering UM entity) → criteria pre-check/gap analysis → documentation remediation → physician affirmation → submission via correct channel → status polling → approval / RFI / denial → (P2P) → (appeal) → (IRO) → auth on file → surgery + facility/ASC scheduling → monitor auth validity window → re-auth if expired → handle intraoperative CPT change / add-on / assistant-surgeon / implant / DME authorization → post-service/retrospective authorization when needed.

**Burden data (2024 AMA Prior Authorization Physician Survey, n=1,000 practicing physicians — 400 primary-care, 600 specialists, fielded December 2024):** practices complete **39 prior authorization requests per physician per week**; physicians and staff spend an **average of 13 hours** per week completing them; **40% employ staff working exclusively on PA**; **93% report PA delays care**; **82% report PA can lead to treatment abandonment**; **29% report PA led to a serious adverse event** for a patient. Physician-reported "high/extremely high" administrative burden by insurer: UnitedHealthcare 75%, Humana 65%, Anthem/Elevance 61%, Aetna 61%, Cigna 59%, Blue Cross Blue Shield 56%.

### 7. AUTOMATION & AI CONSTRAINTS

- **HIPAA + Texas Medical Records Privacy Act (HB 300):** broader "covered entity" definition and training requirements than federal HIPAA.
- **Texas SB 1188 (eff Sept 1 2025; data-localization eff Jan 1 2026):** a practitioner using AI for diagnostic purposes (including recommendations on diagnosis or course of treatment) may do so only within scope of licensure, where not otherwise prohibited, and if the practitioner reviews all AI-generated records per Texas Medical Board standards — and **must disclose the AI use to the patient**; **EHRs containing Texas patient data must be physically stored in the U.S. (offshore storage prohibited regardless of record creation date; offshore access limited).** Penalties via TMB/TDLR/TDI disciplinary action (for three or more same-manner violations) and AG enforcement.
- **Texas HB 149 / TRAIGA (eff Jan 1 2026):** healthcare providers using an AI system "in relation to health care service or treatment of a patient" must disclose that use; prohibits intentionally manipulative/discriminatory AI; AG civil penalties $5,000–$250,000 per violation; safe harbor for entities following the NIST AI Risk Management Framework; a 36-month DIR-administered regulatory sandbox exists.
- **FDA CDS guidance:** administrative/documentation-assembly software that does not drive a diagnostic/treatment recommendation and leaves the clinician able to independently review the basis generally falls outside device regulation; the physician-affirmation gate keeps the system on the non-device side.
- **False Claims Act / fraud-and-abuse:** any AI-generated clinical assertion submitted to a payer that is not supported by the chart creates FCA exposure — hence every generated assertion must trace to a source document with page and date, and a physician must affirm the letter of medical necessity. (AMA notes concern that payer-side AI tools have driven denial rates far higher; the mirror risk on the provider side is unsupported AI-generated documentation.)
- **Payer terms-of-service / RPA constraints:** portal scraping/RPA frequently violates payer ToS; preferred integration is sanctioned APIs (Availity, FHIR PAS as it comes online) and human-in-the-loop portal use. The channel-adapter design should prefer sanctioned surfaces and flag ToS risk per payer.

---

## Use-Case Catalog (end-to-end lifecycle, incl. unhappy paths)

1. **Surgical decision captured** → system creates a case, pulls CPT(s), diagnosis, planned levels/approach from AdvancedMD.
2. **Eligibility & benefit check** → verify coverage active; identify plan regulatory regime (TDI / ERISA / MA / WC); **resolve administering UM entity** (payer vs. eviCore/Carelon/TurningPoint/Cohere/Novitas).
3. **Gold-card check** → is this physician exempt for this service on this plan? If yes, skip to scheduling with documented exemption.
4. **Criteria pre-check** → match planned CPT + diagnosis to the correct payer/vendor guideline; produce a gap list (imaging window, conservative-care weeks, ODI/VAS/NDI, instability metrics, tobacco/psych/BMI/A1c gates, provocative-test counts for SI, trial thresholds for SCS).
5. **Documentation gap remediation** → retrieve/attach imaging & reports; flag missing PT/injection dates; schedule psych eval; set tobacco-cessation timer; assemble packet.
6. **Physician-affirmation gate** → surgeon/PA reviews and affirms the letter of medical necessity; nothing generated is transmitted without affirmation; ledger receipt written.
7. **Channel dispatch** → submit via the correct adapter (portal/fax/EDI/FHIR); capture reference/Decision ID.
8. **Status polling** → poll portal/277/PAS; detect RFI, approval, or denial.
9. **RFI loop (multi-round)** → parse the request-for-information, map to missing elements, remediate, re-affirm, resubmit; loop until resolved or denied.
10. **Approval** → record auth number, approved CPTs/levels, validity window, site of service; push to scheduling.
11. **Denial → classification** → administrative vs. medical necessity vs. experimental/benefit.
12. **Administrative-denial remediation** → auto-correct (member ID, NPI, site), resubmit.
13. **Peer-to-peer** → for medical-necessity denials, request P2P; ensure Texas same-specialty physician; prep briefing packet with criteria crosswalk and chart citations; schedule; record outcome.
14. **Internal appeal (Level 1/2)** → compose appeal citing the exact guideline criteria met and chart evidence; track Chapter 4201 / ERISA / MA timers.
15. **External review (Texas IRO / MA IRE / FFS QIC)** → assemble record, submit within statutory window, track binding determination.
16. **Auth on file → surgery scheduling** → coordinate facility/ASC; verify auth still valid at date of service.
17. **Auth expiration / re-auth** → monitor validity window; auto-trigger re-authorization when a case slips past expiry.
18. **Intraoperative change / CPT change** → post-service or corrected authorization when levels/codes change after approval; add-on codes, assistant-surgeon, implant/DME authorization.
19. **Post-service / retrospective authorization** → for emergent or changed cases, submit retrospective request with operative report.
20. **Gold-card tracking** → accumulate per-service approval rates to earn/defend exemptions; handle rescission disputes.

**Unhappy-path emphasis:** misrouted submissions that "sit unprocessed" (clock never starts); repeated RFI rounds; P2P scheduling friction and IVR/hold; denial reasons vague pre-2026 vs. specific post-CMS-0057-F; experimental determinations that must go straight to IRO; and authorization expiry during long approval cycles.

## Draft User Stories

- **Surgeon (Dr. James / Dr. Eubanks):** "As the surgeon, I want to review and affirm a pre-assembled letter of medical necessity with every clinical assertion traced to a chart page and date, so I can sign off quickly and defensibly." / "I want a one-screen P2P briefing that crosswalks the payer's exact criteria to my chart evidence, so I can win the call."
- **Physician Assistant (Nathan Mahanirananda):** "I want the system to surface exactly which criteria elements are missing for this payer so I can complete the note before submission."
- **PA Coordinator:** "I want a work queue prioritized by deadline and surgery date, with the correct channel pre-selected per payer/vendor, and automatic status polling so I stop calling IVRs." / "I want denial reasons parsed and classified into fix-and-resubmit vs. appeal."
- **Surgery Scheduler:** "I want to see auth status and validity window on the scheduling board, and be blocked from booking a date past the auth expiry."
- **Biller:** "I want the approved CPTs/levels and auth number attached to the claim, and alerts when intraoperative codes diverge from what was authorized."
- **Practice Administrator:** "I want gold-card tracking per physician/service/plan and a dashboard of denial/overturn rates and turnaround-time compliance." / "I want AI-use disclosures and onshore-storage attestations captured for SB 1188/HB 149 compliance."
- **Patient (via patientportal.advancedmd.com/119778):** "I want to know my authorization status and any action needed from me (e.g., completing a psych eval or a tobacco-cessation window)."

## UI/UX Requirements Implied

- **Case queue** with filters by deadline, surgery date, payer/vendor, state (submitted/RFI/approved/denied/P2P/appeal/IRO/expired).
- **Case detail** with criteria-crosswalk panel (payer requirement vs. chart evidence with citations), gap list, and status timeline.
- **Physician-affirmation screen** — hard gate; shows every generated assertion with source page/date; requires explicit sign-off; writes an evidence-ledger receipt.
- **Channel dispatch panel** — per-payer channel selection, fax cover-sheet generation, portal deep-links, attachment manager, ToS-risk flag.
- **Timers/SLA banners** — Chapter 4201, CMS-0057-F, ERISA, MA/FFS clocks with countdown and breach alerts.
- **Denial workspace** — parsed reason, classification, remediation action, appeal composer with criteria citations.
- **P2P prep view** — same-specialty-requirement checker, scheduling, briefing packet.
- **Gold-card dashboard** — per-physician/service approval-rate accumulators, exemption status, rescission-dispute workflow.
- **Notifications** — RFI received, approaching expiry, deadline breach risk, psych/tobacco milestone reminders.
- **Evidence ledger view** — append-only receipts for every generated assertion and every channel event.

## Agent Role Definitions

- **Eligibility Agent** — consumes member/plan data; produces coverage status, regulatory-regime tag (TDI/ERISA/MA/WC), and administering-UM-entity resolution. Human-in-loop: none required for read-only checks.
- **Criteria Matcher** — consumes CPT + diagnosis + payer/vendor; produces the applicable guideline and a structured gap list. Human-in-loop: physician validates clinical interpretation of ambiguous criteria.
- **Document Assembler** — consumes chart, imaging, PT/injection history; produces the PA packet and draft LMN with source citations. Human-in-loop: **mandatory physician affirmation** before transmission.
- **Channel Dispatcher** — consumes affirmed packet + channel config; produces submission via portal/fax/EDI/FHIR and captures reference IDs. Human-in-loop: for portals under restrictive ToS.
- **Response Parser** — consumes inbound fax/email/portal-message/EDI/FHIR; produces normalized status (approved/RFI/denied) with structured denial reasons. Human-in-loop: low-confidence parses flagged.
- **Denial Classifier** — consumes parsed denial; produces category + remediation route (fix-and-resubmit vs. P2P vs. appeal vs. IRO). Human-in-loop: physician confirms any medical-necessity path.
- **Appeal Composer** — consumes denial + criteria crosswalk + chart; produces appeal letter citing exact criteria and evidence. Human-in-loop: **physician affirmation**.
- **Peer-to-Peer Prep Agent** — consumes case + payer criteria; produces same-specialty briefing and scheduling; verifies Texas-licensed same-specialty requirement. Human-in-loop: physician conducts call.
- **Gold-Card Tracker** — consumes per-physician/service/plan approval history; produces exemption eligibility/defense and rescission-dispute artifacts. Human-in-loop: administrator review.
- **Timer/SLA Agent** — consumes case events + regulatory regime; produces countdown timers and breach alerts. Human-in-loop: none.

*(Mapping to the planned architecture: each agent is a Cordis-model plugin; the Document Assembler and Appeal Composer route through the hard physician-affirmation gate before any A2UI/AG-UI transmission action; the Channel Dispatcher and Response Parser are the "agent-managed channel adapters"; Cedar policies gate which agent may transmit, and every agent write appends to the evidence receipt ledger with page/date provenance.)*

---

## Recommendations

1. **Build the three matrices as first-class, versioned data, refreshed quarterly.** Payer policies (Aetna CPB 0743/0016/0194/0591, UHC Spinal Fusion & Decompression, eviCore/Cigna CMM-602/CMM-211, Carelon Spine/MSK05, Novitas LCD L37848/L38033) change on quarterly cycles; store each criterion with its policy number, effective date, and source URL, and treat criteria drift as a monitored event. **Threshold to revisit a criterion:** any policy effective-date change or new guideline version.
2. **Model the administering-UM-entity resolver before the payer.** Route logic must key off eviCore/Carelon/TurningPoint/Cohere/Novitas, not the card brand, because that determines channel, criteria, and P2P line. Misrouting is a documented failure mode ("sits unprocessed; the clock never starts").
3. **Make the physician-affirmation gate non-bypassable and the evidence ledger append-only from day one** — this is both the FDA-non-device posture and the FCA/SB 1188/HB 149 compliance posture. Capture AI-use disclosure and onshore-storage attestations as ledger entries.
4. **Prioritize the denial/appeal engine.** With 81.7% of appealed denials overturned, a disciplined P2P-prep + appeal-composer pipeline is the highest-ROI component. Instrument overturn rates by payer and denial category and route the known experimental/investigational procedures (2-level arthroplasty, posterior/hybrid SI fusion, interspinous spacers, SCS without prior surgery) straight to the appeal/IRO track.
5. **Stage channels: portal + fax first, FHIR PAS/CRD/DTR as payers expose APIs toward Jan 1 2027.** Do not block on EDI 278. Build the adapter abstraction so FHIR slots in behind the same interface. **Threshold to add a FHIR adapter:** a target payer publishes a production PAS endpoint.
6. **Instrument Texas-specific timers and gold-card accumulators now** — Chapter 4201 (5-working-day ack / 30-calendar-day appeal decision), CMS-0057-F (72h/7d + specific denial reason), MA (65-day filing), and HB 3812's 1-year gold-card window with ≥5-request minimum and 90% threshold. Flag each case's regulatory regime so the correct timer set applies.
7. **Close the two research gaps before build:** (a) TRICARE and VA Community Care spine-authorization mechanics; (b) verification of the reported Cigna CMM-211 diabetic-peripheral-neuropathy revision effective 2026-08-04 on Cigna's official posting.

## Caveats

- **Payer policies change quarterly**; every criterion here must be re-verified against the live policy at build time and on an ongoing schedule. Effective/review dates are captured where available.
- **Delegation arrangements shift** (e.g., BCBSM/BCN dropped TurningPoint MA pain-management PA after May 1 2025); the administering-entity resolver must be data-driven, not hard-coded.
- **The Cigna Aug 2026 SCS revision is single-sourced** (secondary summary) and must be confirmed on Cigna's official site.
- **TRICARE/VA Community Care were not directly researched** in this pass.
- **Overturn and burden statistics are national AMA/CAQH figures**, not spine-specific or practice-specific; treat as directional.
- **Legal constraints (SB 1188, HB 149, HB 300, FCA, FDA CDS) are summarized from law-firm and agency sources**, not legal advice; confirm with counsel before deployment, especially on AI-disclosure wording and data-residency for any cloud/LLM components (SB 1188's onshore-storage requirement directly constrains where any model inference touching Texas EHR data may run).