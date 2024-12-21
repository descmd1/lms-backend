const express = require("express")
const database = require("./connect")
const ObjectId = require("mongodb").ObjectId
const jwt = require("jsonwebtoken")
require("dotenv").config({path: "./config.env"})
const streamifier = require('streamifier');
const multer = require('multer');
const cloudinary = require('./cloudinaryConfig');
const mongoose = require('mongoose')

// Multer setup for image file uploads
const storage = multer.memoryStorage(); // Store image in memory temporarily
const upload = multer({ storage: multer.memoryStorage() });
let postRoutes = express.Router()

// //get all
postRoutes.route("/course").get(verifyToken, async (request, response) => {
    let db = database.getDb();
    try {
        let data = await db.collection("courses").find({}).toArray();

        if (data.length > 0) {
            response.json(data);
        } else {
            response.status(404).json({ message: "No courses found" });
        }
    } catch (error) {
        response.status(500).json({ error: "Something went wrong", message: error.message });
    }
});


// Get a single course by ID and track visits
postRoutes.route("/course/:id").get(verifyToken, async (request, response) => {
    let db = database.getDb();
    try {
        let data = await db.collection("courses").findOne({
            _id: new ObjectId(request.params.id)
        });

        if (data) {
            // Log the visit in the course_visits collection
            await db.collection("course_visits").insertOne({
                courseId: request.params.id,
                visitedAt: new Date(),
                userId: request.user ? request.user._id : null // If logged in, associate with the user
            });

            response.json(data); // Return the course with its chapters
        } else {
            response.status(404).json({ message: "Course not found" });
        }
    } catch (error) {
        response.status(500).json({ error: "Something went wrong", message: error.message });
    }
});

// //create one
postRoutes.route("/course").post(
    verifyToken, 
    upload.fields([
        { name: 'image' }, 
        { name: 'chapters[0][video]' }, 
        { name: 'chapters[1][video]' }, 
        { name: 'chapters[2][video]' }
    ]), 
    async (request, response) => {
        let db = database.getDb();

        try {
            let imageUrl = '';
            let chapterVideos = []; // Array to hold chapter video URLs

            // Upload the image to Cloudinary if a file is included
            if (request.files.image) {
                console.log("Uploading image...");
                const imageResult = await new Promise((resolve, reject) => {
                    streamifier.createReadStream(request.files.image[0].buffer).pipe(
                        cloudinary.uploader.upload_stream({ folder: 'learning/images' }, (error, result) => {
                            if (error) {
                                console.error("Image upload error:", error);
                                return reject(error);
                            }
                            console.log("Image uploaded successfully:", result);
                            resolve(result);
                        })
                    );
                });
                imageUrl = imageResult.secure_url; // Get the uploaded image URL
            }
            
            // Extract chapters from the request body
            let chapters = [];
            if (request.body.chapters) {
                // Ensure chapters is parsed correctly
                chapters = Array.isArray(request.body.chapters) ? request.body.chapters : JSON.parse(request.body.chapters);
                console.log("Parsed chapters:", chapters); 

// Upload videos for each chapter if they exist
for (let index = 0; index < chapters.length; index++) {
    const chapter = chapters[index]; // Get the current chapter
    const videoFileKey = `chapters[${index}][video]`; // Use index to access the correct key
    if (request.files[videoFileKey] && request.files[videoFileKey][0]) {
        const videoResult = await new Promise((resolve, reject) => {
            streamifier.createReadStream(request.files[videoFileKey][0].buffer).pipe(
                cloudinary.uploader.upload_stream({ resource_type: 'video', folder: 'learning/videos' }, (error, result) => {
                    if (error) {
                        console.error("Video upload error:", error);
                        return reject(error);
                    }
                    resolve(result);
                })
            );
        });
        chapterVideos.push(videoResult.secure_url); // Add each uploaded video URL to the array
    } else {
        chapterVideos.push(null); // If no video, push null
    }
}
            }
            // Create the course object including chapters and their videos
            let mongoObject = {
                title: request.body.title,
                description: request.body.description,
                content: request.body.content,
                price: request.body.price,
                duration: request.body.duration,
                author: request.user?.name,
                published: false, // Always set published to false during creation
                category: request.body.category,
                dateCreated: new Date(request.body.dateCreated), // Ensure date is stored as a Date object
                image: imageUrl,
                chapters: chapters.map((chapter, index) => ({
                    title: chapter.title,
                    content: chapter.content,
                    video: chapterVideos[index] // Attach the corresponding video URL
                })),
                 // Add enrolledUsers array, initially empty
                 enrolledUsers: []
            };

            // Save the course to the database
            let data = await db.collection("courses").insertOne(mongoObject);
            response.json(data);

        } catch (error) {
            console.error("Error during course creation:", error); // Log the error for debugging
            response.status(500).json({ error: 'Course creation failed', message: error.message });
        }
    }
);

