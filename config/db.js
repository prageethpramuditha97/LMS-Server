
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: 'localhost',
    user: 'CodeStack',
    password: 'CSLMS#456',
    database: 'eduSpace',
    port: 3306,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
