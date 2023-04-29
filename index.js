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

const expireTime = 1000 * 60 * 60 * 24; // 1 day

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
    if (req.session.numPageHits == null) {
        req.session.numPageHits = 0;
    } else {
        req.session.numPageHits++;
    }
    res.send('You have hit ' + req.session.numPageHits + ' times\n');
});

app.get('/nosql-injection', async (req,res) => {
    var username = req.query.username;

    if (!username) {
        res.send(`<h3>No User Provided <br> Try: <br> /nosql-injection?user=name <br> or <br> /nosql-injection?user[$ne]=name</h3>`);
        return;
    }
    console.log("username: " + username);

    const schema = Joi.string().max(20).required();
    const validationResult = schema.validate(username);

    if (validationResult.error != null) {
        console.log(validationResult.error);
        es.send("<h1 style='color:darkred;'>A NoSQL injection attack was detected!</h1>");
        return;
    }

    const result = await userCollection.findOne({username: username}).project({username: 1, password: 1, _id: 1}).toArray();

    console.log(result);

    res.send(`<h1> Hello ${username} </h1>`);
});

app.get('/about', (req,res) => {
    var color = req.query.color;

    res.send("<h1 style='color:"+color+";'>ET</h1>");
});

app.get('/contact', (req,res) => {
    var missingEmail = req.query.missing;
    var html = `
        email address:
        <form action='/submitEmail' method='post'>
            <input name='email' type='text' placeholder='email'>
            <button>Submit</button>
        </form>
    `;
    if (missingEmail) {
        html += "<br> email is required";
    }
    res.send(html);
});

app.post('/submitEmail', (req,res) => {
    var email = req.body.email;
    if (!email) {
        res.redirect('/contact?missing=true');
    } else {
        res.send("Thanks for subscribing with your email: "+email);
    }
});

app.get('/createUser', (req,res) => {
    var html = `
    Create User:
        <form action='/submitUser' method='post'>
            <input name='username' type='text' placeholder='username'>
            <input name='password' type='password' placeholder='password'>
            <button>Submit</button>
        </form>
    `;
    res.send(html);
});

app.get('/login', (req,res) => {
    var html = `
    Login:
        <form action='/loggingIn' method='post'>
            <input name='username' type='text' placeholder='username'>
            <input name='password' type='password' placeholder='password'>
            <button>Submit</button>
        </form>
    `;
    res.send(html);
});

app.post('/submitUser', async (req,res) => {
    var username = req.body.username;
    var password = req.body.password;

    const schema = Joi.object(
        {
        username: Joi.string().alphanum().max(20).required(),
        password: Joi.string().max(20).required()
        }
    );

    const validationResult = schema.validate({username, password});
    if (validationResult.error != null) {
        console.log(validationResult.error);
        res.redirect('/createUser');
        return;
    }

    var hashedPassword = await bcrypt.hash(password, saltRounds);
        await userCollection.insertOne({username: username, password: hashedPassword});
        console.log("inserted user");

    var html = "Successfully created user: " + username + "<br><a href='/login'>Login</a>";
    res.send(html);
});

app.post('/loggingIn', async (req,res) => {
    var username = req.body.username;
    var password = req.body.password;

    const schema = Joi.string().max(20).required();
    const validationResult = schema.validate(username);
    if (validationResult.error != null) {
        console.log(validationResult.error);
        res.redirect('/login');
        return;
    }

    const result = await userCollection.find({username: username}).project({username: 1, password: 1, _id: 1}).toArray();
    console.log(result);

    if (result.length != 1) {
        console.log("User Not Found");
        res.redirect('/login');
        return;
    }

    if (await bcrypt.compare(password, result[0].password)) {
        console.log("Correct password");
        req.session.authenticated = true;
        req.session.username = username;
        req.session.cookie.maxAge = expireTime;

        res.redirect('/loggedIn');
        return;
    } else {
        console.log("Incorrect password");
        res.redirect('/login');
        return;
    }
});

app.get('/loggedIn', (req,res) => {
    if (!req.session.authenticated) {
        res.redirect('/login');
    }
    var html = `
    You are logged in!<br><br>
    <form action="/logout" method="post">
        <button type="submit">Log out</button>
    </form>
    `;
    res.send(html);
});

app.post('/logout', (req,res) => {
    req.session.destroy();
    var html = `
    You are logged out.
    `;
    res.send(html);
});

app.get('/cat/:id', (req,res) => {

    var cat = req.params.id;

    if (cat == 1) {
        res.send("Cat1: <img src='/Cat1.jpg' style='width:250px;'>");
    }
    else if (cat == 2) {
        res.send("Cat2: <img src='/Cat2.jpg' style='width:250px;'>");
    }
    else if (cat == 3) {
        res.send("Cat3: <img src='/Cat3.jpg' style='width:250px;'>");
    }
    else {
        res.send("Invalid cat id: "+cat);
    }
});


app.use(express.static(__dirname + "/public"));

app.get("*", (req,res) => {
	res.status(404);
	res.send("Page not found - 404");
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});