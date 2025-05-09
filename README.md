
# Holy Grail ✨ - Your Personal Knowledge Base

Holy Grail is a full-stack personal wiki and idea organizer designed to be the single source of truth for your most important ideas and knowledge. It features an interactive frontend with a rich text editor and robust backend support.

Users can create projects, and within those projects, hierarchical pages of Markdown content. This application provides a seamless experience for capturing, organizing, and linking your thoughts.

## Key Features

**Frontend Experience & UI:**

*   **Interactive WYSIWYG-like Editor:** Content is edited in a `contenteditable` div, providing a user-friendly experience.
*   **Slash Commands (`/`):** Quickly insert various content blocks (headings, lists, code blocks, tables, dividers, etc.) and perform page operations (new subpage, link existing page, insert emoji).
*   **Markdown Support:**
    *   Content is ultimately stored as Markdown.
    *   Client-side HTML-to-Markdown (Turndown.js) and Markdown-to-HTML (Showdown.js) conversion.
*   **Dynamic Page Tree Navigation:**
    *   Sidebar displays projects and their nested page structures.
    *   Create new projects and pages directly from the sidebar.
    *   Expand/collapse project trees.
*   **Contextual Modals & Toolbars:**
    *   **Text Styling Toolbar:** Appears on text selection for bold, italic, underline, strikethrough, and link creation/editing.
    *   **Action Modals:** Access project/page actions (rename, delete, duplicate) via "..." menus.
    *   **User Settings Modal:** Manage account settings (e.g., logout).
    *   **Embed Page Modal:** Easily search and link to other existing pages within the current project.
    *   **Emoji Modal:** Search and insert emojis.
*   **Table Editing Controls:** Intuitive on-hover controls to add/delete rows/columns and manage table properties.
*   **Efficient & Smart Saving:**
    *   **Autosave:** Changes are automatically saved after a short delay.
    *   **Patch-Based Updates:** Uses `diff-match-patch` to send only changes to the server, reducing data transfer and handling potential conflicts.
    *   **Conflict Detection:** Warns user if the page was modified on the server since last load.
*   **Internal Page Linking:** Clickable `page://PAGE_ID` links for instant navigation within a project.
*   **User Authentication UI:** Clean forms for registration and login.
*   **Status & Feedback:** Clear status messages for operations (saving, loading, errors).
*   **"Welcome" Tutorial:** New users are greeted with a "Welcome" project containing a multi-page interactive tutorial built into the application.

**Backend & Core Functionality:**

*   **Secure User Authentication:** Robust registration and login system using JWT and bcrypt.
*   **Project Management:** Users can create, list, rename, delete, and duplicate their own projects. Project names are unique per user.
*   **Hierarchical Page System:** Supports creating, reading, updating, and deleting pages within projects, with full parent-child relationships.
*   **Database Schema Management:** Idempotent schema initialization (PostgreSQL) for users, projects, and pages tables.
*   **Robust API:** Well-defined API endpoints consumed by the frontend for all core functionalities.

## Tech Stack

*   **Frontend:**
    *   HTML5, CSS3, Vanilla JavaScript (ES Modules)
    *   **Libraries:**
        *   Showdown.js (Markdown to HTML)
        *   Turndown.js (HTML to Markdown)
        *   diff-match-patch (Client-side diffing & patching for saves)
*   **Backend:**
    *   Node.js, Express.js
    *   PostgreSQL (Database)
    *   **Libraries:**
        *   `pg` (PostgreSQL client)
        *   `bcrypt` (Password hashing)
        *   `jsonwebtoken` (JWT for authentication)
        *   `dotenv` (Environment variable management)
        *   `diff-match-patch` (Server-side patch application)
*   **Styling:** Font Awesome (for icons)

## Prerequisites

*   Node.js (latest)
*   npm or yarn
*   PostgreSQL server (latest)

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Liiesl/Holy-Grail-Text-Editor
    cd holy-grail # Or your chosen directory name
    ```

2.  **Install backend dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```
    *(The frontend has no separate build step; its assets are served statically by the backend.)*

