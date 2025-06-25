const express = require('express');
const database = require('./connect');
const ObjectId = require('mongodb').ObjectId;
require("dotenv").config({path: "./config.env"})
const router = express.Router();
const paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);
const axios = require('axios')  // Add your Paystack secret key
const jwt = require('jsonwebtoken')



router.post('/buycourse', async (req, res) => {
    const { email, amount, courseId, userId } = req.body;

    // Validate required fields
    if (!email || !amount || !courseId || !userId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;

    try {
        // Initialize payment with Paystack
        const paymentInitResponse = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            {
                email,
                amount: amount * 100, // Amount should be in kobo
                callback_url: `https://lms-api-pr4i.onrender.com/verifypayment/${courseId}`, // Redirect after payment
                metadata: {
                    courseId: courseId,
                    userId: userId
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${paystackSecretKey}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        // Extract the payment authorization URL from the response
        const paymentLink = paymentInitResponse.data?.data?.authorization_url;

        // If the paymentLink exists, return it to the frontend
        if (paymentLink) {
            return res.json({ paymentLink });
        } else {
            return res.status(500).json({ error: 'Failed to get payment link from Paystack' });
        }
    } catch (error) {
        // Handle the error properly
        console.error('Paystack API error:', error.response ? error.response.data : error.message);
        return res.status(500).json({ error: 'Payment initialization failed' });
    }
});


// Verify Payment Route
// Verify Payment Route
router.get('/verifypayment/:reference', async (req, res) => {
    const { reference } = req.params;

    // Set your Paystack secret key
    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;

    try {
        // Verify the transaction with Paystack
        const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
            headers: {
                Authorization: `Bearer ${paystackSecretKey}`,
            },
        });

        const paymentData = response.data.data;

        if (paymentData.status === 'success') {
            // Handle course enrollment and save the payment info
            const { courseId, userId } = paymentData.metadata;
           
            
            // Your logic to enroll the user in the course
            let db = database.getDb();
            // const existingEnrollment = await db.collection("enrollments").findOne({ userId, courseId });

            // if (existingEnrollment) {
            //     return res.status(400).json({ error: 'User is already enrolled in this course' });
            // }
            const enrollmentObject = {
                userId: userId,
                courseId: courseId,
                dateEnrolled: new Date(),
                paymentReference: reference, // Store the Paystack payment reference
                status: 'active' // Enrollment status
            };

            // Insert into enrollments collection
            const enrollmentResult = await db.collection("enrollments").insertOne(enrollmentObject); // Store the result here
            console.log("Enrollment result:", enrollmentResult); // Now this will log the result correctly

            return res.json({ message: 'Payment verified and user enrolled' });
        } else {
            return res.status(400).json({ error: 'Payment not successful' });
        }
    } catch (error) {
        console.error('Payment verification error:', error);
        return res.status(500).json({ error: 'Payment verification failed' });
    }
});

function verifyToken(request, response, next) {
    const autHeaders = request.headers["authorization"];
    const token = autHeaders && autHeaders.split(' ')[1]; // Get token from Bearer token

    if (!token) {
        return response.status(401).json({ message: "Authentication token is missing" });
    }

    jwt.verify(token, process.env.SECRET_KEY, (error, user) => {
        if (error) {
            return response.status(403).json({ message: "Invalid token" });
        }
        request.user = user; // Set user information in req.user
        next(); // Proceed to the next middleware or route handler
    });
}



module.exports = router;
