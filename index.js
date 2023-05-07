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

app.set('view engine', 'ejs');

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
    res.render('index', {req: req});
});

app.get('/signUp', (req,res) => {
    let error = req.query.error;
    res.render('signUp', {error: error, req: req});
});

app.post('/submitUser', async (req,res) => {
    var username = req.body.username;
    var password = req.body.password;
    var email = req.body.email;

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

    // Joi validation to check if the submitted username, password, and email meet specific requirements when signing up a new user.
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
        if (existingUser.username.toLowerCase() === username.toLowerCase()) {
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
    req.session.message = `Successfully Signed Up: ${username}.`;
    req.session.justSignedUp = true; // set flag to indicate that the user just signed up

    // redirect to members page
    res.redirect('/members');
});

app.get('/login', (req,res) => {
    if (req.session.authenticated) { // Check if session exists
        return res.redirect('/members'); // Redirect to members page
    }

    res.render('login', { req: req });
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

    //set session variables
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
        return res.redirect('/?notLoggedIn=true');
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

    // Render the members.ejs template with the necessary variables
    res.render('members', {
        username: req.session.username,
        justSignedUp: req.session.justSignedUp,
        image: req.session.image
    });

    // Reset the justSignedUp flag
    req.session.justSignedUp = false;
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.render('logout');
});

app.get("/does_not_exist", (req, res) => {
    res.status(404);
    res.render('notFound');
});

app.use(express.static(__dirname + "/public"));

app.get("*", (req,res) => {
    res.redirect('/does_not_exist');
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});