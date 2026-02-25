const express = require('express');
const initSqlJs = require('sql.js');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Database setup
let db;
const DB_PATH = path.join(__dirname, 'database.sqlite');

async function initDatabase() {
    const SQL = await initSqlJs();

    // Try to load existing database
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    // Create tables
    db.run(`
        CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT,
            content TEXT NOT NULL,
            expiration_date INTEGER NOT NULL,
            public_token TEXT UNIQUE NOT NULL,
            created_at INTEGER NOT NULL
        )
    `);

    // Save database
    saveDatabase();
}

function saveDatabase() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

// Routes

// Login
app.post('/api/login', (req, res) => {
    const { pin } = req.body;
    if (pin === '198837') {
        res.json({ success: true, token: 'authenticated' });
    } else {
        res.status(401).json({ success: false, message: 'PIN incorrecto' });
    }
});

// Get all playlists
app.get('/api/playlists', (req, res) => {
    try {
        const results = db.exec(`
            SELECT id, name, phone, expiration_date, public_token, created_at,
            LENGTH(content) as content_length
            FROM playlists
            ORDER BY created_at DESC
        `);

        if (results.length === 0) {
            return res.json([]);
        }

        const columns = results[0].columns;
        const values = results[0].values.map(row => {
            const obj = {};
            columns.forEach((col, i) => {
                obj[col] = row[i];
            });
            return obj;
        });

        res.json(values);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single playlist for editing
app.get('/api/playlists/:id', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM playlists WHERE id = ?');
        stmt.bind([parseInt(req.params.id)]);

        if (stmt.step()) {
            const row = stmt.getAsObject();
            res.json(row);
        } else {
            res.status(404).json({ error: 'Lista no encontrada' });
        }
        stmt.free();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create playlist
app.post('/api/playlists', (req, res) => {
    try {
        const { name, phone, content, duration } = req.body;

        // Calculate expiration date
        const now = Date.now();
        const durations = {
            '1': 1 * 24 * 60 * 60 * 1000,           // 1 day
            '3': 3 * 24 * 60 * 60 * 1000,           // 3 days
            '7': 7 * 24 * 60 * 60 * 1000,           // 1 week
            '15': 15 * 24 * 60 * 60 * 1000,         // 15 days
            '35': 35 * 24 * 60 * 60 * 1000,         // 35 days
            '180': 180 * 24 * 60 * 60 * 1000,       // 6 months
            '365': 365 * 24 * 60 * 60 * 1000        // 1 year
        };

        const expirationDate = now + (durations[duration] || durations['7']);

        // Generate unique public token
        const publicToken = uuidv4();

        const stmt = db.prepare(`
            INSERT INTO playlists (name, phone, content, expiration_date, public_token, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        stmt.run([name, phone, content, expirationDate, publicToken, now]);
        stmt.free();

        saveDatabase();

        res.json({
            success: true,
            id: db.exec('SELECT last_insert_rowid()')[0].values[0][0],
            public_token: publicToken
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update playlist
app.put('/api/playlists/:id', (req, res) => {
    try {
        const { name, phone, content, duration } = req.body;
        const id = parseInt(req.params.id);

        // Calculate new expiration date
        const now = Date.now();
        const durations = {
            '1': 1 * 24 * 60 * 60 * 1000,
            '3': 3 * 24 * 60 * 60 * 1000,
            '7': 7 * 24 * 60 * 60 * 1000,
            '15': 15 * 24 * 60 * 60 * 1000,
            '35': 35 * 24 * 60 * 60 * 1000,
            '180': 180 * 24 * 60 * 60 * 1000,
            '365': 365 * 24 * 60 * 60 * 1000
        };

        const expirationDate = now + (durations[duration] || durations['7']);

        const stmt = db.prepare(`
            UPDATE playlists
            SET name = ?, phone = ?, content = ?, expiration_date = ?
            WHERE id = ?
        `);

        stmt.run([name, phone, content, expirationDate, id]);
        stmt.free();

        saveDatabase();

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete playlist
app.delete('/api/playlists/:id', (req, res) => {
    try {
        const stmt = db.prepare('DELETE FROM playlists WHERE id = ?');
        stmt.run([parseInt(req.params.id)]);
        stmt.free();

        saveDatabase();

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Public M3U access route
app.get('/get/:token.m3u', (req, res) => {
    try {
        const token = req.params.token;

        const stmt = db.prepare('SELECT content FROM playlists WHERE public_token = ?');
        stmt.bind([token]);

        if (stmt.step()) {
            const row = stmt.getAsObject();
            res.setHeader('Content-Type', 'application/x-mpegurl');
            res.setHeader('Content-Disposition', 'attachment; filename="playlist.m3u"');
            res.send(row.content);
        } else {
            res.status(404).send('Lista no encontrada');
        }
        stmt.free();
    } catch (error) {
        res.status(500).send('Error del servidor');
    }
});

// Start server
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor corriendo en puerto ${PORT}`);
    });
}).catch(err => {
    console.error('Error al inicializar la base de datos:', err);
    process.exit(1);
});
