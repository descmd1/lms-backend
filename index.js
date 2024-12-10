const connect = require("./connect")
const express = require("express")
const cors = require("cors")
const course = require("./courseRoutes")
const users = require("./userRoutes")
const resource = require("./resourceRoutes")
const payment = require("./paymentRoutes")
const multer = require('multer')


const app = express()
const PORT = 5001

app.use(cors())
app.use(express.json())
app.use(course)
app.use(users)
app.use(resource)
app.use(payment)

app.listen(PORT, () => {
    connect.connectServer()
    console.log(`Server is running on port ${PORT}`)
})