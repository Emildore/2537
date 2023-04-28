const express = require('express');

const session = require('express-session');

const app = express();

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

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});