// //update one
postRoutes.route("/course/:id").put(
    verifyToken,
    upload.fields([{ name: 'image' }, { name: 'chapters[0][video]' }, { name: 'chapters[1][video]' }, { name: 'chapters[2][video]' }]), 
    async (request, response) => {
        let db = database.getDb();
        let mongoObject = {
            $set: {
                title: request.body.title,
                description: request.body.description,
                content: request.body.content,
                price: request.body.price,
                duration: request.body.duration,
                author: request.user?.name || request.body.author,
                published: request.body.published === 'true',
                category: request.body.category,
                dateCreated: request.body.dateCreated,
                chapters: request.body.chapters // Expecting chapters to be an array
            }
        };

        try {
            // Update the course in the database
            let data = await db.collection("courses").updateOne(
                { _id: new ObjectId(request.params.id) }, 
                mongoObject
            );

            if (data.matchedCount === 0) {
                return response.status(404).json({ message: "Course not found" });
            }

            // Handle image upload
            if (request.files.image) {
                const imageResult = await new Promise((resolve, reject) => {
                    streamifier.createReadStream(request.files.image[0].buffer).pipe(
                        cloudinary.uploader.upload_stream({ folder: 'learning/images' }, (error, result) => {
                            if (error) return reject(error);
                            resolve(result);
                        })
                    );
                });
                await db.collection("courses").updateOne(
                    { _id: new ObjectId(request.params.id) }, 
                    { $set: { image: imageResult.secure_url } }
                );
            }

            // Handle video uploads
            if (request.files) {
                let chapters = Array.isArray(request.body.chapters) ? request.body.chapters : JSON.parse(request.body.chapters);
                let chapterVideos = []; // Array to hold chapter video URLs

                for (let index = 0; index < chapters.length; index++) {
                    const chapter = chapters[index];
                    const videoFileKey = `chapters[${index}][video]`; // Use index to access the correct key

                    if (request.files[videoFileKey] && request.files[videoFileKey][0]) {
                        const videoResult = await new Promise((resolve, reject) => {
                            streamifier.createReadStream(request.files[videoFileKey][0].buffer).pipe(
                                cloudinary.uploader.upload_stream({ resource_type: 'video', folder: 'learning/videos' }, (error, result) => {
                                    if (error) return reject(error);
                                    resolve(result);
                                })
                            );
                        });
                        chapterVideos.push(videoResult.secure_url); // Add each uploaded video URL to the array
                    } else {
                        chapterVideos.push(chapter.video || null); // Retain existing video if none is uploaded
                    }
                }

                // Update chapters with new video URLs
                await db.collection("courses").updateOne(
                    { _id: new ObjectId(request.params.id) }, 
                    { $set: { chapters: chapters.map((chapter, index) => ({ ...chapter, video: chapterVideos[index] })) } } 
                );
            }

            response.json({ success: true, message: "Course updated successfully", data });

        } catch (error) {
            console.error("Error during course update:", error);
            response.status(500).json({ error: "Course update failed", message: error.message });
        }
    }
);

