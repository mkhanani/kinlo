//! The local database: one SQLite file in the app's own data folder.
//!
//! Schema changes are numbered SQL files in `src-tauri/migrations/`. They run in order,
//! once each, the first time the app opens the database after an update. A migration that
//! has shipped is never edited: add a new file instead.

use tauri_plugin_sql::{Migration, MigrationKind};

/// File name of the database inside the app data folder. Each build channel has its own
/// folder, so dev and staging builds never open the released app's data.
pub const DB_URL: &str = "sqlite:kinlo.db";

macro_rules! migration {
    ($version:literal, $description:literal, $file:literal) => {
        Migration {
            version: $version,
            description: $description,
            sql: include_str!(concat!("../migrations/", $file)),
            kind: MigrationKind::Up,
        }
    };
}

pub fn migrations() -> Vec<Migration> {
    vec![
        migration!(1, "schema", "0001_schema.sql"),
        migration!(2, "search", "0002_search.sql"),
        migration!(3, "seed stages", "0003_seed_stages.sql"),
        migration!(4, "notes are not contact", "0004_notes_are_not_contact.sql"),
        migration!(5, "sides", "0005_sides.sql"),
        migration!(6, "avatars", "0006_avatars.sql"),
        migration!(7, "reminder sides", "0007_reminder_sides.sql"),
        migration!(8, "snooze", "0008_snooze.sql"),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use sqlx::{Executor, Row, SqlitePool};
    use std::str::FromStr;

    /// A fresh in-memory database with every migration applied, using the same SQLite
    /// build the app ships with.
    async fn migrated() -> SqlitePool {
        let options = SqliteConnectOptions::from_str("sqlite::memory:").unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();
        for m in migrations() {
            pool.execute(m.sql).await.unwrap_or_else(|e| {
                panic!("migration {} ({}) failed: {e}", m.version, m.description)
            });
        }
        pool
    }

    #[test]
    fn versions_are_numbered_from_one_without_gaps() {
        for (i, m) in migrations().iter().enumerate() {
            assert_eq!(m.version, i as i64 + 1);
        }
    }

    #[test]
    fn every_migration_file_is_registered() {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/migrations");
        let mut files: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .filter(|n| n.ends_with(".sql"))
            .collect();
        files.sort();
        assert_eq!(
            files.len(),
            migrations().len(),
            "unregistered file in {dir}: {files:?}"
        );
        for (file, m) in files.iter().zip(migrations()) {
            assert!(
                file.starts_with(&format!("{:04}_", m.version)),
                "{file} should be migration {}",
                m.version
            );
        }
    }

    #[tokio::test]
    async fn migrations_apply_and_create_every_table() {
        let pool = migrated().await;
        let rows =
            sqlx::query("SELECT name FROM sqlite_master WHERE type IN ('table') ORDER BY name")
                .fetch_all(&pool)
                .await
                .unwrap();
        let names: Vec<String> = rows.iter().map(|r| r.get("name")).collect();
        for table in [
            "ai_messages",
            "ai_threads",
            "avatars",
            "contact_tags",
            "contacts",
            "deals",
            "interactions",
            "reminders",
            "search",
            "settings",
            "stages",
            "tags",
        ] {
            assert!(names.iter().any(|n| n == table), "missing table {table}");
        }
    }

    #[tokio::test]
    async fn stages_are_seeded_in_order() {
        let pool = migrated().await;
        let rows = sqlx::query("SELECT name, outcome FROM stages ORDER BY position")
            .fetch_all(&pool)
            .await
            .unwrap();
        let names: Vec<String> = rows.iter().map(|r| r.get("name")).collect();
        assert_eq!(names, ["Lead", "Talking", "Proposal", "Won", "Lost"]);
        let outcomes: Vec<Option<String>> = rows.iter().map(|r| r.get("outcome")).collect();
        assert_eq!(
            outcomes,
            [
                None,
                None,
                None,
                Some("won".to_string()),
                Some("lost".to_string())
            ]
        );
    }

    #[tokio::test]
    async fn foreign_keys_are_enforced() {
        let pool = migrated().await;
        let orphan = sqlx::query(
            "INSERT INTO interactions (id, contact_id, type, happened_at, created_at)
             VALUES ('i1', 'nobody', 'call', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(&pool)
        .await;
        assert!(
            orphan.is_err(),
            "an interaction for a missing contact must be rejected"
        );
    }

    #[tokio::test]
    async fn full_text_search_and_last_contacted_work_in_the_bundled_sqlite() {
        let pool = migrated().await;
        pool.execute(
            "INSERT INTO contacts (id, name, company, personal, created_at, updated_at)
             VALUES ('c1', 'Zoë Nakamura', 'Fernhill Studio', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .await
        .unwrap();
        pool.execute(
            "INSERT INTO interactions (id, contact_id, type, happened_at, summary, created_at)
             VALUES ('i1', 'c1', 'call', '2026-02-03T10:00:00.000Z', 'Talked about the greenhouse project', '2026-02-03T10:00:00.000Z')",
        )
        .await
        .unwrap();

        // Prefix match, accents ignored, and interaction summaries are searchable.
        for query in ["\"zoe\"*", "\"fern\"*", "\"greenh\"*"] {
            let hit = sqlx::query("SELECT contact_id FROM search WHERE search MATCH ?1")
                .bind(query)
                .fetch_optional(&pool)
                .await
                .unwrap();
            assert!(hit.is_some(), "no match for {query}");
        }

        let row = sqlx::query("SELECT last_contacted_at FROM contacts WHERE id = 'c1'")
            .fetch_one(&pool)
            .await
            .unwrap();
        let last: Option<String> = row.get("last_contacted_at");
        assert_eq!(last.as_deref(), Some("2026-02-03T10:00:00.000Z"));
    }

    /// The data layer writes `$1`, `$2`, ... and does not always use them in order
    /// (`SET name = $3, updated_at = $2 WHERE id = $1`). They must bind by number.
    #[tokio::test]
    async fn numbered_placeholders_bind_by_number_not_by_position() {
        let pool = migrated().await;
        pool.execute(
            "INSERT INTO contacts (id, name, business, created_at, updated_at)
             VALUES ('c1', 'Before', 'client', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .await
        .unwrap();

        let done = sqlx::query("UPDATE contacts SET name = $3, updated_at = $2 WHERE id = $1")
            .bind("c1")
            .bind("2026-02-02T00:00:00.000Z")
            .bind("After")
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(done.rows_affected(), 1);

        let row = sqlx::query("SELECT name, updated_at FROM contacts WHERE id = 'c1'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(row.get::<String, _>("name"), "After");
        assert_eq!(
            row.get::<String, _>("updated_at"),
            "2026-02-02T00:00:00.000Z"
        );
    }

    /// Databases made before the two sides existed must come through the upgrade intact.
    #[tokio::test]
    async fn upgrading_an_older_database_keeps_people_and_sorts_them_into_sides() {
        let options = SqliteConnectOptions::from_str("sqlite::memory:").unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();
        let all = migrations();
        for m in &all[..3] {
            pool.execute(m.sql).await.unwrap();
        }

        // Data as the app wrote it at schema version 3.
        for (id, kind) in [
            ("p", "personal"),
            ("c", "client"),
            ("l", "lead"),
            ("o", "other"),
        ] {
            sqlx::query(
                "INSERT INTO contacts (id, name, kind, created_at, updated_at)
                 VALUES ($1, $1, $2, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
            )
            .bind(id)
            .bind(kind)
            .execute(&pool)
            .await
            .unwrap();
        }
        pool.execute(
            "INSERT INTO interactions (id, contact_id, type, happened_at, created_at) VALUES
               ('i1', 'p', 'call', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'),
               ('i2', 'p', 'note', '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z'),
               ('i3', 'c', 'note', '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z')",
        )
        .await
        .unwrap();

        for m in &all[3..] {
            pool.execute(m.sql)
                .await
                .unwrap_or_else(|e| panic!("migration {} failed on existing data: {e}", m.version));
        }

        let rows = sqlx::query(
            "SELECT id, personal, business, last_contacted_at FROM contacts ORDER BY id",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        let got: Vec<(String, i64, Option<String>, Option<String>)> = rows
            .iter()
            .map(|r| {
                (
                    r.get("id"),
                    r.get("personal"),
                    r.get("business"),
                    r.get("last_contacted_at"),
                )
            })
            .collect();
        assert_eq!(
            got,
            [
                // The note no longer counts, so the client has had no contact at all.
                ("c".into(), 0, Some("client".into()), None),
                ("l".into(), 0, Some("lead".into()), None),
                ("o".into(), 0, Some("other".into()), None),
                // Falls back from the note to the call before it.
                ("p".into(), 1, None, Some("2026-02-01T00:00:00.000Z".into())),
            ]
        );

        // Search still finds them, and nobody can be left without a side.
        let hit = sqlx::query("SELECT contact_id FROM search WHERE search MATCH '\"p\"*'")
            .fetch_optional(&pool)
            .await
            .unwrap();
        assert!(hit.is_some());
        let sideless = sqlx::query("UPDATE contacts SET personal = 0 WHERE id = 'p'")
            .execute(&pool)
            .await;
        assert!(sideless.is_err());
    }
}
