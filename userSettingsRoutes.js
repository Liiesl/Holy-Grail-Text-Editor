const express = require('express');
const db = require('./db');
const { authenticateToken } = require('./auth'); // Import authentication middleware

const router = express.Router();

const ALLOWED_THEMES = ['light', 'dark']; // Define allowed theme values

// GET /api/settings - Fetch current user's settings
router.get('/', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const settingsRes = await db.query(
            'SELECT theme FROM user_settings WHERE user_id = $1',
            [userId]
        );

        let settings = { theme: 'dark' }; // Default settings
        if (settingsRes.rows.length > 0) {
            settings.theme = settingsRes.rows[0].theme;
        } else {
            // Should not happen if registration inserts defaults, but handle defensively
            console.warn(`No settings found for user ${userId}, returning default.`);
        }

        res.json(settings);
    } catch (error) {
        console.error(`Error fetching settings for user ${userId}:`, error);
        res.status(500).json({ error: 'Failed to retrieve user settings.' });
    }
});

// PUT /api/settings - Update current user's settings
router.put('/', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { theme } = req.body;

    // Validate input
    if (!theme || !ALLOWED_THEMES.includes(theme)) {
        return res.status(400).json({ error: `Invalid theme value. Allowed values: ${ALLOWED_THEMES.join(', ')}` });
    }

    try {
        // Use UPSERT (INSERT ON CONFLICT DO UPDATE) to handle both creation and update
        const result = await db.query(`
            INSERT INTO user_settings (user_id, theme, created_at, updated_at)
            VALUES ($1, $2, NOW(), NOW())
            ON CONFLICT (user_id)
            DO UPDATE SET
              theme = EXCLUDED.theme,
              updated_at = NOW()
            RETURNING theme;
        `, [userId, theme]);

        if (result.rows.length === 0) {
             // This case should theoretically not be reached with RETURNING on UPSERT
             throw new Error("Failed to update or insert settings.");
        }

        const updatedTheme = result.rows[0].theme;

        // Note: The JWT token in the client's possession still holds the *old* theme.
        // The client should ideally update its state based on this response OR
        // fetch /api/auth/status again OR re-login to get a new token with the updated theme.
        res.json({ message: 'Settings updated successfully.', settings: { theme: updatedTheme } });

    } catch (error) {
        console.error(`Error updating settings for user ${userId}:`, error);
        res.status(500).json({ error: 'Failed to update user settings.' });
    }
});

module.exports = router;