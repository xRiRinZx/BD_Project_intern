var express = require('express');
var cors = require('cors');
var app = express();
var bodyParser = require('body-parser');
var jsonParser = bodyParser.json();
const bcrypt = require('bcrypt');
const saltRounds = 10;
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const screct = 'Tlogin';

const database = require('./database');
app.use(cors());

dotenv.config();

// == Register ==
function registerUser (req , res , next){
    if (!req.body.username || !req.body.password || !req.body.firstname || !req.body.lastname) {
        return res.json({ status: 'error', message: 'Please fill out the information completely.' });
    }

    bcrypt.hash(req.body.password, saltRounds, (err, hash) => {
        if (err) {
            console.log('hash error');
            return res.json({ status: 'error', message: 'Hash error' });
        }

    // Hashing successful, Store in Database And Return
    console.log('Hashed password:', hash);
    database.executeQuery(
        'INSERT INTO User (username , password , firstname , lastname ) VALUES (?, ?, ?, ?)',
            [req.body.username , hash , req.body.firstname , req.body.lastname],
            function (err, result) {
                if (err) {
                    res.json({ status: 'error', message: err });
                    return;
                }
                res.json({ status: 'ok', message: 'User registered successfully' });
            }
        )
    })
}

function loginUser(req, res, next) {
    if (!req.body.username || !req.body.password) {
        return res.json({ status: 'error', message: 'Username and password are required' });
    }

        database.executeQuery(
            'SELECT * FROM User WHERE username = ?',
            [req.body.username],
            function (err, user, fields) {
                if (err) {
                    res.json({ status: 'error', message: err });
                    return;
                }
                if (user.length == 0) {
                    res.json({ status: 'error', message: 'No user found' });
                    return;
                }
                bcrypt.compare(req.body.password, user[0].password, (err, result) => {
                    if (err) {
                        // Handle error
                        console.error('Error comparing passwords:', err);
                        return;
                    }
                    if (result) {
                        // Passwords match, authentication successful
                        console.log('Passwords match! User authenticated.');
                        var token = jwt.sign(
                            {
                                username: user[0].username,
                                firstname: user[0].firstname,
                                lastname: user[0].lastname,
                            },
                                screct
                            );
                            res.json({ status: 'ok', message: 'Login success', token });
                            } else {
                                // Passwords don't match, authentication failed
                                res.json({ status: 'error', message: 'Login failed' });
                            }
                 });
        });
    }
                        


function getUser(req, res, next) {
    try {
        const token = req.headers.authorization.split(' ')[1];
        var decoded = jwt.verify(token, screct);
        res.json({ status: 'ok', Data: { User: decoded } });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}

app.post('/register', jsonParser, registerUser)
app.post('/login', jsonParser, loginUser);
app.get('/user', jsonParser, getUser);

app.listen(3000, function () {
    console.log('CORS-enabled web server listening on port 3000');
});

