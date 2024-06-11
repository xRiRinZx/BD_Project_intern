var express = require('express');
var cors = require('cors');
var app = express();
var bodyParser = require('body-parser');
var jsonParser = bodyParser.json();
const bcrypt = require('bcrypt');
const saltRounds = 10;
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

const config = require('./config');
const database = require('./database');
app.use(cors());

dotenv.config();

// == Register ==
function registerUser (req , res , next){
    if (!req.body.email || !req.body.password || !req.body.firstname || !req.body.lastname) {
        return res.json({ status: 'error', message: 'Please fill out the information completely.' });
    }

    database.executeQuery(
        'SELECT COUNT(1) as num FROM User WHERE email = ? LIMIT 1',
        [req.body.email],
        function(err, result) {
            if (err) {
                return res.json({ status: 'error', message: err });
            }
            // Check account same as Database
            if (result[0].num > 0) {
                console.log('Query result:', result);
                return res.json({ status: 'error', message: 'This account has been registered.' });
            }
        
            bcrypt.hash(req.body.password, saltRounds, (err, hash) => {
                if (err) {
                    console.log('hash error');
                    return res.json({ status: 'error', message: 'Hash error' });
                }

            // Hashing successful, Store in Database
            console.log('Hashed password:', hash);
            database.executeQuery(
                'INSERT INTO User (email , password , firstname , lastname ) VALUES (?, ?, ?, ?)',
                    [req.body.email , hash , req.body.firstname , req.body.lastname],
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
    )
}

// == Login ==
function loginUser(req, res, next) {
    if (!req.body.email || !req.body.password) {
        return res.json({ status: 'error', message: 'Username and password are required' });
    }

        database.executeQuery(
            'SELECT * FROM User WHERE email = ?',
            [req.body.email],
            function (err, email, fields) {
                if (err) {
                    res.json({ status: 'error', message: err });
                    return;
                }
                if (email.length == 0) {
                    res.json({ status: 'error', message: 'No user found' });
                    return;
                }
                bcrypt.compare(req.body.password, email[0].password, (err, result) => {
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
                                email: email[0].email,
                                firstname: email[0].firstname,
                                lastname: email[0].lastname,
                            },
                                config.screct,
                                { expiresIn: config.tokenExp }
                            );
                            res.json({ status: 'ok', message: 'Login success', token });
                            } else {
                                // Passwords don't match, authentication failed
                                res.json({ status: 'error', message: 'Login failed' });
                            }
                })
            }
        )
}

// == Extend Token ==
function extendToken(req, res, next) {
    try {
        const token = req.headers.authorization.split(' ')[1];
        var decoded = jwt.verify(token, config.screct);
        const newToken = jwt.sign(
            {
                email: decoded.email,
                firstname: decoded.firstname,
                lastname: decoded.lastname
            },
            config.screct,
            { expiresIn: config.tokenExp }
        );
        res.setHeader('Authorization', 'Bearer ' + newToken);
        // New token --> response
        res.locals.newToken = newToken;
        next();
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}
                         
// == Get User ==
function getUser(req, res, next) {
    try {
        const token = req.headers.authorization.split(' ')[1];
        var decoded = jwt.verify(token, config.screct);
        res.json({ status: 'ok', Data: { User: decoded }, token: res.locals.newToken });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}


app.post('/register', jsonParser, registerUser)
app.post('/login', jsonParser, loginUser);
app.get('/user', jsonParser, extendToken, getUser);

app.listen(3000, function () {
    console.log('CORS-enabled web server listening on port 3000');
});

