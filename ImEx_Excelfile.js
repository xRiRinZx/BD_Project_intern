const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
const database = require('./database');
const multer = require('multer');
const config = require('./config');
const dotenv = require('dotenv');
const moment = require('moment-timezone');

const CheckandgetUser = require('./Authen_getUser');

dotenv.config();
moment.tz.setDefault(config.timezone);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const originalname = file.originalname;

        // Generate filename based on user_id and timestamp
        const filename = `upload_${timestamp}_${originalname}`;
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (!file) {
            return cb(new Error('No file uploaded'));
        }
        
        if (!file.originalname) {
            return cb(new Error('File original name is undefined'));
        }

        const ext = path.extname(file.originalname);
        if (ext !== '.xlsx') {
            return cb(new Error('Only .xlsx files are allowed'));
        }
        
        cb(null, true);
    }
});


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
    const firstname = res.locals.user.firstname
    const lastname = res.locals.user.lastname
    if (!user_id || !firstname || !lastname) {
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
        const checkResult = await executeQuery(getTransactionsAllQuery, [user_id]);
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

        // Add user information and create date
        worksheet.getCell('A1').value = `User Name: ${firstname} ${lastname}`;
        worksheet.getCell('A2').value = `Created At: ${moment().format('YYYY-MM-DD HH:mm:ss')}`;


        // Define header cells
        worksheet.getCell('A4').value = 'Transaction ID';
        worksheet.getCell('B4').value = 'Categorie ID';
        worksheet.getCell('C4').value = 'Datetime';
        worksheet.getCell('D4').value = 'Amount';
        worksheet.getCell('E4').value = 'Note';
        worksheet.getCell('F4').value = 'Favorite';
        worksheet.getCell('G4').value = 'Category Name';
        worksheet.getCell('H4').value = 'Category Type';
        worksheet.getCell('I4').value = 'Tags';

        worksheet.columns = [
            { key: 'transactions_id', width: 15 },
            { key: 'categorie_id', width: 15 },
            { key: 'transaction_datetime', width: 20 },
            { key: 'amount', width: 10 },
            { key: 'note', width: 30 },
            { key: 'fav', width: 10 },
            { key: 'categorie_name', width: 20 },
            { key: 'categorie_type', width: 20 },
            { key: 'tags', width: 30 }
        ];

        // Style the header
        worksheet.getRow(4).eachCell((cell) => {
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
                fileUrl: `${process.env.API_URL}/exports/${filename}`
            }
        });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}

