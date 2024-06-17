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
    const summaryQuery = createSummaryQuery(user_id, '%Y-%m-%d', today);
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

    const summaryQuery = createSummaryQuery(user_id, '%Y-%m-%d',selectedDate);
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
function summaryMonth (req , res, next) {
    const user_id = res.locals.user.user_id;
    const selectedMonth = req.body.selectedMonth;

    if (!req.body.user_id || !req.body.selectedMonth) {
        return res.json({ status: 'error', message: 'Please provide user_id and selectedMonth.' });
    }
    const summaryQuery = createSummaryQuery(user_id, '%Y-%m', selectedMonth);
    const summaryTypenameQuery = `
        SELECT 
            Categories.type, 
            SUM(CASE WHEN Categories.name = 'เงินเดือน' THEN Transactions.amount ELSE 0 END) AS total_Salary,
            SUM(CASE WHEN Categories.name = 'รายได้พิเศษ' THEN Transactions.amount ELSE 0 END) AS total_Extra_inc,
            SUM(CASE WHEN Categories.name = 'รายได้จากการลงทุน' THEN Transactions.amount ELSE 0 END) AS total_Investment_inc,
            SUM(CASE WHEN Categories.name = 'รายได้อื่น' THEN Transactions.amount ELSE 0 END) AS total_Oth_inc,
            SUM(CASE WHEN Categories.name = 'อาหาร' THEN Transactions.amount ELSE 0 END) AS total_Food,
            SUM(CASE WHEN Categories.name = 'สมัครสมาชิกรายเดือน' THEN Transactions.amount ELSE 0 END) AS total_Sub,
            SUM(CASE WHEN Categories.name = 'ช้อปปิ้ง' THEN Transactions.amount ELSE 0 END) AS total_Shop,
            SUM(CASE WHEN Categories.name = 'ค่าเดินทาง' THEN Transactions.amount ELSE 0 END) AS total_Tran,
            SUM(CASE WHEN Categories.name = 'ท่องเที่ยว' THEN Transactions.amount ELSE 0 END) AS total_Travel,
            SUM(CASE WHEN Categories.name = 'บิลและสาธารณูปโภค' THEN Transactions.amount ELSE 0 END) AS total_Bill,
            SUM(CASE WHEN Categories.name = 'ความบันเทิง' THEN Transactions.amount ELSE 0 END) AS total_Entertain,
            SUM(CASE WHEN Categories.name = 'สุขภาพ' THEN Transactions.amount ELSE 0 END) AS total_Health,
            SUM(CASE WHEN Categories.name = 'การศึกษา' THEN Transactions.amount ELSE 0 END) AS total_Edu,
            SUM(CASE WHEN Categories.name = 'การเงินการลงทุน' THEN Transactions.amount ELSE 0 END) AS total_Invest,
            SUM(CASE WHEN Categories.name = 'บริจาค' THEN Transactions.amount ELSE 0 END) AS total_Danate,
            SUM(CASE WHEN Categories.name = 'อื่นๆ' THEN Transactions.amount ELSE 0 END) AS total_Oth_exp
        FROM
            Transactions
        JOIN
            Categories ON Transactions.categorie_id = Categories.categorie_id
        WHERE
            Transactions.user_id = ? AND
                DATE_FORMAT(Transactions.transaction_datetime, '%Y-%m') = ?
        GROUP BY
            Categories.type
    `;

    database.executeQuery(
        summaryQuery,
        [user_id, selectedMonth],

        function (err, summaryResults) {
            if (err) {
                res.json({ status: 'error', message: err });
                return;
            }
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

            // Now fetch the individual transactions for the day
            database.executeQuery(
                summaryTypenameQuery,
                [user_id, selectedMonth],
                function (err, transactions) {
                    if (err) {
                        res.json({ status: 'error', message: err });
                        return;
                    }

                     // Calculate the total Typename
                     let incomeTransactions = {
                        type: 'income',
                        total_Salary: "0.00",
                        total_Extra_inc: "0.00",
                        total_Investment_inc: "0.00",
                        total_Oth_inc: "0.00",
                    };

                    let expenseTransactions = {
                        type: 'expense',
                        total_Food: "0.00",
                        total_Sub: "0.00",
                        total_Shop: "0.00",
                        total_Tran: "0.00",
                        total_Travel: "0.00",
                        total_Bill: "0.00",
                        total_Entertain: "0.00",
                        total_Health: "0.00",
                        total_Edu: "0.00",
                        total_Invest: "0.00",
                        total_Donate: "0.00",
                        total_Oth_exp: "0.00",
                    };

                    transactions.forEach(result => {
                        if (result.type === 'income') {
                            if (parseFloat(result.total_Salary) > 0) incomeTransactions.total_Salary = result.total_Salary;
                            if (parseFloat(result.total_Extra_inc) > 0) incomeTransactions.total_Extra_inc = result.total_Extra_inc;
                            if (parseFloat(result.total_Investment_inc) > 0) incomeTransactions.total_Investment_inc = result.total_Investment_inc;
                            if (parseFloat(result.total_Oth_inc) > 0) incomeTransactions.total_Oth_inc = result.total_Oth_inc;
                        } else if (result.type === 'expenses') {
                            if (parseFloat(result.total_Food) > 0) expenseTransactions.total_Food = result.total_Food;
                            if (parseFloat(result.total_Sub) > 0) expenseTransactions.total_Sub = result.total_Sub;
                            if (parseFloat(result.total_Shop) > 0) expenseTransactions.total_Shop = result.total_Shop;
                            if (parseFloat(result.total_Tran) > 0) expenseTransactions.total_Tran = result.total_Tran;
                            if (parseFloat(result.total_Travel) > 0) expenseTransactions.total_Travel = result.total_Travel;
                            if (parseFloat(result.total_Bill) > 0) expenseTransactions.total_Bill = result.total_Bill;
                            if (parseFloat(result.total_Entertain) > 0) expenseTransactions.total_Entertain = result.total_Entertain;
                            if (parseFloat(result.total_Health) > 0) expenseTransactions.total_Health = result.total_Health;
                            if (parseFloat(result.total_Edu) > 0) expenseTransactions.total_Edu = result.total_Edu;
                            if (parseFloat(result.total_Invest) > 0) expenseTransactions.total_Invest = result.total_Invest;
                            if (parseFloat(result.total_Donate) > 0) expenseTransactions.total_Donate = result.total_Donate;
                            if (parseFloat(result.total_Oth_exp) > 0) expenseTransactions.total_Oth_exp = result.total_Oth_exp;
                        }
                    });

                    // Remove keys with "0.00" values from the result objects
                    for (const key in incomeTransactions) {
                        if (incomeTransactions[key] === "0.00") {
                            delete incomeTransactions[key];
                        }
                    }

                    for (const key in expenseTransactions) {
                        if (expenseTransactions[key] === "0.00") {
                            delete expenseTransactions[key];
                        }
                    }

                    res.json({
                        status: 'ok',
                        summary: {
                            user_id: user_id,
                            month: selectedMonth,
                            total_income: total_income,
                            total_expense: total_expense,
                            balance: total_income - total_expense
                        },
                        summaryType : [incomeTransactions, expenseTransactions]
                    });
                }
            );
        }
    )
}

// ==summary Selected Year==

router.post('/record', jsonParser, CheckandExtendToken ,record);
router.get('/summarytoday', jsonParser, CheckandExtendToken , summaryToday);
router.get('/summaryday', jsonParser, CheckandExtendToken , summaryDay);
router.get('/summarymonth', jsonParser, CheckandExtendToken , summaryMonth);


module.exports = router;
