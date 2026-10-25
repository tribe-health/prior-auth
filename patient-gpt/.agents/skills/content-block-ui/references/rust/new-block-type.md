# Adding a New ContentBlock Type — Full Stack Guide
> TJ-ARCH-MOB-001 · 7 steps · Compiler enforces steps 4 and 7

This guide walks through adding a new `ContentBlock` variant across the entire
stack: Rust → Dart/TypeScript → Widget/Component. The compiler produces errors
at steps 4 and 7 if you miss a case — these are structural safety nets.

---

## Example: Adding a `DatabaseResultBlock`

Shows query results from SurrealDB in a formatted table block.

---

## Step 1 — Add `StreamEvent` variant (Rust)

File: `rust/gen_ui_core/src/streaming.rs`

```rust
// In the StreamEvent enum, add:
DatabaseResult {
    query_id:    String,
    query_text:  String,
    columns:     Vec<String>,
    rows_json:   String,    // JSON-serialized Vec<Vec<serde_json::Value>>
    row_count:   usize,
    elapsed_ms:  u64,
},
```

---

## Step 2 — Add `A2uiEvent` variant + ingestion (Rust)

File: `rust/gen_ui_core/src/protocol/a2ui.rs`

```rust
// In A2uiEvent enum:
#[serde(tag = "type", rename_all = "snake_case")]
pub enum A2uiEvent {
    // ... existing variants ...
    DatabaseResult {
        query_id:   String,
        query_text: String,
        columns:    Vec<String>,
        rows_json:  String,
        row_count:  usize,
        elapsed_ms: u64,
    },
}

// In A2uiAdapter::ingest(), add arm in the match:
StreamEvent::DatabaseResult { query_id, query_text, columns, rows_json, row_count, elapsed_ms } => {
    out.push(A2uiEvent::DatabaseResult {
        query_id: query_id.clone(),
        query_text: query_text.clone(),
        columns: columns.clone(),
        rows_json: rows_json.clone(),
        row_count: *row_count,
        elapsed_ms: *elapsed_ms,
    });
}
```

---

## Step 3 — Add AG-UI translation (Rust)

File: `rust/gen_ui_core/src/protocol/agui.rs`

```rust
// In AguiAdapter::translate(), add arm:
A2uiEvent::DatabaseResult { query_id, query_text, columns, rows_json, row_count, elapsed_ms } =>
    out.push(AguiEvent::Custom {
        name: "database_result".into(),
        value: serde_json::json!({
            "query_id": query_id,
            "query_text": query_text,
            "columns": columns,
            "rows_json": rows_json,
            "row_count": row_count,
            "elapsed_ms": elapsed_ms,
        }),
    }),
```

---

## Step 4 — Re-run FFI codegen (Flutter) or update Tauri

**Flutter:** After changing `api.rs`, regenerate Dart bindings:
```bash
flutter_rust_bridge_codegen generate \
  --rust-input rust/gen_ui_core/src/api.rs \
  --dart-output mobile/lib/bridge/generated_api.dart
```

**Tauri:** If the event carries new data structures, update the TypeScript
types in `src/bridge/a2ui/types.ts` (Step 6b).

---

## Step 5a — Add Dart sealed class (Flutter)

File: `mobile/lib/bridge/a2ui/a2ui_event.dart`

```dart
// Add to the A2uiEvent sealed class:
final class A2uiDatabaseResult extends A2uiEvent {
  final String queryId;
  final String queryText;
  final List<String> columns;
  final String rowsJson;
  final int rowCount;
  final int elapsedMs;

  const A2uiDatabaseResult({
    required this.queryId,
    required this.queryText,
    required this.columns,
    required this.rowsJson,
    required this.rowCount,
    required this.elapsedMs,
  });

  factory A2uiDatabaseResult._f(Map<String, dynamic> j) => A2uiDatabaseResult(
    queryId:   j['query_id'] ?? '',
    queryText: j['query_text'] ?? '',
    columns:   (j['columns'] as List? ?? []).cast<String>(),
    rowsJson:  j['rows_json'] ?? '[]',
    rowCount:  j['row_count'] ?? 0,
    elapsedMs: j['elapsed_ms'] ?? 0,
  );
}

// And in A2uiEvent.fromFrb() switch:
'database_result' => A2uiDatabaseResult._f(p),
```

