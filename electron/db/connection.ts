import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { initializeSchema } from './schema'

export interface OpenDatabaseOptions {
  loadVectorExtension?: boolean
}

export function openQualidexDatabase(
  databasePath: string,
  options: OpenDatabaseOptions = {},
): Database.Database {
  const db = new Database(databasePath)

  if (options.loadVectorExtension ?? true) {
    sqliteVec.load(db)
  }

  initializeSchema(db)

  return db
}
