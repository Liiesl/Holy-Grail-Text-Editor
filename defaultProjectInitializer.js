// Default project initializer - DB version with specific "Holy Grail" tutorial content

/**
 * Initializes a default "Welcome" project with an interactive tutorial in the database
 * for a specific user, using an existing database client.
 * @param {object} dbClient - The active database client (from db.getClient() or transaction).
 * @param {string} userId - The ID of the user for whom to create the project.
 * @param {string} projectNameToCreate - The name for the project in the database (e.g., "Welcome").
 */
async function initializeDefaultProject(dbClient, userId, projectNameToCreate = "Welcome") {
    const tutorialRootPageTitle = "👋 Welcome to Holy Grail!"; // Static title from user's content

    try {
        // 1. Create Project or get existing ID for the specific user
        const projectRes = await dbClient.query(
            'INSERT INTO projects (name, user_id) VALUES ($1, $2) ON CONFLICT (user_id, name) DO NOTHING RETURNING id',
            [projectNameToCreate, userId]
        );

        let projectId;

        if (projectRes.rows.length > 0) {
            projectId = projectRes.rows[0].id;
            console.log(`Default project "${projectNameToCreate}" (ID: ${projectId}) created in DB for user ${userId}.`);
        } else {
            // If ON CONFLICT (user_id, name) DO NOTHING occurred, fetch the existing project's ID.
            const existingProjectRes = await dbClient.query(
                'SELECT id FROM projects WHERE name = $1 AND user_id = $2',
                [projectNameToCreate, userId]
            );
            if (existingProjectRes.rows.length === 0) {
                // This should not happen if the INSERT ... ON CONFLICT logic is correct
                // or if the project was truly supposed to be new.
                throw new Error(`Failed to create or find project "${projectNameToCreate}" for user ${userId}.`);
            }
            projectId = existingProjectRes.rows[0].id;
            console.log(`Default project "${projectNameToCreate}" (ID: ${projectId}) for user ${userId} already existed.`);

            // Check if this specific tutorial root page already exists for this project
            const rootCheck = await dbClient.query(
                "SELECT id FROM pages WHERE project_id = $1 AND parent_id IS NULL AND title = $2",
                [projectId, tutorialRootPageTitle]
            );
            if (rootCheck.rows.length > 0) {
                console.log(`Default project "${projectNameToCreate}" for user ${userId} with tutorial root page "${tutorialRootPageTitle}" already initialized. Skipping content population.`);
                return; // Successfully "initialized" by confirming existence
            }
        }

        // 2. Define page titles (from user's file)
        const sidebarPageTitle = "Step 1: Exploring the Sidebar";
        const slashCommandsPageTitle = "Step 2: The Magic of Slash Commands";
        const linkingSubpagesPageTitle = "Step 3: Creating Subpages & Links";
        const savingManagingPageTitle = "Step 4: Saving & Managing";
        const fullCommandListPageTitle = "Full Command List";

        // 3. Insert pages to get their IDs (initially with placeholder content)
        const insertPageAndGetId = async (title, parentId, displayOrder, tempContent = "Initializing...") => {
            const res = await dbClient.query(
                `INSERT INTO pages (project_id, title, markdown_content, parent_id, display_order)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [projectId, title, tempContent, parentId, displayOrder]
            );
            return res.rows[0].id;
        };

        const rootPageId_db = await insertPageAndGetId(tutorialRootPageTitle, null, 0);
        const sidebarPageId_db = await insertPageAndGetId(sidebarPageTitle, rootPageId_db, 0);
        const slashCommandsPageId_db = await insertPageAndGetId(slashCommandsPageTitle, rootPageId_db, 1);
        const linkingSubpagesPageId_db = await insertPageAndGetId(linkingSubpagesPageTitle, rootPageId_db, 2);
        const savingManagingPageId_db = await insertPageAndGetId(savingManagingPageTitle, rootPageId_db, 3);
        const fullCommandListPageId_db = await insertPageAndGetId(fullCommandListPageTitle, rootPageId_db, 4);

        // 4. Define Page Content Templates (using placeholders for dynamic IDs)
        // These are taken directly from the user-provided file content
        const rootPageContentTemplate = `
# 👋 Welcome to Holy Grail!

Hello there! Welcome to Holy Grail, your new space to capture and organize your most important ideas – your personal "holy grails"!

We're excited to help you get started. This short, interactive tutorial will show you the basics in a few simple steps.

**Ready to begin?**
*   ➡️ Let's start with [Step 1: Exploring the Sidebar](page://{SIDEBAR_PAGE_ID}). You'll learn how to find your way around and organize your work.

After that, we'll cover adding content, creating new pages, and more! These steps will guide you through:
*   Using quick "Slash Commands" to add content.
*   Creating and linking pages together.
*   Saving and managing your work.

**Want to see all the cool things you can do at a glance?**
*   You can always check out the [Full Command List](page://{FULL_COMMAND_LIST_PAGE_ID}) for a quick reference.
`;

    const sidebarPageContentTemplate = `
# Step 1: Exploring the Sidebar

The sidebar is your main navigation area. Let's see how it works!

## Projects
*   At the very top of the sidebar, you'll see **"Projects"**. This is where all your different work-spaces live.
*   **To create a new project:** Click the **+** (plus) icon next to the "Projects" heading.
    *   *Why not try it now? Give your test project a name like "My Ideas".*

## Pages
*   Each project can have many pages. When you click a project name, its pages appear below it.
*   **To create a new page in a project:** Click the **+** icon next to the project's name.
*   **To create a subpage under an existing page:** Click the **+** icon next to that page's name in the list.
    *   *You can create a test page in your "My Ideas" project, or even a subpage under this "Exploring the Sidebar" page!*

**Navigation:**
*   Clicking a project name shows its pages.
*   Clicking a page name opens that page in the editor.

**What's Next?**
Feeling good about the sidebar? Great! Let's learn how to add content to your pages.
➡️ Next up: [Step 2: The Magic of Slash Commands](page://{SLASH_COMMANDS_PAGE_ID})
`;

    const slashCommandsPageContentTemplate = `
# Step 2: The Magic of Slash Commands

The easiest way to add and format content is with **Slash Commands**.

**How to use:**
1.  Make sure your cursor is on a new line, or after a space.
2.  Type a forward slash: \`/\`
3.  A menu will pop up!
    *   Type to search for a command (e.g., type "head" for headings).
    *   Use your Arrow Keys (Up/Down) to select.
    *   Press Enter or Tab to choose the highlighted command.

**Let's Practice!**
Below this text is a "Practice Zone". Click into the area below the line, create a new line if needed (by pressing Enter), and try out these commands:

---
**👇 Practice Zone: Type Slash Commands Below This Line 👇**
<p><br></p>
<p><br></p>
<p><br></p>
*(You can type directly here. After typing each command like \`/h1\`, press Enter, then type some example text.)*

*   Try \`/h1\` (then type a big heading)
*   Try \`/h2\` (then type a medium heading)
*   Try \`/bl\` (for a bullet list: type an item, press Enter, type another item)
*   Try \`/cl\` (for a checklist: type a to-do, press Enter, type another to-do)

---

**Did you try them?**
You should see how easy it is to structure your content! *Even this tutorial page is built with these very same elements like headings and bullet lists.*

**Want to see everything you can do?**
For a complete overview of all available commands:
➡️ Dive deeper: [Full Command List](page://{FULL_COMMAND_LIST_PAGE_ID})

**Ready for another powerful command?**
Let's learn how to create new pages *from within your text* and link them automatically.
➡️ Next up: [Step 3: Creating Subpages & Links](page://{LINKING_SUBPAGES_PAGE_ID})
`;

    const linkingSubpagesPageContentTemplate = `
# Step 3: Creating Subpages & Links

A very handy feature is creating new subpages right as you're writing. This helps you build connected ideas easily.

**The \`/create-subpage\` command (short: \`/sp\`):**

1.  Type \`/sp\` or \`/create-subpage\` on a new line and press Enter.
2.  You'll be prompted to enter a title for your new subpage.
3.  After you enter the title, two things happen:
    *   A new subpage is created under the current page (you'll see it in the sidebar!).
    *   A link to this new subpage is inserted right where your cursor was.

**Try it now!**
Let's create a subpage. Follow these steps carefully:

1.  Click to place your cursor on an **empty new line** directly below the "👇 **TYPE \`/sp\` ON A NEW LINE HERE** 👇" marker. (If there isn't an obvious empty line, press Enter once or twice after the marker to create one).
2.  Type \`/sp\` and press Enter.
3.  When prompted, type the title: \`My Awesome Test Subpage\` and press Enter.

👇 **TYPE \`/sp\` ON A NEW LINE HERE** 👇
<p><br></p>
<p><br></p>
<p><br></p>
*(After you complete the steps above, you should see a link like "[My Awesome Test Subpage](page://...)" appear right where you typed /sp. Notice how all the navigation links in this tutorial, like the "Next up" link below, use a similar format!)*

**Understanding Links:**
The link inserted will look something like \`[My Awesome Test Subpage](page://a1b2c3d4-e5f6...)\`.
*   The part in \`[]\` is the visible text.
*   The part in \`()\` is the actual link, starting with \`page://\` followed by a unique ID for that page.
*   Clicking these links will instantly take you to that page!

**Manual Links:**
You can also manually type links like this if you know a page's ID, but the \`/sp\` command is usually the easiest way for new pages.

**What's Next?**
You're creating content and linking it like a pro! Let's cover how your work is saved and how to manage your pages.
➡️ Next up: [Step 4: Saving & Managing](page://{SAVING_MANAGING_PAGE_ID})
`;

    const savingManagingPageContentTemplate = `
# Step 4: Saving & Managing Your Work

Good news! Your work is generally taken care of for you.

## Saving Content
*   **Autosave:** The editor automatically saves your changes a few seconds after you stop typing. You'll usually see a status message like "Autosaving..." and then "All changes saved." at the bottom of the screen.
*   **Manual Save:** If you want to save immediately, look for the **"Save Page"** button in the top bar (often near your page title). It will be active if you have unsaved changes.

## Managing Projects and Pages
Need to rename, delete, or duplicate something?

*   In the sidebar, look for the **...** (ellipsis) icon next to each project name and page name.
*   Clicking this icon opens an **Action Menu** with options like:
    *   Rename
    *   Delete
    *   Duplicate
    *   *(And more, depending on the item)*

**Challenge:**
1.  If you created "My Awesome Test Subpage" in the previous step, navigate to it using its link or the sidebar.
2.  Use the **...** menu next to its name in the sidebar to **Rename** it to "Renamed Test Subpage".
3.  Then, if you're feeling brave, use the **...** menu to **Delete** it (don't worry, it's just a test page!).

## You're All Set! 🎉

You've now covered the basics of navigating, creating content, linking, saving, and managing your work in this editor.

**The best way to learn is by doing.** Feel free to explore, create your own projects, and experiment with all the features. This "Welcome" project itself is just another project – you can edit these pages too!

Happy writing!

Go back to the start: [👋 Welcome to Holy Grail!](page://{ROOT_PAGE_ID})
Or explore all commands: [Full Command List](page://{FULL_COMMAND_LIST_PAGE_ID})
`;

    const fullCommandListPageContentTemplate = `
# Full Command List

Here's a comprehensive list of all available slash commands. Remember to type \`/\` followed by the command or its short code.

## Basic Blocks
*   \`/p\` or \`/paragraph\`
    *   **Paragraph**: Basic text block.
*   \`/h1\`
    *   **Heading 1**: Large section heading.
*   \`/h2\`
    *   **Heading 2**: Medium section heading.
*   \`/h3\`
    *   **Heading 3**: Small section heading.

## Lists
*   \`/bl\` or \`/bullet-list\`
    *   **Bullet List**: Create a bulleted list.
*   \`/nl\` or \`/numbered-list\`
    *   **Numbered List**: Create a numbered list.
*   \`/cl\` or \`/checklist\`
    *   **Checklist**: Create a to-do list with interactive checkboxes.

## Media & Formatting
*   \`/hr\` or \`/divider\`
    *   **Divider**: Insert a horizontal line to separate content.
*   \`/cb\` or \`/code-block\`
    *   **Code Block**: Insert a pre-formatted block for code snippets.
*   \`/bq\` or \`/blockquote\`
    *   **Quote Block**: Highlight text as a quote.

## Page Operations
*   \`/sp\` or \`/create-subpage\`
    *   **New Subpage**: Create a new subpage under the current page and automatically link to it.

---
Back to:
*   [👋 Welcome to Holy Grail!](page://{ROOT_PAGE_ID})
*   [Step 2: The Magic of Slash Commands](page://{SLASH_COMMANDS_PAGE_ID})
`;

        // 5. Prepare final content by replacing placeholders with actual DB-generated IDs
        const finalRootPageContent = rootPageContentTemplate
            .replace(/{SIDEBAR_PAGE_ID}/g, sidebarPageId_db)
            .replace(/{FULL_COMMAND_LIST_PAGE_ID}/g, fullCommandListPageId_db);

        const finalSidebarPageContent = sidebarPageContentTemplate
            .replace(/{SLASH_COMMANDS_PAGE_ID}/g, slashCommandsPageId_db);

        const finalSlashCommandsPageContent = slashCommandsPageContentTemplate
            .replace(/{FULL_COMMAND_LIST_PAGE_ID}/g, fullCommandListPageId_db)
            .replace(/{LINKING_SUBPAGES_PAGE_ID}/g, linkingSubpagesPageId_db);

        const finalLinkingSubpagesPageContent = linkingSubpagesPageContentTemplate
            .replace(/{SAVING_MANAGING_PAGE_ID}/g, savingManagingPageId_db);

        const finalSavingManagingPageContent = savingManagingPageContentTemplate
            .replace(/{ROOT_PAGE_ID}/g, rootPageId_db)
            .replace(/{FULL_COMMAND_LIST_PAGE_ID}/g, fullCommandListPageId_db);

        const finalFullCommandListPageContent = fullCommandListPageContentTemplate
            .replace(/{ROOT_PAGE_ID}/g, rootPageId_db)
            .replace(/{SLASH_COMMANDS_PAGE_ID}/g, slashCommandsPageId_db);

        // 6. Update pages in DB with their final, link-populated content
        const updatePageContentInDb = async (pageId, content) => {
            await dbClient.query('UPDATE pages SET markdown_content = $1 WHERE id = $2', [content.trim(), pageId]);
        };

        await updatePageContentInDb(rootPageId_db, finalRootPageContent);
        await updatePageContentInDb(sidebarPageId_db, finalSidebarPageContent);
        await updatePageContentInDb(slashCommandsPageId_db, finalSlashCommandsPageContent);
        await updatePageContentInDb(linkingSubpagesPageId_db, finalLinkingSubpagesPageContent);
        await updatePageContentInDb(savingManagingPageId_db, finalSavingManagingPageContent);
        await updatePageContentInDb(fullCommandListPageId_db, finalFullCommandListPageContent);

        console.log(`Default project "${projectNameToCreate}" for user ${userId} with tutorial "${tutorialRootPageTitle}" fully initialized in DB.`);

    } catch (error) {
        console.error(`Error initializing default project "${projectNameToCreate}" for user ${userId} (tutorial: "${tutorialRootPageTitle}") in DB:`, error);
        // Re-throw so the calling transaction can be rolled back
        throw error;
    }
    // No client.release() or transaction management here, handled by caller.
}

module.exports = { initializeDefaultProject };