//== TemplateExcel for UserRecord
async function exportTemplate(req, res, next) {
    const user_id = res.locals.user.user_id;
    if (!user_id) {
        return res.json({ status: 'error', message: 'User not found.' });
    }

    try {
        const workbook = new ExcelJS.Workbook();

    // Sheet 1: Transactions Template
        const transactionsSheet = workbook.addWorksheet('Record_Transactions_Template');
        transactionsSheet.columns = [
            { header: 'Datetime', key: 'transaction_datetime', width: 20 },
            { header: 'Categorie ID', key: 'categorie_id', width: 15 },
            { header: 'Amount', key: 'amount', width: 10 },
            { header: 'Note', key: 'note', width: 35 },
            { header: 'Favorite (0 = No/1 = Yes)', key: 'fav', width: 25 },
            { header: 'Tags (tag id)', key: 'tags', width: 30 }
        ];
        // Example data for demonstration
        const exampleTransaction = {
            transaction_datetime: '2024-07-03 14:30:00',
            categorie_id: 1,
            amount: '100.50',
            note: 'Example transaction note REPLACE HERE',
            fav: 1,
            tags: '[tag_id,tag_id]'
        };

        // Style the header for transactionsSheet (Sheet 1)
        transactionsSheet.getRow(1).eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'b3cded' } 
            };
            cell.font = {
                bold: true,
            };
        });

        // Add example data to Sheet 1 (Transactions_Template)
        const dataRow = transactionsSheet.addRow({
            transaction_datetime: exampleTransaction.transaction_datetime,
            categorie_id: exampleTransaction.categorie_id,
            amount: exampleTransaction.amount,
            note: exampleTransaction.note,
            fav: exampleTransaction.fav,
            tags: exampleTransaction.tags
        });

        // Style example data (Row 2) in Sheet 1
        dataRow.eachCell((cell) => {
            cell.font = {
                color: { argb: '797979' } 
            };
        });

    // Sheet 2: Categories Template
        const categoriesSheet = workbook.addWorksheet(`Categories_User_${user_id}`);
        categoriesSheet.columns = [
            { header: 'Category ID', key: 'categorie_id', width: 15 },
            { header: 'Category Name', key: 'categorie_name', width: 20 },
            { header: 'Category Type', key: 'categorie_type', width: 20 }
        ];

        // Style the header for categoriesSheet (Sheet 2)
        categoriesSheet.getRow(1).eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'b3cded' } 
            };
            cell.font = {
                bold: true,
            };
        });

        // Fetch user-specific categories from the database
        const categoriesQuery = `
            SELECT categorie_id, name AS categorie_name, type AS categorie_type
            FROM Categories
            WHERE user_id = ? OR user_id IS NULL
        `;
        const categoriesResult = await executeQuery(categoriesQuery, [user_id]);
        categoriesResult.forEach(category => {
            categoriesSheet.addRow(category);
        });


    // Sheet 3: Tags Template
        const tagsSheet = workbook.addWorksheet(`Tags_User_${user_id}`);
        tagsSheet.columns = [
            { header: 'Tag ID', key: 'tag_id', width: 10 },
            { header: 'Tag Name', key: 'tag_name', width: 20 }
        ];

        // Fetch user-specific tags from the database
        const tagsQuery = `
            SELECT tag_id, tag_name
            FROM Tags
            WHERE user_id = ?
        `;

        // Style the header for tagsSheet (Sheet 3)
        tagsSheet.getRow(1).eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'b3cded' } 
            };
            cell.font = {
                bold: true,
            };
        });

        const tagsResult = await executeQuery(tagsQuery, [user_id]);
        tagsResult.forEach(tag => {
            tagsSheet.addRow(tag);
        });

        const filename = `user_${user_id}_template.xlsx`;
        const filePath = path.join(__dirname, 'exports', filename);
        await workbook.xlsx.writeFile(filePath);

        res.json({
            status: 'ok',
            message: 'Excel template file created successfully',
            data:
            {fileUrl: `${process.env.API_URL}/exports/${filename}`}
        });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}


//==checking before import==
async function validateTransactionData(user_id, transactionData) {
    const { categorie_id, tag_id, transaction_datetime, amount, note, fav } = transactionData;

    if ( !categorie_id || !amount || !transaction_datetime  || fav === undefined) {
        throw new Error(`Missing fill out the information completely.`);
    }

    // Check if category exists
    const checkCategorieUserQuery = 'SELECT * FROM Categories WHERE categorie_id = ? AND (user_id = ? OR user_id IS NULL)';
    const categorieExists = await executeQuery(checkCategorieUserQuery, [categorie_id, user_id]);
    if (categorieExists.length === 0) {
        throw new Error(`Categorie with ID ${categorie_id} not found for user ${user_id}`);
    }

    // Check if tags exist
    if (tag_id && tag_id.length > 0) {
        const tagIdString = tag_id.join(',');
        const checkTagsQuery = `SELECT * FROM Tags WHERE tag_id IN (${tagIdString}) AND user_id = ?`;
        const tagsExists = await executeQuery(checkTagsQuery, [user_id]);

        if (tagsExists.length !== tag_id.length) {
            throw new Error(`One or more tags do not belong to user ${user_id}`);
        }
    }
}



