/**
 * Mock de expo-sqlite pour les tests Jest.
 * Simule les tables en mémoire (Map<tableName, Row[]>).
 * Supporte : CREATE TABLE, INSERT, INSERT OR REPLACE, UPDATE, DELETE, SELECT *.
 */

type Row = Record<string, unknown>;

class MockDatabase {
  private tables: Map<string, Row[]> = new Map();

  /** Réinitialise toutes les tables — à appeler dans beforeEach. */
  reset(): void {
    this.tables.clear();
  }

  execSync(sql: string): void {
    const trimmed = sql.trim();

    // CREATE TABLE IF NOT EXISTS
    const createMatch = trimmed.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
    if (createMatch) {
      if (!this.tables.has(createMatch[1])) this.tables.set(createMatch[1], []);
      return;
    }

    // DELETE FROM table (sans WHERE — vide la table entière)
    const delAll = trimmed.match(/^DELETE\s+FROM\s+(\w+)\s*;?\s*$/i);
    if (delAll) { this.tables.set(delAll[1], []); return; }

    // ALTER TABLE / PRAGMA → ignorés
  }

  runSync(sql: string, params: unknown[] = []): { lastInsertRowId: number; changes: number } {
    const t = sql.trim();
    if (/^INSERT/i.test(t)) return this._insert(t, params);
    if (/^UPDATE/i.test(t)) return this._update(t, params);
    if (/^DELETE/i.test(t)) return this._delete(t, params);
    return { lastInsertRowId: 0, changes: 0 };
  }

  getAllSync<T = Row>(sql: string, _params: unknown[] = []): T[] {
    const table = this._table(sql);
    return table ? [...(this.tables.get(table) ?? [])] as T[] : [];
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private _insert(sql: string, params: unknown[]): { lastInsertRowId: number; changes: number } {
    const table = this._table(sql);
    if (!table) return { lastInsertRowId: 0, changes: 0 };

    const rows = this.tables.get(table) ?? [];
    const row = this._buildRow(sql, params);
    this._applyDefaults(row);

    // Autoincrement id si non fourni (INTEGER PRIMARY KEY)
    if (row['id'] === undefined || row['id'] === null) {
      const maxId = rows.reduce((m, r) => Math.max(m, typeof r['id'] === 'number' ? r['id'] : 0), 0);
      row['id'] = maxId + 1;
    }

    if (/INSERT OR REPLACE/i.test(sql)) {
      const without = rows.filter(r => String(r['id']) !== String(row['id']));
      without.push(row);
      this.tables.set(table, without);
    } else {
      rows.push(row);
      this.tables.set(table, rows);
    }

    return { lastInsertRowId: typeof row['id'] === 'number' ? row['id'] : 0, changes: 1 };
  }

  private _update(sql: string, params: unknown[]): { lastInsertRowId: number; changes: number } {
    const table = this._table(sql);
    if (!table) return { lastInsertRowId: 0, changes: 0 };

    const rows = this.tables.get(table) ?? [];
    let changes = 0;

    // SET attempts = attempts + 1, last_error = ? WHERE id = ?
    if (/attempts\s*=\s*attempts\s*\+\s*1/i.test(sql)) {
      const [lastError, id] = params as [string, unknown];
      const updated = rows.map(r => {
        if (String(r['id']) === String(id)) {
          changes++;
          return { ...r, attempts: (Number(r['attempts']) || 0) + 1, last_error: lastError };
        }
        return r;
      });
      this.tables.set(table, updated);
      return { lastInsertRowId: 0, changes };
    }

    // SET synced = 1 WHERE id = ?
    if (/synced\s*=\s*1/i.test(sql)) {
      const [id] = params as [unknown];
      const updated = rows.map(r => {
        if (String(r['id']) === String(id)) { changes++; return { ...r, synced: 1 }; }
        return r;
      });
      this.tables.set(table, updated);
      return { lastInsertRowId: 0, changes };
    }

    // SET attempts = 0, last_error = NULL WHERE attempts >= ?
    if (/attempts\s*=\s*0/i.test(sql)) {
      const [threshold] = params as [number];
      const updated = rows.map(r => {
        if ((Number(r['attempts']) || 0) >= threshold) {
          changes++;
          return { ...r, attempts: 0, last_error: null };
        }
        return r;
      });
      this.tables.set(table, updated);
      return { lastInsertRowId: 0, changes };
    }

    return { lastInsertRowId: 0, changes: 0 };
  }

  private _delete(sql: string, params: unknown[]): { lastInsertRowId: number; changes: number } {
    const table = this._table(sql);
    if (!table) return { lastInsertRowId: 0, changes: 0 };

    const rows = this.tables.get(table) ?? [];

    // DELETE ... WHERE id = ?
    if (/WHERE\s+id\s*=\s*\?/i.test(sql)) {
      const [id] = params as [unknown];
      const filtered = rows.filter(r => String(r['id']) !== String(id));
      this.tables.set(table, filtered);
      return { lastInsertRowId: 0, changes: rows.length - filtered.length };
    }

    return { lastInsertRowId: 0, changes: 0 };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _table(sql: string): string | null {
    for (const pat of [/INTO\s+(\w+)/i, /FROM\s+(\w+)/i, /UPDATE\s+(\w+)/i, /TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i]) {
      const m = sql.match(pat);
      if (m) return m[1];
    }
    return null;
  }

  private _buildRow(sql: string, params: unknown[]): Row {
    const colMatch = sql.match(/\(([^)]+)\)\s+VALUES/i);
    if (!colMatch) return {};
    const cols = colMatch[1].split(',').map(c => c.trim());
    const row: Row = {};
    cols.forEach((c, i) => { row[c] = params[i] !== undefined ? params[i] : null; });
    return row;
  }

  private _applyDefaults(row: Row): void {
    // Utiliser == null (null ET undefined) car _buildRow peut assigner null
    // quand la colonne dépasse la longueur du tableau params (ex: synced literal 0)
    if (row['attempts']   == null) row['attempts']   = 0;
    if (row['synced']     == null) row['synced']     = 0;
    if (row['last_error'] == null && !('last_error' in row)) row['last_error'] = null;
    if (!row['created_at']) row['created_at'] = new Date().toISOString();
    if (!row['failed_at'])  row['failed_at']  = new Date().toISOString();
  }
}

const db = new MockDatabase();

export const openDatabaseSync = jest.fn(() => db);

/** Réinitialise toutes les tables — à appeler dans beforeEach. */
export function __resetDB(): void {
  db.reset();
}
