/**
 * Mock de expo-sqlite pour les tests Jest.
 * Simule les tables en mémoire (Map<tableName, Row[]>).
 * Supporte : CREATE TABLE, INSERT, INSERT OR REPLACE, UPDATE, DELETE, SELECT *.
 */

type Row = Record<string, unknown>;

class MockDatabase {
  private tables: Map<string, Row[]> = new Map();
  private userVersion = 0;

  /** Réinitialise toutes les tables — à appeler dans beforeEach. */
  reset(): void {
    this.tables.clear();
    this.userVersion = 0;
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

    // PRAGMA user_version = N
    const setVersion = trimmed.match(/^PRAGMA\s+user_version\s*=\s*(\d+)/i);
    if (setVersion) { this.userVersion = Number(setVersion[1]); return; }

    // ALTER TABLE / autres PRAGMA → ignorés
  }

  runSync(sql: string, params: unknown[] = []): { lastInsertRowId: number; changes: number } {
    const t = sql.trim();
    if (/^INSERT/i.test(t)) return this._insert(t, params);
    if (/^UPDATE/i.test(t)) return this._update(t, params);
    if (/^DELETE/i.test(t)) return this._delete(t, params);
    return { lastInsertRowId: 0, changes: 0 };
  }

  getAllSync<T = Row>(sql: string, params: unknown[] = []): T[] {
    const table = this._table(sql);
    if (!table) return [];
    return this._filter(this.tables.get(table) ?? [], sql, params) as T[];
  }

  getFirstSync<T = Row>(sql: string, params: unknown[] = []): T | null {
    if (/^PRAGMA\s+user_version/i.test(sql.trim())) {
      return { user_version: this.userVersion } as unknown as T;
    }
    const table = this._table(sql);
    if (!table) return null;
    const rows = this._filter(this.tables.get(table) ?? [], sql, params);
    return (rows[0] as unknown as T) ?? null;
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

    // SET attempts = attempts + 1, last_error = ?, next_retry_at = ? WHERE id = ?
    if (/attempts\s*=\s*attempts\s*\+\s*1/i.test(sql)) {
      const [lastError, nextRetryAt, id] = params as [string, string, unknown];
      const updated = rows.map(r => {
        if (String(r['id']) === String(id)) {
          changes++;
          return { ...r, attempts: (Number(r['attempts']) || 0) + 1, last_error: lastError, next_retry_at: nextRetryAt };
        }
        return r;
      });
      this.tables.set(table, updated);
      return { lastInsertRowId: 0, changes };
    }

    // SET synced = 1 [, other = ?]* WHERE id = ?
    // Le nombre de ? dans la clause SET détermine l'offset du param WHERE.
    if (/synced\s*=\s*1/i.test(sql)) {
      const setClause = sql.match(/SET\s+(.*?)\s+WHERE/i)?.[1] ?? "";
      const setPlaceholders = (setClause.match(/\?/g) ?? []).length;
      const id = params[setPlaceholders] as unknown;
      const extra: Record<string, unknown> = {};
      // Extraire les colonnes supplémentaires du SET (server_id, etc.)
      const setPairs: string[] = (setClause.replace(/synced\s*=\s*1,?\s*/i, "").match(/(\w+)\s*=\s*\?/gi) ?? []) as string[];
      setPairs.forEach((pair, i) => {
        const col = pair.match(/(\w+)\s*=/i)?.[1];
        if (col) extra[col] = params[i];
      });
      const updated = rows.map(r => {
        if (String(r['id']) === String(id)) { changes++; return { ...r, synced: 1, ...extra }; }
        return r;
      });
      this.tables.set(table, updated);
      return { lastInsertRowId: 0, changes };
    }

    // SET attempts = 0, last_error = NULL, next_retry_at = NULL WHERE attempts >= ?
    if (/attempts\s*=\s*0/i.test(sql)) {
      const [threshold] = params as [number];
      const updated = rows.map(r => {
        if ((Number(r['attempts']) || 0) >= threshold) {
          changes++;
          return { ...r, attempts: 0, last_error: null, next_retry_at: null };
        }
        return r;
      });
      this.tables.set(table, updated);
      return { lastInsertRowId: 0, changes };
    }

    // Cas générique : SET col = ?[, col = ?]* WHERE ...
    const setClause = sql.match(/SET\s+([\s\S]*?)\s+WHERE/i)?.[1];
    if (setClause) {
      const cols = (setClause.match(/(\w+)\s*=\s*\?/gi) ?? [])
        .map(pair => pair.match(/(\w+)\s*=/i)?.[1])
        .filter(Boolean) as string[];
      const setValues = params.slice(0, cols.length);
      const whereParams = params.slice(cols.length);
      const updated = rows.map(r => {
        if (!this._rowMatches(r, sql, whereParams)) return r;
        changes++;
        const patch: Row = {};
        cols.forEach((c, i) => { patch[c] = setValues[i]; });
        return { ...r, ...patch };
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

  /** Conditions `col = ?` / `col IS NULL` d'une clause WHERE (conjonctions seulement). */
  private _conditions(sql: string, params: unknown[]): { col: string; value: unknown; isNull: boolean }[] {
    const where = sql.match(/WHERE\s+([\s\S]*?)(?:\s+ORDER\s+BY|\s+LIMIT|\s*;|$)/i)?.[1];
    if (!where) return [];
    const conds: { col: string; value: unknown; isNull: boolean }[] = [];
    let i = 0;
    for (const part of where.split(/\s+AND\s+/i)) {
      const eq = part.match(/(\w+)\s*=\s*\?/);
      if (eq) { conds.push({ col: eq[1], value: params[i++], isNull: false }); continue; }
      const isNull = part.match(/(\w+)\s+IS\s+NULL/i);
      if (isNull) conds.push({ col: isNull[1], value: null, isNull: true });
    }
    return conds;
  }

  private _rowMatches(row: Row, sql: string, params: unknown[]): boolean {
    const conds = this._conditions(sql, params);
    if (conds.length === 0) return true;   // pas de WHERE exploitable → tout matche
    return conds.every(c => (c.isNull ? row[c.col] == null : String(row[c.col]) === String(c.value)));
  }

  private _filter(rows: Row[], sql: string, params: unknown[]): Row[] {
    return rows.filter(r => this._rowMatches(r, sql, params));
  }

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
    if (row['next_retry_at'] == null && !('next_retry_at' in row)) row['next_retry_at'] = null;
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
