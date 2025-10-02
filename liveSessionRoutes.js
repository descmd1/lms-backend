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

// Get live session details
liveSessionRoutes.route("/live-session/:sessionId").get(verifyToken, async (request, response) => {
    try {
        const { sessionId } = request.params;
        const userId = request.user._id;
        const userRole = request.user.role;
        const db = database.getDb();
        
        const session = await db.collection("liveSessions").findOne({ _id: createObjectId(sessionId) });

        if (!session) {
            return response.status(404).json({ error: "Session not found" });
        }

        // Check if user has access to this session
        if (userRole !== 'tutor') {
            let enrollment = await db.collection("enrollments").findOne({
                userId: createObjectId(userId),
                courseId: session.courseId
            });

            if (!enrollment) {
                enrollment = await db.collection("enrollments").findOne({
                    userId: userId,
                    courseId: session.courseId
                });
            }

            if (!enrollment) {
                enrollment = await db.collection("enrollments").findOne({
                    userId: createObjectId(userId),
                    courseId: session.courseId.toString()
                });
            }

            if (!enrollment) {
                enrollment = await db.collection("enrollments").findOne({
                    userId: userId,
                    courseId: session.courseId.toString()
                });
            }

            if (!enrollment) {
                return response.status(403).json({ error: "You must be enrolled in this course to view session details" });
            }
        }

        response.json({
            session: {
                _id: session._id,
                title: session.title,
                description: session.description,
                tutorId: session.tutorId,
                status: session.status,
                participantCount: session.participants.length,
                participants: session.participants,
                maxParticipants: session.maxParticipants,
                scheduledDateTime: session.scheduledDateTime,
                duration: session.duration
            }
        });

    } catch (error) {
        console.error("Error fetching live session details:", error);
        response.status(500).json({ error: "Failed to fetch session details", message: error.message });
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
        console.log("Checking enrollment for:", {
            userId: userId,
            userIdType: typeof userId,
            courseId: session.courseId,
            courseIdType: typeof session.courseId,
            userRole: request.user.role
        });

        // Try multiple query formats to handle both string and ObjectId storage
        let enrollment = await db.collection("enrollments").findOne({
            userId: createObjectId(userId),
            courseId: session.courseId
        });
        console.log("Enrollment attempt 1 (ObjectId userId, ObjectId courseId):", enrollment ? "Found" : "Not found");

        // If not found with ObjectId, try with string userId (for backward compatibility)
        if (!enrollment) {
            enrollment = await db.collection("enrollments").findOne({
                userId: userId,
                courseId: session.courseId
            });
            console.log("Enrollment attempt 2 (string userId, ObjectId courseId):", enrollment ? "Found" : "Not found");
        }

        // Also try string courseId in case of mixed formats
        if (!enrollment) {
            enrollment = await db.collection("enrollments").findOne({
                userId: createObjectId(userId),
                courseId: session.courseId.toString()
            });
            console.log("Enrollment attempt 3 (ObjectId userId, string courseId):", enrollment ? "Found" : "Not found");
        }

        // Try both as strings
        if (!enrollment) {
            enrollment = await db.collection("enrollments").findOne({
                userId: userId,
                courseId: session.courseId.toString()
            });
            console.log("Enrollment attempt 4 (string userId, string courseId):", enrollment ? "Found" : "Not found");
        }

        if (!enrollment && request.user.role !== 'tutor') {
            console.log("No enrollment found and user is not a tutor. Rejecting access.");
            return response.status(403).json({ error: "You must be enrolled in this course to join the live session" });
        }

        console.log("Access granted. Enrollment found or user is tutor.");

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

// Send chat message in live session
liveSessionRoutes.route("/live-session/:sessionId/message").post(verifyToken, async (request, response) => {
    try {
        const { sessionId } = request.params;
        const { message, timestamp } = request.body;
        const userId = request.user._id;
        const userName = request.user.name;
        const userRole = request.user.role;
        const db = database.getDb();
        
        // Verify session exists and user is participant or tutor
        const session = await db.collection("liveSessions").findOne({ _id: createObjectId(sessionId) });
        if (!session) {
            return response.status(404).json({ error: "Session not found" });
        }

        // Check if user is enrolled in the course or is the tutor
        const enrollment = await db.collection("enrollments").findOne({
            userId: createObjectId(userId),
            courseId: session.courseId
        });

        if (!enrollment && userRole !== 'tutor') {
            return response.status(403).json({ error: "You must be enrolled in this course to send messages" });
        }

        // Create message object
        const chatMessage = {
            sessionId: createObjectId(sessionId),
            userId: createObjectId(userId),
            userName: userName,
            userRole: userRole,
            message: message,
            timestamp: new Date(timestamp || Date.now()),
            createdAt: new Date()
        };

        // Store message in database
        await db.collection("sessionMessages").insertOne(chatMessage);

        console.log(`Chat message stored for session ${sessionId} from ${userName}: ${message}`);

        response.json({ 
            message: "Message sent successfully",
            messageData: {
                id: chatMessage._id,
                userName: chatMessage.userName,
                userRole: chatMessage.userRole,
                message: chatMessage.message,
                timestamp: chatMessage.timestamp
            }
        });

    } catch (error) {
        console.error("Error sending chat message:", error);
        response.status(500).json({ error: "Failed to send message", message: error.message });
    }
});

// Get chat messages for a live session
liveSessionRoutes.route("/live-session/:sessionId/messages").get(verifyToken, async (request, response) => {
    try {
        const { sessionId } = request.params;
        const userId = request.user._id;
        const userRole = request.user.role;
        const db = database.getDb();
        
        // Verify session exists and user is participant or tutor
        const session = await db.collection("liveSessions").findOne({ _id: createObjectId(sessionId) });
        if (!session) {
            return response.status(404).json({ error: "Session not found" });
        }

        // Check if user is enrolled in the course or is the tutor
        const enrollment = await db.collection("enrollments").findOne({
            userId: createObjectId(userId),
            courseId: session.courseId
        });

        if (!enrollment && userRole !== 'tutor') {
            return response.status(403).json({ error: "You must be enrolled in this course to view messages" });
        }

        // Get messages for this session
        const messages = await db.collection("sessionMessages")
            .find({ sessionId: createObjectId(sessionId) })
            .sort({ timestamp: 1 })
            .toArray();

        const formattedMessages = messages.map(msg => ({
            id: msg._id,
            type: 'chat-message',
            text: msg.message,
            userName: msg.userName,
            userRole: msg.userRole,
            timestamp: msg.timestamp.toISOString()
        }));

        response.json({ messages: formattedMessages });

    } catch (error) {
        console.error("Error fetching chat messages:", error);
        response.status(500).json({ error: "Failed to fetch messages", message: error.message });
    }
});

// Send a chat message in a live session
liveSessionRoutes.route("/live-session/:sessionId/message").post(verifyToken, async (request, response) => {
    try {
        const { sessionId } = request.params;
        const { message, timestamp } = request.body;
        const userId = request.user._id;
        const userName = request.user.name;
        const userRole = request.user.role;
        const db = database.getDb();
        
        // Verify session exists and user has access
        const session = await db.collection("liveSessions").findOne({ _id: createObjectId(sessionId) });

        if (!session) {
            return response.status(404).json({ error: "Session not found" });
        }

        // Check if user is enrolled or is the tutor (same logic as join endpoint)
        if (userRole !== 'tutor') {
            console.log("Checking enrollment for message:", {
                userId: userId,
                userIdType: typeof userId,
                courseId: session.courseId,
                courseIdType: typeof session.courseId,
                userRole: userRole
            });

            // Try multiple query formats to handle both string and ObjectId storage
            let enrollment = await db.collection("enrollments").findOne({
                userId: createObjectId(userId),
                courseId: session.courseId
            });
            console.log("Message enrollment attempt 1 (ObjectId userId, ObjectId courseId):", enrollment ? "Found" : "Not found");

            // If not found with ObjectId, try with string userId (for backward compatibility)
            if (!enrollment) {
                enrollment = await db.collection("enrollments").findOne({
                    userId: userId,
                    courseId: session.courseId
                });
                console.log("Message enrollment attempt 2 (string userId, ObjectId courseId):", enrollment ? "Found" : "Not found");
            }

            // Also try string courseId in case of mixed formats
            if (!enrollment) {
                enrollment = await db.collection("enrollments").findOne({
                    userId: createObjectId(userId),
                    courseId: session.courseId.toString()
                });
                console.log("Message enrollment attempt 3 (ObjectId userId, string courseId):", enrollment ? "Found" : "Not found");
            }

            // Try both as strings
            if (!enrollment) {
                enrollment = await db.collection("enrollments").findOne({
                    userId: userId,
                    courseId: session.courseId.toString()
                });
                console.log("Message enrollment attempt 4 (string userId, string courseId):", enrollment ? "Found" : "Not found");
            }

            if (!enrollment) {
                console.log("No enrollment found for messaging. Rejecting access.");
                return response.status(403).json({ error: "You must be enrolled in this course to send messages" });
            }

            console.log("Message access granted. Enrollment found.");
        }

        // Create chat message object
        const chatMessage = {
            sessionId: createObjectId(sessionId),
            userId: createObjectId(userId),
            userName: userName,
            userRole: userRole,
            message: message,
            timestamp: new Date(timestamp || new Date()),
            createdAt: new Date()
        };

        // Store message in database
        console.log('Storing chat message:', chatMessage);
        const result = await db.collection("chatMessages").insertOne(chatMessage);
        console.log('Message stored with ID:', result.insertedId);
        
        // Return the created message
        response.json({
            message: "Message sent successfully",
            chatMessage: {
                ...chatMessage,
                _id: result.insertedId
            }
        });

    } catch (error) {
        console.error("Error sending chat message:", error);
        response.status(500).json({ error: "Failed to send message", message: error.message });
    }
});

// Get chat messages for a live session
liveSessionRoutes.route("/live-session/:sessionId/messages").get(verifyToken, async (request, response) => {
    try {
        const { sessionId } = request.params;
        const userId = request.user._id;
        const userRole = request.user.role;
        const db = database.getDb();
        
        // Verify session exists and user has access
        const session = await db.collection("liveSessions").findOne({ _id: createObjectId(sessionId) });

        if (!session) {
            return response.status(404).json({ error: "Session not found" });
        }

        // Check if user is enrolled or is the tutor (same logic as join endpoint)
        if (userRole !== 'tutor') {
            // Try multiple query formats to handle both string and ObjectId storage
            let enrollment = await db.collection("enrollments").findOne({
                userId: createObjectId(userId),
                courseId: session.courseId
            });

            // If not found with ObjectId, try with string userId (for backward compatibility)
            if (!enrollment) {
                enrollment = await db.collection("enrollments").findOne({
                    userId: userId,
                    courseId: session.courseId
                });
            }

            // Also try string courseId in case of mixed formats
            if (!enrollment) {
                enrollment = await db.collection("enrollments").findOne({
                    userId: createObjectId(userId),
                    courseId: session.courseId.toString()
                });
            }

            // Try both as strings
            if (!enrollment) {
                enrollment = await db.collection("enrollments").findOne({
                    userId: userId,
                    courseId: session.courseId.toString()
                });
            }

            if (!enrollment) {
                return response.status(403).json({ error: "You must be enrolled in this course to view messages" });
            }
        }

        // Get chat messages for this session
        const messages = await db.collection("chatMessages")
            .find({ sessionId: createObjectId(sessionId) })
            .sort({ timestamp: 1 })
            .toArray();
        
        console.log(`Found ${messages.length} messages for session ${sessionId}`);
        console.log('Messages:', messages);
        
        response.json({
            messages: messages,
            count: messages.length
        });

    } catch (error) {
        console.error("Error fetching chat messages:", error);
        response.status(500).json({ error: "Failed to fetch messages", message: error.message });
    }
});

module.exports = liveSessionRoutes;