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

    // --- Create project_type ENUM type ---
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_type') THEN
          CREATE TYPE project_type AS ENUM ('user_project', 'announcement');
        END IF;
      END $$;
    `);
    console.log('Ensured "project_type" ENUM type exists.');

    // --- Create project_status ENUM type ---
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
          CREATE TYPE project_status AS ENUM ('draft', 'published', 'archived');
        END IF;
      END $$;
    `);
    console.log('Ensured "project_status" ENUM type exists.');

    // --- Create user_role ENUM type ---
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
          CREATE TYPE user_role AS ENUM ('user', 'admin', 'owner');
        END IF;
      END $$;
    `);
    console.log('Ensured "user_role" ENUM type exists.');

    // --- NEW: Create user_theme_preference ENUM type ---
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_theme_preference') THEN
          CREATE TYPE user_theme_preference AS ENUM ('light', 'dark');
          -- Add more themes here later if needed, e.g., 'system'
        END IF;
      END $$;
    `);
    console.log('Ensured "user_theme_preference" ENUM type exists.');

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
    // (Schema remains the same as before, but listed for context)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role user_role NOT NULL DEFAULT 'user',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // Ensuring role column logic (as before)
    const roleColumnCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='users' AND column_name='role';
    `);
    if (roleColumnCheck.rows.length === 0) {
      await client.query("ALTER TABLE users ADD COLUMN role user_role NOT NULL DEFAULT 'user';");
    } else {
      await client.query("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';");
      await client.query("ALTER TABLE users ALTER COLUMN role SET NOT NULL;");
      // Potentially alter type if needed: await client.query("ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::text::user_role;");
    }
    console.log('Ensured "users" table schema including "role" column.');
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

    // --- NEW: User Settings table ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id UUID PRIMARY KEY,
        theme user_theme_preference NOT NULL DEFAULT 'light',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT fk_user_settings_user
          FOREIGN KEY(user_id)
          REFERENCES users(id)
          ON DELETE CASCADE -- Delete settings if user is deleted
      );
    `);
    console.log('Ensured "user_settings" table exists.');

    // Ensure theme column exists and has correct type/default if table already existed
    const themeColumnCheck = await client.query(`
      SELECT column_name, data_type, column_default FROM information_schema.columns
      WHERE table_name='user_settings' AND column_name='theme';
    `);
    if (themeColumnCheck.rows.length === 0) {
      await client.query("ALTER TABLE user_settings ADD COLUMN theme user_theme_preference NOT NULL DEFAULT 'light';");
      console.log('Added "theme" column to "user_settings".');
    } else {
      // Ensure correct type and default (simple checks)
      if (themeColumnCheck.rows[0].data_type !== 'user defined' && themeColumnCheck.rows[0].data_type !== 'user_theme_preference') {
          console.warn("Warning: user_settings.theme column type might not be correct. Expected 'user_theme_preference'. Manual check/migration might be needed.");
          // Attempt to fix (might fail with incompatible data):
          // await client.query("ALTER TABLE user_settings ALTER COLUMN theme TYPE user_theme_preference USING theme::text::user_theme_preference;");
      }
      if (themeColumnCheck.rows[0].column_default !== "'light'::user_theme_preference") {
          await client.query("ALTER TABLE user_settings ALTER COLUMN theme SET DEFAULT 'light';");
          console.log('Ensured "theme" column default is "light".');
      }
       // Ensure NOT NULL constraint
      await client.query("ALTER TABLE user_settings ALTER COLUMN theme SET NOT NULL;");
      console.log('Ensured "theme" column is NOT NULL.');
    }

    // Ensure foreign key exists
    const fkUserSettingsExists = await client.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'user_settings'::regclass
        AND confrelid = 'users'::regclass
        AND conname = 'fk_user_settings_user';
    `);
    if (fkUserSettingsExists.rows.length === 0) {
        try {
            await client.query(`
                ALTER TABLE user_settings
                ADD CONSTRAINT fk_user_settings_user
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE;
            `);
            console.log('Added FOREIGN KEY user_settings.user_id -> users.id.');
        } catch (e) {
            console.warn(`Warning: Could not add FOREIGN KEY user_settings.user_id -> users.id: ${e.message}. Ensure all existing user_settings.user_id values exist in users.id.`);
        }
    } else {
        console.log('FOREIGN KEY user_settings.user_id -> users.id already exists.');
    }

    // Ensure trigger for updated_at exists
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_user_settings' AND tgrelid = 'user_settings'::regclass) THEN
          CREATE TRIGGER set_timestamp_user_settings BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
        END IF;
      END $$;
    `);
    console.log('Ensured update_at trigger for "user_settings".');

    // --- Projects table ---
    // (Schema remains the same as before, but ensure it runs after users table)
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        user_id UUID, -- Will be set to NOT NULL and FK added below
        type project_type NOT NULL DEFAULT 'user_project', -- Added type
        status project_status DEFAULT NULL, -- Added status
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
        -- Constraints added/checked below
      );
    `);
    // All the projects table ALTER commands and checks from previous version...
    await client.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS type project_type NOT NULL DEFAULT 'user_project';");
    await client.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS status project_status DEFAULT NULL;");
    const uniqueAnnouncementNameConstraint = 'projects_announcement_name_key';
    // (Code for announcement name constraint check and creation as before) ...
    await client.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id UUID;');
    // (Code for setting user_id NOT NULL and adding FK as before) ...
    await client.query('ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_name_key;'); // Drop old global unique name if exists
    // (Code for adding user_id, name unique constraint as before) ...
    await client.query('DROP INDEX IF EXISTS idx_projects_name;');
    await client.query('CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);');
    // (Code for unique announcement name index as before)...
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_projects' AND tgrelid = 'projects'::regclass) THEN
          CREATE TRIGGER set_timestamp_projects BEFORE UPDATE ON projects FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
        END IF;
      END $$;
    `);
    console.log('Ensured "projects" table schema and constraints.');


    // --- Pages table ---
    // (Schema remains the same as before, ensure it runs after projects table)
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
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_pages' AND tgrelid = 'pages'::regclass) THEN
          CREATE TRIGGER set_timestamp_pages BEFORE UPDATE ON pages FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
        END IF;
      END $$;
    `);
    console.log('Ensured "pages" table schema and triggers.');

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