//delete one
postRoutes.route("/course/:id").delete(verifyToken, async (request, response) => {
    let db = database.getDb()
    let data = await db.collection("courses").deleteOne({
        _id: new ObjectId(request.params.id)
    })
    response.json(data)
})

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

// Route for enrolling in a course
postRoutes.route("/course/:id/enroll").post(verifyToken, async (request, response) => {
    let db = database.getDb();
    try {
        // Find the course by its ID
        let course = await db.collection("courses").findOne({
            _id: new ObjectId(request.params.id)
        });

        if (course) {
            // Check if the user is already enrolled
            let isEnrolled = course.enrolledUsers.some(enrollment => 
                enrollment.userId.equals(new ObjectId(request.user._id))
            );
            

            if (isEnrolled) {
                return response.status(400).json({ message: "User is already enrolled in this course" });
            }

            // Add the user to the enrolledUsers array
            await db.collection("courses").updateOne(
                { _id: new ObjectId(request.params.id) },
                {
                    $push: {
                        enrolledUsers: {
                            userId: new ObjectId(request.user._id),
                            enrollmentDate: new Date(),
                            status: 'ongoing'
                        }
                    }
                }
            );
            

            response.json({ message: "User enrolled successfully" });
        } else {
            response.status(404).json({ message: "Course not found" });
        }
    } catch (error) {
        response.status(500).json({ error: "Something went wrong", message: error.message });
    }
});

// Route to update course status (e.g., marking as completed)
postRoutes.route("/course/:id/update-status").post(verifyToken, async (request, response) => {
    let db = database.getDb();
    try {
        // Find the course by its ID
        let course = await db.collection("courses").findOne({
            _id: new ObjectId(request.params._id)
        });

        if (course) {
            // Update the status of the enrolled user
            await db.collection("courses").updateOne(
                { _id: new ObjectId(request.params._id), "enrolledUsers.userId": new ObjectId(request.user._id) },
                {
                    $set: {
                        "enrolledUsers.$.status": request.body.status // e.g., 'completed'
                    }
                }
            );
            

            response.json({ message: "Course status updated successfully" });
        } else {
            response.status(404).json({ message: "Course not found" });
        }
    } catch (error) {
        response.status(500).json({ error: "Something went wrong", message: error.message });
    }
});

// Fetch enrolled courses for a user
postRoutes.route("/enrolledcourses").get(verifyToken, async (request, response) => {
    let db = database.getDb()
    // Now it should correctly reference req.user.id
    try {
        const userId = request.user._id;
        // Fetch enrolled courses based on user ID
const userEnrollments = await db.collection("enrollments").find({ userId: userId }).toArray();
if (userEnrollments.length === 0) {
    return response.status(404).json({ message: "No enrolled courses found" });
}
// Fetch course details based on the enrolled course IDs
const courseIds = userEnrollments.map(enrollment => enrollment.courseId);
const enrolledCourses = await db.collection("courses").find({ _id: { $in: courseIds.map(id => new ObjectId(id)) } }).toArray();
        response.json(enrolledCourses);
    } catch (error) {
        console.error('Error fetching enrolled courses:', error);
        return response.status(500).json({ error: 'Failed to fetch enrolled courses' });
    }
});

// Fetch ongoing courses for a user
postRoutes.route("/ongoingcourses").get(verifyToken, async (request, response) => {
    let db = database.getDb();
    try {
        const userId = request.user._id;
        const courseOngoings = await db.collection("enrollments").find({ userId: userId }).toArray();
if (courseOngoings.length === 0) {
    return response.status(404).json({ message: "No ongoing courses found" });
}
        // const ongoingCourses = await db.collection("enrollments").find({ userId: userId, status: 'ongoing' }).toArray();
        // Fetch course details based on the enrolled course IDs
const courseIds = courseOngoings.map(ongoing => ongoing.courseId);
const ongoingCourses = await db.collection("courses").find({ _id: { $in: courseIds.map(id => new ObjectId(id)) } }).toArray();
        response.json(ongoingCourses);
    } catch (error) {
        console.error('Error fetching ongoing courses:', error);
        return response.status(500).json({ error: 'Failed to fetch ongoing courses' });
    }
});

