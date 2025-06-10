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
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 5001;

const allowedOrigins = ["http://localhost:3000", "https://lms-xfl6.vercel.app"];

// Enhanced CORS configuration
app.use(cors({
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

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Routes
app.use(course);
app.use(users);
app.use(resource);
app.use(payment);

// Timeout middleware
app.use((req, res, next) => {
  req.setTimeout(600000); // 10 minutes
  next();
});

// Connect to database and start server
app.listen(PORT, () => {
  connect.connectServer();
  console.log(`Server is running on port ${PORT}`);
});