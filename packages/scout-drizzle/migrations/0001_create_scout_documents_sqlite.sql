CREATE TABLE IF NOT EXISTS "scout_documents" (
  "index_name" text NOT NULL,
  "document_type" text NOT NULL,
  "document_key" text NOT NULL,
  "document" text NOT NULL CHECK (json_valid("document")),
  "updated_at" integer NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY ("index_name", "document_type", "document_key")
);

CREATE VIRTUAL TABLE IF NOT EXISTS "scout_documents_fts" USING fts5(
  "index_name" UNINDEXED,
  "document_type" UNINDEXED,
  "document_key" UNINDEXED,
  "body",
  tokenize = 'unicode61'
);
