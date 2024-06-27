const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
const database = require('./database');
const config = require('./config');
const dotenv = require('dotenv');
const moment = require('moment-timezone');

const CheckandgetUser = require('./Authen_getUser');

dotenv.config();
moment.tz.setDefault(config.timezone);

function createSummaryQuery(user_id, format, date) {
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
            Transactions.user_id = ? AND DATE_FORMAT(Transactions.transaction_datetime, '${format}') = ?
        GROUP BY
            Transactions.categorie_id;
    `;
}

// Function to execute SQL query with parameters
function executeQuery(query, params) {
    return new Promise((resolve, reject) => {
        database.executeQuery(query, params, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

// Function to process summary results
function processSummaryResults(summaryResults) {
    let total_income = 0;
    let total_expense = 0;

    summaryResults.forEach(result => {
        total_income += parseFloat(result.total_income) || 0;
        total_expense += parseFloat(result.total_expense) || 0;
    });

    return { total_income, total_expense };
}

// Function to process transactions results
function processTransactionsResults(transactions) {
    return transactions.map(transaction => ({
        transactions_id: transaction.transactions_id,
        amount: parseFloat(transaction.amount).toFixed(2) || 0,
        note: transaction.note,
        transaction_datetime: moment(transaction.transaction_datetime).format('YYYY-MM-DD HH:mm:ss'),
        categorie_name: transaction.categorie_name,
        categorie_type: transaction.categorie_type
    }));
}

// == Record Transactions ==
function record(req, res, next) {
    const user_id = res.locals.user.user_id;
    const { categorie_id, amount, note, transaction_datetime, fav } = req.body;
    
    if (!user_id || !categorie_id || !amount || !transaction_datetime || fav === undefined) {
        return res.json({ status: 'error', message: 'Please fill out the information completely.' });
    }
    const transactionDatetimeThai = moment(transaction_datetime).format('YYYY-MM-DD HH:mm:ss');
    // Set note to null if it's undefined
    const noteValue = note !== undefined ? note : null;
    
    database.executeQuery(
        'INSERT INTO Transactions (user_id, categorie_id, amount, note, transaction_datetime, fav) VALUES (?, ?, ?, ?, ?, ?)',
        [user_id, categorie_id, amount, noteValue, transactionDatetimeThai, fav],
        function (err, result) {
            if (err) {
                res.json({ status: 'error', message: err });
                return;
            }
            res.json({ status: 'ok', message: 'Transaction Registered Successfully' });
        }
    );
}
// async function record(req, res, next){
//     const user_id = res.locals.user.user_id
//     const { categorie_id, amount, note, transaction_datetime, fav, tag_id} = req.body

//     if (!user_id || !categorie_id || !amount || !transaction_datetime || fav === undefined) {
//             return res.json({ status: 'error', message: 'Please fill out the information completely.' });
//         }

//     const noteValue = note !== undefined ? note : null;
//     const transactionDatetimeThai = moment(transaction_datetime).format('YYYY-MM-DD HH:mm:ss');
//     try {
//         //Check CategorieUser
//         const checkCategorieUserQuery = 'SELECT * FROM Categories WHERE categorie_id = ? AND user_id = ?';
//         const categorieExists = await executeQuery(checkCategorieUserQuery,[categorie_id, user_id]);
//         if (categorieExists.length === 0) {
//             return res.json({ status: 'error', message: 'Categories not found for this user.' });
//         }
//         //Check TagAdd?
//         if (Array.isArray(tag_id) && tag_id.length > 0) {
//             const checkTagsQuery = 'SELECT * FROM tags WHERE tag_id IN (?) AND user_id = ?';
//             const tagsExists = await executeQuery(checkTagsQuery, [tag_id, user_id]);

//             if (tagsExists.length !== tag_id.length) {
//                 return res.json({ status: 'error', message: 'One or more tags do not belong to the current user.' });
//             }
//         }
//         //Add To Transactions
//         const addTransaction = 'INSERT INTO Transactions (user_id, categorie_id, amount, note, transaction_datetime, fav) VALUES (?, ?, ?, ?, ?, ?)'
//         await executeQuery(addTransaction, [user_id, categorie_id, amount, noteValue, transactionDatetimeThai, fav])

//         const

//         } catch (err){

//     }
// }

// == edit transaction ==
async function editTransaction(req, res, next){
    const user_id = res.locals.user.user_id;
    const selected_transaction = req.body.transactions_id;
    const { categorie_id, amount, note, transaction_datetime, fav } = req.body;

    if (!user_id || !selected_transaction || !categorie_id || !amount || !transaction_datetime || !fav) {
        return res.json({ status: 'error', message: 'Please fill out the information completely.'});
    }
    
    const noteValue = note !== undefined ? note : null;
    const transactionDatetimeThai = moment(transaction_datetime).format('YYYY-MM-DD HH:mm:ss');

    try {
        // Check if the transaction exists for the given user
        const checkTransactionQuery = 'SELECT * FROM Transactions WHERE transactions_id = ? AND user_id = ?';
        const transactionExists = await new Promise((resolve, reject) => {
            database.executeQuery(checkTransactionQuery, [selected_transaction, user_id], (err, results) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(results.length > 0);
                }
            });
        });

        if (!transactionExists) {
            return res.json({ status: 'error', message: 'Transaction not found for this user.' });
        }

        const updateEditTransaction = 'UPDATE Transactions SET categorie_id = ? , amount = ? , note = ? ,transaction_datetime = ? , fav = ? WHERE transactions_id = ? AND user_id = ?';
        await new Promise((resolve, reject) => {
            database.executeQuery(updateEditTransaction, [categorie_id, amount, noteValue, transactionDatetimeThai, fav, selected_transaction, user_id], (err, results) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(results);
                }
            });
        });

        res.json({ status: 'ok', message: 'Edit Transaction successfully.' });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}

//== delete Transaction ==
async function deleteTransaction(req, res, next){
    const user_id = res.locals.user.user_id;
    const selected_transaction = req.body.transactions_id;

    if (!user_id || !selected_transaction) {
        return res.json({ status: 'error', message: 'Please select Transaction.' });
    }

    try {
        // Check if the transaction exists for the given user
        const checkTransactionQuery = 'SELECT * FROM Transactions WHERE transactions_id = ? AND user_id = ?';
        const transactionExists = await new Promise((resolve, reject) => {
            database.executeQuery(checkTransactionQuery, [selected_transaction, user_id], (err, results) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(results.length > 0);
                }
            });
        });

        if (!transactionExists) {
            return res.json({ status: 'error', message: 'Transaction not found for this user.' });
        }

        // Delete the transaction
        const deleteTransactionQuery = 'DELETE FROM Transactions WHERE transactions_id = ? AND user_id = ?';
        await new Promise((resolve, reject) => {
            database.executeQuery(deleteTransactionQuery, [selected_transaction, user_id], (err, results) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(results);
                }
            });
        });

        res.json({ status: 'ok', message: 'Transaction deleted Successfully' });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}




// ==summary Selected Day==
async function summaryDay(req, res, next) {
    const user_id = res.locals.user.user_id;
    const selected_date_start = req.query.selected_date_start; // YYYY-MM-DD
    const selected_date_end = req.query.selected_date_end; // YYYY-MM-DD

    if (!user_id || !selected_date_start || !selected_date_end) {
        return res.json({ status: 'error', message: 'Please provide user_id and selectedDate.' });
    }

    try{
        const summaryQuery = 
        `SELECT 
            Transactions.categorie_id, 
            SUM(CASE WHEN Categories.type = 'income' THEN Transactions.amount ELSE 0 END) AS total_income,
            SUM(CASE WHEN Categories.type = 'expenses' THEN Transactions.amount ELSE 0 END) AS total_expense
        FROM
            Transactions
        JOIN
            Categories ON Transactions.categorie_id = Categories.categorie_id
        WHERE
            Transactions.user_id = ? AND DATE_FORMAT(Transactions.transaction_datetime, '%Y-%m-%d') BETWEEN ? AND ?
        GROUP BY
            Transactions.categorie_id`;

        const transactionsQuery = `
        SELECT 
            Transactions.transactions_id,
            Transactions.amount,
            Transactions.note,
            Transactions.transaction_datetime,
            Categories.name AS categorie_name,
            Categories.type AS categorie_type
        FROM
            Transactions
        JOIN
            Categories ON Transactions.categorie_id = Categories.categorie_id
        WHERE
            Transactions.user_id = ? AND DATE_FORMAT(Transactions.transaction_datetime, '%Y-%m-%d') BETWEEN ? AND ?
    `;

        const [summaryResults, transactions] = await Promise.all([
            executeQuery(summaryQuery, [user_id, selected_date_start, selected_date_end]),
            executeQuery(transactionsQuery, [user_id, selected_date_start, selected_date_end])
        ])
        
        //After query all-------------------------
            if (summaryResults.length === 0) {
                res.json({ status: 'error', message: 'No transactions found for the selected date.' });
                return;
            }

            const { total_income, total_expense } = processSummaryResults(summaryResults);
            const processedTransactions = processTransactionsResults(transactions);

            const selected_date_range = (selected_date_start === selected_date_end) 
            ? selected_date_start 
            : `${selected_date_start} - ${selected_date_end}`;

            res.json({
                status: 'ok',
                message: 'Get SummaryDay Transactions Successfully',
                data: {
                summary: {
                    user_id: user_id,
                    selected_date: selected_date_range,
                    total_income: total_income.toFixed(2),
                    total_expense: total_expense.toFixed(2)
                },
                transactions: processedTransactions
            }
            });
        //--------------------------------
        } catch (err) {
            res.json({ status: 'error', message: err.message })
        }
}

            
// ==summary Selected Month==
async function summaryMonth (req , res, next) {
    const user_id = res.locals.user.user_id;
    const selected_month = req.query.selected_month;

    if (!user_id || !req.query.selected_month) {
        return res.json({ status: 'error', message: 'Please provide user_id and selected_month' });
    }

    try{
        const summaryQuery = createSummaryQuery(user_id, '%Y-%m', selected_month);
        const summaryTypenameQuery = `
            SELECT 
                Categories.type, 
                Categories.name,
                SUM(Transactions.amount) as amount
            FROM
                Transactions
            JOIN
                Categories ON Transactions.categorie_id = Categories.categorie_id
            WHERE
                Transactions.user_id = ? AND
                DATE_FORMAT(Transactions.transaction_datetime, '%Y-%m') = ?
            GROUP BY
                Categories.type, Categories.name
        `;

        const [summaryResults, transactions] = await Promise.all([
            executeQuery(summaryQuery, [user_id, selected_month]),
            executeQuery(summaryTypenameQuery, [user_id, selected_month])
        ])

    //After Query All---------------------
        if (summaryResults.length === 0) {
            res.json({ status: 'error', message: 'No transactions found for the selected month.' });
            return;
        }
    
        // Calculate the total income and expenses
        const { total_income, total_expense } = processSummaryResults(summaryResults);

        // Calculate the total income and expenses Each categorie_name
        let incomeTransactions = { type: 'income', categories: [] };
        let expenseTransactions = { type: 'expense', categories: [] };
        let tagTransactions = { type: 'tag', categories: [] };
    
        transactions.forEach(result => {
            let categoryData = {
                categorie_name: result.name,
                amount: parseFloat(result.amount).toFixed(2) || 0
            };
    
            if (result.type === 'income') {
                incomeTransactions.categories.push(categoryData);
            } else if (result.type === 'expenses') {
                expenseTransactions.categories.push(categoryData);
            } else if (result.type === 'tag') {
                tagTransactions.categories.push(categoryData);
            }

        });
    
        res.json({
            status: 'ok',
            message: 'Get SummaryMonth Successfully',
            data: {
            summary: {
                user_id: user_id,
                month: selected_month,
                total_income: total_income.toFixed(2),
                total_expense: total_expense.toFixed(2),
                balance: (total_income - total_expense).toFixed(2)
            },
            summary_type: [incomeTransactions, expenseTransactions ,tagTransactions]
        }
        });
    //--------------------------------
    } catch(err){
        res.json({ status: 'error', message: err.message })
    }
}

// ==summary Selected Year==
async function summaryYear(req, res, next) {
    const user_id = res.locals.user.user_id;
    const selected_year = req.query.selected_year;

    if (!user_id || !req.query.selected_year) {
        return res.json({ status: 'error', message: 'Please provide user_id and selected_year.' });
    }

    try {
        const summaryQuery = createSummaryQuery(user_id, '%Y', selected_year);
        const monthlySummaryQuery = `
            SELECT 
                DATE_FORMAT(Transactions.transaction_datetime, '%Y-%m') AS month,
                SUM(CASE WHEN Categories.type = 'income' THEN Transactions.amount ELSE 0 END) AS total_income,
                SUM(CASE WHEN Categories.type = 'expenses' THEN Transactions.amount ELSE 0 END) AS total_expense
            FROM
                Transactions
            JOIN
                Categories ON Transactions.categorie_id = Categories.categorie_id
            WHERE
                Transactions.user_id = ? AND
                DATE_FORMAT(Transactions.transaction_datetime, '%Y') = ?
            GROUP BY
                DATE_FORMAT(Transactions.transaction_datetime, '%Y-%m')
            ORDER BY
                DATE_FORMAT(Transactions.transaction_datetime, '%Y-%m');
        `;

        const [summaryResults, monthlyResults] = await Promise.all([
            executeQuery(summaryQuery, [user_id, selected_year]),
            executeQuery(monthlySummaryQuery, [user_id, selected_year])
        ])

    //After Query All-----------------------
        if (summaryResults.length === 0) {
            res.json({ status: 'error', message: 'No transactions found for the selected year.' });
            return;
        }

        // Calculate the total income and expenses
        const { total_income, total_expense } = processSummaryResults(summaryResults);
        
        // Calculate the total income and expenses Each Monthly
        let monthlySummary = [];
    
        monthlyResults.forEach(result => {
            monthlySummary.push({
                month: result.month,
                total_income: parseFloat(result.total_income).toFixed(2) || 0,
                total_expense: parseFloat(result.total_expense).toFixed(2) || 0,
                balance: ((parseFloat(result.total_income) || 0) - (parseFloat(result.total_expense) || 0)).toFixed(2)
            });
        });
    
        res.json({
            status: 'ok', 
            message: 'Get SummaryYear Successfully',
            data:{
                summary: {
                user_id: user_id,
                year: selected_year,
                total_income: total_income.toFixed(2),
                total_expense: total_expense.toFixed(2),
                balance: (total_income - total_expense).toFixed(2)
            },
            monthly_summary: monthlySummary 
        }
        });
    //--------------------------------
    } catch (err) {
        res.json({ status: 'error', message: err.message })
    }
}
    

router.post('/record', jsonParser, CheckandgetUser ,record);
router.get('/summaryday', jsonParser, CheckandgetUser , summaryDay);
router.get('/summarymonth', jsonParser, CheckandgetUser , summaryMonth);
router.get('/summaryyear', jsonParser, CheckandgetUser , summaryYear);
router.put('/edit-transaction', jsonParser, CheckandgetUser , editTransaction);
router.delete('/delete-transaction', jsonParser, CheckandgetUser , deleteTransaction);


module.exports = 
    // executeQuery,
    router