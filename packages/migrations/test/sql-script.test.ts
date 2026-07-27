import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { executeSqlScript, splitSqlStatements } from '../src/index.js'

describe('splitSqlStatements', () => {
  it('splits executable statements without splitting comments or quoted semicolons', () => {
    const statements = splitSqlStatements(`
      -- semicolons in comments are not delimiters;
      CREATE TABLE "semi;colon" (value text DEFAULT 'one;two');
      /* neither are block-comment semicolons; */
      INSERT INTO "semi;colon" VALUES ('it''s;quoted');
      -- a trailing comment is not a statement;
    `)

    expect(statements).toHaveLength(2)
    expect(statements[0]).toContain('CREATE TABLE "semi;colon"')
    expect(statements[1]).toContain('INSERT INTO "semi;colon"')
  })

  it('rejects unterminated quoted strings and block comments', () => {
    expect(() => splitSqlStatements('SELECT \'unfinished;')).toThrow('unterminated single quote')
    expect(() => splitSqlStatements('SELECT 1; /* unfinished')).toThrow('unterminated block comment')
  })

  it('retains a CREATE TRIGGER compound body as one executable statement', () => {
    const database = new DatabaseSync(':memory:')
    try {
      const statements = splitSqlStatements(`
        CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, caseé TEXT DEFAULT 'unicode');
        CREATE TABLE user_events (description TEXT NOT NULL);
        CREATE TRIGGER users_after_insert AFTER INSERT ON users BEGIN
          INSERT INTO user_events VALUES ('created;' || NEW.name);
          INSERT INTO user_events VALUES (CASE WHEN NEW.name = 'Ada' THEN 'matched' ELSE 'other' END);
          INSERT INTO user_events VALUES (NEW.caseé);
        END;
        INSERT INTO users (name) VALUES ('Ada');
      `)

      expect(statements).toHaveLength(4)
      expect(statements[2]).toContain('\'created;\' || NEW.name);')
      for (const statement of statements) database.prepare(statement).run()
      expect(database.prepare('SELECT description FROM user_events ORDER BY rowid').all()).toEqual([
        { description: 'created;Ada' },
        { description: 'matched' },
        { description: 'unicode' },
      ])
    }
    finally {
      database.close()
    }
  })

  it('rejects malformed CREATE TRIGGER compound scripts before execution', async () => {
    const execute = vi.fn()
    await expect(executeSqlScript({ dialect: 'sqlite', execute }, 'CREATE TABLE users (id INTEGER); CREATE TRIGGER broken AFTER INSERT ON users BEGIN INSERT INTO log VALUES (1);')).rejects.toThrow('unterminated CREATE TRIGGER compound body')
    expect(execute).not.toHaveBeenCalled()
  })
})
