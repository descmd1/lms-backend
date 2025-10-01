// const connect = require("./connect")
// const express = require("express")
// const cors = require("cors")
// const course = require("./courseRoutes")
// const users = require("./userRoutes")
// const resource = require("./resourceRoutes")
// const payment = require("./paymentRoutes")
// const multer = require('multer')


// const app = express()
// const PORT = process.env.PORT || 5001;


// const allowedOrigins = ["http://localhost:3000", "https://lms-xfl6.vercel.app"];

// app.use(cors({
//   origin: allowedOrigins,
//   credentials: true,
// }));
// app.use(express.urlencoded({ extended: true }));
// app.use(express.json())
// app.use(course)
// app.use(users)
// app.use(resource)
// app.use(payment)
// app.use((req, res, next) => {
//     req.setTimeout(600000); // 10 minutes
//     next();
//   });
// app.listen(PORT, () => {
//     connect.connectServer()
//     console.log(`Server is running on port ${PORT}`)
// })

// app.listen(process.env.PORT || 5001, () => {
//   console.log("Server is running on port", process.env.PORT || 5001);
// });



const connect = require("./connect");
const express = require("express");
const cors = require("cors");
const course = require("./courseRoutes");
const users = require("./userRoutes");
const resource = require("./resourceRoutes");
const payment = require("./paymentRoutes");
const liveSession = require("./liveSessionRoutes");
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 5001;

const allowedOrigins = ["https://lms-xfl6.vercel.app"];

// Enhanced CORS configuration
app.use(cors({
  // origin:"http://localhost:3000",
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests
app.options('*', cors());

// Increase payload limits for file uploads
app.use(express.urlencoded({ extended: true, limit: '500mb' }));
app.use(express.json({ limit: '500mb' }));

// Timeout middleware - must come before routes
app.use((req, res, next) => {
  // Set different timeouts based on the endpoint
  if (req.path.includes('/course') && req.method === 'POST') {
    req.setTimeout(480000, () => { // 8 minutes for course creation
      res.status(408).json({ error: 'Request timeout', message: 'File upload took too long. Please try with smaller files or check your internet connection.' });
    });
    res.setTimeout(480000);
  } else {
    req.setTimeout(120000); // 2 minutes for other requests
    res.setTimeout(120000);
  }
  next();
});

// Routes
app.use(course);
app.use(users);
app.use(resource);
app.use(payment);
app.use(liveSession);

// Error handling middleware
app.use((error, req, res, next) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large', message: 'Please upload smaller files (max 500MB)' });
  }
  if (error.message.includes('timeout')) {
    return res.status(408).json({ error: 'Upload timeout', message: 'Upload took too long. Please try with smaller files.' });
  }
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error', message: error.message });
});

// Connect to database and start server
app.listen(PORT, () => {
  connect.connectServer();
  console.log(`Server is running on port ${PORT}`);
});