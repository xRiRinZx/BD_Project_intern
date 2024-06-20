const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
const database = require('./database');
const nodemailer = require('nodemailer')
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const config = require('./config');
const AuthenAndgetUser = require('./Authen_getUser');

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
                'INSERT INTO User (email , password , firstname , lastname , verification_token , is_verified) VALUES (?, ?, ?, ?, NULL , 0)',
                    [req.body.email , hash , req.body.firstname , req.body.lastname ],
                    function (err, result) {
                        if (err) {
                            res.json({ status: 'error', message: err });
                            return;
                        }
                        //Send verification email
                        sendVerificationEmail({ email: req.body.email })
                            .then(() => {
                                console.log('Verification email sent.');
                                res.json({ status: 'ok', message: 'User registered successfully. Please verify your email.' });
                            })
                            .catch((err) => {
                                console.error('Error sending verification email:', err);
                                res.json({ status: 'error', message: err.message });
                            });
                    }
                )
            })
        }
    )
}

// == sendEmailVerification ==
async function sendVerificationEmail(user){
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const updateTokenQuery = 'UPDATE User SET verification_token = ? WHERE email = ?'
    
    const checkResult = await new Promise((resolve, reject)=>{
        database.executeQuery(updateTokenQuery,[verificationToken, user.email], (err , results)=>{
            if (err) {
                console.error('Error updating verification token:', err);
                reject(err);
            } else {
                console.log('Verification token updated in database for email:', user.email);
                resolve(results);
            }
        })
    })
    const verificationUrl = `${process.env.API_URL}/verify-email?token=${verificationToken}&email=${user.email}`;
    const transporter = nodemailer.createTransport({
        service:'Gmail',
        // host: process.env.API_URL,  // เปลี่ยนเป็น Host ของ SMTP Server ที่คุณใช้
        // port: 465,  // เปลี่ยนเป็น Port ของ SMTP Server ที่คุณใช้ (เช่น 465 สำหรับ SSL, 587 สำหรับ TLS)
        // secure: true,  // เปลี่ยนเป็น true หากใช้ SSL, เปลี่ยนเป็น false หากใช้ TLS
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    })

    //email format send
    const mailOption = {
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: 'Email Verification',
        text: `Please verify your email by clicking on the following link: ${verificationUrl}`,
        html: `<p>Please verify your email by clicking on the following link:</p><a href="${verificationUrl}">${verificationUrl}</a>`
    }

    //send email
    try {
        await transporter.sendMail(mailOption);
        console.log('Verification email sent');
    } catch (error) {
        console.error('Error sending verification email:', error);
        throw error;
    }
}

//== VerifyEmail ==
async function VerifyEmail(req, res, next){
    const {token, email} = req.query;

    if(!token || !email) {
        return res.json({ status: 'error', message: 'Invalid request'})
    }

    try {
        const checkQuery = 'SELECT * FROM User WHERE email = ? AND verification_token = ?'
        const user = await new Promise((resolve,reject)=>{
            database.executeQuery(checkQuery,[email, token],(err,results)=>{
                if (err) reject(err);
                else resolve(results[0]);
            })
        })
        if (!user) {
            return res.json({ status: 'error', message: 'Invalid token or email' });
        }

        const updateQuery = 'UPDATE User SET is_verified = 1, verification_token = NULL WHERE email = ?'
        await new Promise((resolve,reject)=>{
            database.executeQuery(updateQuery,[email],(err,results)=>{
                if (err) {
                    console.error('Error updating user verification status:', err);
                    reject(err);
                } else {
                    console.log('User email verified:', email);
                    resolve(results);
                }
            });
        })
        res.redirect('/email-verified');
    } catch (err){
        console.error('Verification error:', err);
        res.json({ status: 'error', message: err.message});
    }
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
                    res.json({ status: 'error', message: 'Wrong email or password' });
                    return;
                }
                // Check if the user is verified
                if (!email[0].is_verified) {
                    return res.json({ status: 'error', message: 'Please verify your email before logging in.' });
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
                                user_id: email[0].user_id,
                                email: email[0].email,
                                firstname: email[0].firstname,
                                lastname: email[0].lastname,
                            },
                                config.screct,
                                { expiresIn: config.tokenExp }
                            );
                            res.json({ status: 'ok', message: 'Login Success', data:{token} });
                    } else {
                         // Passwords don't match, authentication failed
                            res.json({ status: 'error', message: 'Wrong email or password' });
                    }
                })
            }
        )
}

// == Edit Profile ==
function editProfile(req, res, next){
    const user_id = res.locals.user.user_id;
    if (!user_id || !req.body.firstname || !req.body.lastname) {
        return res.json({ status: 'error', message: 'Please fill out the information completely.' });
    }

    database.executeQuery(
        'UPDATE User SET firstname = ? , lastname = ? WHERE user_id = ?',
        [req.body.firstname , req.body.lastname , user_id],
        function (err, result) {
            if (err) {
                res.json({ status: 'error', message: err });
                return;
            }
            res.json({ status: 'ok', message: 'Edit Profile successfully' });
        }
    )
}
                         
// == ExtendToken ==
function Extend(req, res, next) {
    try {
        const token = req.headers.authorization.split(' ')[1];
        var decoded = jwt.verify(token, config.screct);
        const user_id = res.locals.user.user_id;

        database.executeQuery(
            'SELECT user_id, email, firstname, lastname FROM User WHERE user_id = ?',
            [user_id],
            function (err, results) {
                if (err) {
                    return res.json({ status: 'error', message: err.message });
                }

                if (results.length === 0) {
                    return res.json({ status: 'error', message: 'User not found' });
                }

                const user = results[0];
                const newToken = jwt.sign(
                    {
                        user_id: user.user_id,
                        email: user.email,
                        firstname: user.firstname,
                        lastname: user.lastname,
                    },
                    config.screct,
                    { expiresIn: config.tokenExp }
                );

                res.setHeader('Authorization', 'Bearer ' + newToken);
                res.locals.user = user;
                res.locals.newToken = newToken;
                console.log('New token:', newToken);
                res.json({
                    status: 'ok',
                    message: 'Get UpdateDataUser & New TokenUser Success',
                    data: { user, token: newToken }
                });
            }
        );
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}




router.post('/login', jsonParser, loginUser);
router.post('/register', jsonParser, registerUser);
router.get('/verify-email', VerifyEmail);
router.get('/user', jsonParser, AuthenAndgetUser , Extend);
router.put('/edit', jsonParser, AuthenAndgetUser , editProfile);

module.exports = router;