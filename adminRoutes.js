const express = require('express');
const db = require('./db');
const { authenticateToken, authorizeRole } = require('./auth');

const router = express.Router();

// Endpoint for an owner to assign/change a user's role (to 'admin' or 'user')
// Only an 'owner' can assign the 'admin' role or change other non-owner user roles.
router.put('/users/:userId/role', authenticateToken, authorizeRole('owner'), async (req, res) => {
    const { userId: targetUserId } = req.params; // The user whose role is to be changed
    const { role: newRole } = req.body;         // The new role to assign ('admin' or 'user')
    const requesterId = req.user.id;            // The ID of the 'owner' making the request

    // Validate the new role that can be assigned by an owner
    const assignableRolesByOwner = ['user', 'admin'];
    if (!assignableRolesByOwner.includes(newRole)) {
        return res.status(400).json({ error: `Invalid role. Owner can only assign: ${assignableRolesByOwner.join(', ')}.` });
    }

    // Owners cannot change their own role via this API
    if (targetUserId === requesterId) {
        return res.status(403).json({ error: "Owners cannot change their own role using this endpoint." });
    }

    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        // Get the target user's current role
        const targetUserRes = await client.query('SELECT id, username, role FROM users WHERE id = $1 FOR UPDATE', [targetUserId]);
        if (targetUserRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Target user not found.' });
        }
        const targetUser = targetUserRes.rows[0];

        // Prevent changing the role of another 'owner' account
        if (targetUser.role === 'owner') {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: "Cannot change the role of an 'owner' account via API." });
        }

        // If target user's role is already the newRole, no update needed
        if (targetUser.role === newRole) {
            await client.query('ROLLBACK');
            return res.status(200).json({ message: `User ${targetUser.username}'s role is already ${newRole}. No change made.`, user: targetUser });
        }

        // Update the user's role
        const updateResult = await client.query(
            'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, username, email, role',
            [newRole, targetUserId]
        );
        
        await client.query('COMMIT');
        res.json({ message: `User ${updateResult.rows[0].username}'s role updated to ${newRole}.`, user: updateResult.rows[0] });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error updating role for user ${targetUserId} by owner ${requesterId}:`, error);
        if (error.message && error.message.includes("invalid input value for enum user_role")) {
             return res.status(400).json({ error: `Invalid role value specified: ${newRole}` });
        }
        res.status(500).json({ error: 'Failed to update user role.' });
    } finally {
        client.release();
    }
});

// Endpoint for 'owner' or 'admin' to list users
router.get('/users', authenticateToken, authorizeRole(['owner', 'admin']), async (req, res) => {
    try {
        // Exclude password_hash from the response for security
        const users = await db.query('SELECT id, username, email, role, created_at, updated_at FROM users ORDER BY created_at DESC');
        res.json(users.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users.' });
    }
});

module.exports = router;