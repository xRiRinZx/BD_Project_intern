const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
const database = require('./database');
const config = require('./config');
const dotenv = require('dotenv');

const extendToken = require('./authen');

dotenv.config();

function createSummaryQuery(user_id, date) {
    return `
        SELECT 
            Transactions.categorie_id, 
            SUM(CASE WHEN Categories.type = 'income' THEN Transactions.amount ELSE 0 END) AS total_income,
            SUM(CASE WHEN Categories.type = 'expenses' THEN Transactions.amount ELSE 0 END) AS total_expense
        FROM
            Transactions
        JOIN
            Categories ON Transactions.categorie_id = Categories.categorie_id
        WHERE
            Transactions.user_id = ${user_id} AND DATE(Transactions.transaction_datetime) = '${date}'
        GROUP BY
            Transactions.categorie_id;
    `;
}

function createTransactionsQuery(user_id, date) {
    return `
        SELECT 
            Transactions.transactions_id,
            Transactions.amount,
            Transactions.note,
            Transactions.transaction_datetime,
            Categories.name AS category_name,
            Categories.type AS category_type
        FROM
            Transactions
        JOIN
            Categories ON Transactions.categorie_id = Categories.categorie_id
        WHERE
            Transactions.user_id = ${user_id} AND DATE(Transactions.transaction_datetime) = '${date}';
    `;
}

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
    const summaryQuery = createSummaryQuery(user_id, today);
    const transactionsQuery = createTransactionsQuery(user_id, today);

    database.executeQuery(
        summaryQuery,
        [user_id, today],
        function (err, summaryResults) {
            if (err) {
                res.json({ status: 'error', message: err });
                return;
            }
            if (summaryResults.length === 0) {
                res.json({ status: 'error', message: 'No transactions found for the selected date.' });
                return;
            }

            // Calculate the total income and expenses
            let total_income = 0;
            let total_expense = 0;

            summaryResults.forEach(result => {
                total_income += parseFloat(result.total_income) || 0;
                total_expense += parseFloat(result.total_expense) || 0;
            });

            // Now fetch the individual transactions for the day
            database.executeQuery(
                transactionsQuery,
                [user_id, today],
                function (err, transactions) {
                    if (err) {
                        res.json({ status: 'error', message: err });
                        return;
                    }

                    res.json({
                        status: 'ok',
                        summary: {
                            user_id: user_id,
                            date: today,
                            total_income: total_income,
                            total_expense: total_expense
                        },
                        transactions: transactions
                    });
                }
            );
        }
    );
}

// ==summary Selected Day==
function summaryDay(req, res, next) {
    const user_id = res.locals.user.user_id;
    const selectedDate = req.body.selectedDate; // YYYY-MM-DD

    if (!req.body.user_id || !req.body.selectedDate) {
        return res.json({ status: 'error', message: 'Please provide user_id and selectedDate.' });
    }

    const summaryQuery = createSummaryQuery(user_id, selectedDate);
    const transactionsQuery = createTransactionsQuery(user_id, selectedDate);
    
    database.executeQuery(
        summaryQuery,
        [user_id, selectedDate],
        function (err, summaryResults) {
            if (err) {
                res.json({ status: 'error', message: err });
                return;
            }
            if (summaryResults.length === 0) {
                res.json({ status: 'error', message: 'No transactions found for the selected date.' });
                return;
            }

            // Calculate the total income and expenses
            let total_income = 0;
            let total_expense = 0;

            summaryResults.forEach(result => {
                total_income += parseFloat(result.total_income) || 0;
                total_expense += parseFloat(result.total_expense) || 0;
            });

            // Now fetch the individual transactions for the day
            database.executeQuery(
                transactionsQuery,
                [user_id, selectedDate],
                function (err, transactions) {
                    if (err) {
                        res.json({ status: 'error', message: err });
                        return;
                    }

                    res.json({
                        status: 'ok',
                        summary: {
                            user_id: user_id,
                            selectedDate: selectedDate,
                            total_income: total_income,
                            total_expense: total_expense
                        },
                        transactions: transactions
                    });
                }
            );
        }
    );
}

// ==summary Selected Month==

// ==summary Selected Year==

router.post('/record', jsonParser, extendToken ,record);
router.post('/summarytoday', jsonParser, extendToken , summaryToday);
router.post('/summaryday', jsonParser, extendToken , summaryDay);

module.exports = router;
