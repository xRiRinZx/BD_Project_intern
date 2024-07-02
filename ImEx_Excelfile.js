const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
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

//== Export AllTransactionsUser ==
async function exTransactionsAll(req, res, next) {
    const user_id = res.locals.user.user_id;
    if (!user_id) {
        return res.json({ status: 'error', message: 'User not found.' });
    }
    try {
    const getTransactionsAllQuery = `
    SELECT
        Transactions.transactions_id,
        Transactions.categorie_id,
        Transactions.amount,
        Transactions.note,
        Transactions.transaction_datetime,
        Transactions.fav,
        Categories.name As categorie_name,
        Categories.type As categorie_type,
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
        Transactions.user_id = ? 
    GROUP BY
        Transactions.transactions_id
    ORDER BY
        DATE_FORMAT(Transactions.transaction_datetime, '%Y-%m-%d %H:%i:%s');
    `;
    const checkResult = await executeQuery(getTransactionsAllQuery,[user_id]);
    if (checkResult.length === 0) {
        return res.json({ status: 'error', message: 'No Transactions in this User' });
    }
    const processedTransactions = checkResult.map(transaction => ({
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
    // Create Excel file
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('User_Transactions');

    worksheet.columns = [
        { header: 'Transaction ID', key: 'transactions_id', width: 15 },
        { header: 'Category ID', key: 'categorie_id', width: 15 },
        { header: 'Datetime', key: 'transaction_datetime', width: 20 },
        { header: 'Amount', key: 'amount', width: 10 },
        { header: 'Note', key: 'note', width: 30 },
        { header: 'Favorite', key: 'fav', width: 10 },
        { header: 'Category Name', key: 'categorie_name', width: 20 },
        { header: 'Category Type', key: 'categorie_type', width: 20 },
        { header: 'Tags', key: 'tags', width: 30 }
    ];

    worksheet.getRow(1).eachCell((cell) => {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'b3cded' } 
        };
        cell.font = {
            bold: true 
        };
    });

    processedTransactions.forEach(transaction => {
        worksheet.addRow({
            ...transaction,
            tags: transaction.tags.map(tag => `${tag.tag_id}:${tag.tag_name}`).join(', ')
        });
    });
    const filename = `user(${user_id})_transactions.xlsx`; //filename use User_id for protect same namefile
    const filePath = path.join(__dirname, 'exports', filename);
    await workbook.xlsx.writeFile(filePath);

        res.json({
            status: 'ok',
            message: 'Get UserTransactions successfully and Excel file created',
            data: {
                user_id: user_id,
                transactions: processedTransactions,
                fileUrl: `${process.env.API_URL}/exports/${filename}`
            }
        });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}

router.get('/getExcelUserTransactions', jsonParser, CheckandgetUser , exTransactionsAll);

module.exports = router