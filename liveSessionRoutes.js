const express = require("express");
const database = require("./connect");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { sendLiveSessionNotification } = require("./emailService");
require("dotenv").config({ path: "./config.env" });

let liveSessionRoutes = express.Router();

// Test route to verify live session routes are working
liveSessionRoutes.route("/live-session/test").get((request, response) => {
    response.json({ message: "Live session routes are working!" });
});

// Test route for email functionality
liveSessionRoutes.route("/live-session/test-email").post(verifyToken, async (request, response) => {
    try {
        const { email, name } = request.body;
        
        const testSessionDetails = {
            title: "Test Live Session",
            description: "This is a test email notification",
            scheduledDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
            duration: 60,
            maxParticipants: 50
        };

        const result = await sendLiveSessionNotification(
            email || 'test@example.com',
            name || 'Test User',
            testSessionDetails,
            'student'
        );

        if (result.success) {
            response.json({ 
                message: "Test email sent successfully!", 
                messageId: result.messageId 
            });
        } else {
            response.status(500).json({ 
                error: "Failed to send test email", 
                details: result.error 
            });
        }
    } catch (error) {
        console.error("Email test error:", error);
        response.status(500).json({ 
            error: "Email test failed", 
            message: error.message 
        });
    }
});

// Middleware to verify token (using same implementation as courseRoutes)
function verifyToken(request, response, next){
    const autHeaders = request.headers["authorization"]
    const token = autHeaders && autHeaders.split(' ')[1]
    if(!token) {
        return response.status(401).json({message: "Authentication token is missing"})
    }
    jwt.verify(token, process.env.SECRET_KEY, (error, user) =>{
        if(error){
            return response.status(403).json({message: "Invalid token"}) 
        }
        request.user = user
        next()
    })
}

