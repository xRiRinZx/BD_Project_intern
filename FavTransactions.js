const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
const database = require('./database');
const config = require('./config');
const dotenv = require('dotenv');
const moment = require('moment-timezone');
const { executeQuery } = require('./database');

const AuthenAndgetUser = require('./Authen_getUser');
moment.tz.setDefault(config.timezone);

dotenv.config();

// ==Add Fav Transaction==
async function addFavorite(req, res, next){
    if (!req.body.transactions_id) {
        return res.json({ status: 'error', message: 'Please provide transaction_id.' });
    }

    const user_id = res.locals.user.user_id;
    const transactions_id = req.body.transactions_id;

    try {
        // check transaction & favorite
        const checkQuery = `
            SELECT fav FROM Transactions WHERE transactions_id = ? AND user_id = ?`;
        const checkResult = await executeQuery(checkQuery, [transactions_id, user_id]);
        // No transaction
        if (checkResult.length === 0) {
            return res.json({ status: 'error', message: 'No transaction found' });
        }
        // Check favorite
        if (checkResult[0].fav === 1) {
            return res.json({ status: 'error', message: 'This transaction is already favorite' });
        }

        // Update favorite
        const updateQuery = `
            UPDATE Transactions SET fav = 1 WHERE transactions_id = ? AND user_id = ?
        `;
        await executeQuery(updateQuery, [transactions_id, user_id]);

        res.json({ status: 'ok', message: 'Add Favorite successfully' });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}

// ==Get Fav Transaction==
async function getFavorite(req, res, next) {
    const user_id = res.locals.user.user_id;
    const fav = req.query.fav;
    if (!user_id) {
        return res.json({ status: 'error', message: 'User not found.' });
    }
    try {
        const getFavoriteQuery = `
            SELECT 
                Transactions.transactions_id,
                Transactions.categorie_id,
                Transactions.amount,
                Transactions.note,
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
                Transactions.user_id = ? AND Transactions.fav = ?
            GROUP BY
                Transactions.transactions_id
        `;

        const checkResult = await executeQuery(getFavoriteQuery, [user_id, fav])
        // No Fav transaction
        if (checkResult.length === 0) {
            return res.json({ status: 'error', message: 'No Favorite transaction found' });
        }

        const processedTransactions = checkResult.map(transaction => ({
            transactions_id: transaction.transactions_id,
            categorie_id: transaction.categorie_id,
            amount: parseFloat(transaction.amount),
            note: transaction.note,
            fav: transaction.fav,
            categorie_name: transaction.categorie_name,
            categorie_type: transaction.categorie_type,
            tags: transaction.tags ? transaction.tags.split(',').map(tag => {
                const [id, name] = tag.trim().split(':');
                return { tag_id: parseInt(id, 10), tag_name: name };
            }) : []
        }));

        res.json({
            status: 'ok',
            message: 'Get Favorite successfully',
            data: {
                user_id: user_id,
                favorite: processedTransactions
            }
        });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}

router.put('/addFavorite', jsonParser ,AuthenAndgetUser ,addFavorite);
router.get('/getFavorite', jsonParser ,AuthenAndgetUser ,getFavorite);

module.exports = router;