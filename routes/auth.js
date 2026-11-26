
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET;

// GET - All Users
router.get("/", async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT
                ID,
                Name,
                Address,
                Username,
                Account_Type,
                MobileNumber,
                Email,
                ProfilePicture,
                Term,
                RegNumber
             FROM Users`
        );

        res.json(rows);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


// GET - Account by ID
router.get("/:id", async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT
                ID,
                Name,
                Address,
                Username,
                Account_Type,
                MobileNumber,
                Email,
                ProfilePicture,
                Term,
                RegNumber
             FROM Users
             WHERE ID = ?`,
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                message: "Account not found"
            });
        }

        res.json(rows[0]);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


// POST - Create Account
router.post("/", async (req, res) => {
    try {
        const {
            Name,
            Address,
            Username,
            Password,
            Account_Type,
            MobileNumber,
            Email,
            ProfilePicture,
            Term,
            RegNumber
        } = req.body;

        if (!Name || !Username || !Password) {
            return res.status(400).json({
                message: "Name, Username and Password are required"
            });
        }

        const hashedPassword = await bcrypt.hash(Password, 10);

        const [result] = await db.query(
            `INSERT INTO Users
            (
                Name,
                Address,
                Username,
                Password,
                Account_Type,
                MobileNumber,
                Email,
                ProfilePicture,
                Term,
                RegNumber
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                Name,
                Address || null,
                Username,
                hashedPassword,
                Account_Type || null,
                MobileNumber || null,
                Email || null,
                ProfilePicture || null,
                Term || null,
                RegNumber || null
            ]
        );

        res.status(201).json({
            message: "Account created successfully",
            ID: result.insertId
        });

    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                message: "Username already exists"
            });
        }

        res.status(500).json({ message: error.message });
    }
});


// PUT - Update Account
router.put("/:id", async (req, res) => {
    try {
        const {
            Name,
            Address,
            Username,
            Password,
            Account_Type,
            MobileNumber,
            Email,
            ProfilePicture,
            Term,
            RegNumber
        } = req.body;

        let query = `
            UPDATE Users SET
                Name = ?,
                Address = ?,
                Username = ?,
                Account_Type = ?,
                MobileNumber = ?,
                Email = ?,
                ProfilePicture = ?,
                Term = ?,
                RegNumber = ?
        `;

        let values = [
            Name,
            Address ?? null,
            Username,
            Account_Type,
            MobileNumber,
            Email,
            ProfilePicture,
            Term,
            RegNumber
        ];

        // Update password only when provided
        if (Password) {
            const hashedPassword = await bcrypt.hash(Password, 10);

            query += ", Password = ?";
            values.push(hashedPassword);
        }

        query += " WHERE ID = ?";
        values.push(req.params.id);

        const [result] = await db.query(query, values);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Account not found"
            });
        }

        res.json({
            message: "Account updated successfully"
        });

    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                message: "Username already exists"
            });
        }

        res.status(500).json({ message: error.message });
    }
});


// DELETE - Account
router.delete("/:id", async (req, res) => {
    try {
        const [result] = await db.query(
            "DELETE FROM Users WHERE ID = ?",
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Account not found"
            });
        }

        res.json({
            message: "Account deleted successfully"
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


// POST - Login
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        // Check required fields
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Username and password required"
            });
        }

        // Check username in MySQL
        const [rows] = await db.execute(
            "SELECT * FROM Users WHERE Username = ? LIMIT 1",
            [username]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const user = rows[0];

        // Check password
        const passwordMatch = await bcrypt.compare(
            password,
            user.Password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        // Generate JWT expiration (3–6 days)
        const min = 3 * 24 * 60 * 60;
        const max = 6 * 24 * 60 * 60;

        const randomExpire = Math.floor(
            Math.random() * (max - min)
        ) + min;

        // Generate JWT token
        const token = jwt.sign(
            {
                id: user.ID,
                username: user.Username
            },
            JWT_SECRET,
            { expiresIn: randomExpire }
        );

        // Fetch user orders
        const [orders] = await db.execute(
            `SELECT
                p.id AS productID,
                p.name AS productName,
                p.price AS productPrice
             FROM user_orders uo
             INNER JOIN products p ON p.id = uo.product_id
             WHERE uo.user_id = ?`,
            [user.ID]
        );

        // Remove password before returning user
        delete user.Password;

        return res.status(200).json({
            success: true,
            token,
            user: {
                ...user,
                orders
            },
            randomExpire
        });

    } catch (error) {
        console.error("Login Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
});

module.exports = router;