---

## Step 5b — Add TypeScript type (Tauri)

File: `desktop/src/bridge/a2ui/types.ts`

```typescript
// Add to ContentBlock discriminated union:
| {
    type:       'databaseResult';
    queryId:    string;
    queryText:  string;
    columns:    string[];
    rowsJson:   string;
    rowCount:   number;
    elapsedMs:  number;
  }
```

---

## Step 6 — Add driver mapping ← COMPILER ENFORCED

File (Flutter): `mobile/lib/bridge/a2ui/a2ui_content_driver.dart`
File (Tauri):   `desktop/src/bridge/a2ui/driver.ts`

**Flutter** — add case in `_handle()`:
```dart
// The Dart compiler will error if this case is missing:
case A2uiDatabaseResult(:final queryId, :final queryText,
                         :final columns, :final rowsJson,
                         :final rowCount, :final elapsedMs):
  onBlock(
    messageId: messageId,
    block: ContentBlock.databaseResult(
      queryId:   queryId,
      queryText: queryText,
      columns:   columns,
      rowsJson:  rowsJson,
      rowCount:  rowCount,
      elapsedMs: elapsedMs,
    ),
  );
```

**TypeScript** — add case in `applyA2uiEvent()`:
```typescript
case 'database_result':
  onBlock({
    messageId,
    block: { type: 'databaseResult', ...event } as ContentBlock,
  });
  break;
```

---

## Step 7 — Add ContentBlock variant + Widget/Component ← COMPILER ENFORCED

### Flutter

**message.dart** — add to the `ContentBlock` freezed union:
```dart
const factory ContentBlock.databaseResult({
  required String queryId,
  required String queryText,
  required List<String> columns,
  required String rowsJson,
  required int rowCount,
  int? elapsedMs,
}) = DatabaseResultBlock;
```

Run codegen: `flutter pub run build_runner build`

**message_bubble.dart** — the Dart compiler enforces exhaustiveness:
```dart
// This case MUST be added or the code won't compile:
DatabaseResultBlock(:final queryId, :final queryText,
                    :final columns, :final rowsJson, :final rowCount) =>
  DatabaseResultBlockWidget(
    queryId: queryId, queryText: queryText,
    columns: columns, rowsJson: rowsJson, rowCount: rowCount,
  ),
```

**Create the widget**: `widgets/blocks/database_result_block.dart`
```dart
class DatabaseResultBlockWidget extends StatelessWidget {
  // ... render columns + rows from rowsJson using DataTable
}
```

### Tauri/TypeScript

**types.ts** — add the union variant (done in Step 5b).

**renderBlock()** — TypeScript enforces exhaustiveness:
```typescript
// TypeScript will produce a compile error until this case is added:
case 'databaseResult':
  return <DatabaseResultBlock {...block} />;
```

**Create the component**: `features/chat/components/blocks/DatabaseResultBlock.tsx`
```tsx
import { useMemo } from 'react';
import {
  useReactTable, getCoreRowModel, createColumnHelper, flexRender,
} from '@tanstack/react-table';

export function DatabaseResultBlock({ columns, rowsJson, queryText, elapsedMs }: DatabaseResultBlockProps) {
  const rows = useMemo(() => JSON.parse(rowsJson), [rowsJson]);
  const columnHelper = createColumnHelper<Record<string, unknown>>();
  const cols = columns.map((c) => columnHelper.accessor(c, { header: c }));
  const table = useReactTable({ data: rows, columns: cols, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="rounded-lg border border-border overflow-hidden my-2">
      <div className="px-3 py-2 bg-muted text-xs text-muted-foreground font-mono">
        {queryText} · {rows.length} rows · {elapsedMs}ms
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>{hg.headers.map((h) => (
                <th key={h.id} className="px-3 py-2 text-left border-b border-border">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}</tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

## Checklist

- [ ] StreamEvent variant added (`streaming.rs`)
- [ ] A2uiEvent variant + ingestion added (`protocol/a2ui.rs`)
- [ ] AG-UI translation added (`protocol/agui.rs`)
- [ ] FFI codegen re-run / Tauri types updated
- [ ] Dart sealed class added OR TypeScript union updated
- [ ] Content driver case added ← compiler error until done
- [ ] ContentBlock variant + widget/component added ← compiler error until done
