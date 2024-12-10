const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema({
  title: { type: String, required: true },
  tutorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tutor', required: true },
  pdfData: { type: Buffer, required: true },  // Store PDF as binary data
  pdfMimeType: { type: String, required: true },  // Store the PDF MIME type
  dateUploaded: { type: Date, default: Date.now }
});

const Resource = mongoose.model('Resource', resourceSchema);
module.exports = Resource;
