CREATE TABLE IF NOT EXISTS "scout_documents" (
  "index_name" text NOT NULL,
  "document_type" text NOT NULL,
  "document_key" text NOT NULL,
  "document" jsonb NOT NULL,
  "search_vector" tsvector NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "scout_documents_pk" PRIMARY KEY ("index_name", "document_type", "document_key")
);
CREATE INDEX IF NOT EXISTS "scout_documents_search_vector_gin" ON "scout_documents" USING gin ("search_vector");
