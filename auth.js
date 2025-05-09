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
    const payload = {
        id: user.id,
        username: user.username,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null; // Token is invalid or expired
    }
}

// --- Auth Middleware (previously in auth_middleware.js) ---
// This needs to be exported as it's used by other protected routes in server.js
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) {
        return res.status(401).json({ error: 'No token provided. Access denied.' });
    }

    const user = verifyToken(token); // Uses verifyToken from this file
    if (!user) {
        return res.status(403).json({ error: 'Invalid or expired token. Access denied.' });
    }

    req.user = user; // Add user payload to request object
    next();
}

// --- Auth API Endpoints (previously in server.js) ---
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

        const hashedPassword = await hashPassword(password); // Uses hashPassword from this file
        const newUserRes = await client.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username',
            [username, email, hashedPassword]
        );
        const newUser = newUserRes.rows[0];

        try {
            await initializeDefaultProject(client, newUser.id); 
            console.log(`Successfully initialized default project for new user ${newUser.id} (${newUser.username}).`);
        } catch (initError) {
            console.error(`Failed to initialize default project for user ${newUser.id} (${newUser.username}). Rolling back user registration.`, initError);
            throw initError; 
        }
        
        await client.query('COMMIT');
        
        const token = generateToken(newUser); // Uses generateToken from this file
        res.status(201).json({ message: 'User registered successfully.', token, user: {id: newUser.id, username: newUser.username } });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error during user registration or default project initialization:', error);
        
        if (error.code === '23503' && error.constraint === 'users_email_key') { // Example specific db error for email
             return res.status(409).json({ error: 'Email already exists.' });
        }
        if (error.code === '23503' && error.constraint === 'users_username_key') { // Example specific db error for username
             return res.status(409).json({ error: 'Username already exists.' });
        }
        // Fallback for other unique constraint violations or general errors
        if (error.message && (error.message.toLowerCase().includes('username or email already exists') || (error.constraint && (error.constraint.includes('username') || error.constraint.includes('email'))))) {
             return res.status(409).json({ error: 'Username or email already exists.' });
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
        const userRes = await db.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
        if (userRes.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }
        const user = userRes.rows[0];

        const passwordMatch = await comparePassword(password, user.password_hash); // Uses comparePassword from this file
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }

        const token = generateToken(user); // Uses generateToken from this file
        res.json({ message: 'Login successful.', token, user: {id: user.id, username: user.username }});
    } catch (error) {
        console.error('Error logging in user:', error);
        res.status(500).json({ error: `Failed to log in: ${error.message}` });
    }
});

router.get('/status', authenticateToken, (req, res) => { // Uses authenticateToken from this file
    // If authenticateToken middleware passes, req.user is set
    res.json({ loggedIn: true, user: req.user });
});

router.post('/logout', (req, res) => {
    // For JWT, logout is primarily client-side (clearing the token).
    // Server-side might involve token blacklisting for immediate invalidation, but that's more complex.
    res.json({ message: 'Logged out successfully.' });
});

module.exports = {
    authRouter: router,
    authenticateToken, // Export middleware for use in server.js for other protected routes
};