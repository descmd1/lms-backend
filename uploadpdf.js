const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure the directory exists
const pdfDirectory = 'uploads/pdfs/';
if (!fs.existsSync(pdfDirectory)) {
  fs.mkdirSync(pdfDirectory, { recursive: true });
}

// Configure storage for PDFs
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, pdfDirectory);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

// File filter to allow only PDFs
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDFs are allowed'));
  }
};

const upload = multer({ storage, fileFilter });
module.exports = upload;
