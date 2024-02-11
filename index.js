const express = require('express')
require("dotenv").config();
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");


const app = express();
const PORT = process.env.PORT || 8080;

// ------------------
// Middleware
// ------------------
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());

// ---------------------------------------------------------------
// MongoDB connection
// ---------------------------------------------------------------
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vs5jjxp.mongodb.net/?retryWrites=true&w=majority`;
// mongodb+srv://omorfaruk113311:<password>@cluster0.vs5jjxp.mongodb.net/?retryWrites=true&w=majority


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();



    // Right your code here
    // ---------------------------------------------
    // Database connection
    // ---------------------------------------------
    const database = client.db("Fs_project");
    // ---------------------------------------------
    // MongoDB collection
    // ---------------------------------------------
    const userCollection = database.collection("users");




    // ---------------------------------------------
    // Multer storage configuration for profile images
    // ---------------------------------------------
    const storage = multer.diskStorage({
      destination: function (req, file, cb) {
        const username = req.body.username; // Assuming username is sent in the request body
        const userUploadsFolder = path.join('uploads', username);

        // Create the user-specific folder if it doesn't exist
        fs.mkdir(userUploadsFolder, { recursive: true })
          .then(() => cb(null, userUploadsFolder))
          .catch((error) => cb(error));
      },
      filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
      },
    });

    // Filter function to accept only specific image file types
    const fileFilter = function (req, file, cb) {
      // Check file extension
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
      const fileExtension = path.extname(file.originalname).toLowerCase();

      if (allowedExtensions.includes(fileExtension)) {
        cb(null, true); // Accept file
      } else {
        cb(new Error('Only JPG, JPEG, PNG, and GIF files are allowed')); // Reject file
      }
    };

    const upload = multer({ storage: storage, fileFilter: fileFilter });




    // ---------------------------------------------
    // POST USER with profile image upload
    // ---------------------------------------------
    app.post("/users", upload.single('profileImage'), async (req, res) => {
      try {
        const username = req.body.username;

        // Check if username is missing
        if (!username) {
          return res.status(400).send({ message: "username is required." });
        }

        const user = req.body;
        const query = { email: user.email };
        // const userName = { username: user.username };

        // Check if user with the same email already exists
        const existingUser = await userCollection.findOne(query);

        // const existingUsername = await userCollection.findOne(userName);

        // if (existingUsername) {
        //   return res.send({ message: "Username already exists" });
        // }

        if (existingUser) {
          // If user exists, remove uploaded file if it exists
          if (req.file) {
            fs.unlink(req.file.path, (err) => {
              if (err) {
                console.error('Error deleting file:', err);
              }
            });
          }
          return res.send({ message: "User already exists" });
        }

        // Check if profile image is missing
        if (!req.file) {
          return res.status(400).send({ message: "Profile image is required." });
        }

        // Attach the profile image filename to the user object
        user.profileImage = req.file.filename;

        // Insert the user into the MongoDB collection
        const result = await userCollection.insertOne(user);

        // Send the response
        res.send(result);
      } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ message: 'Internal server error' });
      }
    });



    // // ---------------------------------------------
    // // POST USER with profile image upload
    // // ---------------------------------------------
    // app.post("/users", upload.single('profileImage'), async (req, res) => {
    //   const user = req.body;
    //   user.profileImage = req.file ? req.file.filename : null; // Attach filename to user profileImage field

    //   const query = { email: user.email };
    //   const existingUser = await userCollection.findOne(query);

    //   if (existingUser) {
    //     return res.send({ message: "User already exists" });
    //   }

    //   const result = await userCollection.insertOne(user);
    //   res.send(result);
    // });


    // Nodemailer configuration
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'your_email@gmail.com',
        pass: 'your_password'
      }
    });

    // Register a new user
    app.post('/register', async (req, res) => {
      const { email, password } = req.body;

      // Check if user already exists
      const existingUser = await userCollection.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }

      try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert the user into the MongoDB collection
        await userCollection.insertOne({ email, password: hashedPassword });

        res.status(201).json({ message: 'User registered successfully' });
      } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ message: 'Internal server error' });
      }
    });

    // Login user
    app.post('/login', async (req, res) => {
      const { email, password } = req.body;

      // Find user by email
      const user = await userCollection.findOne({ email });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      try {
        // Compare passwords
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (passwordMatch) {
          // Generate JWT token
          const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET);
          return res.status(200).json({ token });
        } else {
          return res.status(401).json({ message: 'Invalid credentials' });
        }
      } catch (error) {
        console.error('Error logging in user:', error);
        res.status(500).json({ message: 'Internal server error' });
      }
    });

    // Reset password
    app.post('/reset-password', async (req, res) => {
      const { email } = req.body;

      // Find user by email
      const user = await userCollection.findOne({ email });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      try {
        // Generate reset token
        const resetToken = jwt.sign({ email: user.email }, process.env.RESET_SECRET, { expiresIn: '1h' });

        // Send reset email
        const mailOptions = {
          from: process.env.EMAIL,
          to: email,
          subject: 'Password Reset',
          text: `Use this token to reset your password: ${resetToken}`
        };

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error('Error sending reset email:', error);
            res.status(500).json({ message: 'Error sending reset email' });
          } else {
            console.log('Reset email sent:', info.response);
            res.status(200).json({ message: 'Reset email sent' });
          }
        });
      } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ message: 'Internal server error' });
      }
    });








    // ----------------------------------------------
    // Send a ping to confirm a successful connection
    // ----------------------------------------------
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server route");
});

app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
