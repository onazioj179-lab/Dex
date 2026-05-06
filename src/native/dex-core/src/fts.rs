// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// DEX Core -- Phase 5: Full-text search engine via tantivy.
// Indexed search with fuzzy matching, phrase queries, and BM25 ranking.
// Complements the existing fuzzy_search for large document collections
// (100k+ notes) where FTS5 and character subsequence matching are too slow.

use parking_lot::Mutex;
use serde_json::json;
use std::sync::OnceLock;
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::*;
use tantivy::schema::Value as TantivyValue;
use tantivy::{doc, Index, IndexWriter, ReloadPolicy};

// ---------------------------------------------------------------------------
// Singleton index state
// ---------------------------------------------------------------------------

static FTS_STATE: OnceLock<Mutex<Option<FtsState>>> = OnceLock::new();

struct FtsState {
    index: Index,
    writer: IndexWriter,
    schema: Schema,
    id_field: Field,
    title_field: Field,
    body_field: Field,
}

fn get_fts() -> &'static Mutex<Option<FtsState>> {
    FTS_STATE.get_or_init(|| Mutex::new(None))
}

// ---------------------------------------------------------------------------
// Schema definition
// ---------------------------------------------------------------------------

fn build_schema() -> (Schema, Field, Field, Field) {
    let mut builder = Schema::builder();
    let id_field = builder.add_text_field("id", STRING | STORED);
    let title_field = builder.add_text_field("title", TEXT | STORED);
    let body_field = builder.add_text_field("body", TEXT);
    (builder.build(), id_field, title_field, body_field)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Create a new tantivy index at the given directory path.
pub fn create_index(path: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (schema, id_field, title_field, body_field) = build_schema();
    std::fs::create_dir_all(path)?;
    let dir = tantivy::directory::MmapDirectory::open(path)?;
    let index = Index::create_in_dir(path, schema.clone())
        .or_else(|_| Index::open(dir))?;
    let writer = index.writer(50_000_000)?; // 50MB heap

    let mut state = get_fts().lock();
    *state = Some(FtsState {
        index,
        writer,
        schema,
        id_field,
        title_field,
        body_field,
    });
    Ok(())
}

/// Open an existing tantivy index.
pub fn open_index(path: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (schema, id_field, title_field, body_field) = build_schema();
    let index = Index::open_in_dir(path)?;
    let writer = index.writer(50_000_000)?;

    let mut state = get_fts().lock();
    *state = Some(FtsState {
        index,
        writer,
        schema,
        id_field,
        title_field,
        body_field,
    });
    Ok(())
}

/// Add a document to the index. Call commit() after batch additions.
pub fn add_document(
    id: &str,
    title: &str,
    body: &str,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut state = get_fts().lock();
    let fts = state.as_mut().ok_or("FTS index not initialized")?;
    fts.writer.add_document(doc!(
        fts.id_field => id,
        fts.title_field => title,
        fts.body_field => body,
    ))?;
    Ok(())
}

/// Commit pending writes to the index.
pub fn commit() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut state = get_fts().lock();
    let fts = state.as_mut().ok_or("FTS index not initialized")?;
    fts.writer.commit()?;
    Ok(())
}

/// Search the index and return results as a JSON array.
/// Each result: { id, title, score }.
pub fn search(
    query_str: &str,
    limit: usize,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let state = get_fts().lock();
    let fts = state.as_ref().ok_or("FTS index not initialized")?;

    let reader = fts
        .index
        .reader_builder()
        .reload_policy(ReloadPolicy::Manual)
        .try_into()?;
    let searcher = reader.searcher();

    let query_parser = QueryParser::for_index(&fts.index, vec![fts.title_field, fts.body_field]);
    let query = query_parser.parse_query(query_str)?;

    let top_docs = searcher.search(&query, &TopDocs::with_limit(limit))?;

    let mut results = Vec::with_capacity(top_docs.len());
    for (score, doc_address) in top_docs {
        let retrieved: tantivy::TantivyDocument = searcher.doc(doc_address)?;
        let id = retrieved
            .get_first(fts.id_field)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let title = retrieved
            .get_first(fts.title_field)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        results.push(json!({
            "id": id,
            "title": title,
            "score": score,
        }));
    }

    Ok(serde_json::to_string(&results)?)
}

/// Delete all documents matching the given id.
pub fn delete_document(id: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut state = get_fts().lock();
    let fts = state.as_mut().ok_or("FTS index not initialized")?;
    let term = tantivy::Term::from_field_text(fts.id_field, id);
    fts.writer.delete_term(term);
    fts.writer.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn fts_index_and_search() {
        let dir = "/tmp/dex_fts_test";
        let _ = fs::remove_dir_all(dir);

        create_index(dir).expect("create index");
        add_document("note-1", "Meeting Notes", "Discussed the DEX roadmap for Q2").expect("add");
        add_document("note-2", "Shopping List", "Buy milk, eggs, and bread").expect("add");
        add_document("note-3", "DEX Architecture", "The Rust native layer handles performance").expect("add");
        commit().expect("commit");

        let results = search("DEX roadmap", 10).expect("search");
        assert!(results.contains("note-1") || results.contains("note-3"));

        delete_document("note-1").expect("delete");
        let results2 = search("meeting", 10).expect("search after delete");
        assert!(!results2.contains("note-1"));

        let _ = fs::remove_dir_all(dir);
    }
}
