const express = require("express")
const database = require("./connect")
const ObjectId = require("mongodb").ObjectId
const bycriptjs = require("bcryptjs")
const jwt = require("jsonwebtoken")
require("dotenv").config({path:"./config.env"})
const multer = require('multer');
const streamifier = require('streamifier'); 
const cloudinary = require('./cloudinaryConfig');

const storage = multer.memoryStorage(); // Store image in memory temporarily
const upload = multer({ storage: multer.memoryStorage() });

let userRoutes = express.Router()
const SALT_ROUNDS = 6
//get all
userRoutes.route("/user").get(async (request, response) => {
    let db = database.getDb()
    let data = await db.collection("users").find({}).toArray()
        if(data.length > 0){
            response.json(data)
        } else {
            throw new Error("something went wrong :(")
        }
})

//get one
userRoutes.route("/user/:id").get(async (request, response) => {
    let db = database.getDb()
    let data = await db.collection("users").findOne({
        _id: new ObjectId(request.params.id)
    })
    try{
        if(Object.keys(data).length > 0){
            response.json(data)
        }
    }catch(error){
        throw new Error(error, "something went wrong")
    }
})

//create one
userRoutes.route("/user").post(async (request, response) => {
    let db = database.getDb()
const takenEmail = await db.collection("users").findOne({email: request.body.email})
if(takenEmail) {
    response.json({message: "The user already exist"})
}else{
    const hash = await bycriptjs.hash(request.body.password, SALT_ROUNDS)
    const profileImageUrl = request.file ? request.file.path : null;
    let mongoObject = {
        name:request.body.name,
        email:request.body.email,
        password:hash,
        joinDate: new Date(),
        role: request.body.role, 
        profileImage: profileImageUrl,
        courses: []
    }
    let data = await db.collection("users").insertOne(mongoObject)
    response.json(data)
}
   
})

// //update one
// userRoutes.route("/user/:id").put(upload.fields([{ name: 'profileImage' }]), async (request, response) => {
//     let db = database.getDb()
//     let profileImageUrl = request.file ? request.file.path : request.body.currentProfileImage;
//     let mongoObject = {
//         $set:{
//             name:request.body.name,
//             email:request.body.email,
//             password:request.body.password,
//             joinDate: request.body.joinDate,
//             role: request.body.role, 
//             courses: request.body.courses,
//             profileImage: profileImageUrl
//         }
//     }
//     let data = await db.collection("users").updateOne({_id: new ObjectId(request.params.id)}, mongoObject)
//     response.json(data)
// })

// userRoutes.route("/user/:id").put(upload.fields([{ name: 'profileImage' }]), async (request, response) => {
//     let db = database.getDb();

//     // Check if the ID is a valid ObjectId
//     if (!ObjectId.isValid(request.params.id)) {
//         return response.status(400).json({ error: "Invalid user ID format" });
//     }

//     // Handle profile image
//     let profileImageUrl = request.file ? request.file.path : request.body.currentProfileImage;

//     // Construct the update object
//     let mongoObject = {
//         $set: {
//             name: request.body.name,
//             email: request.body.email,
//             password: request.body.password,
//             joinDate: request.body.joinDate,
//             role: request.body.role,
//             courses: request.body.courses,
//             profileImage: profileImageUrl
//         }
//     };

//     try {
//         // Update the user by their ObjectId
//         let data = await db.collection("users").updateOne(
//             { _id: new ObjectId(request.params.id) },
//             mongoObject
//         );

//         // Check if the user was updated
//         if (data.matchedCount === 0) {
//             return response.status(404).json({ error: "User not found" });
//         }

//         response.json({ success: true, data });
//     } catch (error) {
//         console.error("Error updating user:", error);
//         response.status(500).json({ error: "An error occurred while updating the user" });
//     }
// });


// userRoutes.route("/user/:id").put(upload.fields([{ name: 'profileImage' }]), async (request, response) => {
//     let db = database.getDb();

//     // Check if the ID is valid
//     if (!ObjectId.isValid(request.params.id)) {
//         return response.status(400).json({ error: "Invalid user ID format" });
//     }

//     let profileImageUrl = request.file ? request.file.path : request.body.currentProfileImage;

