const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const sqlite3 = require('sqlite3');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

let db;
try {
    db = new sqlite3.Database('tokens.db');

    // Create table
    db.run('CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, project_name TEXT, usage_count INTEGER DEFAULT 0)', (err) => {
        if (err) {
            console.error('Error creating tokens table:', err);
        } else {
            console.log('Database initialized successfully');
        }
    });
} catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
}

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Higher limit for image serving - many users may view the same images
    message: {
        error: 'Too many requests from this IP, please try again later.',
        status: 'error'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

app.use(limiter);

// Body parser with size limits
app.use(express.json({ limit: '10mb' }));

// Global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

async function downloadImage(url) {
    return new Promise((resolve, reject) => {
        try {
            // Validate URL
            if (!url || typeof url !== 'string') {
                reject({ status: 'error', message: 'Invalid URL provided' });
                return;
            }

            // Ensure the public/delivery directory exists
            const deliveryDir = path.join(__dirname, 'files');
            try {
                if (!fs.existsSync(deliveryDir)) {
                    fs.mkdirSync(deliveryDir, { recursive: true });
                }
            } catch (dirError) {
                console.error('Error creating directory:', dirError);
                reject({ status: 'error', message: 'Failed to create storage directory' });
                return;
            }

            // Generate a random filename like uploadthing does
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let randomString = '';
            for (let i = 0; i < 26; i++) {
                randomString += chars.charAt(Math.floor(Math.random() * chars.length));
            }

            // Parse URL to extract extension properly, removing query parameters
            let urlPath, extension, filename;
            try {
                urlPath = new URL(url).pathname;
                extension = path.extname(urlPath) || '.jpg'; // Default to .jpg if no extension found
                filename = `${randomString}${extension}`;
            } catch (urlError) {
                console.error('Error parsing URL:', urlError);
                reject({ status: 'error', message: 'Invalid URL format' });
                return;
            }

            // Create the full file path
            const filePath = path.join(deliveryDir, filename);
            const fileStream = fs.createWriteStream(filePath);

            fileStream.on('error', (error) => {
                console.error('Error creating file stream:', error);
                reject({ status: 'error', message: 'Error creating file stream' });
            });

            const request = https.get(url, (response) => {
                // Check if response is successful
                if (response.statusCode !== 200) {
                    fileStream.destroy();
                    fs.unlink(filePath, () => { }); // Clean up partial file
                    reject({ status: 'error', message: `HTTP ${response.statusCode}: Failed to download image` });
                    return;
                }

                // Check content type
                const contentType = response.headers['content-type'];
                if (!contentType || !contentType.startsWith('image/')) {
                    fileStream.destroy();
                    fs.unlink(filePath, () => { }); // Clean up partial file
                    reject({ status: 'error', message: 'URL does not point to an image' });
                    return;
                }

                response.pipe(fileStream);

                fileStream.on('finish', () => {
                    console.log(`Image saved to ${filePath}`);
                    const fileId = filename.split('.')[0];
                    resolve({ status: 'success', message: 'Image downloaded successfully', fid: fileId, url: `${process.env.HOST}/f/${fileId}` });
                });

                fileStream.on('error', (error) => {
                    console.error('Error writing file:', error);
                    fs.unlink(filePath, () => { }); // Clean up partial file
                    reject({ status: 'error', message: 'Error writing file' });
                });
            });

            request.on('error', (error) => {
                console.error('Error downloading image:', error);
                fileStream.destroy();
                fs.unlink(filePath, () => { }); // Clean up partial file
                reject({ status: 'error', message: 'Error downloading image' });
            });

            request.on('timeout', () => {
                console.error('Download timeout');
                fileStream.destroy();
                fs.unlink(filePath, () => { }); // Clean up partial file
                reject({ status: 'error', message: 'Download timeout' });
            });

            request.setTimeout(30000); // 30 second timeout
        } catch (error) {
            console.error('Unexpected error in downloadImage:', error);
            reject({ status: 'error', message: 'Unexpected error occurred' });
        }
    });
}

// Function to increment token usage
function incrementTokenUsage(token) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not available'));
            return;
        }

        db.run('UPDATE tokens SET usage_count = usage_count + 1 WHERE token = ?', [token], function (err) {
            if (err) {
                console.error('Error incrementing usage count:', err);
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

const authMiddleware = (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!db) {
            console.error('Database not available');
            return res.status(500).json({ error: 'Internal server error' });
        }

        // Check token in database and get project info
        db.get('SELECT token, project_name, usage_count FROM tokens WHERE token = ?', [token], (err, row) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            if (!row) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            // Store token info in request for later use
            req.tokenInfo = {
                token: row.token,
                projectName: row.project_name,
                usageCount: row.usage_count
            };

            next();
        });
    } catch (error) {
        console.error('Error in auth middleware:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Image download endpoint - requires token
app.post('/api/save', authMiddleware, async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Increment token usage
        await incrementTokenUsage(req.tokenInfo.token);

        const result = await downloadImage(url);
        console.log(`Token usage incremented for project: ${req.tokenInfo.projectName}`);
        console.log(result);
        res.json(result);
    } catch (error) {
        console.error('Error in /api/save:', error);
        if (error.status === 'error') {
            res.status(400).json(error);
        } else {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

// UploadThing-style file serving endpoint - public access
app.get('/f/:id', (req, res) => {
    const startTime = Date.now();

    try {
        const { id } = req.params;

        if (!id || typeof id !== 'string') {
            return res.status(400).json({ error: 'Invalid file ID' });
        }

        const deliveryDir = path.join(__dirname, 'files');

        // Check if directory exists
        if (!fs.existsSync(deliveryDir)) {
            const responseTime = Date.now() - startTime;
            console.log(`Files directory not found, request completed in ${responseTime}ms for ID: ${id}`);
            return res.status(404).json({ error: 'File not found' });
        }

        // Find the file with the matching ID (without extension)
        let files;
        try {
            files = fs.readdirSync(deliveryDir);
        } catch (dirError) {
            console.error('Error reading directory:', dirError);
            return res.status(500).json({ error: 'Internal server error' });
        }

        const matchingFile = files.find(file => {
            try {
                const nameWithoutExt = path.parse(file).name;
                return nameWithoutExt === id;
            } catch (parseError) {
                console.error('Error parsing filename:', parseError);
                return false;
            }
        });

        if (matchingFile) {
            const filePath = path.join(deliveryDir, matchingFile);

            // Check if file exists and is readable
            fs.access(filePath, fs.constants.R_OK, (err) => {
                if (err) {
                    console.error('File access error:', err);
                    const responseTime = Date.now() - startTime;
                    console.log(`File access denied, request completed in ${responseTime}ms for file: ${matchingFile}`);
                    return res.status(404).json({ error: 'File not found' });
                }

                const responseTime = Date.now() - startTime;
                console.log(`File serving request completed in ${responseTime}ms for file: ${matchingFile}`);
                res.sendFile(filePath);
            });
        } else {
            const responseTime = Date.now() - startTime;
            console.log(`File not found request completed in ${responseTime}ms for ID: ${id}`);
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        console.error('Error in file serving:', error);
        const responseTime = Date.now() - startTime;
        console.log(`Error in file serving, request completed in ${responseTime}ms`);

        if (error.code === 'ENOENT') {
            res.status(404).json({ error: 'File not found' });
        } else {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    try {
        const healthData = {
            status: 'OK',
            timestamp: new Date().toISOString(),
            database: db ? 'connected' : 'disconnected',
            uptime: process.uptime(),
            memory: process.memoryUsage()
        };
        res.json(healthData);
    } catch (error) {
        console.error('Error in health check:', error);
        res.status(500).json({ status: 'ERROR', timestamp: new Date().toISOString() });
    }
});

// Global error handler middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Handle 404 for unmatched routes
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    if (db) {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            } else {
                console.log('Database connection closed');
            }
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    if (db) {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            } else {
                console.log('Database connection closed');
            }
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

try {
    app.listen(PORT, () => {
        console.log(`Image download API server running on port ${PORT}`);
    });
} catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
}