// // Fetch completed courses for a user
// router.get('/completedcourses', verifyToken, async (req, res) => {
//     let db = database.getDb();
//     const userId = req.user.id;

//     try {
//         const completedCourses = await db.collection("enrollments").find({ userId: userId, status: 'completed' }).toArray();
//         res.json(completedCourses);
//     } catch (error) {
//         console.error('Error fetching completed courses:', error);
//         return res.status(500).json({ error: 'Failed to fetch completed courses' });
//     }
// });

// postRoutes.route("/completedcourses").get(verifyToken, async (request, response) => {
//     let db = database.getDb();
//     const { courseId } = request.body;
//     const userId = request.user._id;

//     try {
//         const result = await db.collection("enrollments").updateOne(
//             { userId: userId, courseId: courseId },
//             { $set: { status: 'completed' } }
//         );

//         if (result.modifiedCount > 0) {
//             response.json({ message: 'Course marked as completed' });
//         } else {
//             response.status(404).json({ error: 'Enrollment not found or already completed' });
//         }
//     } catch (error) {
//         console.error('Error completing course:', error);
//         return response.status(500).json({ error: 'Failed to complete course' });
//     }
// });

postRoutes.route("/completedcourses").get(verifyToken, async (request, response) => {
    let db = database.getDb();
    const userId = request.user._id;

    try {
        // Fetch all completed courses for the user
        const completeCourses = await db.collection("enrollments").find({ userId: userId, status: 'completed' }).toArray();

        if (completeCourses.length === 0) {
            // return response.status(404).json({ message: "No completed courses found" });
            return response.json([]); 
        }

        const courseIds = completeCourses.map(courseCompleted => courseCompleted.courseId);
        const completedCourses = await db.collection("courses").find({ _id: { $in: courseIds.map(id => new ObjectId(id)) } }).toArray();

        response.json(completedCourses);
    } catch (error) {
        console.error('Error fetching completed courses:', error);
        return response.status(500).json({ error: 'Failed to fetch completed courses' });
    }
});




postRoutes.route("/analytics/visits/:tutorId").get(verifyToken, async (req, res) => {
    let db = database.getDb();
    try {
        const tutorId = req.params.tutorId;

        // Validate the tutorId
        if (!tutorId || !mongoose.Types.ObjectId.isValid(tutorId)) {
            return res.status(400).json({ message: 'Invalid or missing Tutor ID' });
        }

        // Fetch all courseIds by this tutor
        const courses = await db.collection("courses").find({ tutorId: new ObjectId(tutorId) }).toArray();
        const courseIds = courses.map(course => new ObjectId(course._id));

        // Fetch the visit count for these courses
        const visitCount = await db.collection("visits").countDocuments({
            courseId: { $in: courseIds }
        });

        // Fetch additional statistics
        const enrolledCount = await db.collection("courses").countDocuments({
            tutorId: new ObjectId(tutorId),
            'enrolledUsers': { $elemMatch: { status: 'ongoing' } }
        });

        const completedCount = await db.collection("courses").countDocuments({
            tutorId: new ObjectId(tutorId),
            'enrolledUsers': { $elemMatch: { status: 'completed' } }
        });

        // Respond with analytics data
        res.json({
            visitCount, // Corrected visit count
            coursesCreated: courses.length,
            ongoing: enrolledCount,
            completed: completedCount
        });

    } catch (error) {
        console.error("Error fetching analytics:", error);
        res.status(500).json({ message: "Error fetching analytics", error: error.message });
    }
});

