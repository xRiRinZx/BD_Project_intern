const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
const database = require('./database');
const config = require('./config');
const dotenv = require('dotenv');

const AuthenAndgetUser = require('./Authen_getUser');

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
            SELECT fav FROM Transactions WHERE transactions_id = ? AND user_id = ?
        `;
        const checkResult = await new Promise((resolve, reject) => {
            database.executeQuery(checkQuery, [transactions_id, user_id], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });
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
        await new Promise((resolve, reject) => {
            database.executeQuery(updateQuery, [transactions_id, user_id], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        res.json({ status: 'ok', message: 'Add Favorite successfully' });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}

// // ==Get Fav Transaction==
async function getFavorite(req, res, next) {
    const user_id = res.locals.user.user_id;
    const fav = req.query.fav;
    if (!user_id) {
        return res.json({ status: 'error', message: 'User not found.' });
    }
    try {
        const getFavoriteQuery =`
            SELECT transactions_id, categorie_id, amount, note
            FROM Transactions
            WHERE fav = ? AND user_id = ?
        `;
        const checkResult = await new Promise((resolve, reject) => {
            database.executeQuery(getFavoriteQuery, [fav, user_id], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });
        // No Fav transaction
        if (checkResult.length === 0) {
            return res.json({ status: 'error', message: 'No Favorite transaction found' });
        }
        res.json({ status: 'ok', message: 'Get Favorite successfully', data:{user_id: user_id,favorite: checkResult}});
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
}


router.put('/addFavorite', jsonParser ,AuthenAndgetUser ,addFavorite);
router.get('/getFavorite', jsonParser ,AuthenAndgetUser ,getFavorite);

module.exports = router;