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

// == Record Transactions ==
async function record(req, res, next){
    const user_id = res.locals.user.user_id
    const { categorie_id, amount, note, transaction_datetime, fav, tag_id} = req.body

    if (!user_id || !categorie_id || !amount || !transaction_datetime || fav === undefined) {
            return res.json({ status: 'error', message: 'Please fill out the information completely.' });
        }

    const noteValue = note !== undefined ? note : null;
    const transactionDatetimeThai = moment(transaction_datetime).format('YYYY-MM-DD HH:mm:ss');
    const favValue = fav !== undefined && fav !== null ? fav : 0;
    try {
        //Check CategorieUser
        const checkCategorieUserQuery = 'SELECT * FROM Categories WHERE categorie_id = ? AND user_id = ? OR user_id IS NULL';
        const categorieExists = await executeQuery(checkCategorieUserQuery,[categorie_id, user_id]);
        if (categorieExists.length === 0) {
            return res.json({ status: 'error', message: 'Categories not found for this user.' });
        }
        //Check TagAdd?
        if (Array.isArray(tag_id) && tag_id.length > 0) {
            // Convert tag_id array to a comma-separated string for the query
            const tagIdString = tag_id.join(',');
            const checkTagsQuery = `SELECT * FROM Tags WHERE tag_id IN (${tagIdString}) AND user_id = ?`;
            const tagsExists = await executeQuery(checkTagsQuery, [user_id]);

            if (tagsExists.length !== tag_id.length) {
                return res.json({ status: 'error', message: 'One or more tags do not belong to the current user.' });
            }
        }
        //Add To Transactions
        const addTransaction = 'INSERT INTO Transactions (user_id, categorie_id, amount, note, transaction_datetime, fav) VALUES (?, ?, ?, ?, ?, ?)'
        const transactionInsertResult = await executeQuery(addTransaction, [user_id, categorie_id, amount, noteValue, transactionDatetimeThai, favValue])

        if (!transactionInsertResult || !transactionInsertResult.insertId) {
            throw new Error('Failed to insert transaction');
        }

        const transactions_id = transactionInsertResult.insertId;

        if (Array.isArray(tag_id) && tag_id.length > 0) {
            const values = tag_id.map(tag => [transactions_id, tag]);
            const valuesPlaceholder = values.map(() => '(?, ?)').join(', ');
            const flattenedValues = values.flat();

            const insertMapQuery = `INSERT INTO Transactions_Tags_map (transactions_id, tag_id) VALUES ${valuesPlaceholder}`;
            await executeQuery(insertMapQuery, flattenedValues);
        }

            return res.json({ status: 'ok', message: 'Transaction Registered Successfully' });
        } catch (err){
            return res.json({ status: 'error', message: err.message });
    }
}

