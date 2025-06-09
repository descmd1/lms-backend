const connect = require("./connect")
const express = require("express")
const cors = require("cors")
const course = require("./courseRoutes")
const users = require("./userRoutes")
const resource = require("./resourceRoutes")
const payment = require("./paymentRoutes")
const multer = require('multer')


const app = express()
const PORT = process.env.PORT || 5001;


const allowedOrigins = ["http://localhost:3000", "https://lms-xfl6.vercel.app"];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json())
app.use(course)
app.use(users)
app.use(resource)
app.use(payment)
app.use((req, res, next) => {
    req.setTimeout(600000); // 10 minutes
    next();
  });
app.listen(PORT, () => {
    connect.connectServer()
    console.log(`Server is running on port ${PORT}`)
})

app.listen(process.env.PORT || 5001, () => {
  console.log("Server is running on port", process.env.PORT || 5001);
});