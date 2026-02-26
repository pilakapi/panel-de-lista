console.log("DATABASE_URL:", process.env.DATABASE_URL);
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Crear tabla si no existe
async function initDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS playlists (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            phone TEXT,
            content TEXT NOT NULL,
            expiration_date BIGINT NOT NULL,
            public_token TEXT UNIQUE NOT NULL,
            created_at BIGINT NOT NULL
        )
    `);
}

// LOGIN (igual que antes)
app.post('/api/login', (req, res) => {
    const { pin } = req.body;
    if (pin === '198837') {
        res.json({ success: true, token: 'authenticated' });
    } else {
        res.status(401).json({ success: false });
    }
});

// Obtener playlists
app.get('/api/playlists', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, phone, expiration_date, public_token, created_at,
            LENGTH(content) as content_length
            FROM playlists
            ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Obtener una playlist
app.get('/api/playlists/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM playlists WHERE id = $1',
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Lista no encontrada' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Crear playlist
app.post('/api/playlists', async (req, res) => {
    try {
        const { name, phone, content, duration } = req.body;

        const now = Date.now();
        const durations = {
            '1': 86400000,
            '3': 259200000,
            '7': 604800000,
            '15': 1296000000,
            '35': 3024000000,
            '180': 15552000000,
            '365': 31536000000
        };

        const expirationDate = now + (durations[duration] || durations['7']);
        const publicToken = uuidv4();

        const result = await pool.query(
            `INSERT INTO playlists 
            (name, phone, content, expiration_date, public_token, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id`,
            [name, phone, content, expirationDate, publicToken, now]
        );

        res.json({
            success: true,
            id: result.rows[0].id,
            public_token: publicToken
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Actualizar
app.put('/api/playlists/:id', async (req, res) => {
    try {
        const { name, phone, content, duration } = req.body;

        const now = Date.now();
        const durations = {
            '1': 86400000,
            '3': 259200000,
            '7': 604800000,
            '15': 1296000000,
            '35': 3024000000,
            '180': 15552000000,
            '365': 31536000000
        };

        const expirationDate = now + (durations[duration] || durations['7']);

        await pool.query(
            `UPDATE playlists
             SET name=$1, phone=$2, content=$3, expiration_date=$4
             WHERE id=$5`,
            [name, phone, content, expirationDate, req.params.id]
        );

        res.json({ success: true });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Eliminar
app.delete('/api/playlists/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM playlists WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Ruta pública M3U
app.get('/get/:token.m3u', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT content FROM playlists WHERE public_token=$1',
            [req.params.token]
        );

        if (result.rows.length === 0) {
            return res.status(404).send('Lista no encontrada');
        }

        res.setHeader('Content-Type', 'application/x-mpegurl');
        res.send(result.rows[0].content);

    } catch (error) {
        res.status(500).send('Error del servidor');
    }
});

initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor corriendo en puerto ${PORT}`);
    });
});