// == edit transaction ==
async function editTransaction(req, res, next) {
    const user_id = res.locals.user.user_id;
    const { transactions_id, categorie_id, amount, note, transaction_datetime, fav, tag_id } = req.body;

    if (!user_id || !transactions_id || !categorie_id || !amount || !transaction_datetime || fav === undefined) {
        return res.json({ status: 'error', message: 'Please fill out the information completely.' });
    }

    const noteValue = note !== undefined ? note : null;
    const transactionDatetimeThai = moment(transaction_datetime).format('YYYY-MM-DD HH:mm:ss');
    const favValue = fav !== undefined && fav !== null ? fav : 0;
    try {
        // Check if the transaction exists and belongs to the user
        const checkTransactionQuery = 'SELECT * FROM Transactions WHERE transactions_id = ? AND user_id = ?';
        const transactionExists = await executeQuery(checkTransactionQuery, [transactions_id, user_id]);
        if (transactionExists.length === 0) {
            return res.json({ status: 'error', message: 'Transaction not found for this user.' });
        }

        // Check CategorieUser
        const checkCategorieUserQuery = 'SELECT * FROM Categories WHERE categorie_id = ? AND (user_id = ? OR user_id IS NULL)';
        const categorieExists = await executeQuery(checkCategorieUserQuery, [categorie_id, user_id]);
        if (categorieExists.length === 0) {
            return res.json({ status: 'error', message: 'Categories not found for this user.' });
        }

        // Check TagAdd?
        if (Array.isArray(tag_id) && tag_id.length > 0) {
            // Convert tag_id array to a comma-separated string for the query
            const tagIdString = tag_id.join(',');
            const checkTagsQuery = `SELECT * FROM Tags WHERE tag_id IN (${tagIdString}) AND user_id = ?`;
            const tagsExists = await executeQuery(checkTagsQuery, [user_id]);

            if (tagsExists.length !== tag_id.length) {
                return res.json({ status: 'error', message: 'One or more tags do not belong to the current user.' });
            }
        }

        // Update Transactions
        const updateTransaction = 'UPDATE Transactions SET categorie_id = ?, amount = ?, note = ?, transaction_datetime = ?, fav = ? WHERE transactions_id = ? AND user_id = ?';
        const transactionUpdateResult = await executeQuery(updateTransaction, [categorie_id, amount, noteValue, transactionDatetimeThai, favValue, transactions_id, user_id]);

        if (!transactionUpdateResult || transactionUpdateResult.affectedRows === 0) {
            throw new Error('Failed to update transaction');
        }

        // Delete existing tags for the transaction
        const deleteTagsQuery = 'DELETE FROM Transactions_Tags_map WHERE transactions_id = ?';
        await executeQuery(deleteTagsQuery, [transactions_id]);

        // Insert new tags if provided
        if (Array.isArray(tag_id) && tag_id.length > 0) {
            const values = tag_id.map(tag => [transactions_id, tag]);
            const valuesPlaceholder = values.map(() => '(?, ?)').join(', ');
            const flattenedValues = values.flat();

            const insertMapQuery = `INSERT INTO Transactions_Tags_map (transactions_id, tag_id) VALUES ${valuesPlaceholder}`;
            await executeQuery(insertMapQuery, flattenedValues);
        }

        res.json({ status: 'ok', message: 'Transaction Updated Successfully' });
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
    const page = parseInt(req.query.page) || 1; // default page 1
    const pageSize = parseInt(req.query.pageSize) || 10; // default page size 10

    if (!user_id || !selected_date_start || !selected_date_end ) {
        return res.json({ status: 'error', message: 'Please provide valid user_id, selected_date_start, selected_date_end, page, and pageSize.' });
    }

    try {
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

            const transactionsQuery =
            `SELECT 
                Transactions.transactions_id,
                Transactions.categorie_id,
                Transactions.amount,
                Transactions.note,
                Transactions.transaction_datetime,
                Transactions.fav,
                Categories.name AS categorie_name,
                Categories.type AS categorie_type,
                GROUP_CONCAT(CONCAT(Tags.tag_id, ':', Tags.tag_name) SEPARATOR ', ') AS tags
            FROM
                Transactions
            JOIN
                Categories ON Transactions.categorie_id = Categories.categorie_id
            LEFT JOIN
                Transactions_Tags_map ON Transactions.transactions_id = Transactions_Tags_map.transactions_id
            LEFT JOIN
                Tags ON Transactions_Tags_map.tag_id = Tags.tag_id
            WHERE
                Transactions.user_id = ? AND DATE_FORMAT(Transactions.transaction_datetime, '%Y-%m-%d') BETWEEN ? AND ?
            GROUP BY
                Transactions.transactions_id
            ORDER BY
                DATE_FORMAT(Transactions.transaction_datetime, '%Y-%m-%d %H:%i:%s') LIMIT ? OFFSET ? 
            `;
        const countQuery =
            `SELECT 
                COUNT(*) AS total_transactions
            FROM
                Transactions
            WHERE
                Transactions.user_id = ? AND DATE_FORMAT(Transactions.transaction_datetime, '%Y-%m-%d') BETWEEN ? AND ?`;
        

        const offset = (page - 1) * pageSize;


        const [summaryResults, transactions, countResult] = await Promise.all([
            executeQuery(summaryQuery, [user_id, selected_date_start, selected_date_end]),
            executeQuery(transactionsQuery, [user_id, selected_date_start, selected_date_end ,`${pageSize}` , `${offset}`]),
            executeQuery(countQuery, [user_id, selected_date_start, selected_date_end])
        ]);


        if (transactions.length === 0) {
            return res.json({ status: 'error', message: 'No transactions found for the selected date.' });
        }

        const { total_income, total_expense } = processSummaryResults(summaryResults);
        const processedTransactions = transactions.map(transaction => ({
            transactions_id: transaction.transactions_id,
            categorie_id: transaction.categorie_id,
            amount: parseFloat(transaction.amount),
            note: transaction.note,
            transaction_datetime: moment(transaction.transaction_datetime).format('YYYY-MM-DD HH:mm:ss'),
            fav: transaction.fav,
            categorie_name: transaction.categorie_name,
            categorie_type: transaction.categorie_type,
            tags: transaction.tags ? transaction.tags.split(',').map(tag => {
                const [id, name] = tag.trim().split(':');
                return { tag_id: parseInt(id, 10), tag_name: name };
            }) : []
        }));

        const selected_date_range = (selected_date_start === selected_date_end)
            ? selected_date_start
            : `${selected_date_start} - ${selected_date_end}`;

        const totalTransactions = countResult[0].total_transactions;
        const totalPages = Math.ceil(totalTransactions / pageSize);
            
            res.json({
                status: 'ok',
                message: 'Get SummaryDay Transactions Successfully',
                data: {
                    summary: {
                        user_id: user_id,
                        selected_date: selected_date_range,
                        total_income: parseFloat(total_income.toFixed(2)),
                        total_expense: parseFloat(total_expense.toFixed(2))
                    },
                    transactions: processedTransactions,
                    pagination: {
                        page: page,
                        page_size: pageSize,
                        page_total: totalPages,
                        total_transactions: totalTransactions // จำนวน transaction ทั้งหมดที่มี
                    }
                }
            });

    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}


            
// ==summary Selected Month==
async function summaryMonth(req, res, next) {
    const user_id = res.locals.user.user_id;
    const selected_month = req.query.selected_month;

    if (!user_id || !req.query.selected_month) {
        return res.json({ status: 'error', message: 'Please provide user_id and selected_month' });
    }

    try {
        const summaryQuery = createSummaryQuery(user_id, '%Y-%m', selected_month);
        const summaryTypenameQuery = `
            SELECT 
                Categories.type, 
                Categories.name,
                Categories.categorie_id,
                SUM(Transactions.amount) as amount
            FROM
                Transactions
            JOIN
                Categories ON Transactions.categorie_id = Categories.categorie_id
            WHERE
                Transactions.user_id = ? AND
                DATE_FORMAT(Transactions.transaction_datetime, '%Y-%m') = ?
            GROUP BY
                Categories.type, Categories.name, Categories.categorie_id
            ORDER BY
                amount DESC;
        `;

        const tagSummaryQuery = `
        SELECT 
            Tags.tag_id,
            Tags.tag_name,
            Categories.type,
            SUM(Transactions.amount) as amount
        FROM
            Transactions
        JOIN
            Transactions_Tags_map ON Transactions.transactions_id = Transactions_Tags_map.transactions_id
        JOIN
            Tags ON Transactions_Tags_map.tag_id = Tags.tag_id
        JOIN
            Categories ON Transactions.categorie_id = Categories.categorie_id
        WHERE
            Transactions.user_id = ? AND
            DATE_FORMAT(Transactions.transaction_datetime, '%Y-%m') = ? 
            -- Ensure to filter expenses and incomes
            AND (Categories.type = 'expenses' OR Categories.type = 'income')
        GROUP BY
            Tags.tag_id, Tags.tag_name, Categories.type
        ORDER BY
            amount DESC;
    `;


        const [summaryResults, transactions, tagSummaryResults] = await Promise.all([
            executeQuery(summaryQuery, [user_id, selected_month]),
            executeQuery(summaryTypenameQuery, [user_id, selected_month]),
            executeQuery(tagSummaryQuery, [user_id, selected_month])
        ]);

        // After Query All---------------------
        if (summaryResults.length === 0) {
            res.json({ status: 'error', message: 'No transactions found for the selected month.' });
            return;
        }

        // Calculate the total income and expenses
        const { total_income, total_expense } = processSummaryResults(summaryResults);

        // Initialize transactionsByType
        let transactionsByType = {
            income: [],
            expense: []
        };

        // Group transactions by type
        transactions.forEach(result => {
            let categorieData = {
                categorie_id: result.categorie_id,
                categorie_name: result.name,
                amount: parseFloat(result.amount) || 0,
            };

            if (result.type === 'income') {
                transactionsByType.income.push(categorieData);
            } else if (result.type === 'expenses') {
                transactionsByType.expense.push(categorieData);
            }
        });

        // Calculate tag summaries
        let tagSummaries = {};

        tagSummaryResults.forEach(result => {
            if (!tagSummaries[result.tag_id]) {
                tagSummaries[result.tag_id] = {
                    tag_id: result.tag_id,
                    tag_name: result.tag_name,
                    income: 0,
                    expense: 0
                };
            }

            if (result.type === 'income') {
                tagSummaries[result.tag_id].income += parseFloat(result.amount);
            } else if (result.type === 'expenses') {
                tagSummaries[result.tag_id].expense += parseFloat(result.amount);
            }
        });

        // Format and send response
        res.json({
            status: 'ok',
            message: 'Get SummaryMonth Successfully',
            data: {
                summary: {
                    user_id: user_id,
                    month: selected_month,
                    total_income: parseFloat(total_income.toFixed(2)),
                    total_expense: parseFloat(total_expense.toFixed(2)),
                    balance: parseFloat((total_income - total_expense).toFixed(2))
                },
                summary_type: [
                    { type: 'income', categories: transactionsByType.income },
                    { type: 'expense', categories: transactionsByType.expense }
                ],
                tag_summary: Object.values(tagSummaries).map(tagSummary => ({
                    tag_id: tagSummary.tag_id,
                    tag_name: tagSummary.tag_name,
                    income: parseFloat(tagSummary.income.toFixed(2)),
                    expense: parseFloat(tagSummary.expense.toFixed(2))
                }))
            }
        });
        //--------------------------------
    } catch (err) {
        res.json({ status: 'error', message: err.message });
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
            WITH months AS (
                SELECT 1 AS month UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL
                SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL
                SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL
                SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
            )
            SELECT 
                months.month,
                COALESCE(SUM(CASE WHEN Categories.type = 'income' THEN Transactions.amount ELSE 0 END), 0) AS total_income,
                COALESCE(SUM(CASE WHEN Categories.type = 'expenses' THEN Transactions.amount ELSE 0 END), 0) AS total_expense
            FROM
                months
            LEFT JOIN
                Transactions ON MONTH(Transactions.transaction_datetime) = months.month
                AND YEAR(Transactions.transaction_datetime) = ?
                AND Transactions.user_id = ?
            LEFT JOIN
                Categories ON Transactions.categorie_id = Categories.categorie_id
            GROUP BY
                months.month
            ORDER BY
                months.month;
        `;
    
        const [summaryResults, monthlyResults] = await Promise.all([
            executeQuery(summaryQuery, [user_id, selected_year]),
            executeQuery(monthlySummaryQuery, [selected_year, user_id])
        ])

    //After Query All-----------------------
        if (summaryResults.length === 0) {
            res.json({ status: 'error', message: 'No transactions found for the selected year.' });
            return;
        }

        // Calculate the total income and expenses
        const { total_income, total_expense } = processSummaryResults(summaryResults);
        
        // Calculate the total income and expenses Each Monthly
        const months = Array.from({ length: 12 }, (_, i) => i + 1);
    
        const monthlySummary = months.map(month => {
            const result = monthlyResults.find(r => r.month === month);
            return {
                month,
                total_income: result ? parseFloat(result.total_income) : 0,
                total_expense: result ? parseFloat(result.total_expense) : 0,
                balance: (result ? parseFloat(result.total_income) : 0) - (result ? parseFloat(result.total_expense) : 0)
            };
        });
    
        res.json({
            status: 'ok', 
            message: 'Get SummaryYear Successfully',
            data:{
                summary: {
                user_id: user_id,
                year: selected_year,
                total_income: parseFloat(total_income.toFixed(2)),
                total_expense: parseFloat(total_expense.toFixed(2)),
                balance: parseFloat((total_income - total_expense).toFixed(2))
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


module.exports = router