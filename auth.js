const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config(); // Ensure .env is loaded for this module

const db = require('./db'); // Assuming db.js is in the same directory
const { initializeDefaultProject } = require('./defaultProjectInitializer'); // Assuming this is also in the same dir

const router = express.Router();

// --- Auth Utility Functions (previously in auth_utils.js) ---
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const DEFAULT_THEME = 'light'; // Define default theme

if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET is not defined in .env file.");
    process.exit(1);
}

async function hashPassword(password) {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
}

async function comparePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
}

function generateToken(user) {
    // User object should include id, username, role, and theme
    const payload = {
        id: user.id,
        username: user.username,
        role: user.role,
        theme: user.theme || DEFAULT_THEME, // Include theme, fallback to default
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
    try {
        // Decoded payload will now include role and theme
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null; // Token is invalid or expired
    }
}

// --- Auth Middleware (previously in auth_middleware.js) ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) {
        return res.status(401).json({ error: 'No token provided. Access denied.' });
    }

    const user = verifyToken(token);
    if (!user) {
        return res.status(403).json({ error: 'Invalid or expired token. Access denied.' });
    }

    // req.user now has id, username, role, theme
    req.user = user;
    next();
}

// --- Role Authorization Middleware ---
function authorizeRole(allowedRoles) {
    if (typeof allowedRoles === 'string') {
        allowedRoles = [allowedRoles];
    }
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(403).json({ error: 'Access Forbidden: User role not available.' });
        }
        if (allowedRoles.includes(req.user.role)) {
            next();
        } else {
            return res.status(403).json({ error: `Access Forbidden: Requires ${allowedRoles.join(' or ')} role.` });
        }
    };
}


// --- Auth API Endpoints ---
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password are required.' });
    }

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const existingUser = await client.query(
            'SELECT id FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );
        if (existingUser.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Username or email already exists.' });
        }

        const hashedPassword = await hashPassword(password);
        const newUserRes = await client.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, role',
            [username, email, hashedPassword]
        );
        const newUser = newUserRes.rows[0]; // Includes id, username, role

        // *** ADD DEFAULT USER SETTINGS ***
        try {
            await client.query(
                'INSERT INTO user_settings (user_id, theme) VALUES ($1, $2)',
                [newUser.id, DEFAULT_THEME]
            );
            console.log(`Successfully inserted default settings for new user ${newUser.id}.`);
            newUser.theme = DEFAULT_THEME; // Add theme for token generation
        } catch (settingsError) {
             console.error(`Failed to insert default settings for user ${newUser.id}. Rolling back user registration.`, settingsError);
             throw settingsError; // Trigger ROLLBACK
        }
        // *** END ADD DEFAULT USER SETTINGS ***

        try {
            await initializeDefaultProject(client, newUser.id);
            console.log(`Successfully initialized default project for new user ${newUser.id} (${newUser.username}).`);
        } catch (initError) {
            console.error(`Failed to initialize default project for user ${newUser.id} (${newUser.username}). Rolling back transaction.`, initError);
            throw initError; // Trigger ROLLBACK
        }

        await client.query('COMMIT');

        // Generate token with user info including theme
        const token = generateToken(newUser);
        res.status(201).json({
            message: 'User registered successfully.',
            token,
            user: { id: newUser.id, username: newUser.username, role: newUser.role, theme: newUser.theme } // Include role and theme
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error during user registration, settings, or project initialization:', error);

        if (error.code === '23505') { // Handle unique constraint violations
             if (error.constraint && error.constraint.includes('users_email_key')) {
                 return res.status(409).json({ error: 'Email already exists.' });
             }
             if (error.constraint && error.constraint.includes('users_username_key')) {
                 return res.status(409).json({ error: 'Username already exists.' });
             }
        }
        res.status(500).json({ error: `Failed to register user. ${error.message || 'An unexpected error occurred.'}` });
    } finally {
        client.release();
    }
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    try {
        // Fetch user details and their theme setting in one go
        const userRes = await db.query(`
            SELECT u.id, u.username, u.password_hash, u.role, COALESCE(s.theme, $2) as theme
            FROM users u
            LEFT JOIN user_settings s ON u.id = s.user_id
            WHERE u.username = $1
        `, [username, DEFAULT_THEME]); // Use default theme if settings row is missing

        if (userRes.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }
        const user = userRes.rows[0]; // user now includes id, username, password_hash, role, theme

        const passwordMatch = await comparePassword(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        // Generate token with the fetched user data (including theme)
        const token = generateToken(user);

        // Don't send password hash back
        const userResponse = {
            id: user.id,
            username: user.username,
            role: user.role,
            theme: user.theme
        };

        res.json({
            message: 'Login successful.',
            token,
            user: userResponse // Include role and theme
        });
    } catch (error) {
        console.error('Error logging in user:', error);
        res.status(500).json({ error: `Failed to log in: ${error.message}` });
    }
});

router.get('/status', authenticateToken, async (req, res) => { // Make async to fetch latest settings
    const userId = req.user.id;
    try {
        // Fetch the latest theme setting for the user
        const settingsRes = await db.query(
            'SELECT theme FROM user_settings WHERE user_id = $1',
            [userId]
        );
        const currentTheme = settingsRes.rows.length > 0 ? settingsRes.rows[0].theme : DEFAULT_THEME;

        // Update the theme in the user object from the token (if different)
        // Note: The token itself isn't updated here, only the response
        const userResponse = {
            ...req.user, // Contains id, username, role from token
            theme: currentTheme // Overwrite with latest theme from DB
        };

        res.json({ loggedIn: true, user: userResponse });
    } catch (error) {
         console.error(`Error fetching settings for status check (user ${userId}):`, error);
         // Fallback to token data if DB fails
         res.json({ loggedIn: true, user: req.user });
    }
});


router.post('/logout', (req, res) => {
    // Logout is typically handled client-side by discarding the token
    res.json({ message: 'Logged out successfully.' });
});

module.exports = {
    authRouter: router,
    authenticateToken,
    authorizeRole,
};