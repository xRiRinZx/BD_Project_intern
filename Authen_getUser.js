const jwt = require('jsonwebtoken');
const config = require('./config');
const dotenv = require('dotenv');
const moment = require('moment-timezone');


dotenv.config();
moment.tz.setDefault(config.timezone);

// == Extend Token ==
function AuthenAndgetUser(req, res, next) {
    try {
        const token = req.headers.authorization.split(' ')[1];
        var decoded = jwt.verify(token, config.screct);
        res.locals.user = decoded;
        next();
    } catch (err) {
        res.json({ status: 'error', message: 'Invalid or expired token' });
    }
}

module.exports = AuthenAndgetUser;