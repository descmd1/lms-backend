const express = require('express');
const database = require("./connect")
const ObjectId = require("mongodb").ObjectId
const router = express.Router();
const Resource = require('./model/resourceModel');
const multer = require('multer');

// Configure multer for memory storage (so the file doesn't get saved to disk)
const storage = multer.memoryStorage(); 
const upload = multer({ storage });

router.post('/resources', upload.single('pdf'), async (req, res) => {
    let db = database.getDb()
   
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'PDF file is required' });
    }

    const newResource = new Resource({
      title: req.body.title,
      tutorId: req.body.tutorId,
      pdfData: req.file.buffer,  // Save the file buffer (binary data)
      pdfMimeType: req.file.mimetype  // Save the MIME type of the file
    });

    let data = await db.collection("resource").insertOne(newResource);
        res.json(data);

    } catch (error) {
        res.status(500).json({ error: 'Resource upload failed', message: error.message });
    }
});

  
//find all
router.get('/resources', async (req, res) => {
    const db = database.getDb();
    
    try {
      const resources = await db.collection("resource").find({}, { projection: { title: 1, _id: 1 } }).toArray();
      res.json(resources);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch resources', message: error.message });
    }
  });

  //find all
  router.get('/resources/:id', async (req, res) => {
    const db = database.getDb();
    
    try {
      const resource = await db.collection("resource").findOne({ _id: new ObjectId(req.params.id) });
      
      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }
  
      const base64Data = resource.pdfData.toString('base64');
  
      res.json({
        title: resource.title,
        pdfBase64: base64Data,
        pdfMimeType: resource.pdfMimeType,
        dateUploaded: resource.dateUploaded
      });
      
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve resource', message: error.message });
    }
  });
  
  
module.exports = router;

