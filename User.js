const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
const database = require('./database');
const nodemailer = require('nodemailer')
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const saltRounds = 10;
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const config = require('./config');
const AuthenAndgetUser = require('./Authen_getUser');
const { resolve } = require('path');
const { match } = require('assert');
const moment = require('moment-timezone');
const { executeQuery } = require('./database');

dotenv.config();
moment.tz.setDefault(config.timezone);

// Multer settings for profile image upload
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'Uploads/Profile');
    },
    filename: (req, file, cb) => {
        const random = crypto.randomBytes(3).toString('hex');
        const timestamp = Date.now();
        const originalname = file.originalname;

        // Generate filename based on user_id and timestamp
        const filename = `uploadProfile_${timestamp}_${random}_${originalname}`;
        cb(null, filename);
    }
});
const ProfileUpload = multer({ storage: profileStorage });

// == Register ==
async function registerUser (req , res , next){
    const { email, password, firstname, lastname } = req.body;
    if (!req.body.email || !req.body.password || !req.body.firstname || !req.body.lastname) {
        return res.json({ status: 'error', message: 'Please fill out the information completely.' });
    }

    try {
        const checkEmailQuery = 'SELECT COUNT(1) as num FROM User WHERE email = ? LIMIT 1';
        const checkEmailResult = await executeQuery(checkEmailQuery,[email]);
        // Check account same as Database
        if (checkEmailResult[0].num > 0) {
            console.log('Query result:', checkEmailResult);
            return res.json({ status: 'error', message: 'This account has been registered.' });
        }
        const hash = await bcrypt.hash(password, saltRounds);
        // Hashing successful, Store in Database
        console.log('Hashed password:', hash);
        const insertRegisterQuery = `
            INSERT INTO User (email , password , firstname , lastname , verification_token , is_verified , profile_path) 
            VALUES (?, ?, ?, ?, NULL , 0 , "Uploads/Profile/user-profile-default.png")`;
        const insertResult = await executeQuery(insertRegisterQuery,[email, hash, firstname, lastname]);
        // Send verification email
        sendVerificationEmail({ email: req.body.email });
        console.log('Verification email sent.');
        res.json({ status: 'ok', message: 'User registered successfully. Please verify your email.' });

    } catch (error) {
        console.error('Error during registration:', error);
        res.json({ status: 'error', message: error.message });
    }
}

