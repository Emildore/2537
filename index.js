const express = require('express');

const session = require('express-session');

const app = express();

app.use(express.urlencoded({extended: false}));

const port = process.env.PORT || 3000;

const node_session_secret = '018b2db5-23f7-48c7-9049-3049ba4c7d4b'; // Define the variable here

app.use(session({
    secret: node_session_secret,
    //store: mongoStore, //default is memory store
    saveUninitialized: false,
    resave: true
}
));

// var numPageHits = 0;

app.get('/', (req, res) => {
    if (req.session.numPageHits == null) {
        req.session.numPageHits = 0;
    } else {
        req.session.numPageHits++;
    }
    res.send('You have hit ' + req.session.numPageHits + ' times\n');
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