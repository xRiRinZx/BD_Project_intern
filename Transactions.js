const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
const database = require('./database');
const config = require('./config');
const dotenv = require('dotenv');

const extendToken = require('./authen');

dotenv.config();

// ==Record Transactions==
function record (req ,res ,next) {
    if (!req.body.user_id || !req.body.categorie_id || !req.body.amount || !req.body.transaction_datetime) {
        return res.json({ status: 'error', message: 'Please fill out the information completely.' });
    }

    const user_id = res.locals.user.user_id;

    database.executeQuery(
        'INSERT INTO Transactions (user_id , categorie_id , amount , note , transaction_datetime) VALUES (?, ?, ?, ?, ?)',
            [req.body.user_id , req.body.categorie_id , req.body.amount , req.body.note , req.body.transaction_datetime],
                function (err, result) {
                    if (err) {
                        res.json({ status: 'error', message: err });
                        return;
                    }
                        res.json({ status: 'ok', message: 'Transaction registered successfully' });
                    }
    )
}

// ==summary Today==
function summaryToday (req, res, next){
    const user_id = res.locals.user.user_id;

    if (!req.body.user_id ) {
        return res.json({ status: 'error', message: 'No User.' });
    }
    const today = new Date().toISOString().split('T')[0];

    database.executeQuery(
        'SELECT * FROM Transactions WHERE user_id = ? AND DATE(transaction_datetime) = ?',
        [req.body.user_id, today],
        function (err, transactions) {
            if (err) {
                res.json({ status: 'error', message: err});
                return;
            }
            if (transactions == 0) {
                res.json({ status: 'error', message: 'No transactions have been recorded today.' });
                return;
            }
            res.json({ status: 'ok', transactionsToday:{user : req.body.user_id ,transactions}});
        } 
    )
}

// ==summary Selected Day==
function summaryDay (req, res, next) {
    const user_id = res.locals.user.user_id;
    const selectedDate = req.body.selectedDate; //YYYY-MM-DD

    if (!req.body.user_id || !req.body.selectedDate ) {
        return res.json({ status: 'error', message: 'Please provide user_id and selectedDate.' });
    }

    database.executeQuery (
        'SELECT * FROM Transactions WHERE user_id = ? AND DATE(transaction_datetime) = ?',
        [user_id , selectedDate],
        function (err , transactions){
            if (err) {
                res.json({ status: 'error', message: err });
                return;
            }
            if (transactions.length === 0) {
                res.json({ status: 'error', message: 'No transactions found for the selected date.' });
                return;
            }
            res.json({ status: 'ok', user_id: {transaction : selectedDate ,transactions }});
        }
    )
}

// ==summary Selected Month==

// ==summary Selected Year==

router.post('/record', jsonParser, extendToken ,record);
router.post('/summarytoday', jsonParser, extendToken , summaryToday);
router.post('/summaryday', jsonParser, extendToken , summaryDay);

module.exports = router;