//== Read Excel for Record == 
async function importTransactionsFromExcel(req, res, next) {
    try {
        const user_id = res.locals.user.user_id
        const filePath = req.body.filepath;

        if (!filePath) {
            return res.json({ status: 'error', message: 'No FilePart.' });
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);

        const worksheet = workbook.worksheets[0];

        const transactions = [];
        let errors = [];
        let validTransactions = [];

        let isFirstRow = true;
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (isFirstRow) {
                isFirstRow = false;
                return; // Skip header row
            }

            let transaction_datetime = row.getCell(1).value ? moment.utc(row.getCell(1).value).format('YYYY-MM-DD HH:mm:ss') : null;
            
            // Ensure transaction_datetime has 'HH:mm:ss' if it's missing
            if (transaction_datetime && !transaction_datetime.includes(' ')) {
                transaction_datetime += ' 00:00:00';
            } else if (transaction_datetime && transaction_datetime.split(' ')[1].length < 8) {
                transaction_datetime = transaction_datetime.split(' ')[0] + ' 00:00:00';
            }
            
            let tag_id = row.getCell(6).value ? row.getCell(6).value.toString().trim() : '[]';
            try {
                tag_id = JSON.parse(tag_id);
                if (!Array.isArray(tag_id)) {
                    tag_id = [];
                } else {
                    tag_id = tag_id.filter(id => typeof id === 'number');
                }
            } catch (error) {
                tag_id = [];
            }

            const transaction = {
                transaction_datetime: transaction_datetime,
                categorie_id: row.getCell(2).value,
                amount: row.getCell(3).value,
                note: row.getCell(4).value,
                fav: row.getCell(5).value,
                tag_id: tag_id,
            };

            transactions.push(transaction);
        });

        console.log('Transactions:', transactions);

        // Validate each transaction
        for (const transactionData of transactions) {
            try {
                await validateTransactionData(user_id, transactionData);
                validTransactions.push(transactionData);
            } catch (err) {
                errors.push({ row: transactionData, error: err.message });
            }
        }

        // Handle validation results 
        if (errors.length === 0) {
            console.log('All transactions are valid.');
        } else {
            console.log('Validation failed for some transactions:', errors);
            return res.json({
                message: 'Validation failed for some transactions.',
                errors: errors,
                validTransactions: validTransactions
            });
        }

        // Record valid transactions
        await recordValidTransactions(user_id, validTransactions, req, res);
        // Respond with success message
        res.status(200).json({
            message: 'Transactions imported successfully.',
            validTransactions: validTransactions
        });
    } catch (error) {
        console.error('Error importing transactions:', error);
        res.status(500).json({ message: 'Error importing transactions.', error: error.message });
    }
}


//== Read Excel for RecordAll Ignore ErrorTransaction == 
async function importTransactionsFromExcelAll(req, res, next) {
    try {
        const user_id = res.locals.user.user_id
        const filePath = req.body.filepath;

        if (!filePath) {
            return res.json({ status: 'error', message: 'No FilePart.' });
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);

        const worksheet = workbook.worksheets[0];

        const transactions = [];
        let errors = [];
        let validTransactions = [];

        let isFirstRow = true;
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (isFirstRow) {
                isFirstRow = false;
                return; // Skip header row
            }

            let transaction_datetime = row.getCell(1).value ? moment.utc(row.getCell(1).value).format('YYYY-MM-DD HH:mm:ss') : null;
            
            // Ensure transaction_datetime has 'HH:mm:ss' if it's missing
            if (transaction_datetime && !transaction_datetime.includes(' ')) {
                transaction_datetime += ' 00:00:00';
            } else if (transaction_datetime && transaction_datetime.split(' ')[1].length < 8) {
                transaction_datetime = transaction_datetime.split(' ')[0] + ' 00:00:00';
            }
            
            let tag_id = row.getCell(6).value ? row.getCell(6).value.toString().trim() : '[]';
            try {
                tag_id = JSON.parse(tag_id);
                if (!Array.isArray(tag_id)) {
                    tag_id = [];
                } else {
                    tag_id = tag_id.filter(id => typeof id === 'number');
                }
            } catch (error) {
                tag_id = [];
            }

            const transaction = {
                transaction_datetime: transaction_datetime,
                categorie_id: row.getCell(2).value,
                amount: row.getCell(3).value,
                note: row.getCell(4).value,
                fav: row.getCell(5).value,
                tag_id: tag_id,
            };

            transactions.push(transaction);
        });

        console.log('Transactions:', transactions);

        // Validate each transaction
        for (const transactionData of transactions) {
            try {
                await validateTransactionData(user_id, transactionData);
                validTransactions.push(transactionData);
            } catch (err) {
                errors.push({ row: transactionData, error: err.message });
            }
        }

        // Record valid transactions All
        await recordValidTransactions(user_id, validTransactions, req, res);
        // Respond with success message
        res.status(200).json({
            message: 'Transactions imported successfully.',
            validTransactions: validTransactions
        });
    } catch (error) {
        console.error('Error importing transactions:', error);
        res.status(500).json({ message: 'Error importing transactions.', error: error.message });
    }
}


