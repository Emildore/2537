require("./utils.js")

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const saltRounds = 12;

const port = process.env.PORT || 3000;

const app = express();

const Joi = require('joi');

const expireTime = 1000 * 60 * 60 ; // 1 Hour

/* Secret information section */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const node_session_secret = process.env.NODE_SESSION_SECRET;
/* End secret information section */

var {database} = include('databaseConnection');

const userCollection = database.db(mongodb_database).collection("users");

app.use(express.urlencoded({extended: false}));

var mongoStore = MongoStore.create({
    mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/test`,
    crypto: {
        secret: mongodb_session_secret
    }
})

app.use(session({
    secret: node_session_secret,
        store: mongoStore, //default is memory store
        saveUninitialized: false,
        resave: true
}
));

app.get('/', (req, res) => {

    var html = `
    <h1> Comp 2537 <br> Assignment 1 <br> Home Page</h1>
    `

    if (req.session.authenticated) {
        // User is logged in
        html += `
        <h2>Hello, ${req.session.username}!</h2>
        <form action='/members' method='get'>
            <button type='submit'>Members Area</button>
        </form>
        <form action='/logout' method='post'>
            <button type='submit'>Log out</button>
        </form>
        `;
    } else {
        // User is not logged in
        html += `
        <form action='/signUp' method='get'>
            <button type='submit'>Sign Up</button>
        </form>
        <form action='/login' method='get'>
            <button type='submit'>Login</button>
        </form>
        `;
    }

    if (req.query.notLoggedIn) {
        html += "<p style='color: red;'>You must be logged in to access the members page.</p>";
    }

    res.send(html);
});

app.get('/signUp', (req,res) => {
    var error = req.query.error;
    var errorMessage = "";

    if (error === "username") {
        errorMessage = "<p style='color: red;'>Username already exists. Please choose a different username.</p>";
      } else if (error === "email") {
        errorMessage = "<p style='color: red;'>Email address already in use. Please choose a different email address.</p>";
      }
    
    var passwordMessage = "<p style='color: gray;'>Password must contain at least <br> 1 special character,<br> 1 upper case letter,<br> 1 number, <br>and be at least 6 characters long.</p>";

    if (req.query.error && req.query.error.includes("password")) {
        var passwordMessage = "<p style='color: red;'>Password must contain at least <br> 1 special character,<br> 1 upper case letter,<br> 1 number, <br>and be at least 6 characters long.</p>";
        passwordMessage += "<p style='color: red;'>Please try again.</p>";
    }

    if (req.query.blankUsername) {
        errorMessage += "<p style='color: red;'>Username field cannot be left blank.</p>";
    }

    if (req.query.blankEmail) {
        errorMessage += "<p style='color: red;'>Email field cannot be left blank.</p>";
    }

    if (req.query.blankPassword) {
        errorMessage += "<p style='color: red;'>Password field cannot be left blank.</p>";
    }
    
    var html = `
        <h1>Sign Up: </h1>
        ${errorMessage}
        <form action='/submitUser' method='post'>
        <input name='username' type='text' placeholder='username'><br><br>
        <input name='email' type='email' placeholder='email'><br>
        ${passwordMessage}
        <input name='password' type='password' placeholder='password'><br><br>
        <button>Submit</button>
        </form>
        <form action='/' method='get'>
        <button type='submit'>Back</button>
        </form>
    `;
    res.send(html);
});

app.post('/submitUser', async (req,res) => {
    var username = req.body.username.toLowerCase();
    var password = req.body.password;
    var email = req.body.email.toLowerCase();

    const queryParams = [];
    if (!username) {
        queryParams.push("blankUsername=true");
    }

    if (!password) {
        queryParams.push("blankPassword=true");
    }

    if (!email) {
        queryParams.push("blankEmail=true");
    }

    if (queryParams.length > 0) {
        res.redirect(`/signUp?${queryParams.join('&')}`);
        return;
    }

    // Joi validation to check if the submitted username, password, and email meet specific requirements when signing up a new user.
    const schema = Joi.object(
        {
        username: Joi.string().alphanum().max(20).required(),
        password: Joi.string().regex(/^(?=.*[!@#$%^&*])(?=.*[A-Z])(?=.*[0-9])(?=.{6,})/).required(),
        email: Joi.string().email().required()
        }
    );

    const validationResult = schema.validate({username, password, email});
    if (validationResult.error != null) {
        console.log(validationResult.error);
        res.redirect('/signUp?error=password');
        return;
    }

    const existingUser = await userCollection.findOne({
        $or: [
          { username: { $regex: new RegExp(`^${username}$`, "i") } }, // case-insensitive match for username
          { email: { $regex: new RegExp(`^${email}$`, "i") } } // case-insensitive match for email
        ]
    });

    if (existingUser) {
        if (existingUser.username.toLowerCase() === username) {
        res.redirect('/signUp?error=username');
        return;
        } else {
        res.redirect('/signUp?error=email');
        return;
        }
    }

    var hashedPassword = await bcrypt.hash(password, saltRounds);
        await userCollection.insertOne({username: username, password: hashedPassword, email: email});
        console.log("inserted user");

    req.session.authenticated = true;
    req.session.username = username;

    var html = `<h2>Successfully Signed Up: ${username}</h2> <form action='/members' method='get'><button type='submit'>Members Page</button></form>`;
    res.send(html);
});

app.get('/login', (req,res) => {
    if (req.session.authenticated) { // Check if session exists
        return res.redirect('/members'); // Redirect to members page
    }

    var html = `
    <h1>Login:</h1>
        <form action='/loggingIn' method='post'>
            <input name='identifier' type='text' placeholder='username or email'><br><br>
            <input name='password' type='password' placeholder='password'><br><br>
            <button>Submit</button>
        </form>
        <form action='/' method='get'>
        <button type='submit'>Back</button>
        </form>
    `;
    if (req.query.loginError) {
        html += "<p style='color: red;'>Invalid username and/or password</p>";
    }

    var blankFields = req.query.blankFields;
    if (blankFields) {
        const fields = blankFields.split(',');
        fields.forEach(field => {
            if (field === "identifier") {
                html += "<p style='color: red;'>Username or email field cannot be left blank.</p>";
            } else if (field === "password") {
                html += "<p style='color: red;'>Password field cannot be left blank.</p>";
            }
        });
    }
    
    res.send(html);
});

app.post('/loggingIn', async (req,res) => {
    var identifier = req.body.identifier;
    var password = req.body.password;

    const blankFields = [];
    if (!identifier) {
        blankFields.push("identifier");
    }

    if (!password) {
        blankFields.push("password");
    }

    if (blankFields.length > 0) {
        res.redirect(`/login?blankFields=${blankFields.join(',')}`);
        return;
    }

    // Joi validation to check if the submitted identifier (username or email) meets specific requirements when logging in.
    const schema = Joi.string().max(20).required();
    const validationResult = schema.validate(identifier);
    if (validationResult.error != null) {
        console.log(validationResult.error);
        res.redirect('/login?blankFields=true');
        return;
    }

    let query;
    if (identifier.includes('@')) { // Check if the identifier is an email
        query = { email: identifier };
    } else {
        query = { username: identifier };
    }

    const result = await userCollection
        .find(query)
        .project({username: 1, password: 1, _id: 1})
        .toArray();
    console.log(result);
    
    if (result.length != 1) {
        console.log("User Not Found");
        res.redirect('/login?loginError=true');
        return;
    }

    if (await bcrypt.compare(password, result[0].password)) {
        console.log("Correct password");
        req.session.authenticated = true;
        req.session.username = result[0].username;
        req.session.cookie.maxAge = expireTime;

        res.redirect('/members');
        return;
    } else {
        console.log("Incorrect password");
        res.redirect('/login?loginError=true');
        return;
    }
});

app.get('/members', (req,res) => {
    if (!req.session.authenticated) {
        return res.redirect('/?notLoggedIn=true')
    }

    // Array of image URLs
    const images = [
    '/Cat1.jpg',
    '/Cat2.jpg',
    '/Cat3.jpg'
    ];

    // Generate random index for image array
    const randomIndex = Math.floor(Math.random() * images.length);

    // Set image URL in session
    req.session.image = images[randomIndex];

    var html = `
    <h2>${req.session.username}'s Page</h2>
    <img src="${req.session.image}" width="300" height="400"><br><br>
    <form action="/" method="get">
    <button type="submit">Home</button>
    </form>
    <form action="/logout" method="post">
        <button type="submit">Log out</button>
    </form>
    `;
    res.send(html);
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    var html = `
      <div>You are logged out.</div><br>
      <form action="/" method="get">
        <button type="submit">Home</button>
      </form>
    `;
    res.send(html);
});

app.get("/does_not_exist", (req, res) => {
    res.status(404);
    var html = `<h1>404 - Page Not Found</h1>`;
    res.send(html);
});

app.use(express.static(__dirname + "/public"));

app.get("*", (req,res) => {
    res.redirect('/does_not_exist');
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});