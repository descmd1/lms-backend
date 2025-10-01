const cloudinary = require('cloudinary').v2;
require("dotenv").config({path:"./config.env"})

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_SECRET_KEY,
  secure: true,
  timeout: 300000 // 5 minutes timeout
});

// Configure upload defaults with simpler settings
const uploadOptions = {
  image: {
    folder: 'learning/images',
    quality: 'auto:low', // Reduce quality for faster upload
    transformation: [
      { width: 800, height: 600, crop: 'limit' }, // Smaller dimensions
      { quality: 'auto:low' }
    ]
  },
  video: {
    resource_type: 'video',
    folder: 'learning/videos',
    quality: 'auto:low' // Reduce quality for faster upload
  }
};

module.exports = { cloudinary, uploadOptions };