// //comments
// postRoutes.route("/comments").post(verifyToken, async (req, res) => {
//     const { courseId, commentText, parentId } = req.body;
//     const comment = await Comment.create({
//       courseId,
//       userId: req.user._id,
//       commentText,
//       parentId: parentId || null,
//       createdAt: new Date()
//     });
    
//     // Notify the teacher when a new comment is added
//     const teacher = await getTeacherByCourseId(courseId);  // Implement this helper
//     await Notification.create({
//       userId: teacher._id,
//       courseId,
//       commentId: comment._id,
//       type: 'comment',
//       isRead: false,
//       createdAt: new Date()
//     });
  
//     res.json(comment);
//   });
  
//   postRoutes.route("/comments/reply").post(verifyToken, async (req, res) => {
//     const { courseId, commentText, parentId } = req.body;
//     const reply = await Comment.create({
//       courseId,
//       userId: req.user._id,
//       commentText,
//       parentId,
//       createdAt: new Date()
//     });
  
//     // Notify the student who asked the question
//     const parentComment = await Comment.findById(parentId);
//     await Notification.create({
//       userId: parentComment.userId,
//       courseId,
//       commentId: reply._id,
//       type: 'reply',
//       isRead: false,
//       createdAt: new Date()
//     });
  
//     res.json(reply);
//   });
  
// //get notification
// postRoutes.route("/notifications").get(verifyToken, async (req, res) => {
//     const notifications = await Notification.find({ userId: req.user._id, isRead: false });
//     res.json(notifications);
//   });
  
//   //mark read notifaction
//   postRoutes.route("/notifications/:id/read").put(verifyToken, async (req, res) => {
//     await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
//     res.sendStatus(200);
//   });
  
 

// Post a comment
postRoutes.route("/comment").post(verifyToken, async (req, res) => {
    const db = database.getDb();

    try {
        const { courseId, text } = req.body;

        if (!courseId || !text) {
            return res.status(400).json({ error: "Course ID and comment text are required." });
        }

        const newComment = {
            courseId: new ObjectId(courseId), // Reference to the course
            user: req.user?.name, // Extracted from the token
            text,
            createdAt: new Date()
        };

        const result = await db.collection("comments").insertOne(newComment);

        res.status(201).json({ message: "Comment added successfully!", comment: newComment });
    } catch (error) {
        console.error("Error posting comment:", error);
        res.status(500).json({ error: "Failed to add comment." });
    }
});

// Get all comments for a specific course
postRoutes.route("/comment/:courseId").get(async (req, res) => {
    const db = database.getDb();
    const { courseId } = req.params;

    try {
        const comments = await db
            .collection("comments")
            .find({ courseId: new ObjectId(courseId) }) // Filter comments by courseId
            .sort({ createdAt: -1 }) // Sort by newest first
            .toArray();

        res.status(200).json({ comments });
    } catch (error) {
        console.error("Error fetching comments:", error);
        res.status(500).json({ error: "Failed to fetch comments." });
    }
});


// Reply to a comment
postRoutes.route("/comment/reply/:commentId").post(verifyToken, async (req, res) => {
    const db = database.getDb();
    const { commentId } = req.params;
    const { text } = req.body;

    try {
        if (!text) {
            return res.status(400).json({ error: "Reply text is required." });
        }

        // Create the reply object
        const reply = {
            user: req.user?.name, // Extract user name from the token
            text,
            createdAt: new Date()
        };

        // Update the comment document by pushing the reply into the replies array
        const result = await db.collection("comments").updateOne(
            { _id: new ObjectId(commentId) },
            { $push: { replies: reply } }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ error: "Comment not found." });
        }

        res.status(200).json({ message: "Reply added successfully!", reply });
    } catch (error) {
        console.error("Error replying to comment:", error);
        res.status(500).json({ error: "Failed to reply to the comment." });
    }
});

module.exports = postRoutes