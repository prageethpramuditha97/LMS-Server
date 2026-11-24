
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const db = require("../config/db");

// GET - All Accounts
router.get("/", async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT ID, Name, Username, Account_Type,
             MobileNumber, Email, ProfilePicture, Term, RegNumber
             FROM Accounts`
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
            "SELECT ID, Name, Username, Account_Type, MobileNumber, Email, ProfilePicture, Term, RegNumber FROM Accounts WHERE ID = ?",
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "Account not found" });
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
            `INSERT INTO Accounts
            (Name, Username, Password, Account_Type, MobileNumber,
             Email, ProfilePicture, Term, RegNumber)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                Name,
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
            UPDATE Accounts SET
            Name = ?,
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
            Username,
            Account_Type,
            MobileNumber,
            Email,
            ProfilePicture,
            Term,
            RegNumber
        ];

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

        res.json({ message: "Account updated successfully" });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


// DELETE - Account
router.delete("/:id", async (req, res) => {
    try {
        const [result] = await db.query(
            "DELETE FROM Accounts WHERE ID = ?",
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Account not found"
            });
        }

        res.json({ message: "Account deleted successfully" });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


module.exports = router;
