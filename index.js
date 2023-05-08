require("./utils.js");
require('dotenv').config();
const url = require('url');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const Joi = require('joi');

const port = process.env.PORT || 3000;
const app = express();
const saltRounds = 12;
const expireTime = 1000 * 60 * 60; // 1 Hour

const { database } = include('databaseConnection');
const userCollection = database.db(process.env.MONGODB_DATABASE).collection("users");

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));

app.use(session({
    secret: process.env.NODE_SESSION_SECRET,
    store: MongoStore.create({
        mongoUrl: `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/test`,
        crypto: { secret: process.env.MONGODB_SESSION_SECRET }
    }),
    saveUninitialized: false,
    resave: true
}));

const navLinks = [
    { name: "Home", link: "/" },
    { name: "Members", link: "/members" },
];

app.use((req, res, next) => {
    app.locals.authenticated = req.session.authenticated;
    app.locals.user_type = req.session.user_type;
    app.locals.username = req.session.username;
    app.locals.navLinks = navLinks;
    app.locals.currentURL = url.parse(req.url).pathname;
    app.locals.error = req.query.error;
    app.locals.req = req;
    next();
});


app.get('/', (req, res) => {
    res.render('index');
});

app.get('/signUp', (req,res) => {
    res.render('signUp');
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
        await userCollection.insertOne({username: username, password: hashedPassword, email: email, userType: "user"});
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

    res.render('login');
});

app.post('/loggingIn', async (req, res) => {
    const { identifier, password } = req.body;
    const blankFields = [
        !identifier && "identifier",
        !password && "password",
    ].filter(Boolean);

    if (blankFields.length) {
        res.redirect(`/login?blankFields=${blankFields.join(',')}`);
        return;
    }

    const schema = Joi.string().max(20).required();
    if (schema.validate(identifier).error) {
        res.redirect('/login?blankFields=true');
        return;
    }

    const query = identifier.includes('@') ? { email: identifier } : { username: identifier };
    const result = await userCollection
        .find(query)
        .project({ username: 1, password: 1, user_type: 1, _id: 1 })
        .toArray();

    if (result.length !== 1) {
        res.redirect('/login?loginError=true');
        return;
    }

    if (await bcrypt.compare(password, result[0].password)) {
        req.session.authenticated = true;
        req.session.username = result[0].username;
        req.session.user_type = result[0].user_type;
        req.session.cookie.maxAge = expireTime;

        res.redirect('/members');
    } else {
        res.redirect('/login?loginError=true');
    }
});

app.get('/members', sessionValidation, (req, res) => {
    const images = [
        '/Cat1.jpg',
        '/Cat2.jpg',
        '/Cat3.jpg'
    ];

    // Render the members.ejs template with the images
    res.render('members', { images, justSignedUp: req.session.justSignedUp });

    // Reset the justSignedUp flag
    req.session.justSignedUp = false;
});

function isValidSession(req) {
    return req.session.authenticated;
}

function sessionValidation(req, res, next) {
    isValidSession(req) ? next() : res.redirect('/login?notLoggedIn=true');
}

function isAdmin(req) {
    return req.session.user_type == 'admin';
}

function adminAuthorization(req, res, next) {
    if (!req.session.authenticated) {
        res.redirect('/login');
        return;
    }

    if (!isAdmin(req)) {
        res.status(403);
        res.render("adminNotAuth", {error: 'You are not authorized to view this page'});
        return;
    }

    next();
}

app.get('/admin', sessionValidation, adminAuthorization, async (req,res) => {
    const result = await userCollection.find().project({username: 1, email: 1,user_type: 1, _id: 0}).toArray();

    res.render('admin', {users: result});
});

app.post('/toggleAdminStatus', sessionValidation, adminAuthorization, async (req, res) => {
    const username = req.body.username;
  
    const user = await userCollection.findOne({ username });
  
    const newUserType = user.user_type === "admin" ? "user" : "admin";
    await userCollection.updateOne({ username }, { $set: { user_type: newUserType } });

    if (req.session.username === username && newUserType === "user") {
        req.session.user_type = "user";
    }
  
    // Redirect back to the admin page to see the updated user list
    res.redirect('/admin');

  });

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.render('logout', { authenticated: false });
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