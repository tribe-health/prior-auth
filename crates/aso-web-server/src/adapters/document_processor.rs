//! Bounded text extraction for server-owned document processing jobs.

use aso_host::{
    document_processing::{
        DocumentExtractionError, ExtractedDocumentPage, MAX_EXTRACTED_PAGE_BYTES,
    },
    document_upload::{DocumentMediaType, MAX_DOCUMENT_UPLOAD_PAGES},
    ports::DocumentProcessor,
};
use async_trait::async_trait;

pub struct BoundedDocumentProcessor;

fn normalize_page_text(value: &str) -> Result<String, DocumentExtractionError> {
    let normalized = value.replace("\r\n", "\n").replace('\r', "\n");
    let normalized = normalized.trim().to_owned();
    if normalized.is_empty() {
        return Err(DocumentExtractionError::EmptyPageText);
    }
    if normalized.len() > MAX_EXTRACTED_PAGE_BYTES {
        return Err(DocumentExtractionError::TextExtractionFailed);
    }
    Ok(normalized)
}

fn extract_text_pages(bytes: &[u8]) -> Result<Vec<ExtractedDocumentPage>, DocumentExtractionError> {
    let text = std::str::from_utf8(bytes).map_err(|_| DocumentExtractionError::SourceIntegrity)?;
    if text.contains('\0') {
        return Err(DocumentExtractionError::SourceIntegrity);
    }
    let page_texts = text.split('\u{000c}').collect::<Vec<_>>();
    if page_texts.len() > MAX_DOCUMENT_UPLOAD_PAGES {
        return Err(DocumentExtractionError::PageLimitExceeded);
    }
    page_texts
        .into_iter()
        .enumerate()
        .map(|(index, text)| {
            Ok(ExtractedDocumentPage {
                page_number: u32::try_from(index + 1)
                    .map_err(|_| DocumentExtractionError::PageLimitExceeded)?,
                text: normalize_page_text(text)?,
            })
        })
        .collect()
}

fn extract_pdf_pages(bytes: &[u8]) -> Result<Vec<ExtractedDocumentPage>, DocumentExtractionError> {
    if !bytes.starts_with(b"%PDF-") {
        return Err(DocumentExtractionError::SourceIntegrity);
    }
    let document =
        lopdf::Document::load_mem(bytes).map_err(|_| DocumentExtractionError::SourceIntegrity)?;
    if document.is_encrypted() {
        return Err(DocumentExtractionError::SourceIntegrity);
    }
    let page_numbers = document.get_pages().into_keys().collect::<Vec<_>>();
    if page_numbers.is_empty() {
        return Err(DocumentExtractionError::EmptyPageText);
    }
    if page_numbers.len() > MAX_DOCUMENT_UPLOAD_PAGES {
        return Err(DocumentExtractionError::PageLimitExceeded);
    }
    page_numbers
        .into_iter()
        .map(|page_number| {
            let text = document
                .extract_text_with_limit(&[page_number], MAX_EXTRACTED_PAGE_BYTES)
                .map_err(|_| DocumentExtractionError::TextExtractionFailed)?;
            Ok(ExtractedDocumentPage {
                page_number,
                text: normalize_page_text(&text)?,
            })
        })
        .collect()
}

#[async_trait]
impl DocumentProcessor for BoundedDocumentProcessor {
    async fn extract_pages(
        &self,
        media_type: DocumentMediaType,
        bytes: Vec<u8>,
    ) -> Result<Vec<ExtractedDocumentPage>, DocumentExtractionError> {
        tokio::task::spawn_blocking(move || match media_type {
            DocumentMediaType::ApplicationPdf => extract_pdf_pages(&bytes),
            DocumentMediaType::TextPlain => extract_text_pages(&bytes),
        })
        .await
        .map_err(|_| DocumentExtractionError::TextExtractionFailed)?
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn text_pages_are_sequential_and_normalized() {
        let pages = BoundedDocumentProcessor
            .extract_pages(
                DocumentMediaType::TextPlain,
                b" Synthetic first page\r\n\x0cSynthetic second page\r".to_vec(),
            )
            .await
            .unwrap();
        assert_eq!(
            pages,
            vec![
                ExtractedDocumentPage {
                    page_number: 1,
                    text: "Synthetic first page".into(),
                },
                ExtractedDocumentPage {
                    page_number: 2,
                    text: "Synthetic second page".into(),
                },
            ]
        );
    }

    #[tokio::test]
    async fn invalid_or_empty_text_is_refused() {
        for bytes in [b"\0".to_vec(), b" \n\x0cSynthetic second page".to_vec()] {
            assert!(
                BoundedDocumentProcessor
                    .extract_pages(DocumentMediaType::TextPlain, bytes)
                    .await
                    .is_err()
            );
        }
    }
}