// == Send Verification Email ==
async function sendVerificationEmail(user) {
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const updateTokenQuery = 'UPDATE User SET verification_token = ? WHERE email = ?';

    try {
        await executeQuery(updateTokenQuery, [verificationToken, user.email]);
        console.log('Verification token updated in database for email:', user.email);

        const verificationUrl = `${process.env.API_URL}/verify-email?token=${verificationToken}&email=${user.email}`;
        const transporter = nodemailer.createTransport({
            service: 'Gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: '[BeChan] - Email Verification',
            text: `Please verify your email by clicking on the following link: ${verificationUrl}`,
            html: `<p>Please verify your email by clicking on the following link:</p><a href="${verificationUrl}">${verificationUrl}</a>`
        };

        await transporter.sendMail(mailOptions);
        console.log('Verification email sent');
    } catch (error) {
        console.error('Error sending verification email:', error);
        throw error;
    }
}

// == Verify Email ==
async function VerifyEmail(req, res, next) {
    const { token, email } = req.query;

    if (!token || !email) {
        return res.json({ status: 'error', message: 'Invalid request' });
    }

    try {
        const checkQuery = 'SELECT * FROM User WHERE email = ? AND verification_token = ?';
        const userResult = await executeQuery(checkQuery, [email, token]);
        
        if (userResult.length === 0) {
            return res.json({ status: 'error', message: 'Invalid token or email' });
        }

        const updateQuery = 'UPDATE User SET is_verified = 1, verification_token = NULL WHERE email = ?';
        await executeQuery(updateQuery, [email]);
        console.log('User email verified:', email);

        res.redirect('/email-verified');
    } catch (err) {
        console.error('Verification error:', err);
        res.json({ status: 'error', message: err.message });
    }
}

// == Login ==
async function loginUser(req, res, next) {
    const email = req.body.email;
    if (!req.body.email || !req.body.password) {
        return res.json({ status: 'error', message: 'Email and password are required' });
    }

    try {
        const emailQuery = 'SELECT * FROM User WHERE email = ?';
        const emailResult = await database.executeQuery(emailQuery, [email]);
        
        if (emailResult.length === 0) {
            return res.json({ status: 'error', message: 'Wrong email or password' });
        }

        // Check if the user is verified
        if (!emailResult[0].is_verified) {
            return res.json({ status: 'error', message: 'Please verify your email before logging in.' });
        }

        const isPasswordValid = await bcrypt.compare(req.body.password, emailResult[0].password);
        
        if (isPasswordValid) {
            // Passwords match, authentication successful
            console.log('Passwords match! User authenticated.');
            const token = jwt.sign(
                {
                    user_id: emailResult[0].user_id,
                    email: emailResult[0].email,
                    firstname: emailResult[0].firstname,
                    lastname: emailResult[0].lastname,
                    profilepath: emailResult[0].profile_path,
                },
                config.screct,
                { expiresIn: config.tokenExp }
            );
            res.json({ status: 'ok', message: 'Login Success', data: { token } });
        } else {
            // Passwords don't match, authentication failed
            res.json({ status: 'error', message: 'Wrong email or password' });
        }
    } catch (err) {
        console.error('Error during login:', err);
        res.json({ status: 'error', message: 'An error occurred during login' });
    }
}

// == Edit Profile ==
async function editProfile(req, res, next){
    const user_id = res.locals.user.user_id;
    const { firstname, lastname } = req.body;
    if (!user_id || !req.body.firstname || !req.body.lastname) {
        return res.json({ status: 'error', message: 'Please fill out the information completely.' });
    }

    try {
    const editProfileQuery = 'UPDATE User SET firstname = ? , lastname = ? WHERE user_id = ?';
    await executeQuery(editProfileQuery,[firstname, lastname, user_id]);
            res.json({ status: 'ok', message: 'Edit Profile successfully' });
    } catch (error){
        res.json({ status: 'error', message: err.message });
    }
}

         
// == ExtendToken ==
async function Extend(req, res, next) {
    try {
        const token = req.headers.authorization.split(' ')[1];
        var decoded = jwt.verify(token, config.screct);
        const user_id = res.locals.user.user_id;

        const userQuery = 'SELECT user_id, email, firstname, lastname, profile_path FROM User WHERE user_id = ?';
        const userQueryResult = await executeQuery(userQuery,[user_id]);
            if (userQueryResult.length === 0) {
                return res.json({ status: 'error', message: 'User not found' });
            }

                const user = userQueryResult[0];
                const newToken = jwt.sign(
                    {
                        user_id: user.user_id,
                        email: user.email,
                        firstname: user.firstname,
                        lastname: user.lastname,
                        profilepath: user.profile_path,
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
        } catch (error) {
        res.json({ status: 'error', message: err.message });
    }
}

// == send email ResetPassword ==
async function requestPasswordReset(req, res, next){
    const {email} = req.body;

    if (!email) {
        return res.json({ status: 'error', message: 'Email is required'});
    }
    const checkEmailQuery = 'SELECT COUNT(1) as num FROM User WHERE email = ? LIMIT 1';
    const checkEmailResult = await executeQuery(checkEmailQuery,[email]);
    // Check email Database
        if (checkEmailResult[0].num == 0) {
            console.log('Query result:', checkEmailResult);  
            return res.json({ status: 'error', message: 'no registered email.' });
        }
   
    const resetToken = crypto.randomBytes(3).toString('hex');
    const tokenExpiry = Date.now() + 30 * 60 * 1000; // 30 minutes 

    const updateTokenQuery = 'UPDATE User SET reset_token = ?,token_expiry = ? WHERE email = ?'
    await executeQuery(updateTokenQuery,[resetToken, tokenExpiry, email]);

        const transporter = nodemailer.createTransport({
            service: 'Gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        })
        const mailOption = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: '[BeChan] - ResetPassword OTP',
            text: `Your password reset token is: ${resetToken}`,
            html: `<p>Your password reset token is: <strong>${resetToken}</strong></p>`,
        }

        //send email
        try{
            await transporter.sendMail(mailOption);
            console.log('Password reset email sent');
            res.json({ status: 'ok', message: 'send email successfully'})
        } catch (err) {
            console.error('Error sending Password reset email:', err);
            res.json({ status: 'error', message: 'Error sending Password reset email'})
            throw err;
        }
}

// == Verify ResetToken ==
async function verifyResetPassword(req, res, next){
    const { token, email } = req.body;

    if (!token || !email ) {
        return res.json({ status: 'error', message: 'Please fill out the information completely.'});
    }

    try {
        const checkTokenQuery = 'SELECT * FROM User WHERE email = ? AND reset_token = ? AND token_expiry > ?';
        const user = await executeQuery(checkTokenQuery,[email, token, Date.now()]);
        
        if (!user.length) {
            return res.json({ status: 'error', message: 'Invalid or expired Reset token' });
        }
        res.json({ status: 'ok', message: 'Token is valid' });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}

//== resetPassword ==
async function resetPassword(req, res, next){
    const { token, email, new_password} = req.body;

    if (!token || !email || !new_password){
        return res.json({ status: 'error', message:'Please fill out the information completely.'})
    }

    try {
        const checkTokenQuery = 'SELECT * FROM User WHERE email = ? AND reset_token = ? AND token_expiry > ?';
        const user = await executeQuery(checkTokenQuery,[email, token, Date.now()]);
        
        if (!user.length) {
            return res.json({ status: 'error', message: 'Invalid or expired Reset token' });
        }
        const hashedPassword = await bcrypt.hash(new_password, saltRounds);
        const updatePasswordQuery = 'UPDATE User SET password = ?, reset_token = NULL, token_expiry = NULL WHERE email = ?';
        await executeQuery (updatePasswordQuery, [hashedPassword, email])
                
        res.json({ status: 'ok', message: 'Password has been reset successfully' });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}

// == change Password ==
async function changePassword(req, res, next){
    const user_id = res.locals.user.user_id;
    const {old_password , new_password} = req.body;

    if (!user_id || !old_password || !new_password) {
        return res.json({ status: 'error', message: 'Please fill out the information completely.' });
    }
     try{
        const getUserQuery = 'SELECT * FROM User WHERE user_id = ?';
        const user = await executeQuery(getUserQuery,[user_id]);
        
        if (!user.length) {
            return res.json({ status: 'error', message: 'User not found.' });
        }

        //check password
        const match = await bcrypt.compare(old_password, user[0].password);
        if (!match) {
            return res.json({ status: 'error', message: 'Old password is incorrect.' });
        }
        const hashedPassword = await bcrypt.hash(new_password , saltRounds);

        //Update to database
        const updatePasswordQuery = 'UPDATE User SET password = ? WHERE user_id = ?';
        await executeQuery(updatePasswordQuery, [hashedPassword, user_id]);
                
        res.json({ status: 'ok', message: 'Password has been changed successfully'});
     } catch (err) {
        console.error('Error changing password:', err);
        res.json({ status: 'error', message: err.message})
     }
}

//== Edit Profile-Picture ==
async function editProfilePic (req, res, next) {
    const user_id = res.locals.user.user_id;
    if (!user_id) {
        return res.json({ status: 'error', message: 'User ID is required' });
    }
    if (!req.file) {
        return res.json({ status: 'error', message: 'No file uploaded' });
    }

    const profilePath = `Uploads/Profile/${req.file.filename}`;

    const updateProfilePathQuery = `UPDATE User SET profile_path = ? WHERE user_id = ?`;
    
    try {
        await executeQuery(updateProfilePathQuery, [profilePath, user_id]);
        res.json({ status: 'ok', message: 'Profile image uploaded successfully', data:{profile_path: profilePath }});
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}

router.post('/login', jsonParser, loginUser);
router.post('/register', jsonParser, registerUser);
router.get('/verify-email', VerifyEmail);
router.get('/user', jsonParser, AuthenAndgetUser , Extend);
router.put('/edit', jsonParser, AuthenAndgetUser , editProfile);
router.put('/edit-profile-pic', jsonParser, AuthenAndgetUser , ProfileUpload.single('file'), editProfilePic);
router.post('/req-password-reset', jsonParser, requestPasswordReset);
router.post('/setnewpassword', jsonParser, resetPassword);
router.post('/verify-token-password', jsonParser, verifyResetPassword);
router.post('/changepassword', jsonParser, AuthenAndgetUser, changePassword);

module.exports = router;