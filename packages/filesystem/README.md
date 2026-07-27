# @nuxt-laravelize/filesystem

Portable filesystem disks, capability contracts, secure wrappers, an in-memory test driver, and a root-confined local Node adapter for Nuxt Laravelize.

The stable `Filesystem` API remains byte-oriented. Optional features are separate capability interfaces with fail-closed guards: temporary URLs, direct-upload issue/confirmation, visibility, SHA-256 checksums, streams, and multipart lifecycle. Unsupported disks do not fabricate these methods.

`scopedFilesystem()` confines base and optional operations below one normalized prefix. `readOnlyFilesystem()` rejects base mutations and omits optional mutation capabilities. Mutable `ReadFallbackFilesystem` requires an explicit async `FilesystemTombstoneStore`; production must provide a durable, shared implementation scoped to that logical primary/fallback pair. Tombstones are monotonic authoritative deletion history: delete and move-source removal record before primary mutation and writes/copies/moves never clear them. A current primary always wins and remains visible; when it is absent, the tombstone permanently suppresses stale fallback data. Compaction is an explicit administrative operation only after verifying fallback deletion or retention completion and is intentionally absent from this API. Plan storage growth, retention, backup, and monitoring. `InMemoryFilesystemTombstoneStore` is solely for tests/development; there is no unsafe default. Only use a trusted, committed replica as fallback.

`quarantineFilesystem()` exposes an explicit staging disk plus `release()` and `reject()`. It does not scan files: the application must scan/transform first and call `release()` only after acceptance.

The Node `LocalFilesystem` supports native streams, SHA-256 checksums, and private/public file modes (`0600`/`0644`). Its root must be exclusively controlled by the application; the pre-operation symlink checks are not a hostile same-host sandbox.
