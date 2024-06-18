const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
const database = require('./database');
const config = require('./config');
const dotenv = require('dotenv');

const CheckandExtendToken = require('./authen');

dotenv.config();

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


function createTransactionsQuery(user_id, date) {
    return `
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
                        res.json({ status: 'ok', message: 'Transaction Registered Successfully' });
                    }
    )
}

// ==summary Today==
// function summaryToday (req, res, next){
//     const user_id = res.locals.user.user_id;

//     if (!req.body.user_id ) {
//         return res.json({ status: 'error', message: 'No User.' });
//     }
//     const today = new Date().toISOString().split('T')[0];
//     const summaryQuery = createSummaryQuery(user_id, '%Y-%m-%d', today);
//     const transactionsQuery = createTransactionsQuery(user_id, today);

//     database.executeQuery(
//         summaryQuery,
//         [user_id, today],
//         function (err, summaryResults) {
//             if (err) {
//                 res.json({ status: 'error', message: err });
//                 return;
//             }
//             if (summaryResults.length === 0) {
//                 res.json({ status: 'error', message: 'No transactions found for the selected date.' });
//                 return;
//             }

//             // Calculate the total income and expenses
//             let total_income = 0;
//             let total_expense = 0;

//             summaryResults.forEach(result => {
//                 total_income += parseFloat(result.total_income) || 0;
//                 total_expense += parseFloat(result.total_expense) || 0;
//             });

//             // Now fetch the individual transactions for the day
//             database.executeQuery(
//                 transactionsQuery,
//                 [user_id, today],
//                 function (err, transactions) {
//                     if (err) {
//                         res.json({ status: 'error', message: err });
//                         return;
//                     }

//                     res.json({
//                         status: 'ok',
//                         summary: {
//                             user_id: user_id,
//                             date: today,
//                             total_income: total_income,
//                             total_expense: total_expense
//                         },
//                         transactions: transactions
//                     });
//                 }
//             );
//         }
//     );
// }

// ==summary Selected Day==
async function summaryDay(req, res, next) {
    const user_id = res.locals.user.user_id;
    const selectedDate = req.body.selectedDate; // YYYY-MM-DD

    if (!req.body.user_id || !req.body.selectedDate) {
        return res.json({ status: 'error', message: 'Please provide user_id and selectedDate.' });
    }

    try{
        const summaryQuery = createSummaryQuery(user_id, '%Y-%m-%d',selectedDate);
        const transactionsQuery = createTransactionsQuery(user_id, selectedDate);

        const [summaryResults, transactions] = await Promise.all([
            executeSummaryQuery(summaryQuery, user_id, selectedDate),
            executeTransactionsQuery(transactionsQuery, user_id, selectedDate)
        ])
        
        //After query all-------------------------
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

            res.json({
                status: 'ok',
                message: 'Get SummaryDay Transactions Successfully',
                data: {
                summary: {
                    user_id: user_id,
                    selectedDate: selectedDate,
                    total_income: total_income,
                    total_expense: total_expense
                },
                transactions: transactions
            }
            });
        //--------------------------------
        } catch (err) {
            res.json({ status: 'error', message: err.message })
        }

        //Function summaryQuery
        function executeSummaryQuery(summaryQuery, user_id, selectedDate) {
            return new Promise((resolve, reject) =>{
                database.executeQuery(summaryQuery, [user_id, selectedDate], (err, result) =>{
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                })
            })
        }

        //Function transactionQuery
        function executeTransactionsQuery(transactionQuery, user_id, selectedDate) {
            return new Promise((resolve, reject) =>{
                database.executeQuery(transactionQuery, [user_id, selectedDate], (err, result) =>{
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                })
            })
        }
    }

            
// ==summary Selected Month==
async function summaryMonth (req , res, next) {
    const user_id = res.locals.user.user_id;
    const selectedMonth = req.body.selectedMonth;

    if (!req.body.user_id || !req.body.selectedMonth) {
        return res.json({ status: 'error', message: 'Please provide user_id and selectedMonth.' });
    }

    try{
        const summaryQuery = createSummaryQuery(user_id, '%Y-%m', selectedMonth);
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
            executeSummaryQuery(summaryQuery, user_id, selectedMonth),
            executeTypenameQuery(summaryTypenameQuery, user_id, selectedMonth)
        ])

    //After Query All---------------------
        if (summaryResults.length === 0) {
            res.json({ status: 'error', message: 'No transactions found for the selected month.' });
            return;
        }
    
        // Calculate the total income and expenses
        let total_income = 0;
        let total_expense = 0;
    
        summaryResults.forEach(result => {
            total_income += parseFloat(result.total_income) || 0;
            total_expense += parseFloat(result.total_expense) || 0;
        });

        let incomeTransactions = { type: 'income', categories: [] };
        let expenseTransactions = { type: 'expense', categories: [] };
    
        transactions.forEach(result => {
            let categoryData = {
                categorie_name: result.name,
                amount: parseFloat(result.amount) || 0
            };
    
            if (result.type === 'income') {
                incomeTransactions.categories.push(categoryData);
            } else if (result.type === 'expenses') {
                expenseTransactions.categories.push(categoryData);
            }
        });
    
        res.json({
            status: 'ok',
            message: 'Get SummaryMonth Successfully',
            data: {
            summary: {
                user_id: user_id,
                month: selectedMonth,
                total_income: total_income,
                total_expense: total_expense,
                balance: total_income - total_expense
            },
            summary_type: [incomeTransactions, expenseTransactions]
        }
        });
    //--------------------------------
    } catch(err){
        res.json({ status: 'error', message: err.message })
    }

    //Function summaryQuery
    function executeSummaryQuery(summaryQuery, user_id, selectedMonth){
        return new Promise((resolve, reject) =>{
            database.executeQuery(summaryQuery,[user_id, selectedMonth], (err,result)=>{
            if (err) {
                reject (err);
            } else {
                resolve (result);
            }
            })
        })
    }

    //Function summaryTypenameQuery
    function executeTypenameQuery(summaryTypenameQuery, user_id, selectedMonth){
        return new Promise((resolve, reject) =>{
            database.executeQuery(summaryTypenameQuery,[user_id, selectedMonth], (err,result)=>{
            if (err){
                reject (err);
            } else {
                resolve (result);
            }
            })
        })
    }
}


// ==summary Selected Year==
async function summaryYear(req, res, next) {
    const user_id = res.locals.user.user_id;
    const selectedYear = req.body.selectedYear;

    if (!req.body.user_id || !req.body.selectedYear) {
        return res.json({ status: 'error', message: 'Please provide user_id and selectedYear.' });
    }

    try {
        const summaryQuery = createSummaryQuery(user_id, '%Y', selectedYear);
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
                DATE_FORMAT(Transactions.transaction_datetime, '%Y-%m');
        `;

        const [summaryResults, monthlyResults] = await Promise.all([
            executeSummaryQuery(summaryQuery,user_id ,selectedYear),
            executeMonthlySummaryQuery(monthlySummaryQuery,user_id ,selectedYear)
        ])

    //After Query All-----------------------
        if (summaryResults.length === 0) {
            res.json({ status: 'error', message: 'No transactions found for the selected year.' });
            return;
        }

        // Calculate the total income and expenses
        let total_income = 0;
        let total_expense = 0;

        summaryResults.forEach(result => {
            total_income += parseFloat(result.total_income) || 0;
            total_expense += parseFloat(result.total_expense) || 0;
        });
        
        let monthlySummary = [];
    
        monthlyResults.forEach(result => {
            monthlySummary.push({
                month: result.month,
                total_income: parseFloat(result.total_income) || 0,
                total_expense: parseFloat(result.total_expense) || 0,
                balance: (parseFloat(result.total_income) || 0) - (parseFloat(result.total_expense) || 0)
            });
        });
    
        res.json({
            status: 'ok', 
            message: 'Get SummaryYear Successfully',
            data:{
                summary: {
                user_id: user_id,
                year: selectedYear,
                total_income: total_income,
                total_expense: total_expense,
                balance: total_income - total_expense
            },
            monthly_summary: monthlySummary 
        }
        });
    } catch (err) {
        res.json({ status: 'error', message: err.message })
    }

    //Function summaryQuery
    function executeSummaryQuery(summaryQuery,user_id ,selectedYear){
        return new Promise((resolve, reject) =>{
            database.executeQuery(summaryQuery, [user_id, selectedYear], (err,result)=>{
                if (err) {
                    reject (err);
                } else {
                    resolve (result);
                }
            })
        })
    }

    //Function monthlySummaryQuery
    function executeMonthlySummaryQuery(monthlySummaryQuery,user_id ,selectedYear){
        return new Promise((resolve, reject)=>{
            database.executeQuery(monthlySummaryQuery, [user_id, selectedYear], (err,result)=>{
                if (err) {
                    reject (err);
                } else {
                    resolve (result);
                }
            })
        })
    }
}


router.post('/record', jsonParser, CheckandExtendToken ,record);
// router.get('/summarytoday', jsonParser, CheckandExtendToken , summaryToday);
router.get('/summaryday', jsonParser, CheckandExtendToken , summaryDay);
router.get('/summarymonth', jsonParser, CheckandExtendToken , summaryMonth);
router.get('/summaryyear', jsonParser, CheckandExtendToken , summaryYear);


module.exports = router;