async function recordValidTransactions(user_id, validTransactions, req, res) {
    const results = [];
    try {
        for (const transaction of validTransactions) {
            console.log('Transaction to be recorded:', transaction);
            try {
                req.body = { user_id, ...transaction }; // Set request body
                const result = await record(req); // Record transaction
                results.push({ transaction, result });

                console.log(`Transaction recorded successfully: ${JSON.stringify(transaction)}`);
            } catch (error) {
                console.error('Error recording transaction:', error);
                results.push({ transaction, error: error.message });
            }
        }

        console.log('Import transactions completed.');
        // res.status(200).json({ message: 'Transactions imported successfully.', results });
    } catch (error) {
        console.error('Error in recordValidTransactions:', error);
        res.status(500).json({ message: 'Error importing transactions.', error: error.message });
    }
}

//== API ImportFile ==
async function importFile(req, res, next) {
    const user_id = res.locals.user.user_id
    const file = req.file;
    try {
        if (!file) {
            return res.status(400).json({status: error , message: 'No file uploaded' });
        }
        return res.status(200).json({ 
            status: 'ok', 
            message: 'File uploaded successfully',
            data : {file: file }
        });
    } catch (error) {
        console.error('Error importing transactions:', error);
        res.status(500).json({ message: 'Error importing transactions.', error: error.message });
        return; 
    }
}


async function record(req) {
    const { user_id, categorie_id, amount, note, transaction_datetime, fav, tag_id } = req.body;

    if (!user_id || !categorie_id || !amount || !transaction_datetime || fav === undefined) {
        throw new Error('Please fill out the information completely.');
    }

    const noteValue = note !== undefined ? note : null;
    const transactionDatetimeThai = moment(transaction_datetime).format('YYYY-MM-DD HH:mm:ss');
    const favValue = fav !== undefined && fav !== null ? fav : 0;

    try {
        const addTransaction = 'INSERT INTO Transactions (user_id, categorie_id, amount, note, transaction_datetime, fav) VALUES (?, ?, ?, ?, ?, ?)';
        const transactionInsertResult = await executeQuery(addTransaction, [user_id, categorie_id, amount, noteValue, transactionDatetimeThai, favValue]);

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

        return { status: 'ok', message: 'Transaction Registered Successfully' };
    } catch (err) {
        console.error('Error recording transaction:', err);
        throw err;
    }
}


// router.post('/confirm-transactions', CheckandgetUser, confirm)
router.post('/import-file', CheckandgetUser, upload.single('file'), importFile)
router.post('/import-excel', jsonParser, CheckandgetUser , importTransactionsFromExcel);
router.post('/import-excelAll', jsonParser, CheckandgetUser , importTransactionsFromExcelAll);
router.get('/getExcelUserTransactions', jsonParser, CheckandgetUser , exTransactionsAll);
router.get('/getExportTemplate', jsonParser, CheckandgetUser , exportTemplate);

module.exports = router