//     // Log the incoming request data for debugging
//     console.log("Incoming request body:", request.body);

//     // Fetch the current user data from the database for comparison
//     let existingUser = await db.collection("users").findOne({ _id: new ObjectId(request.params.id) });
//     console.log("Existing user data:", existingUser);

//     let mongoObject = {
//         $set: {
//             name: request.body.name,
//             email: request.body.email,
//             password: request.body.password,
//             joinDate: request.body.joinDate,
//             role: request.body.role,
//             profileImage: profileImageUrl
//         }
//     };

//     try {
//         let data = await db.collection("users").updateOne(
//             { _id: new ObjectId(request.params.id) },
//             mongoObject
//         );

//         if (data.matchedCount === 0) {
//             return response.status(404).json({ error: "User not found" });
//         }

//         response.json({ success: true, data });
//     } catch (error) {
//         console.error("Error updating user:", error);
//         response.status(500).json({ error: "An error occurred while updating the user" });
//     }
// });




userRoutes.route("/user/:id").put(upload.fields([{ name: 'profileImage' }]), async (request, response) => {
    let db = database.getDb();

    // Check if the ID is valid
    if (!ObjectId.isValid(request.params.id)) {
        return response.status(400).json({ error: "Invalid user ID format" });
    }

    // Log the incoming request body and files for debugging
    console.log("Incoming request body:", request.body);
    console.log("Incoming files:", request.files);

    let profileImageUrl = null;

    // If there's a new profile image, upload it to Cloudinary
    if (request.files && request.files.profileImage) {
        const file = request.files.profileImage[0];

        // Upload the image to Cloudinary using streams
        try {
            const result = await new Promise((resolve, reject) => {
                streamifier.createReadStream(file.buffer).pipe(
                    cloudinary.uploader.upload_stream({ folder: 'learning/profileImages' }, (error, result) => {
                        if (error) return reject(error);
                        resolve(result);
                    })
                );
            });

            profileImageUrl = result.secure_url; // Get the URL of the uploaded image
        } catch (uploadError) {
            console.error("Error uploading to Cloudinary:", uploadError);
            return response.status(500).json({ error: "Error uploading image to Cloudinary" });
        }
    } else {
        // If no new image, use the current profile image if provided
        profileImageUrl = request.body.currentProfileImage;
    }

    // Construct the update object, but only include fields that are provided
    let mongoObject = {
        $set: {}
    };

    // Conditionally add each field if provided in the request
    if (request.body.name) mongoObject.$set.name = request.body.name;
    if (request.body.email) mongoObject.$set.email = request.body.email;
    if (request.body.password) mongoObject.$set.password = request.body.password;
    if (request.body.joinDate) mongoObject.$set.joinDate = request.body.joinDate;
    if (request.body.role) mongoObject.$set.role = request.body.role;
    if (request.body.courses) mongoObject.$set.courses = request.body.courses;
    if (profileImageUrl) mongoObject.$set.profileImage = profileImageUrl;

    try {
        // Update the user document in the database
        let data = await db.collection("users").updateOne(
            { _id: new ObjectId(request.params.id) },
            mongoObject
        );

        // Check if any document was matched and updated
        if (data.matchedCount === 0) {
            return response.status(404).json({ error: "User not found" });
        }

        // Successfully updated
        response.json({ success: true, data });
    } catch (error) {
        console.error("Error updating user:", error);
        response.status(500).json({ error: "An error occurred while updating the user" });
    }
});




//delete one
userRoutes.route("/users/:id").delete(async (request, response) => {
    let db = database.getDb()
    let data = await db.collection("users").deleteOne({
        _id: new ObjectId(request.params.id)
    })
    response.json(data)
})


//login
userRoutes.route("/user/login").post(async (request, response) => {
    let db = database.getDb()
const user = await db.collection("users").findOne({email: request.body.email})

if(user) {
let confirmation = await bycriptjs.compare(request.body.password, user.password)
if(confirmation){
const token = jwt.sign(user, process.env.SECRET_KEY, {expiresIn:"1hr"})

    response.json({success:true, token})
}else{
    response.json({success:false, message: "Incorrect password"})
}
}else{
    response.json({success: false, message: "User not found"})
}
   
})


module.exports = userRoutes