3.  **Set up Environment Variables:**
    Create a `.env` file in the root of the project and populate it with your database credentials and JWT secret. use the template below as a guide:

    ```ini
    # .env
    PORT=3133

    DB_USER=your_db_user
    DB_HOST=localhost
    DB_DATABASE=your_db_name
    DB_PASSWORD=your_db_password
    DB_PORT=5432
    DB_SSL=false # Set to true if your DB requires SSL

    JWT_SECRET=your_very_strong_and_secret_jwt_key # IMPORTANT: CHANGE THIS!
    JWT_EXPIRES_IN=7d
    ```
    **Important:**
    *   Replace placeholder values with your actual credentials.
    *   Choose a strong, unique `JWT_SECRET`. Generate one using:
        ```bash
        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
        ```

4.  **Database Setup:**
    *   Ensure your PostgreSQL server is running.
    *   Create the database specified in `DB_DATABASE`.
    *   The application's backend (`server.js`) will attempt to initialize the schema (create tables, functions, triggers via `db.js`) automatically on startup.

## Running the Application

1.  **Start the backend server:**
    ```bash
    npm start
    # or
    node server.js
    ```
    The server will start, typically on `http://localhost:3133` (or the port specified in your `.env` file). You'll see console logs indicating database connection and schema initialization status.

2.  **Access Holy Grail in your browser:**
    Open your web browser and navigate to `http://localhost:3133`. The backend server also serves the frontend application from the `public` directory.

## Folder Structure

```
.
├── public/                 # Frontend static assets (HTML, CSS, JS modules)
│   ├── SCMD/               # Slash Command related JS modules
│   │   ├── emojiModal.js       # Modal for inserting emojis
│   │   ├── embedPageModal.js   # Modal for linking existing pages
│   │   ├── emojiModal.js       # Modal for inserting emojis
│   ├── auth_client.js      # Frontend authentication logic
│   ├── editArea.js         # Core editor interaction logic (saving, loading)
│   ├── main.js             # Main frontend entry point, initializes modules
│   ├── sidePanel.js        # Sidebar (projects, page tree) logic
│   ├── tableEditor.js      # Table editing UI controls
│   ├── textStyleModal.js   # Text styling pop-up
│   ├── userSettingsModal.js # User settings UI
│   ├── style.css           # Main stylesheet
│   ├── auth.css            # Authentication form styles
│   └── index.html          # Main HTML file for the SPA
├── auth.js                 # Backend: Authentication logic, routes, middleware
├── db.js                   # Backend: Database connection, schema initialization
├── defaultProjectInitializer.js # Backend: Logic for creating the "Welcome" tutorial content
├── server.js               # Backend: Main Express application, API routes
├── .env.example            # Example environment file
├── package.json
└── README.md
```

## How the "Welcome" Tutorial Works

Upon new user registration, the backend initializes a "Welcome" project for the user. This project is populated with a set of pre-defined tutorial pages. When the user first logs in and opens this project on the frontend, they are guided through the application's features via these interconnected pages.

## Screenshots / Demo

*(This is a great place to add a few screenshots or a GIF showcasing the Holy Grail UI and key features like the editor, slash commands, and page organization!)*

## Future Enhancements

*   **Frontend:**
    *   UI Themes (Dark/Light mode)
    *   Improved mobile responsiveness.
    *   Advanced keyboard shortcuts for editor actions.
    *   Drag-and-drop page reordering in the sidebar tree.
    *   Real-time collaboration (would require significant backend changes too).
*   **Backend/Full-Stack:**
    *   Full-text search across projects and pages.
    *   File/Image uploads and embedding.
    *   More granular permissions if project sharing is introduced.
*   **Development:**
    *   Comprehensive unit, integration, and end-to-end tests.
    *   Dockerization for easier deployment.
    *   CI/CD pipelines.

## Contributing

Contributions are welcome! If you have ideas for improvements or find bugs, please open an issue or submit a pull request.

## License

(Specify your license here, e.g., MIT, Apache 2.0. If it's a private project, you can omit this or state it.)
Example:
[MIT License](LICENSE.txt)