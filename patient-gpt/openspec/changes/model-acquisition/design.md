# Design

## Context

KnowMe's `gen_ui_inference` holds the pattern this change adapts: pinned catalog,
`.part` + Range resume, streamed verification, atomic rename (`llama.rs:195-298`,
`mlx_download.rs:100-171`), RAM preflight with downgrade (`memory.rs`) and a
progress state machine (`gen_ui_types/src/lifecycle.rs:104-123`). Defects not to
copy are listed in `analysis.md` → Model acquisition. The contract types come
from `inference-contract`.

## Goals / Non-Goals

**Goals:** a catalog pinned in source; byte-exact verification; resumable,
observable downloads; memory-based selection; platform-correct storage.

**Non-Goals:** OS background downloads (a download runs while the app is in the
foreground and resumes on the next prepare); Windows/Linux GGUF entries (decision
10: macOS only); any engine or embedder runtime.

## Decisions

1. **Catalog (pinned 2026-10-26 from the Hugging Face API, `?blobs=true`).**
   Large files below carry their LFS SHA-256 now. Small JSON/text files at the same
   revisions are pinned by git blob id today; task 1.2 downloads each at the pinned
   revision, computes its SHA-256 and records it, and the operator reviews the diff.

   | Catalog id | Platforms | Repository @ revision | Weight file | Bytes | SHA-256 |
   |---|---|---|---|---|---|
   | `qwen3-0.6b-mlx-4bit` | macOS, iOS | `mlx-community/Qwen3-0.6B-4bit` @ `73e3e38d981303bc594367cd910ea6eb48349da8` | `model.safetensors` | 335,450,584 | `392e8d466d56100ada00eb82031fb854297fc9e389b7d303eba3af114e87bce2` |
   | `qwen3-1.7b-mlx-4bit` | macOS, iOS | `mlx-community/Qwen3-1.7B-4bit` @ `3b1b1768f8f8cf8351c712464f906e86c2b8269e` | `model.safetensors` | 968,080,210 | `0e86d9677e519323849eac1bc272caae88567a481ff188c431f70be543d9995f` |
   | `qwen3-0.6b-litertlm` | Android | `litert-community/Qwen3-0.6B` @ `fed81d17517e6ea64362e917ecf7e5accff12492` | `Qwen3-0.6B_dynamic_wi4b32_afp32.litertlm` | 344,671,744 | `03e7da1eb1108b50dffaa9bb52cc7bcbad2eb0c66ca990267f480c1e545d2856` |
   | `qwen3-1.7b-litertlm` | Android | `litert-community/Qwen3-1.7B` @ `79bf0667b32ae025b972e5fe555fe72ca6e8816c` | `Qwen3-1.7B_dynamic_wi4b32_afp32.litertlm` | 977,184,032 | `2a72330b504a6596d53a2c00923c57173b10f1b83e6a541213ffec08d1fc5de8` |
   | `arctic-embed-xs-int8` | all | `Snowflake/snowflake-arctic-embed-xs` @ `d8c86521100d3556476a063fc2342036d45c106f` | `onnx/model_int8.onnx` | 22,972,992 | `e6aa5e656466a73d7c3111e9a3378bd13e5b93af30eaac2b3f13fd56692589a1` |

   MLX entries also need `tokenizer.json` (11,422,654 B, SHA-256
   `aeb13307a71acd8fe81861d94ad54ab689df773318809eed3cbe794b4492dae4`, identical in
   both repos), `config.json`, `tokenizer_config.json`, `special_tokens_map.json`,
   `added_tokens.json` and `model.safetensors.index.json`. The embedder also needs
   `tokenizer.json` (711,649 B), `config.json`, `tokenizer_config.json` and
   `special_tokens_map.json`. Licences: Qwen repos tag `apache-2.0`; the
   arctic-embed-xs model card at the pinned revision states Apache-2 (README
   §License) but its metadata carries no licence tag and the repo has no LICENSE
   file — the operator should accept the card as the licence record.
2. **Int8 embedder on every platform.** One file everywhere keeps one vector space
   per embedder id across devices. Alternative: fp32 (90 MB) on desktop — rejected,
   two ids for one model with no consumer that needs the precision.
3. **LiteRT `dynamic_wi4b32_afp32` variants.** They are the 345 MB / 977 MB files
   the analysis sized; the mediatek-specific and mixed-int4 files are excluded.
   The `litert-community/Qwen3-0.6B` repo was modified on 2026-10-25, so the pin is
   the revision, not `main`.
4. **Thresholds are named constants**: `CAPABLE_RAM_BYTES = 7 GiB`,
   `MIN_CHAT_RAM_BYTES = 3 GiB`. Phones sold as 8 GB report less than 8 GiB of
   physical memory, so the threshold sits at 7 GiB to give them the 1.7B model;
   the value each evidence device reports is recorded in its receipt. The
   evidence Android AVD must be configured with at least 4 GiB.
5b. **A full-length `.part` is verified without a request.** If the partial file
   already has the catalog size, the downloader hashes it locally; a mismatch is
   `integrity_failed` and the file is deleted. An HTTP 416 from a Range request is
   treated the same way.
5. **Source URLs** are `https://huggingface.co/<repo>/resolve/<revision>/<file>`;
   redirects are followed only to `https` URLs.
6. **Crate layout.** `patient-gpt-inference` modules: `catalog`, `download`,
   `preflight`, `store` (the `ModelStorePort` adapter). Engines and the embedder
   are added by later changes behind features, so the host still names no engine.

## Risks / Trade-offs

- [Hugging Face availability or repo deletion] → digests make a substituted file
  fail closed; a mirror is a later decision.
- [First-run download size: 335 MB–968 MB chat + 23 MB embedder] → progress is
  visible; the preflight picks the smaller model below 7 GiB.
- [Small-file SHA-256 not yet computed] → task 1.2 computes and records them before
  any engine change starts; unreviewed digests block that change.
