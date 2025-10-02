const express = require('express');
const database = require('./connect');
const ObjectId = require('mongodb').ObjectId;
require("dotenv").config({path: "./config.env"})
const router = express.Router();
const paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);
const axios = require('axios')  // Add your Paystack secret key
const jwt = require('jsonwebtoken')

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

// Test route to check if payment service is working
router.get('/test-payment', (req, res) => {
    const hasPaystackKey = !!process.env.PAYSTACK_SECRET_KEY;
    const hasDbConnection = !!database.getDb();
    
    res.json({
        message: 'Payment service is running',
        paystackConfigured: hasPaystackKey,
        databaseConnected: hasDbConnection,
        timestamp: new Date().toISOString()
    });
});

// Debug route to test JWT token decoding
router.post('/debug-token', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.SECRET_KEY);
        res.json({
            message: 'Token decoded successfully',
            decodedData: {
                email: decoded.email,
                _id: decoded._id,
                name: decoded.name,
                role: decoded.role,
                // Show structure without sensitive data
                hasPassword: !!decoded.password
            }
        });
    } catch (error) {
        res.status(403).json({ error: 'Invalid token', details: error.message });
    }
});



router.post('/buycourse', verifyToken, async (req, res) => {
    console.log('Buy course request received:', req.body);
    console.log('User from token:', req.user);
    
    const { amount, courseId } = req.body;
    
    // Get email and userId from the verified token instead of request body
    const email = req.user.email;
    const userId = req.user._id;

    // Validate required fields
    if (!email || !amount || !courseId || !userId) {
        console.log('Missing required fields:', { email: !!email, amount: !!amount, courseId: !!courseId, userId: !!userId });
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        console.log('Invalid email format:', email);
        return res.status(400).json({ error: 'Invalid email format provided' });
    }

    // Validate amount
    if (isNaN(amount) || amount <= 0) {
        console.log('Invalid amount:', amount);
        return res.status(400).json({ error: 'Invalid amount provided' });
    }

    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
    
    if (!paystackSecretKey) {
        console.error('Paystack secret key not found in environment variables');
        return res.status(500).json({ error: 'Payment service configuration error' });
    }

    try {
        // Ensure amount is a number and convert to kobo (multiply by 100)
        const amountInKobo = parseInt(amount) * 100;
        console.log('Payment details:', { email, amount, amountInKobo, courseId, userId });
        
        // Initialize payment with Paystack
        const paymentInitResponse = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            {
                email,
                amount: amountInKobo, // Amount in kobo
                callback_url: `https://lms-xfl6.vercel.app/verifypayment/${courseId}`, // Update for local development
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

        console.log('Paystack response:', paymentInitResponse.data);

        // Extract the payment authorization URL from the response
        const paymentLink = paymentInitResponse.data?.data?.authorization_url;

        // If the paymentLink exists, return it to the frontend
        if (paymentLink) {
            console.log('Payment link generated successfully:', paymentLink);
            return res.json({ paymentLink });
        } else {
            console.error('No authorization URL in Paystack response');
            return res.status(500).json({ error: 'Failed to get payment link from Paystack' });
        }
    } catch (error) {
        // Handle the error properly
        console.error('Paystack API error details:');
        console.error('Error message:', error.message);
        console.error('Error response:', error.response?.data);
        console.error('Error status:', error.response?.status);
        
        const errorMessage = error.response?.data?.message || error.message || 'Payment initialization failed';
        return res.status(500).json({ 
            error: 'Payment initialization failed',
            details: errorMessage
        });
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
                userId: new ObjectId(userId),
                courseId: new ObjectId(courseId),
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

module.exports = router;
