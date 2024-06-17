const jwt = require('jsonwebtoken');
const config = require('./config');
const dotenv = require('dotenv');

dotenv.config();

// == Extend Token ==
function CheckandExtendToken(req, res, next) {
    try {
        const token = req.headers.authorization.split(' ')[1];
        var decoded = jwt.verify(token, config.screct);
        const newToken = jwt.sign(
            {
                user_id: decoded.user_id,
                email: decoded.email,
                firstname: decoded.firstname,
                lastname: decoded.lastname
            },
            config.screct,
            { expiresIn: config.tokenExp }
        );
        res.setHeader('Authorization', 'Bearer ' + newToken);
        // New token --> response
        res.locals.user = decoded;
        res.locals.newToken = newToken;
        console.log('New token:', newToken);
        next();
    } catch (err) {
        res.json({ status: 'error', message: 'Invalid or expired token' });
    }
}

module.exports = CheckandExtendToken;