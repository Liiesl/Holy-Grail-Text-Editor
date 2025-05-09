const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || "5432", 10),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('connect', (client) => {
  console.log('Connected to PostgreSQL database!');
  client.query('SET TIME ZONE "UTC";').catch(err => console.error('Error setting timezone:', err));
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

async function initializeSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    const updateTimestampFunction = `
      CREATE OR REPLACE FUNCTION trigger_set_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `;
    await client.query(updateTimestampFunction);

    // --- Users table ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);');
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_users' AND tgrelid = 'users'::regclass) THEN
          CREATE TRIGGER set_timestamp_users BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
        END IF;
      END $$;
    `);

    // --- Projects table ---
    // 1. Create the table with a basic structure if it doesn't exist.
    //    user_id and constraints will be added/ensured in subsequent steps.
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 2. Ensure user_id column exists. Add it if it doesn't.
    await client.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id UUID;');
    console.log('Ensured "user_id" column exists in "projects" table.');

    // 3. Attempt to set user_id to NOT NULL.
    //    This will fail if existing projects have NULL user_id.
    //    A full migration script would handle populating user_id for existing rows first.
    const userIdColInfo = await client.query(`SELECT attnotnull FROM pg_attribute WHERE attrelid = 'projects'::regclass AND attname = 'user_id';`);
    if (userIdColInfo.rows.length > 0 && !userIdColInfo.rows[0].attnotnull) {
        try {
            await client.query('ALTER TABLE projects ALTER COLUMN user_id SET NOT NULL;');
            console.log('Set projects.user_id to NOT NULL.');
        } catch (e) {
            if (e.message.includes("cannot alter column") && e.message.includes("contains null values")) {
                console.warn("Warning: Could not set projects.user_id to NOT NULL because existing rows have NULL. Manual data migration required for projects.user_id to assign them to users.");
            } else {
                // Re-throw if it's not the expected null violation error
                throw e;
            }
        }
    } else if (userIdColInfo.rows.length > 0 && userIdColInfo.rows[0].attnotnull) {
        console.log('projects.user_id is already NOT NULL.');
    }


    // 4. Attempt to add Foreign Key constraint from projects.user_id to users.id.
    const fkProjectUserExists = await client.query(`SELECT conname FROM pg_constraint WHERE conrelid = 'projects'::regclass AND conname = 'projects_user_id_fkey';`);
    if (fkProjectUserExists.rows.length === 0) {
        try {
            // This requires user_id to be NOT NULL if the FK is to be effective for all rows,
            // or for existing NULL user_id rows to be updated.
            // If user_id is NOT NULL (attempted above), this should work if all user_ids are valid.
            await client.query('ALTER TABLE projects ADD CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;');
            console.log('Added FOREIGN KEY projects.user_id -> users.id.');
        } catch (e) {
            console.warn(`Warning: Could not add FOREIGN KEY projects.user_id -> users.id: ${e.message}. Ensure all existing projects.user_id values exist in users.id and are NOT NULL if required by previous step.`);
        }
    } else {
        console.log('FOREIGN KEY projects.user_id -> users.id already exists.');
    }

    // 5. Drop old global unique constraint on project name if it existed.
    //    (e.g., if previous schema had UNIQUE(name) instead of UNIQUE(user_id, name))
    await client.query('ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_name_key;');
    console.log('Attempted to drop old global unique constraint "projects_name_key" if it existed.');

    // 6. Add new unique constraint for (user_id, name).
    const uniqueUserProjectNameConstraint = 'projects_user_id_name_key'; // Standard naming
    const uniqueConstraintCheck = await client.query(`SELECT conname FROM pg_constraint WHERE conrelid = 'projects'::regclass AND conname = $1;`, [uniqueUserProjectNameConstraint]);
    if (uniqueConstraintCheck.rows.length === 0) {
        try {
            // This requires user_id to be NOT NULL if it's part of the key effectively for all rows.
            // If user_id can be NULL, then multiple (NULL, 'some_name') entries might be allowed depending on DB,
            // but our goal is (user_id, name) to be truly unique where user_id is known.
            await client.query(`ALTER TABLE projects ADD CONSTRAINT ${uniqueUserProjectNameConstraint} UNIQUE (user_id, name);`);
            console.log(`Added UNIQUE constraint ${uniqueUserProjectNameConstraint} on projects(user_id, name).`);
        } catch (e) {
            console.warn(`Warning: Could not add UNIQUE constraint ${uniqueUserProjectNameConstraint} on projects(user_id, name): ${e.message}. This can happen if existing data violates this (e.g. duplicate (user,name) pairs, or issues with NULLs in user_id if not handled by NOT NULL constraint).`);
        }
    } else {
         console.log(`UNIQUE constraint ${uniqueUserProjectNameConstraint} on projects(user_id, name) already exists.`);
    }

    // 7. Indexes. The UNIQUE constraint 'projects_user_id_name_key' already creates an index on (user_id, name).
    await client.query('DROP INDEX IF EXISTS idx_projects_name;'); // For any old global name index.
    await client.query('CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);'); // Useful for user-specific queries.
    console.log('Ensured necessary indexes on "projects" table.');

    // --- Pages table ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS pages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        markdown_content TEXT,
        parent_id UUID REFERENCES pages(id) ON DELETE CASCADE,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_pages_project_id ON pages(project_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_pages_parent_id ON pages(parent_id);');
    console.log('Ensured "pages" table and its indexes.');

    // --- Triggers ---
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_projects' AND tgrelid = 'projects'::regclass) THEN
          CREATE TRIGGER set_timestamp_projects BEFORE UPDATE ON projects FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
        END IF;
      END $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_pages' AND tgrelid = 'pages'::regclass) THEN
          CREATE TRIGGER set_timestamp_pages BEFORE UPDATE ON pages FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
        END IF;
      END $$;
    `);
    console.log('Ensured update_at triggers.');

    await client.query('COMMIT');
    console.log('Database schema initialized/verified successfully.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error initializing database schema:', e);
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  initializeSchema,
};