// Generate unique room ID
function generateRoomId() {
    return 'room_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

// Helper function to create ObjectId using mongoose (avoids corrupted mongodb driver)
function createObjectId(id) {
    return new mongoose.Types.ObjectId(id);
}

// Create a new live session
liveSessionRoutes.route("/live-session").post(verifyToken, async (request, response) => {
    try {
        const { courseId, title, description, scheduledDateTime, duration, maxParticipants } = request.body;
        
        // Verify the user is a tutor and owns the course
        const db = database.getDb();
        const course = await db.collection("courses").findOne({
            _id: createObjectId(courseId),
            author: request.user.name
        });

        if (!course) {
            return response.status(404).json({ error: "Course not found or you don't have permission" });
        }

        // Create new live session object
        const liveSessionObj = {
            courseId: createObjectId(courseId),
            tutorId: createObjectId(request.user._id),
            title,
            description,
            scheduledDateTime: new Date(scheduledDateTime),
            duration: duration || 60,
            maxParticipants: maxParticipants || 100,
            roomId: generateRoomId(),
            status: 'scheduled',
            participants: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await db.collection("liveSessions").insertOne(liveSessionObj);
        const savedSession = await db.collection("liveSessions").findOne({ _id: result.insertedId });
        
        // Send email notifications to enrolled students and tutor
        try {
            // Get course details
            const courseDetails = await db.collection("courses").findOne({
                _id: createObjectId(courseId)
            });

            // Get enrolled students for this course
            const enrollments = await db.collection("enrollments").find({
                courseId: createObjectId(courseId)
            }).toArray();

            // Get student details
            const studentIds = enrollments.map(enrollment => enrollment.userId);
            const students = await db.collection("users").find({
                _id: { $in: studentIds }
            }).toArray();

            // Get tutor details
            const tutor = await db.collection("users").findOne({
                _id: createObjectId(request.user._id)
            });

            // Prepare session details for email
            const sessionDetails = {
                title: savedSession.title,
                description: savedSession.description,
                scheduledDateTime: savedSession.scheduledDateTime,
                duration: savedSession.duration,
                maxParticipants: savedSession.maxParticipants,
                courseTitle: courseDetails?.title || 'Course'
            };

            // Send notification to tutor
            if (tutor && tutor.email) {
                sendLiveSessionNotification(
                    tutor.email,
                    tutor.firstname || tutor.name || 'Tutor',
                    sessionDetails,
                    'tutor'
                ).catch(error => {
                    console.error('Error sending email to tutor:', error);
                });
            }

            // Send notifications to all enrolled students
            students.forEach(student => {
                if (student.email) {
                    sendLiveSessionNotification(
                        student.email,
                        student.firstname || student.name || 'Student',
                        sessionDetails,
                        'student'
                    ).catch(error => {
                        console.error(`Error sending email to student ${student.email}:`, error);
                    });
                }
            });

            console.log(`Live session notifications sent to ${students.length} students and 1 tutor`);

        } catch (emailError) {
            console.error('Error sending live session notification emails:', emailError);
            // Don't fail the session creation if email sending fails
        }
        
        response.json(savedSession);

    } catch (error) {
        console.error("Error creating live session:", error);
        response.status(500).json({ error: "Failed to create live session", message: error.message });
    }
});

// Get all live sessions for a course
liveSessionRoutes.route("/live-session/course/:courseId").get(verifyToken, async (request, response) => {
    try {
        console.log("Fetching live sessions for course:", request.params.courseId);
        console.log("User requesting:", request.user);
        
        const { courseId } = request.params;
        const db = database.getDb();
        
        console.log("Database connection:", db ? "Connected" : "Not connected");
        
        const sessions = await db.collection("liveSessions").find({ 
            courseId: createObjectId(courseId) 
        }).sort({ scheduledDateTime: 1 }).toArray();

        console.log("Found sessions:", sessions.length);
        response.json(sessions);

    } catch (error) {
        console.error("Error fetching live sessions:", error);
        console.error("Error stack:", error.stack);
        response.status(500).json({ error: "Failed to fetch live sessions", message: error.message });
    }
});

// Get live sessions for a tutor
liveSessionRoutes.route("/live-session/tutor").get(verifyToken, async (request, response) => {
    try {
        if (request.user.role !== 'tutor') {
            return response.status(403).json({ error: "Access denied. Tutors only." });
        }

        const db = database.getDb();
        const sessions = await db.collection("liveSessions").find({ 
            tutorId: createObjectId(request.user._id) 
        }).sort({ scheduledDateTime: 1 }).toArray();

        response.json(sessions);

    } catch (error) {
        console.error("Error fetching tutor sessions:", error);
        response.status(500).json({ error: "Failed to fetch sessions", message: error.message });
    }
});

// Start a live session
liveSessionRoutes.route("/live-session/:sessionId/start").put(verifyToken, async (request, response) => {
    try {
        const { sessionId } = request.params;
        const db = database.getDb();
        
        const session = await db.collection("liveSessions").findOne({
            _id: createObjectId(sessionId),
            tutorId: createObjectId(request.user._id)
        });

        if (!session) {
            return response.status(404).json({ error: "Session not found or unauthorized" });
        }

        if (session.status !== 'scheduled') {
            return response.status(400).json({ error: "Session cannot be started" });
        }

        await db.collection("liveSessions").updateOne(
            { _id: createObjectId(sessionId) },
            { $set: { status: 'live', updatedAt: new Date() } }
        );

        const updatedSession = await db.collection("liveSessions").findOne({ _id: createObjectId(sessionId) });
        response.json({ message: "Session started successfully", session: updatedSession });

    } catch (error) {
        console.error("Error starting live session:", error);
        response.status(500).json({ error: "Failed to start session", message: error.message });
    }
});

// End a live session
liveSessionRoutes.route("/live-session/:sessionId/end").put(verifyToken, async (request, response) => {
    try {
        const { sessionId } = request.params;
        const { recordingUrl } = request.body;
        const db = database.getDb();
        
        const session = await db.collection("liveSessions").findOne({
            _id: createObjectId(sessionId),
            tutorId: createObjectId(request.user._id)
        });

        if (!session) {
            return response.status(404).json({ error: "Session not found or unauthorized" });
        }

        const updateFields = { status: 'completed', updatedAt: new Date() };
        if (recordingUrl) {
            updateFields.recordingUrl = recordingUrl;
        }

        await db.collection("liveSessions").updateOne(
            { _id: createObjectId(sessionId) },
            { $set: updateFields }
        );

        const updatedSession = await db.collection("liveSessions").findOne({ _id: createObjectId(sessionId) });
        response.json({ message: "Session ended successfully", session: updatedSession });

    } catch (error) {
        console.error("Error ending live session:", error);
        response.status(500).json({ error: "Failed to end session", message: error.message });
    }
});

// Join a live session
liveSessionRoutes.route("/live-session/:sessionId/join").post(verifyToken, async (request, response) => {
    try {
        const { sessionId } = request.params;
        const userId = request.user._id;
        const db = database.getDb();
        
        const session = await db.collection("liveSessions").findOne({ _id: createObjectId(sessionId) });

        if (!session) {
            return response.status(404).json({ error: "Session not found" });
        }

        // Check if user is enrolled in the course
        const enrollment = await db.collection("enrollments").findOne({
            userId: createObjectId(userId),
            courseId: session.courseId
        });

        if (!enrollment && request.user.role !== 'tutor') {
            return response.status(403).json({ error: "You must be enrolled in this course to join the live session" });
        }

        // Check if session is live
        if (session.status !== 'live') {
            return response.status(400).json({ error: "Session is not currently live" });
        }

        // Check participant limit
        if (session.participants.length >= session.maxParticipants) {
            return response.status(400).json({ error: "Session is at maximum capacity" });
        }

        // Add participant if not already present
        const existingParticipant = session.participants.find(p => p.userId.toString() === userId);
        if (!existingParticipant) {
            await db.collection("liveSessions").updateOne(
                { _id: createObjectId(sessionId) },
                { 
                    $push: { 
                        participants: {
                            userId: createObjectId(userId),
                            joinedAt: new Date()
                        }
                    },
                    $set: { updatedAt: new Date() }
                }
            );
        }

        const updatedSession = await db.collection("liveSessions").findOne({ _id: createObjectId(sessionId) });
        
        response.json({ 
            message: "Joined session successfully", 
            roomId: updatedSession.roomId,
            session: {
                _id: updatedSession._id,
                title: updatedSession.title,
                description: updatedSession.description,
                tutorId: updatedSession.tutorId,
                participantCount: updatedSession.participants.length
            }
        });

    } catch (error) {
        console.error("Error joining live session:", error);
        response.status(500).json({ error: "Failed to join session", message: error.message });
    }
});

// Leave a live session
liveSessionRoutes.route("/live-session/:sessionId/leave").post(verifyToken, async (request, response) => {
    try {
        const { sessionId } = request.params;
        const userId = request.user._id;
        const db = database.getDb();
        
        const session = await db.collection("liveSessions").findOne({ _id: createObjectId(sessionId) });

        if (!session) {
            return response.status(404).json({ error: "Session not found" });
        }

        // Find and update participant
        const participant = session.participants.find(p => p.userId.toString() === userId);
        if (participant && !participant.leftAt) {
            await db.collection("liveSessions").updateOne(
                { 
                    _id: createObjectId(sessionId),
                    "participants.userId": createObjectId(userId)
                },
                { 
                    $set: { 
                        "participants.$.leftAt": new Date(),
                        updatedAt: new Date()
                    }
                }
            );
        }

        response.json({ message: "Left session successfully" });

    } catch (error) {
        console.error("Error leaving live session:", error);
        response.status(500).json({ error: "Failed to leave session", message: error.message });
    }
});

// Update live session
liveSessionRoutes.route("/live-session/:sessionId").put(verifyToken, async (request, response) => {
    try {
        const { sessionId } = request.params;
        const { title, description, scheduledDateTime, duration, maxParticipants } = request.body;
        const db = database.getDb();
        
        const session = await db.collection("liveSessions").findOne({
            _id: createObjectId(sessionId),
            tutorId: createObjectId(request.user._id)
        });

        if (!session) {
            return response.status(404).json({ error: "Session not found or unauthorized" });
        }

        if (session.status === 'live') {
            return response.status(400).json({ error: "Cannot update a live session" });
        }

        // Build update object
        const updateFields = { updatedAt: new Date() };
        if (title) updateFields.title = title;
        if (description) updateFields.description = description;
        if (scheduledDateTime) updateFields.scheduledDateTime = new Date(scheduledDateTime);
        if (duration) updateFields.duration = duration;
        if (maxParticipants) updateFields.maxParticipants = maxParticipants;

        await db.collection("liveSessions").updateOne(
            { _id: createObjectId(sessionId) },
            { $set: updateFields }
        );

        const updatedSession = await db.collection("liveSessions").findOne({ _id: createObjectId(sessionId) });
        
        // Send email notifications if session was rescheduled
        if (scheduledDateTime && new Date(scheduledDateTime).getTime() !== new Date(session.scheduledDateTime).getTime()) {
            try {
                // Get course details
                const courseDetails = await db.collection("courses").findOne({
                    _id: session.courseId
                });

                // Get enrolled students for this course
                const enrollments = await db.collection("enrollments").find({
                    courseId: session.courseId
                }).toArray();

                // Get student details
                const studentIds = enrollments.map(enrollment => enrollment.userId);
                const students = await db.collection("users").find({
                    _id: { $in: studentIds }
                }).toArray();

                // Get tutor details
                const tutor = await db.collection("users").findOne({
                    _id: createObjectId(request.user._id)
                });

                // Prepare session details for email
                const sessionDetails = {
                    title: updatedSession.title,
                    description: updatedSession.description,
                    scheduledDateTime: updatedSession.scheduledDateTime,
                    duration: updatedSession.duration,
                    maxParticipants: updatedSession.maxParticipants,
                    courseTitle: courseDetails?.title || 'Course',
                    isRescheduled: true
                };

                // Send notification to tutor
                if (tutor && tutor.email) {
                    sendLiveSessionNotification(
                        tutor.email,
                        tutor.firstname || tutor.name || 'Tutor',
                        sessionDetails,
                        'tutor'
                    ).catch(error => {
                        console.error('Error sending reschedule email to tutor:', error);
                    });
                }

                // Send notifications to all enrolled students
                students.forEach(student => {
                    if (student.email) {
                        sendLiveSessionNotification(
                            student.email,
                            student.firstname || student.name || 'Student',
                            sessionDetails,
                            'student'
                        ).catch(error => {
                            console.error(`Error sending reschedule email to student ${student.email}:`, error);
                        });
                    }
                });

                console.log(`Live session reschedule notifications sent to ${students.length} students and 1 tutor`);

            } catch (emailError) {
                console.error('Error sending live session reschedule notification emails:', emailError);
            }
        }
        
        response.json(updatedSession);

    } catch (error) {
        console.error("Error updating live session:", error);
        response.status(500).json({ error: "Failed to update session", message: error.message });
    }
});

// Delete live session
liveSessionRoutes.route("/live-session/:sessionId").delete(verifyToken, async (request, response) => {
    try {
        const { sessionId } = request.params;
        const db = database.getDb();
        
        const session = await db.collection("liveSessions").findOne({
            _id: createObjectId(sessionId),
            tutorId: createObjectId(request.user._id)
        });

        if (!session) {
            return response.status(404).json({ error: "Session not found or unauthorized" });
        }

        if (session.status === 'live') {
            return response.status(400).json({ error: "Cannot delete a live session" });
        }

        await db.collection("liveSessions").deleteOne({ _id: createObjectId(sessionId) });
        response.json({ message: "Session deleted successfully" });

    } catch (error) {
        console.error("Error deleting live session:", error);
        response.status(500).json({ error: "Failed to delete session", message: error.message });
    }
});

module.exports = liveSessionRoutes;