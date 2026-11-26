
const express = require("express");
const cors = require("cors");

const app = express();

// Middleware
app.use(cors());

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));


app.use(express.json());

// Parse URL-encoded requests (optional)
app.use(express.urlencoded({ extended: true }));


const CLIENT_ID = "SiCPlcOYSpqRqu6hCZeLuw";
const CLIENT_SECRET = "bCPPKwVLCyBN507tTgdlHZUlKXplYzwC";
const ACCOUNT_ID = "nljggsNnTaqIAgP5isRorg"; // Needed for Server-to-Server OAuth apps

// Zoom OAuth token endpoint
const ZOOM_TOKEN_URL = "https://zoom.us/oauth/token";

// Showroom Routes
const authRoutes = require("./routes/auth");

app.use("/api/auth", authRoutes);



// Server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
