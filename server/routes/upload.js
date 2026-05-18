const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

// Ensure uploads directory exists
// UPLOADS_DIR env var lets production point to a path outside the git repo
// so files survive redeployments (e.g. /home/u579331817/uploads)
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
console.log('WorkForce Connect Upload: uploads dir =', uploadsDir);
if (!fs.existsSync(uploadsDir)) {
    console.log('WorkForce Connect Upload: Creating uploads directory...');
    fs.mkdirSync(uploadsDir, { recursive: true });
}
try {
    const testFile = path.join(uploadsDir, '.write-test');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    console.log('WorkForce Connect Upload: Directory is writable.');
} catch (e) {
    console.error('WorkForce Connect Upload: NOT writable -', e.message);
}

// Multer storage config
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const unique = `cs-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}.pdf`);
    }
});

const ALLOWED_MIMETYPES = [
    'application/pdf',
    'application/x-pdf',
    'application/acrobat'
];

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ALLOWED_MIMETYPES.includes(file.mimetype) || ext === '.pdf') {
            cb(null, true);
        } else {
            cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only PDF files are allowed'));
        }
    }
});

// POST /api/upload-cs — authenticated users only (small_business uploading their own capability statement)
router.post('/', requireRole('small_business'), (req, res) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            console.error('WorkForce Connect Upload: Multer error -', err);
            return res.status(400).json({ error: err.message || 'Upload failed' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = `/uploads/${req.file.filename}`;
        res.json({
            path: filePath,
            originalName: req.file.originalname,
            fileName: req.file.filename,
            date: new Date().toISOString(),
            size: req.file.size
        });
    });
});

module.exports = router;
